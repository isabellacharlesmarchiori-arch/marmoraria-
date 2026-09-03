import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase';
import { PLANTA_SYSTEM_FULL, PLANTA_SYSTEM_VETORIAL, PLANTA_SYSTEM_ECONOMY, PLANTA_SYSTEM_AMBIENTES, PLANTA_SYSTEM_ITENS_MATERIAIS, PLANTA_SYSTEM_MAPEAR_SUBTOPICOS } from '../shared/plantaPrompts';
import { agruparEmBlocos, formatarBlocosParaPrompt } from '../shared/vetorialBlocos';

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL_PRIMARY  = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-3.5-flash-lite';
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

  logUsage({ fluxo, empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
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
  logUsage({ fluxo, empresaId, tokensEntrada: data.tokensEntrada ?? 0, tokensSaida: data.tokensSaida ?? 0, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
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
      logUsage({ fluxo, empresaId, tokensEntrada: 0, tokensSaida: 0, fromCache: true }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
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

async function analyzePlantPDFBatchDirect({ pageImages, economyMode, empresaId, contextoAnterior, paginaAtual }) {
  const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;
  const imageParts   = pageImages.map((dataUrl) => {
    const [header, data] = dataUrl.split(',');
    const mimeType       = header.match(/:(.*?);/)[1];
    return { inlineData: { data, mimeType } };
  });
  const paginaAtualText = paginaAtual != null ? `Página atual (dentro desta análise): ${paginaAtual}\n\n` : '';
  const contents = [{
    role:  'user',
    parts: [
      { text: `${paginaAtualText}${buildContextText(contextoAnterior)}Analise as seguintes imagens e extraia os itens conforme instruído:` },
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
  logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function analyzePlantPDFBatchProxy({ pageImages, economyMode, empresaId, contextoAnterior, paginaAtual }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'analyze_pdf', pageImages, economyMode, contextoAnterior, paginaAtual }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { items, tokensEntrada, tokensSaida } = await res.json();
  logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
  return items;
}

async function analyzePlantPDFBatch(args) {
  return USE_PROXY ? analyzePlantPDFBatchProxy(args) : analyzePlantPDFBatchDirect(args);
}

// ── Pipeline vetorial (PDF com texto real, ou DXF) — sem imagem, só texto ────
// textItems: [{texto, x, y, camada?}] de UMA página/arquivo. Agrupa em blocos
// de desenho (agruparEmBlocos) ANTES de formatar — o modelo recebe as cotas já
// separadas por vista/título, não uma lista plana pra ele inferir sozinho onde
// um desenho termina e outro começa (ver src/shared/vetorialBlocos.js).
async function analyzePlantaVetorialBatchDirect({ textItems, empresaId, contextoAnterior, paginaAtual, usarModeloBarato }) {
  const paginaAtualText = paginaAtual != null ? `Página atual (dentro desta análise): ${paginaAtual}\n\n` : '';
  const textoFormatado = formatarBlocosParaPrompt(agruparEmBlocos(textItems));
  const contents = [{
    role:  'user',
    parts: [{
      text: `${paginaAtualText}${buildContextText(contextoAnterior)}Textos extraídos desta página/arquivo, já agrupados por bloco de desenho, com posição (x,y em pontos/unidades do desenho, origem no canto superior esquerdo):\n\n${textoFormatado}\n\nAnalise e extraia os itens conforme instruído. Retorne o JSON array dos itens encontrados.`,
    }],
  }];
  // usarModeloBarato: modo debug de teste de página única (ver handleDebugTestarPagina
  // em AbaImportarPDF.jsx) — usa direto o modelo mais barato (flash-lite), sem o
  // custo do flash "de verdade" pra só validar se um ajuste de prompt funcionou.
  const model    = getModel(null, usarModeloBarato ? MODEL_FALLBACK : MODEL_PRIMARY, { temperature: 0 });
  const fallback = getModel(null, MODEL_FALLBACK, { temperature: 0 });
  const result   = await generateWithRetry(model, { contents, systemInstruction: PLANTA_SYSTEM_VETORIAL }, fallback);
  const rawText  = result.response.text();
  const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;
  logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function analyzePlantaVetorialBatchProxy({ textItems, empresaId, contextoAnterior, paginaAtual, usarModeloBarato }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'analyze_vetorial', textItems, contextoAnterior, paginaAtual, usarModeloBarato }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { items, tokensEntrada, tokensSaida } = await res.json();
  logUsage({ fluxo: 'analise_planta', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false }).catch(() => {}); // telemetria não crítica — nunca deve travar o fluxo principal
  return items;
}

async function analyzePlantaVetorialBatch(args) {
  return USE_PROXY ? analyzePlantaVetorialBatchProxy(args) : analyzePlantaVetorialBatchDirect(args);
}

// ── PASSO 1 do pipeline sequencial: identificação de ambientes (isolado) ─────
// Roda ANTES da extração de peças, e por enquanto NÃO é chamada por ela — só
// identifica quais ambientes existem no documento e em quais páginas, a partir
// dos mesmos blocos/legenda do agrupamento (ver vetorialBlocos.js). UMA
// chamada só pro documento inteiro (não por página, como a extração) — tarefa
// leve, sempre no modelo mais barato (flash-lite).
//
// `paginas` recebe {numero, items} em vez de um array posicional: a fonte
// confiável de nome de ambiente é a planta de ARQUITETURA (geralmente no
// início do documento), não a legenda de marmoraria (lista PEÇAS, não
// cômodos) — quem chama combina páginas de duas faixas não-contíguas do PDF
// (ver handleDebugIdentificarAmbientes em AbaImportarPDF.jsx), então o número
// real da página precisa vir explícito, não inferido pela posição no array.
function formatarPaginasParaAmbientes(paginas) {
  return paginas
    .filter(p => p.items?.length)
    .map(p => `=== PÁGINA ${p.numero} ===\n${formatarBlocosParaPrompt(agruparEmBlocos(p.items))}`)
    .join('\n\n');
}

async function identificarAmbientesVetorialDirect({ paginas, empresaId }) {
  const contents = [{
    role:  'user',
    parts: [{
      text: `Textos extraídos de páginas do documento, já agrupados por bloco de desenho:\n\n${formatarPaginasParaAmbientes(paginas)}\n\nIdentifique os ambientes conforme instruído. Retorne o JSON array.`,
    }],
  }];
  const model  = getModel(null, MODEL_FALLBACK, { temperature: 0 });
  const result = await generateWithRetry(model, { contents, systemInstruction: PLANTA_SYSTEM_AMBIENTES });
  const rawText = result.response.text();
  const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;
  logUsage({ fluxo: 'identifica_ambientes', empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function identificarAmbientesVetorialProxy({ paginas, empresaId }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'identificar_ambientes', paginas }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { ambientes, tokensEntrada, tokensSaida } = await res.json();
  logUsage({ fluxo: 'identifica_ambientes', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false }).catch(() => {});
  return ambientes;
}

// paginas: [{numero, items: [{texto, x, y, camada?}]}] — numero é a página
// REAL do PDF (não posição no array), pois as páginas vêm de faixas
// não-contíguas (planta de arquitetura + seção de marmoraria). Retorna
// [{ambiente, paginas: [n, ...]}] — só a lista, sem peça/medida/material.
// Isolado do fluxo de extração por enquanto.
export async function identificarAmbientesVetorial({ paginas, empresaId = null }) {
  if (!paginas?.length) throw new Error('Nenhum texto de página fornecido.');
  return USE_PROXY
    ? identificarAmbientesVetorialProxy({ paginas, empresaId })
    : identificarAmbientesVetorialDirect({ paginas, empresaId });
}

// ── PASSO 2 do pipeline sequencial: itens + material por ambiente (isolado) ──
// Roda DEPOIS do Passo 1 (identificarAmbientesVetorial), mas ainda NÃO é
// chamada pelo fluxo de extração completa — recebe um ambiente já identificado
// e só as páginas onde ele aparece, lista item+material, nunca dimensão/medida
// (isso é Passo 3). Sempre no modelo mais barato (flash-lite).
async function identificarItensMateriaisPorAmbienteDirect({ ambiente, paginas, empresaId }) {
  const contents = [{
    role:  'user',
    parts: [{
      text: `Ambiente: ${ambiente}\n\nTextos extraídos das páginas onde esse ambiente aparece, já agrupados por bloco de desenho:\n\n${formatarPaginasParaAmbientes(paginas)}\n\nListe os itens e materiais desse ambiente conforme instruído. Retorne o JSON array.`,
    }],
  }];
  const model  = getModel(null, MODEL_FALLBACK, { temperature: 0 });
  const result = await generateWithRetry(model, { contents, systemInstruction: PLANTA_SYSTEM_ITENS_MATERIAIS });
  const rawText = result.response.text();
  const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;
  logUsage({ fluxo: 'identifica_itens_materiais', empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function identificarItensMateriaisPorAmbienteProxy({ ambiente, paginas, empresaId }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'identificar_itens_materiais', ambiente, paginas }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { itens, tokensEntrada, tokensSaida } = await res.json();
  logUsage({ fluxo: 'identifica_itens_materiais', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false }).catch(() => {});
  return itens;
}

// ambiente: nome de um ambiente já retornado por identificarAmbientesVetorial.
// paginas: [{numero, items}] — só as páginas onde esse ambiente aparece.
// Retorna [{item, material}] — sem dimensão/medida/recorte. Isolado do fluxo
// de extração por enquanto.
export async function identificarItensMateriaisPorAmbiente({ ambiente, paginas, empresaId = null }) {
  if (!ambiente) throw new Error('Nenhum ambiente informado.');
  if (!paginas?.length) throw new Error('Nenhum texto de página fornecido.');
  return USE_PROXY
    ? identificarItensMateriaisPorAmbienteProxy({ ambiente, paginas, empresaId })
    : identificarItensMateriaisPorAmbienteDirect({ ambiente, paginas, empresaId });
}

// ── Casamento subtópico de rodapé → ambiente real (mudança estrutural) ──────
// A ATRIBUIÇÃO DE PÁGINA em si é 100% determinística por código (ver
// localizarSubtopicosMarmoraria em AbaImportarPDF.jsx, que lê literalmente o
// rodapé "CONTEÚDO: MARMORARIA X"). Esta função só resolve o VOCABULÁRIO —
// a qual ambiente real cada subtópico pertence — numa ÚNICA chamada pro
// documento inteiro, nunca repetida por ambiente/página (era isso que
// causava instabilidade entre execuções antes).
async function mapearSubtopicosAmbientesDirect({ subtopicos, ambientes, empresaId }) {
  const contents = [{
    role:  'user',
    parts: [{
      text: `AMBIENTES REAIS:\n${ambientes.join('\n')}\n\nSUBTÓPICOS DE RODAPÉ:\n${subtopicos.join('\n')}\n\nAssocie cada subtópico ao ambiente real conforme instruído. Retorne o JSON array.`,
    }],
  }];
  const model  = getModel(null, MODEL_FALLBACK, { temperature: 0 });
  const result = await generateWithRetry(model, { contents, systemInstruction: PLANTA_SYSTEM_MAPEAR_SUBTOPICOS });
  const rawText = result.response.text();
  const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
  const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;
  logUsage({ fluxo: 'mapeia_subtopicos_ambientes', empresaId, tokensEntrada, tokensSaida, fromCache: false }).catch(() => {}); // telemetria não crítica
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');
  return JSON.parse(jsonMatch[0]);
}

async function mapearSubtopicosAmbientesProxy({ subtopicos, ambientes, empresaId }) {
  const res = await fetch('/api/gemini', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'mapear_subtopicos_ambientes', subtopicos, ambientes }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error('A IA demorou demais para responder (tempo esgotado). Tente novamente em instantes.');
    }
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  const { mapeamento, tokensEntrada, tokensSaida } = await res.json();
  logUsage({ fluxo: 'mapeia_subtopicos_ambientes', empresaId, tokensEntrada: tokensEntrada ?? 0, tokensSaida: tokensSaida ?? 0, fromCache: false }).catch(() => {});
  return mapeamento;
}

// subtopicos: array de strings (subtópicos únicos lidos do rodapé). ambientes:
// array de nomes de ambiente (do resultado do Passo 1). Retorna
// [{subtopico, ambiente}] — ambiente pode ser null se não houver associação clara.
export async function mapearSubtopicosAmbientes({ subtopicos, ambientes, empresaId = null }) {
  if (!subtopicos?.length) throw new Error('Nenhum subtópico informado.');
  if (!ambientes?.length) throw new Error('Nenhum ambiente informado.');
  return USE_PROXY
    ? mapearSubtopicosAmbientesProxy({ subtopicos, ambientes, empresaId })
    : mapearSubtopicosAmbientesDirect({ subtopicos, ambientes, empresaId });
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

// Concorrência do lote de páginas processadas em paralelo. Tier 1 (billing
// ativo) do Gemini aguenta ~1000 RPM em gemini-2.5-flash — 3 é bem conservador
// (evita 429 mesmo com o fallback e o chat rodando ao mesmo tempo) mas já corta
// o tempo total em ~3x frente ao 1-por-vez sequencial de hoje de manhã.
const PAGE_BATCH_CONCURRENCY = 3;

// pageImages: array com TODAS as páginas (já renderizadas client-side).
// onProgress(paginaInicio, totalPaginas, paginaFim): opcional, chamado antes de
// cada LOTE — paginaFim > paginaInicio quando o lote tem mais de uma página.
// Orquestração compartilhada entre o pipeline de visão e o vetorial: contexto
// incremental por lote, merge de atualiza_id, e dedup final. `callBatchForPage`
// recebe (índice da página, contextoAnterior) e retorna os itens brutos daquela
// página — quem chama decide COMO obter esses itens (imagem vs texto).
//
// Páginas de um MESMO lote rodam em paralelo (Promise.all) e por isso não se
// veem entre si: o contextoAnterior enviado a todas elas é só o que já foi
// CONFIRMADO pelos lotes anteriores. É uma limitação aceita em troca da
// velocidade — dedup final (deduplicarItens) cobre o que esse contexto perder.
async function runExtractionPipeline(totalPages, callBatchForPage, onProgress, concurrency = PAGE_BATCH_CONCURRENCY) {
  const allItems = [];
  let nextId = 1;

  for (let inicio = 0; inicio < totalPages; inicio += concurrency) {
    const fim = Math.min(inicio + concurrency, totalPages); // exclusivo
    onProgress?.(inicio + 1, totalPages, fim);

    // Resumo compacto (id/descricao/ambiente/dimensoes) das peças já vistas —
    // dá ao modelo contexto pra reconhecer duplicatas/detalhes sem reenviar a página inteira.
    // `pagina` vai junto pra o modelo poder recusar merge com item de página
    // distante (ver REGRAS DE CONTEXTO) — é o índice local dentro da faixa
    // processada, não a página real do PDF, mas isso não importa aqui: só serve
    // pra comparação relativa de proximidade dentro desta mesma extração.
    const contextoAnterior = allItems.length === 0 ? null : allItems.map(it => ({
      id: it.id, descricao: it.descricao, ambiente: it.ambiente, dimensoes: it.dimensoes,
      pagina: it.pagina, pendente: it.dimensoes === 'a medir',
    }));

    const resultadosDoLote = await Promise.all(
      Array.from({ length: fim - inicio }, (_, k) => callBatchForPage(inicio + k, contextoAnterior))
    );

    // Merge em ordem de página (não de conclusão) — mantém id/pagina determinístico
    // mesmo com as chamadas do lote terminando em ordem diferente da disparada.
    for (let k = 0; k < resultadosDoLote.length; k++) {
      const i = inicio + k;
      for (const item of resultadosDoLote[k]) {
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
  }

  // Segunda camada: pega duplicatas que o modelo não reconheceu via CONTEXTO
  // (ex: mesma peça descrita de forma um pouco diferente em páginas distintas,
  // ou nas mesmas do lote, que não trocaram contexto entre si).
  return deduplicarItens(allItems);
}

export async function analyzePlantPDF({ pageImages, economyMode = false, empresaId = null, onProgress = null }) {
  if (!pageImages?.length) throw new Error('Nenhuma imagem de página fornecida.');

  return runExtractionPipeline(pageImages.length, async (i, contextoAnterior) => {
    try {
      return await analyzePlantPDFBatch({ pageImages: [pageImages[i]], economyMode, empresaId, contextoAnterior, paginaAtual: i + 1 });
    } catch (err) {
      const isTimeout = /504|tempo esgotado|timed out/i.test(err?.message ?? '');
      if (isTimeout && pageImages.length > 1) {
        throw new Error(`Tempo esgotado ao analisar a página ${i + 1} de ${pageImages.length}. Tente novamente — se persistir, envie o PDF em partes menores.`);
      }
      throw err;
    }
  }, onProgress);
}

// pageTextItems: array por página de [{texto, x, y, camada?}] — extraído de PDF
// vetorial (getTextContent) ou de um DXF (entidades TEXT/MTEXT + geometria). DXF
// não tem conceito de página: quem chama passa um array de 1 elemento.
export async function analyzePlantaVetorial({ pageTextItems, empresaId = null, onProgress = null, usarModeloBarato = false }) {
  if (!pageTextItems?.length) throw new Error('Nenhum texto de página fornecido.');

  // isPdfVetorial (caller) decide pela MÉDIA de caracteres nas primeiras páginas —
  // uma capa/página em branco isolada pode ter 0 itens mesmo num PDF vetorial "de
  // verdade". Pula a chamada à IA pra essa página (nada a extrair) em vez de
  // mandar textItems vazio, que a API rejeita com 400.
  return runExtractionPipeline(pageTextItems.length, (i, contextoAnterior) =>
    pageTextItems[i].length === 0
      ? Promise.resolve([])
      : analyzePlantaVetorialBatch({ textItems: pageTextItems[i], empresaId, contextoAnterior, paginaAtual: i + 1, usarModeloBarato }),
  onProgress);
}
