import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase';

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const MODEL_NAME = 'gemini-2.5-flash';
export const MAX_HISTORY_MESSAGES = 20;
export const isConfigured = !!GEMINI_API_KEY;

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

async function generateWithRetry(model, params) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await model.generateContent(params);
    } catch (err) {
      if (!is503(err)) throw err; // falha imediata para 400, 429, etc.
      if (attempt === RETRY_DELAYS_MS.length) break; // esgotou tentativas
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[AI] 503 — tentativa ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}, aguardando ${delay / 1000}s…`);
      await sleep(delay);
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

function getModel(withTools) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: MODEL_NAME,
    ...(withTools?.length ? { tools: [{ functionDeclarations: withTools }] } : {}),
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

const PLANTA_SYSTEM_FULL = `Você é um especialista em leitura de plantas baixas para marmoraria.
Analise as imagens do PDF e identifique TODOS os itens que utilizam pedra natural ou artificial:
bancadas, pias, balcões, soleiras, peitoris, pisos, revestimentos, rodapés em pedra, tampos, etc.

Para cada item extraído, retorne um objeto JSON com:
- id: número sequencial (1, 2, 3...)
- descricao: nome descritivo do item (ex: "Bancada cozinha", "Soleira sala")
- dimensoes: medidas no formato "X,XX m × Y,YY m" se visível, ou "a medir" se não legível
- ambiente: nome do cômodo ou área (ex: "Cozinha", "Suíte", "Hall de entrada")
- pagina: número da página onde o item aparece (começando em 1)
- confianca: sua confiança na extração (0 a 100), considerando legibilidade e clareza das cotas

Retorne APENAS um array JSON válido, sem texto adicional, markdown ou explicação.
Exemplo de saída:
[
  {"id":"1","descricao":"Bancada cozinha","dimensoes":"3,20 m × 0,60 m","ambiente":"Cozinha","pagina":1,"confianca":90},
  {"id":"2","descricao":"Soleira entrada","dimensoes":"1,20 m × 0,15 m","ambiente":"Hall","pagina":1,"confianca":60}
]`;

const PLANTA_SYSTEM_ECONOMY = `Analise as imagens de planta baixa e extraia itens que usam pedra (bancadas, pias, soleiras, pisos etc).
Retorne apenas JSON array: [{id, descricao, dimensoes, ambiente, pagina, confianca}].
Sem texto extra.`;

export const PLANTA_CHAT_SYSTEM = `Você é assistente de análise de plantas baixas para marmoraria. Responda em pt-BR sobre os itens extraídos do PDF. Seja direto e técnico.`;

// ── callGemini — chamada única de chat (sem loop) ─────────────────────────────

export async function callGemini({
  systemPrompt,
  history,         // Gemini-format: [{role:'user'|'model', parts:[...]}]
  tools,           // OpenAI-format tool definitions (converted internally)
  economyMode = false,
  fluxo           = 'chat_vendedor',
  empresaId       = null,
}) {
  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY não configurada.');

  // Cache lookup (skip cache when tools are present — respostas dependem do estado do banco)
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

  const declarations  = toFunctionDeclarations(tools);
  const model         = getModel(declarations.length ? declarations : null);
  const safeHistory   = sanitizeGeminiHistory(history);

  if (!safeHistory.length) throw new Error('Histórico resultou vazio após sanitização — verifique a sequência de mensagens.');

  const result   = await generateWithRetry(model, { contents: safeHistory, systemInstruction: systemPrompt });
  const response = result.response;

  const rawCalls     = response.functionCalls();
  const hasCalls     = rawCalls?.length > 0;
  const functionCalls = hasCalls ? rawCalls : null; // [{name, args}]
  const text          = hasCalls ? null : (response.text() || null);

  const tokensEntrada = response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = response.usageMetadata?.candidatesTokenCount ?? 0;

  // Cache text-only responses
  if (canCache && text) {
    const cacheKey = hashPrompt(systemPrompt.slice(0, 150) + JSON.stringify(history.slice(-3)));
    responseCache.set(cacheKey, { text, ts: Date.now() });
  }

  await logUsage({ fluxo, empresaId, tokensEntrada, tokensSaida, fromCache: false });

  return { text, functionCalls, tokensEntrada, tokensSaida, fromCache: false };
}

// ── analyzePlantPDF — análise de imagens de páginas do PDF ───────────────────

export async function analyzePlantPDF({ pageImages, economyMode = false, empresaId = null }) {
  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY não configurada.');
  if (!pageImages?.length) throw new Error('Nenhuma imagem de página fornecida.');

  const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;

  const imageParts = pageImages.map((dataUrl) => {
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

  const model    = getModel(null);
  const result   = await generateWithRetry(model, { contents, systemInstruction: systemPrompt });
  const response = result.response;
  const rawText  = response.text();

  const tokensEntrada = response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = response.usageMetadata?.candidatesTokenCount ?? 0;

  await logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada, tokensSaida, fromCache: false });

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');

  return JSON.parse(jsonMatch[0]);
}
