import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase';

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL_PRIMARY  = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-2.5-flash-lite';
export const MODEL_NAME = MODEL_PRIMARY;
export const MAX_HISTORY_MESSAGES = 20;
// Em dev local com VITE_GEMINI_API_KEY: chama Gemini diretamente.
// Em produção (Vercel, sem VITE_): delega para /api/gemini que usa GEMINI_API_KEY server-side.
const USE_PROXY = !GEMINI_API_KEY;
export const isConfigured = !!GEMINI_API_KEY || import.meta.env.PROD;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ── Response cache ────────────────────────────────────────────────────────────

const responseCache = new Map();

function hashPrompt(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of responseCache) if (now - v.ts > CACHE_TTL_MS) responseCache.delete(k);
}

// ── Logging ───────────────────────────────────────────────────────────────────

// Circuit-breaker: desativa o log após o primeiro erro de "tabela não existe"
// (migration ainda não aplicada) para evitar spam de 404 no console.
let _logEnabled = true;

async function logUsage({ fluxo, empresaId, tokensEntrada, tokensSaida, fromCache }) {
  if (import.meta.env.DEV) {
    console.log(
      `[AI] ${fluxo} | ${MODEL_NAME} | in:${tokensEntrada} out:${tokensSaida} | cache:${fromCache}`,
    );
  }
  if (fromCache || !_logEnabled) return;
  const { error } = await supabase.from('ai_usage_logs').insert({
    empresa_id:    empresaId ?? null,
    fluxo,
    modelo:        MODEL_NAME,
    tokens_entrada: tokensEntrada,
    tokens_saida:   tokensSaida,
    from_cache:     false,
  });
  if (error) {
    // 42P01 = relation does not exist (migration pendente)
    if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      _logEnabled = false;
      console.info('[AI] tabela ai_usage_logs não encontrada — logging desativado. Aplique a migration para reativar.');
    } else {
      console.warn('[AI] log error:', error.message);
    }
  }
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function is503(err) {
  return err?.status === 503
    || String(err?.message ?? '').includes('503')
    || String(err?.message ?? '').toLowerCase().includes('overloaded');
}

