// Vercel Serverless Function — proxy para Gemini API.
// Mantém a chave GEMINI_API_KEY server-side (sem VITE_).
// Configurar em Vercel Dashboard → Settings → Environment Variables → GEMINI_API_KEY.

import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  api: {
    bodyParser: { sizeLimit: '20mb' },
  },
  maxDuration: 60,
};

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const MODEL_PRIMARY   = 'gemini-2.5-flash';
const MODEL_FALLBACK  = 'gemini-2.5-flash-lite';
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
  return genAI.getGenerativeModel({
    model: modelName,
    ...(generationConfig ? { generationConfig } : {}),
    ...(withTools?.length ? {
      tools:      [{ functionDeclarations: withTools }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    } : {}),
  });
}

// ── System prompts (PDF) ──────────────────────────────────────────────────────

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
      const { pageImages, economyMode } = body;

      if (!pageImages?.length) {
        return res.status(400).json({ error: 'pageImages é obrigatório.' });
      }

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

    return res.status(400).json({ error: `Tipo desconhecido: ${type}` });

  } catch (err) {
    console.error('[api/gemini]', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Erro interno do servidor.' });
  }
}
