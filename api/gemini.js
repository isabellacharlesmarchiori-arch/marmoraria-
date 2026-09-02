// Vercel Serverless Function — proxy para Gemini API.
// Mantém a chave GEMINI_API_KEY server-side (sem VITE_).
// Configurar em Vercel Dashboard → Settings → Environment Variables → GEMINI_API_KEY.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PLANTA_SYSTEM_FULL, PLANTA_SYSTEM_VETORIAL, PLANTA_SYSTEM_ECONOMY } from '../src/shared/plantaPrompts.js';
import { agruparEmBlocos, formatarBlocosParaPrompt } from '../src/shared/vetorialBlocos.js';

export const config = {
  api: {
    bodyParser: { sizeLimit: '20mb' },
  },
  maxDuration: 60,
};

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const MODEL_PRIMARY   = 'gemini-2.5-flash';
const MODEL_FALLBACK  = 'gemini-3.5-flash-lite';
const RETRY_DELAYS_MS = [2000, 4000, 8000];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
      if (!is503(err)) throw err;
      if (attempt === RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  if (fallbackModel) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await fallbackModel.generateContent(params);
      } catch (err) {
        if (!is503(err)) throw err;
        if (attempt === 2) break;
        await sleep([2000, 4000][attempt]);
      }
    }
  }
  throw new Error('Serviço temporariamente sobrecarregado. Tente novamente em instantes.');
}

function toFunctionDeclarations(tools) {
  return (tools ?? []).map(t => ({
    name:        t.function.name,
    description: t.function.description,
    parameters:  t.function.parameters,
  }));
}