async function generateWithRetry(model, params, fallbackModel = null) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await model.generateContent(params);
    } catch (err) {
      if (!is503(err)) throw err; // falha imediata para 400, 429, etc.
      if (attempt === RETRY_DELAYS_MS.length) break; // esgotou tentativas do primário
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[AI] 503 — tentativa ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}, aguardando ${delay / 1000}s…`);
      await sleep(delay);
    }
  }

  if (fallbackModel) {
    console.warn('[AI] modelo primário falhou, tentando fallback…');
    const FALLBACK_DELAYS_MS = [2000, 4000];
    for (let attempt = 0; attempt <= FALLBACK_DELAYS_MS.length; attempt++) {
      try {
        const result = await fallbackModel.generateContent(params);
        console.log('[AI] resposta obtida via fallback gemini-2.0-flash');
        return result;
      } catch (err) {
        if (!is503(err)) throw err;
        if (attempt === FALLBACK_DELAYS_MS.length) break;
        await sleep(FALLBACK_DELAYS_MS[attempt]);
      }
    }
  }

  throw new Error('O serviço está temporariamente sobrecarregado. Tente novamente em alguns instantes.');
}

// ── Gemini helpers ────────────────────────────────────────────────────────────

function toFunctionDeclarations(openAITools) {
  return (openAITools ?? []).map(t => ({
    name:        t.function.name,
    description: t.function.description,
    parameters:  t.function.parameters,
  }));
}

function getModel(withTools, modelName = MODEL_PRIMARY, generationConfig = undefined) {
  // DEBUG TEMPORÁRIO — remover depois de confirmar qual key/projeto está ativo.
  console.log(`[AI][debug] model=${modelName} key=...${GEMINI_API_KEY?.slice(-4) ?? 'undefined'}`);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: modelName,
    ...(generationConfig ? { generationConfig } : {}),
    ...(withTools?.length ? {
      tools:      [{ functionDeclarations: withTools }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    } : {}),
  });
}

// ── History sanitizer ─────────────────────────────────────────────────────────
// O Gemini exige: model(functionCall) → user(functionResponse) sempre em par
// e consecutivos. Truncar o histórico pelo meio pode criar órfãos que causam 400.

function isFunctionCallTurn(msg) {
  return msg.role === 'model' && Array.isArray(msg.parts) && msg.parts.some(p => p.functionCall != null);
}

function isFunctionResponseTurn(msg) {
  return msg.role === 'user' && Array.isArray(msg.parts) && msg.parts.some(p => p.functionResponse != null);
}

function isPlainUserTurn(msg) {
  return msg.role === 'user' && !isFunctionResponseTurn(msg);
}

export function sanitizeGeminiHistory(messages) {
  if (!messages?.length) return [];

  const result = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (isFunctionCallTurn(msg)) {
      // Exige que o próximo seja imediatamente um functionResponse
      const next = messages[i + 1];
      if (next && isFunctionResponseTurn(next)) {
        result.push(msg, next);
        i += 2;
      } else {
        // functionCall sem response correspondente — descarta
        i++;
      }
    } else if (isFunctionResponseTurn(msg)) {
      // functionResponse sem functionCall precedente — descarta
      i++;
    } else {
      result.push(msg);
      i++;
    }
  }

  // Garante que o histórico começa com uma mensagem de usuário comum (não functionResponse, não model)
  while (result.length > 0 && !isPlainUserTurn(result[0])) {
    result.shift();
  }

  return result;
}

// ── System prompts ────────────────────────────────────────────────────────────

export function buildChatSystemPrompt(perfil, nome, nomeEmpresa, economyMode = false) {
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const acesso = perfil === 'medidor'
    ? 'projetos, medições, notificações'
    : perfil === 'vendedor'
    ? 'projetos, clientes, orçamentos, materiais, arquitetos, fechamentos, medições'
    : 'tudo: projetos, clientes, orçamentos, materiais, financeiro, parceiros, usuários';

  if (economyMode) {
    return [
      `Você é a Gi, assistente da empresa "${nomeEmpresa}". Data: ${hoje}. Usuário: ${nome} (${perfil}).`,
      `Acesso: ${acesso}.`,
      'Responda em pt-BR. Use tools para dados do banco. Moeda: "R$ X.XXX,XX".',
    ].join('\n');
  }

  return [
    `Você é a Gi, assistente inteligente da empresa "${nomeEmpresa}". Hoje é ${hoje}. Usuário: ${nome} (perfil: ${perfil}). Acesso: ${acesso}.`,
    'Responda sempre em pt-BR, de forma direta e objetiva. Formate valores como "R$ X.XXX,XX".',
    'REGRA PRINCIPAL: quando o usuário pedir dados que estão no banco (projetos, clientes, financeiro etc.), chame as tools IMEDIATAMENTE, sem descrever o que vai fazer. Execute primeiro, explique depois se necessário.',
    'REGRAS DAS TOOLS:',
    '  • NUNCA peça IDs ao usuário. Sempre resolva IDs via tools (buscar_clientes, buscar_projetos, buscar_usuarios) usando o nome mencionado.',
    '  • agendar_medicao → fluxo obrigatório: 1) buscar_clientes(nome) → 2) buscar_projetos(projeto_nome, cliente_id) → 3) buscar_usuarios(nome do medidor) → 4) agendar_medicao. Se alguma busca retornar múltiplos, apresente as opções e pergunte qual é o certo.',
    '  • cadastrar_cliente → se o usuário fornecer um CEP, chame buscar_cep PRIMEIRO para obter logradouro, bairro, cidade e estado. Depois colete nome e telefone.',
    '  • adicionar_lancamento_financeiro → chame buscar_financeiro antes para obter categoria_id e conta_id.',
    '  • Para operações financeiras: confirme valores com o usuário antes de registrar.',
    'FORMATAÇÃO: use listas e tabelas simples quando listar múltiplos itens.',
  ].join('\n');
}

const PLANTA_SYSTEM_FULL = `Você é um especialista em leitura de plantas baixas para marmoraria. Analise TODAS as imagens/páginas do PDF e identifique os itens em pedra natural ou artificial.

