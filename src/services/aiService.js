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

REGRAS IMPORTANTES:
- Quando o projeto mostrar DETALHES (DET. ILHA, DET. BANCADA), use as medidas do detalhe — são mais precisas que a planta baixa
- Se o tampo tiver segmentos (ex: lado cuba e lado cooktop), extraia cada segmento como item separado
- Espessura da pedra (1, 2 ou 3 cm) é diferente da altura/largura da peça
- Furos visíveis no desenho: cooktop = "furo_cooktop", cuba/pia = "furo_cuba", torneira = "furo_torneira"
- Material: se houver amostra de material ou legenda, aplique a TODOS os itens do mesmo ambiente/página
- NÃO duplique — cada peça física = um registro

REGRAS DE EXTRAÇÃO:
- Extraia APENAS itens com cotas visíveis ou inferíveis
- NÃO invente dimensões sem cota explícita
- Se dimensão não legível: "a medir"
- trecho_origem: "pág. N — [cota ou texto exato]"
- Espessura: APENAS 1, 2 ou 3. Se valor > 3 = não é espessura = null

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
- furos: ["furo_cuba","furo_torneira","furo_cooktop"] ou []
- trecho_origem: "pág. N — [origem]"

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

async function analyzePlantPDFDirect({ pageImages, economyMode, empresaId }) {
  const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;
  const imageParts   = pageImages.map((dataUrl) => {
    const [header, data] = dataUrl.split(',');
    const mimeType       = header.match(/:(.*?);/)[1];
    return { inlineData: { data, mimeType } };
  });
  const contents = [{
    role:  'user',
    parts: [
      { text: 'Analise as seguintes imagens e extraia os itens conforme instruído:' },
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

async function analyzePlantPDFProxy({ pageImages, economyMode, empresaId }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'analyze_pdf', pageImages, economyMode }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { items, tokensEntrada, tokensSaida } = await res.json();
  await logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false });
  return items;
}

export async function analyzePlantPDF({ pageImages, economyMode = false, empresaId = null }) {
  if (!pageImages?.length) throw new Error('Nenhuma imagem de página fornecida.');
  return USE_PROXY
    ? analyzePlantPDFProxy({ pageImages, economyMode, empresaId })
    : analyzePlantPDFDirect({ pageImages, economyMode, empresaId });
}