function getModel(genAI, withTools, modelName, generationConfig) {
  // DEBUG TEMPORÁRIO — remover depois de confirmar qual key/projeto está ativo.
  console.log(`[AI][debug] model=${modelName} key=...${GEMINI_API_KEY?.slice(-4) ?? 'undefined'}`);
  return genAI.getGenerativeModel({
    model: modelName,
    ...(generationConfig ? { generationConfig } : {}),
    ...(withTools?.length ? {
      tools:      [{ functionDeclarations: withTools }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    } : {}),
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor. Adicione em Vercel → Settings → Environment Variables.' });
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const { type, ...body } = req.body ?? {};

  try {
    // ── Chat (callGemini) ─────────────────────────────────────────────────────
    if (type === 'chat') {
      const { systemPrompt, history, tools } = body;

      if (!history?.length) {
        return res.status(400).json({ error: 'history é obrigatório.' });
      }

      const declarations = toFunctionDeclarations(tools);
      const hasTools     = declarations.length > 0;
      const model        = getModel(genAI, hasTools ? declarations : null, MODEL_PRIMARY);
      const fallback     = getModel(genAI, hasTools ? declarations : null, MODEL_FALLBACK);

      const result   = await generateWithRetry(model, { contents: history, systemInstruction: systemPrompt }, fallback);
      const response = result.response;

      const rawCalls      = response.functionCalls();
      const hasCalls      = rawCalls?.length > 0;
      const functionCalls = hasCalls ? rawCalls : null;
      const text          = hasCalls ? null : (response.text() || null);
      const tokensEntrada = response.usageMetadata?.promptTokenCount     ?? 0;
      const tokensSaida   = response.usageMetadata?.candidatesTokenCount ?? 0;

      return res.status(200).json({ text, functionCalls, tokensEntrada, tokensSaida });
    }

    // ── PDF analysis (analyzePlantPDF) ────────────────────────────────────────
    if (type === 'analyze_pdf') {
      const { pageImages, economyMode, contextoAnterior, paginaAtual } = body;

      if (!pageImages?.length) {
        return res.status(400).json({ error: 'pageImages é obrigatório.' });
      }

      const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;

      const imageParts = pageImages.map((dataUrl) => {
        const [header, data] = dataUrl.split(',');
        const mimeType       = header.match(/:(.*?);/)[1];
        return { inlineData: { data, mimeType } };
      });

      // contextoAnterior: array [{id, descricao, ambiente, dimensoes, pagina}] das
      // peças já identificadas em páginas anteriores — texto compacto, nunca
      // reenvia imagens. paginaAtual dá ao modelo como comparar contra a "pagina"
      // do CONTEXTO e recusar merge com item de página distante (ver REGRAS DE CONTEXTO).
      const paginaAtualText = paginaAtual != null ? `Página atual (dentro desta análise): ${paginaAtual}\n\n` : '';
      const contextText = contextoAnterior?.length
        ? `CONTEXTO — peças já identificadas em páginas anteriores deste mesmo projeto (use pra não duplicar, ver REGRAS DE CONTEXTO):\n${JSON.stringify(contextoAnterior)}\n\n`
        : '';

      const contents = [{
        role:  'user',
        parts: [
          { text: `${paginaAtualText}${contextText}Analise as seguintes imagens e extraia os itens conforme instruído:` },
          ...imageParts,
          { text: 'Retorne o JSON array dos itens encontrados.' },
        ],
      }];

      const model    = getModel(genAI, null, MODEL_PRIMARY,  { temperature: 0 });
      const fallback = getModel(genAI, null, MODEL_FALLBACK, { temperature: 0 });
      const result   = await generateWithRetry(model, { contents, systemInstruction: systemPrompt }, fallback);
      const rawText  = result.response.text();
      const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
      const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;

      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');

      return res.status(200).json({ items: JSON.parse(jsonMatch[0]), tokensEntrada, tokensSaida });
    }

    // ── Vetorial analysis (analyzePlantaVetorial) — PDF com texto real ou DXF ──
    if (type === 'analyze_vetorial') {
      const { textItems, contextoAnterior, paginaAtual, usarModeloBarato } = body;

      if (!textItems?.length) {
        return res.status(400).json({ error: 'textItems é obrigatório.' });
      }

      const paginaAtualText = paginaAtual != null ? `Página atual (dentro desta análise): ${paginaAtual}\n\n` : '';
      const contextText = contextoAnterior?.length
        ? `CONTEXTO — peças já identificadas em páginas anteriores deste mesmo projeto (use pra não duplicar, ver REGRAS DE CONTEXTO):\n${JSON.stringify(contextoAnterior)}\n\n`
        : '';

      const textoFormatado = formatarBlocosParaPrompt(agruparEmBlocos(textItems));

      const contents = [{
        role:  'user',
        parts: [{
          text: `${paginaAtualText}${contextText}Textos extraídos desta página/arquivo, já agrupados por bloco de desenho, com posição (x,y em pontos/unidades do desenho, origem no canto superior esquerdo):\n\n${textoFormatado}\n\nAnalise e extraia os itens conforme instruído. Retorne o JSON array dos itens encontrados.`,
        }],
      }];

      // usarModeloBarato: modo debug de teste de página única (dev only) — usa
      // direto o flash-lite, sem o custo do flash "de verdade".
      const model    = getModel(genAI, null, usarModeloBarato ? MODEL_FALLBACK : MODEL_PRIMARY, { temperature: 0 });
      const fallback = getModel(genAI, null, MODEL_FALLBACK, { temperature: 0 });
      const result   = await generateWithRetry(model, { contents, systemInstruction: PLANTA_SYSTEM_VETORIAL }, fallback);
      const rawText  = result.response.text();
      const tokensEntrada = result.response.usageMetadata?.promptTokenCount     ?? 0;
      const tokensSaida   = result.response.usageMetadata?.candidatesTokenCount ?? 0;

      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('IA não retornou JSON válido. Tente novamente.');

      return res.status(200).json({ items: JSON.parse(jsonMatch[0]), tokensEntrada, tokensSaida });
    }

    return res.status(400).json({ error: `Tipo desconhecido: ${type}` });

  } catch (err) {
    console.error('[api/gemini]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Erro interno do servidor.' });
  }
}