TIPOS DE PEÇAS E COMO LER SUAS DIMENSÕES:

1. TAMPO / BANCADA (peça horizontal):
   - dimensoes = "COMPRIMENTO m × PROFUNDIDADE m"
   - Ex: bancada de frente 2,44m e fundo 0,60m = "2,44 m × 0,60 m"

2. FRONTÃO / ESPELHO (peça vertical atrás da bancada):
   - dimensoes = "COMPRIMENTO m × ALTURA m"
   - Ex: frontão de 4,01m de largura e 0,70m de altura = "4,01 m × 0,70 m"
   - NUNCA use 0,10m como altura de frontão — 0,10m é espessura da pedra

3. SAIA / RODAPÉ (peça vertical na frente da bancada):
   - dimensoes = "COMPRIMENTO m × ALTURA m"
   - Ex: saia de 1,74m de frente e 0,90m de altura = "1,74 m × 0,90 m"
   - Saias de ilha geralmente têm altura = altura da bancada (0,90m)
   - Saias de bancada de parede geralmente têm altura pequena (0,05m a 0,15m)

4. SOLEIRA / PEITORIL (peça horizontal no chão/janela):
   - dimensoes = "COMPRIMENTO m × LARGURA m"

5. PRATELEIRA:
   - dimensoes = "COMPRIMENTO m × PROFUNDIDADE m"

6. FAIXA (tira estreita de pedra, geralmente arremate entre bancada e parede, rodapé estreito ou filete decorativo):
   - dimensoes = "COMPRIMENTO m × LARGURA m"
   - Diferencie de saia/frontão: faixa tem função de acabamento/arremate, não de fechamento vertical de ilha ou bancada — geralmente largura pequena (até ~15cm)
   - Ex: faixa de 2,44m de comprimento e 0,10m de largura = "2,44 m × 0,10 m"

REGRAS IMPORTANTES:
- Quando o projeto mostrar DETALHES (DET. ILHA, DET. BANCADA), use as medidas do detalhe — são mais precisas que a planta baixa
- Se o tampo tiver trechos com FUNÇÕES DIFERENTES claramente identificáveis (ex: um lado tem o ícone/recorte de cooktop, outro lado tem o ícone/recorte de cuba), extraia cada trecho como item separado
- Espessura da pedra (1, 2 ou 3 cm) é diferente da altura/largura da peça
- Material: se houver amostra de material ou legenda, aplique a TODOS os itens do mesmo ambiente/página
- NÃO duplique — cada peça física = um registro

REGRAS PARA DIMENSIONAMENTO EM PARTES x PEÇAS SEPARADAS (fonte comum de contagem errada):
- Uma cota total dividida em dois trechos consecutivos que somam o total (ex: "0,70 m" + "0,72 m" cotando o mesmo desenho contínuo, cujo total é "1,42 m" em outra vista) normalmente é UMA peça física só, cotada em partes por clareza — não duas. Só separe em duas peças se houver indicação clara de peças distintas: nota escrita dizendo isso, espessuras/materiais diferentes entre os trechos, ou um desenho com contorno visivelmente descontínuo (junta/gap real, não só uma linha de cota)
- Uma cota PEQUENA (poucos centímetros, até uns 5cm) ao lado de uma cota bem maior na MESMA vista é quase sempre um detalhe de acabamento da peça principal (borda, retorno, overhang) — NÃO extraia como peça/saia/lateral separada. Só vira peça própria se tiver uma vista de detalhe DEDICADA a ela, com nome/label próprio
- "RALO APARENTE" (dreno/ralo visível) é diferente de um furo de cuba — não crie peça ou recorte extra só por causa dessa anotação; só conte como recorte de cuba se houver também um ícone/cota de cuba explícito (círculo ou retângulo de pia)
- Ilha ou bancada com múltiplas faces em pedra (frente, laterais, fundo): extraia UMA peça (saia/lateral) para CADA vista de detalhe DISTINTA e substancial (ex: cada isométrico "DET. ILHA" com seu próprio comprimento e altura) — não fragmente uma única vista em várias peças por causa de cotas menores dentro dela (ver regra acima), e não omita uma vista que tenha cota própria
- Anotações como "FRENTE REVESTIDA" ou "FRENTE ... EM PEDRA" indicam que só aquele lado tem acabamento em pedra — não assuma que os outros lados da ilha também precisam de peça a menos que estejam desenhados/cotados separadamente

REGRAS PARA RECORTES (cubas, cooktops, torneiras e outros rebaixos/aberturas na peça):
- Identifique TODOS os recortes desenhados na peça: cuba/pia, cooktop, torneira, e outros rebaixos ou aberturas (ex.: nicho, dreno, filtro)
- Para cada recorte, retorne um objeto com:
  - funcao_label: nome do recorte em português, capitalizado (ex: "Cuba", "Cooktop", "Torneira", "Furo")
  - formato: "circular" quando o contorno desenhado é arredondado (ex: furo de torneira), "retangular" quando o contorno é reto (maioria das cubas e cooktops)
  - diametro_cm: SOMENTE quando formato = "circular" e a cota estiver visível; senão null
  - largura_cm e altura_cm: SOMENTE quando formato = "retangular" e as cotas estiverem visíveis; senão null
  - posicao_aproximada: descrição curta da posição na peça (ex: "canto inferior esquerdo", "centralizado à direita", "próximo à parede")
- NÃO invente dimensões do recorte sem cota explícita — mesmo sem cota, registre o recorte com funcao_label, formato (se identificável) e posicao_aproximada, deixando as dimensões como null
- Uma peça pode ter múltiplos recortes

REGRAS DE EXTRAÇÃO:
- Extraia APENAS itens com cotas visíveis ou inferíveis
- NÃO invente dimensões sem cota explícita
- Se dimensão não legível: "a medir"
- O objetivo aqui NÃO é acertar 100% sozinho — é NUNCA inventar peça ou medida errada silenciosamente. Se a existência de uma peça, sua contagem, ou o pareamento de uma cota depender de interpretação ambígua (sem um jeito claro de decidir só com o que está nesta página), NÃO decida por conta própria: retorne confianca abaixo de 50 (mesmo que você tenha preenchido uma dimensão) ou "a medir" quando não der pra nem estimar — isso sinaliza revisão humana no app, o que é preferível a arriscar
- trecho_origem: "pág. N — [cota ou texto exato]"
- Espessura: APENAS 1, 2 ou 3. Se valor > 3 = não é espessura = null

REGRAS DE CONTEXTO (quando a mensagem incluir um bloco CONTEXTO com peças de páginas anteriores deste mesmo projeto):
- Cada página é analisada separadamente, mas o CONTEXTO lista o que já foi identificado nas páginas anteriores — use-o pra não duplicar
- Se um item desta página for a MESMA peça física de um item do CONTEXTO (mesmo ambiente, mesma peça), NÃO crie um registro novo — omita esse item do retorno
- Se um item desta página for um DETALHE/zoom (ex: "DET. ILHA") que refina a medida de uma peça do CONTEXTO, retorne o objeto completo dela com os dados corrigidos e o campo "atualiza_id" = id dessa peça no CONTEXTO (não invente um id novo pra ela)
- Itens do CONTEXTO com "pendente": true têm dimensão "a medir" — ANTES de extrair itens novos desta página, verifique ativamente se algum detalhe desta página (ex: um "DET." com o nome do ambiente/peça) resolve a medida de algum item pendente, mesmo que a página não repita o nome da peça literalmente — e retorne com atualiza_id se sim
- Itens que não aparecem no CONTEXTO são peças novas: retorne normalmente, com "atualiza_id": null

Para cada item retorne:
- id: sequencial
- descricao: nome claro (ex: "Tampo Ilha Cozinha - lado cooktop")
- dimensoes: "X,XX m × Y,YY m" ou "X,XX m × a medir" ou "a medir"
- ambiente: nome do cômodo
- pagina: número da página
- confianca: 0-100
- material: nome exato ou null
- espessura_cm: 1, 2, 3 ou null
- tipo: "bancada"|"tampo"|"soleira"|"peitoril"|"espelho"|"saia"|"frontao"|"prateleira"|"faixa"|"outro"
- recortes: [{funcao_label, formato, diametro_cm, largura_cm, altura_cm, posicao_aproximada}] ou []
- trecho_origem: "pág. N — [origem]"
- atualiza_id: id da peça do CONTEXTO que este item corrige (ver REGRAS DE CONTEXTO), ou null se for peça nova

Retorne APENAS array JSON válido, sem markdown.`;

const PLANTA_SYSTEM_ECONOMY = `Analise as imagens de planta baixa e extraia itens que usam pedra (bancadas, pias, soleiras, pisos etc).
Retorne apenas JSON array: [{id, descricao, dimensoes, ambiente, pagina, confianca}].
Sem texto extra.`;

export const PLANTA_CHAT_SYSTEM = `Você é assistente de análise de plantas baixas para marmoraria. Responda em pt-BR sobre os itens extraídos do PDF. Seja direto e técnico.`;

// ── callGemini — chamada única de chat (sem loop) ─────────────────────────────

async function callGeminiDirect({ systemPrompt, history, tools, fluxo, empresaId }) {
  const declarations  = toFunctionDeclarations(tools);
  const model         = getModel(declarations.length ? declarations : null);
  const fallback      = getModel(declarations.length ? declarations : null, MODEL_FALLBACK);
  const safeHistory   = sanitizeGeminiHistory(history);

  if (!safeHistory.length) throw new Error('Histórico resultou vazio após sanitização — verifique a sequência de mensagens.');

  const result   = await generateWithRetry(model, { contents: safeHistory, systemInstruction: systemPrompt }, fallback);
  const response = result.response;

  const rawCalls      = response.functionCalls();
  const hasCalls      = rawCalls?.length > 0;
  const functionCalls = hasCalls ? rawCalls : null;
  const text          = hasCalls ? null : (response.text() || null);
  const tokensEntrada = response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = response.usageMetadata?.candidatesTokenCount ?? 0;

  await logUsage({ fluxo, empresaId, tokensEntrada, tokensSaida, fromCache: false });
  return { text, functionCalls, tokensEntrada, tokensSaida, fromCache: false };
}

async function callGeminiProxy({ systemPrompt, history, tools, fluxo, empresaId }) {
  const safeHistory = sanitizeGeminiHistory(history);
  if (!safeHistory.length) throw new Error('Histórico resultou vazio após sanitização — verifique a sequência de mensagens.');

  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'chat', systemPrompt, history: safeHistory, tools }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const data = await res.json();
  await logUsage({ fluxo, empresaId, tokensEntrada: data.tokensEntrada ?? 0, tokensSaida: data.tokensSaida ?? 0, fromCache: false });
  return { text: data.text, functionCalls: data.functionCalls, tokensEntrada: data.tokensEntrada, tokensSaida: data.tokensSaida, fromCache: false };
}

export async function callGemini({
  systemPrompt,
  history,
  tools,
  economyMode = false,
  fluxo       = 'chat_vendedor',
  empresaId   = null,
}) {
  // Cache lookup (sem cache quando há tools — respostas dependem do estado do banco)
  const canCache = !tools?.length;
  if (canCache) {
    pruneCache();
    const cacheKey = hashPrompt(systemPrompt.slice(0, 150) + JSON.stringify(history.slice(-3)));
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log('[AI] cache hit');
      await logUsage({ fluxo, empresaId, tokensEntrada: 0, tokensSaida: 0, fromCache: true });
      return { text: cached.text, functionCalls: null, fromCache: true };
    }
  }

  const result = USE_PROXY
    ? await callGeminiProxy({ systemPrompt, history, tools, fluxo, empresaId })
    : await callGeminiDirect({ systemPrompt, history, tools, fluxo, empresaId });

  if (canCache && result.text) {
    const cacheKey = hashPrompt(systemPrompt.slice(0, 150) + JSON.stringify(history.slice(-3)));
    responseCache.set(cacheKey, { text: result.text, ts: Date.now() });
  }

  return result;
}

// ── analyzePlantPDF — análise de imagens de páginas do PDF ───────────────────
// Uma chamada ao Gemini POR PÁGINA, não uma chamada única com o PDF inteiro:
// agrupar todas as páginas em um só request fazia o tempo de resposta crescer
// com o número/resolução de páginas até estourar o maxDuration=60s da function
// serverless (api/gemini.js, Vercel), retornando 504 Gateway Timeout pro
// usuário. Analisando página a página, cada chamada HTTP fica bem abaixo do
// limite independente do tamanho do PDF — o "custo" é uma soma de várias
// chamadas mais curtas em vez de uma só longa, o que também permite mostrar
// progresso ("página X de Y") em vez de uma barra de loading indefinida.

// contextoAnterior: array [{id, descricao, ambiente, dimensoes}] das peças já
// identificadas em páginas anteriores — texto compacto, nunca reenvia imagens.
function buildContextText(contextoAnterior) {
  if (!contextoAnterior?.length) return '';
  return `CONTEXTO — peças já identificadas em páginas anteriores deste mesmo projeto (use pra não duplicar, ver REGRAS DE CONTEXTO):\n${JSON.stringify(contextoAnterior)}\n\n`;
}

async function analyzePlantPDFBatchDirect({ pageImages, economyMode, empresaId, contextoAnterior }) {
  const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;
  const imageParts   = pageImages.map((dataUrl) => {
    const [header, data] = dataUrl.split(',');
    const mimeType       = header.match(/:(.*?);/)[1];
    return { inlineData: { data, mimeType } };
  });
  const contents = [{
    role:  'user',
    parts: [
      { text: `${buildContextText(contextoAnterior)}Analise as seguintes imagens e extraia os itens conforme instruído:` },
      ...imageParts,
      { text: 'Retorne o JSON array dos itens encontrados.' },
    ],
  }];
  const model    = getModel(null, MODEL_PRIMARY,  { temperature: 0 });
  const fallback = getModel(null, MODEL_FALLBACK, { temperature: 0 });
  const result   = await generateWithRetry(model, { contents, systemInstruction: systemPrompt }, fallback);
  const rawText  = result.response.text();
  const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;
  await logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada, tokensSaida, fromCache: false });
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function analyzePlantPDFBatchProxy({ pageImages, economyMode, empresaId, contextoAnterior }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'analyze_pdf', pageImages, economyMode, contextoAnterior }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { items, tokensEntrada, tokensSaida } = await res.json();
  await logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false });
  return items;
}

async function analyzePlantPDFBatch(args) {
  return USE_PROXY ? analyzePlantPDFBatchProxy(args) : analyzePlantPDFBatchDirect(args);
}

// ── Deduplicação client-side (segunda camada, além do CONTEXTO enviado ao modelo) ──
// Compara ambiente (exato) + descrição (similaridade de palavras) + dimensões
// (tolerância de 3cm) pra pegar duplicatas que o modelo não reconheceu sozinho.
// Limiares são heurísticos, não exatos — calibrados pra pegar "mesma peça, texto
// ligeiramente diferente" sem juntar peças realmente distintas do mesmo ambiente.
function normTxt(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function parseDimParNum(str) {
  if (!str) return null;
  const nums = [...str.matchAll(/(\d+)[,.](\d+)/g)].map(m => parseFloat(`${m[1]}.${m[2]}`));
  if (nums.length < 2) return null;
  return [nums[0], nums[1]].sort((a, b) => a - b);
}

function descricaoSimilar(a, b) {
  const wa = new Set(normTxt(a).split(/\s+/).filter(Boolean));
  const wb = new Set(normTxt(b).split(/\s+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return false;
  const shared = [...wa].filter(w => wb.has(w)).length;
  return shared / new Set([...wa, ...wb]).size >= 0.5;
}

// Uma peça sem medida ainda ("a medir") é compatível com qualquer dimensão —
// é exatamente o caso "detalhe de outra página resolve a medida que faltava".
function dimensoesSimilares(a, b) {
  if (a === 'a medir' || b === 'a medir') return true;
  const pa = parseDimParNum(a);
  const pb = parseDimParNum(b);
  if (!pa || !pb) return a === b;
  return Math.abs(pa[0] - pb[0]) <= 0.03 && Math.abs(pa[1] - pb[1]) <= 0.03;
}

// "tipo" é um enum controlado pelo prompt (bancada/tampo/soleira/...) — muito mais
// confiável que comparar texto livre de "descricao", que varia de wording entre
// páginas (ex: "Tampo W.C. 02" vs "Tampo Banheiro 02 (detalhe)"). Usa tipo quando
// disponível; cai para similaridade de texto só se o tipo não ajudar a decidir.
function mesmaPeca(a, b) {
  if (normTxt(a.ambiente) !== normTxt(b.ambiente)) return false;
  const tipoA = a.tipo ?? 'outro', tipoB = b.tipo ?? 'outro';
  const mesmoTipo = tipoA !== 'outro' && tipoA === tipoB;
  if (!mesmoTipo && !descricaoSimilar(a.descricao, b.descricao)) return false;
  return dimensoesSimilares(a.dimensoes, b.dimensoes);
}

// Confiança auto-reportada pelo modelo não detecta "leitura errada mas convicta"
// (ele comita numa interpretação ambígua com a mesma confiança de uma leitura
// correta). O sinal confiável é objetivo: duas leituras de mesmo ambiente+tipo
// cujas dimensões não batem o suficiente pra merge — isso é sinal de conflito
// real, não apenas "peças diferentes do mesmo tipo no mesmo cômodo" (ex: saia
// frente x lateral de uma ilha). Distingue os dois casos pelos qualificadores
// de posição na descrição: se ambas têm um qualificador e eles diferem
// (frente x lateral), são peças distintas de propósito — não é conflito.
const QUALIFICADORES_POSICAO = ['frente', 'frontal', 'lateral', 'traseiro', 'traseira', 'direita', 'esquerda', 'lado'];

function qualificadoresDe(descricao) {
  const words = new Set(normTxt(descricao).split(/\s+/).filter(Boolean));
  return QUALIFICADORES_POSICAO.filter(q => words.has(q));
}

function mesmoAmbienteETipo(a, b) {
  const tipoA = a.tipo ?? 'outro', tipoB = b.tipo ?? 'outro';
  return normTxt(a.ambiente) === normTxt(b.ambiente) && tipoA !== 'outro' && tipoA === tipoB;
}

// true = pode ser a MESMA peça (nenhum qualificador conflitante) → candidato a conflito
// false = qualificadores de posição diferentes → são peças distintas por definição
function semQualificadorConflitante(a, b) {
  const qa = qualificadoresDe(a.descricao);
  const qb = qualificadoresDe(b.descricao);
  if (qa.length === 0 || qb.length === 0) return true;
  return qa.some(q => qb.includes(q));
}

function deduplicarItens(items) {
  const kept = [];
  for (const item of items) {
    const match = kept.find(k => mesmaPeca(k, item));
    if (match) {
      // Mantém o mais completo: maior confiança, ou dimensão resolvida no lugar de "a medir"
      const matchMelhor = (match.confianca ?? 0) >= (item.confianca ?? 0)
        && !(match.dimensoes === 'a medir' && item.dimensoes !== 'a medir');
      if (!matchMelhor) Object.assign(match, item, { id: match.id });
      continue;
    }
    // Não bateu o suficiente pra merge — mas se for mesmo ambiente+tipo, sem
    // qualificador que já explique a diferença, e as dimensões não batem,
    // é uma leitura conflitante da mesma peça: marca as duas pra revisão.
    const conflito = kept.find(k => mesmoAmbienteETipo(k, item) && semQualificadorConflitante(k, item));
    if (conflito) {
      conflito.confianca = Math.min(conflito.confianca ?? 100, 30);
      item.confianca = Math.min(item.confianca ?? 100, 30);
    }
    kept.push(item);
  }
  return kept;
}

// pageImages: array com TODAS as páginas (já renderizadas client-side).
// onProgress(paginaAtual, totalPaginas): opcional, chamado antes de cada chamada.
export async function analyzePlantPDF({ pageImages, economyMode = false, empresaId = null, onProgress = null }) {
  if (!pageImages?.length) throw new Error('Nenhuma imagem de página fornecida.');

  const allItems = [];
  let nextId = 1;

  for (let i = 0; i < pageImages.length; i++) {
    onProgress?.(i + 1, pageImages.length);
    // Resumo compacto (id/descricao/ambiente/dimensoes) das peças já vistas —
    // dá ao modelo contexto pra reconhecer duplicatas/detalhes sem reenviar imagens.
    const contextoAnterior = i === 0 ? null : allItems.map(it => ({
      id: it.id, descricao: it.descricao, ambiente: it.ambiente, dimensoes: it.dimensoes,
      pendente: it.dimensoes === 'a medir',
    }));
    let pageItems;
    try {
      pageItems = await analyzePlantPDFBatch({ pageImages: [pageImages[i]], economyMode, empresaId, contextoAnterior });
    } catch (err) {
      const isTimeout = /504|tempo esgotado|timed out/i.test(err?.message ?? '');
      if (isTimeout && pageImages.length > 1) {
        throw new Error(`Tempo esgotado ao analisar a página ${i + 1} de ${pageImages.length}. Tente novamente — se persistir, envie o PDF em partes menores.`);
      }
      throw err;
    }
    // ids e página são reatribuídos aqui: o modelo só vê uma página por chamada
    // e sempre numeraria a partir de 1, então o índice real do loop é a fonte da verdade.
    for (const item of pageItems) {
      const atualizaId = item.atualiza_id != null ? String(item.atualiza_id) : null;
      const alvo = atualizaId ? allItems.find(it => it.id === atualizaId) : null;
      if (alvo) {
        // Detalhe/zoom de uma peça já vista: atualiza no lugar em vez de criar item novo.
        Object.assign(alvo, item, { id: alvo.id, pagina: alvo.pagina, atualiza_id: undefined });
      } else {
        allItems.push({ ...item, id: String(nextId++), pagina: i + 1, atualiza_id: undefined });
      }
    }
  }

  // Segunda camada: pega duplicatas que o modelo não reconheceu via CONTEXTO
  // (ex: mesma peça descrita de forma um pouco diferente em páginas distintas).
  return deduplicarItens(allItems);
}
