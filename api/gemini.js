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

// ── System prompts (PDF) ──────────────────────────────────────────────────────
// Bloco compartilhado entre o pipeline de visão (PLANTA_SYSTEM_FULL, imagem de
// página) e o vetorial (PLANTA_SYSTEM_VETORIAL, texto+coordenadas de PDF
// vetorial ou DXF — ver type: 'analyze_vetorial'). Só RECORTES muda entre os dois.

const PLANTA_TIPOS_E_REGRAS = `TIPOS DE PEÇAS E COMO LER SUAS DIMENSÕES:

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
- Anotações como "FRENTE REVESTIDA" ou "FRENTE ... EM PEDRA" indicam que só aquele lado tem acabamento em pedra — não assuma que os outros lados da ilha também precisam de peça a menos que estejam desenhados/cotados separadamente`;

const PLANTA_RECORTES_VISUAL = `REGRAS PARA RECORTES (cubas, cooktops, torneiras e outros rebaixos/aberturas na peça):
- Identifique TODOS os recortes desenhados na peça: cuba/pia, cooktop, torneira, e outros rebaixos ou aberturas (ex.: nicho, dreno, filtro)
- Para cada recorte, retorne um objeto com:
  - funcao_label: nome do recorte em português, capitalizado (ex: "Cuba", "Cooktop", "Torneira", "Furo")
  - formato: "circular" quando o contorno desenhado é arredondado (ex: furo de torneira), "retangular" quando o contorno é reto (maioria das cubas e cooktops)
  - diametro_cm: SOMENTE quando formato = "circular" e a cota estiver visível; senão null
  - largura_cm e altura_cm: SOMENTE quando formato = "retangular" e as cotas estiverem visíveis; senão null
  - posicao_aproximada: descrição curta da posição na peça (ex: "canto inferior esquerdo", "centralizado à direita", "próximo à parede")
- NÃO invente dimensões do recorte sem cota explícita — mesmo sem cota, registre o recorte com funcao_label, formato (se identificável) e posicao_aproximada, deixando as dimensões como null
- Uma peça pode ter múltiplos recortes`;

const PLANTA_RECORTES_TEXTO = `REGRAS PARA RECORTES (cubas, cooktops, torneiras) — SEM DESENHO, SÓ TEXTO:
- Como você não vê o ícone/contorno do recorte, só extraia um recorte quando houver uma ANOTAÇÃO TEXTUAL explícita identificando-o perto da peça (ex: "CUBA DECA DE SOBREPOR", "TORNEIRA DE BANCADA - BICA ALTA"). "RALO APARENTE" NÃO é anotação de cuba — não conta como recorte de cuba
- Para cada recorte, retorne um objeto com:
  - funcao_label: nome do recorte em português, capitalizado (ex: "Cuba", "Cooktop", "Torneira")
  - formato: null, a menos que a própria anotação de texto diga explicitamente "circular"/"redondo" ou "retangular"/"quadrado"
  - diametro_cm / largura_cm / altura_cm: null, a menos que haja uma cota numérica próxima explicitamente associada ao recorte (não invente a partir de um "tamanho típico")
  - posicao_aproximada: baseada na posição relativa (x,y) do texto do recorte dentro da peça (ex: coordenada x menor = mais à esquerda)
- Uma peça pode ter múltiplos recortes`;

const PLANTA_EXTRACAO_E_CONTEXTO = `REGRAS DE EXTRAÇÃO:
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
- Itens que não aparecem no CONTEXTO são peças novas: retorne normalmente, com "atualiza_id": null`;

const PLANTA_SCHEMA = `Para cada item retorne:
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

const PLANTA_SYSTEM_FULL = `Você é um especialista em leitura de plantas baixas para marmoraria. Analise TODAS as imagens/páginas do PDF e identifique os itens em pedra natural ou artificial.

${PLANTA_TIPOS_E_REGRAS}

${PLANTA_RECORTES_VISUAL}

${PLANTA_EXTRACAO_E_CONTEXTO}

${PLANTA_SCHEMA}`;

// Pipeline vetorial (PDF com texto real, ou DXF): sem imagem, recebe uma lista de
// {texto, x, y, camada?} formatada como texto no corpo da mensagem (ver handler
// type: 'analyze_vetorial'). Reaproveita as mesmas regras de tipo/dimensionamento/
// contexto do pipeline de visão — só recortes muda (sem ícone pra ver formato).
const PLANTA_SYSTEM_VETORIAL = `Você é um especialista em leitura de plantas baixas para marmoraria. Você NÃO recebe uma imagem do desenho — recebe uma lista de textos extraídos de um PDF vetorial ou arquivo DXF, cada um com sua posição (x,y em pontos/unidades do desenho, origem no canto superior esquerdo da página) e, quando disponível, a camada (layer) de origem. Use a proximidade espacial entre os textos pra inferir quais números são cota de qual peça — um valor numérico perto de um rótulo de ambiente ou de outro texto relacionado geralmente pertence à mesma peça/cota. Itens marcados "[cota ...]" vêm de entidades de cotagem do CAD (medida calculada pelo software) — trate como cota explícita, tão confiável quanto texto escrito pelo autor. Já itens marcados "[linha ...]" ou "[polilinha ...]" são geometria pura (comprimento medido no desenho, sem ser uma cota de verdade) — use como apoio SOMENTE quando não houver "[cota ...]" nem texto explícito por perto, e nesse caso retorne confianca mais baixa; "[cota ...]" e texto explícito sempre têm prioridade sobre geometria inferida. Itens marcados "[objeto] ..." vêm do nome de um bloco/família do CAD instanciado naquela posição (comum em louças/torneiras/mobiliário exportados de BIM) — o nome costuma descrever o objeto (ex: "Sink - Bathroom - Cuba de apoio redonda" = uma cuba ali) mesmo sem cota anexada; use isso pra identificar recortes (cuba/torneira) mas sem inventar dimensão que não esteja explícita em algum "[cota ...]" ou texto próximo.

${PLANTA_TIPOS_E_REGRAS}

${PLANTA_RECORTES_TEXTO}

${PLANTA_EXTRACAO_E_CONTEXTO}

${PLANTA_SCHEMA}`;

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
      const { pageImages, economyMode, contextoAnterior } = body;

      if (!pageImages?.length) {
        return res.status(400).json({ error: 'pageImages é obrigatório.' });
      }

      const systemPrompt = economyMode ? PLANTA_SYSTEM_ECONOMY : PLANTA_SYSTEM_FULL;

      const imageParts = pageImages.map((dataUrl) => {
        const [header, data] = dataUrl.split(',');
        const mimeType       = header.match(/:(.*?);/)[1];
        return { inlineData: { data, mimeType } };
      });

      // contextoAnterior: array [{id, descricao, ambiente, dimensoes}] das peças já
      // identificadas em páginas anteriores — texto compacto, nunca reenvia imagens.
      const contextText = contextoAnterior?.length
        ? `CONTEXTO — peças já identificadas em páginas anteriores deste mesmo projeto (use pra não duplicar, ver REGRAS DE CONTEXTO):\n${JSON.stringify(contextoAnterior)}\n\n`
        : '';

      const contents = [{
        role:  'user',
        parts: [
          { text: `${contextText}Analise as seguintes imagens e extraia os itens conforme instruído:` },
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
      const { textItems, contextoAnterior } = body;

      if (!textItems?.length) {
        return res.status(400).json({ error: 'textItems é obrigatório.' });
      }

      const contextText = contextoAnterior?.length
        ? `CONTEXTO — peças já identificadas em páginas anteriores deste mesmo projeto (use pra não duplicar, ver REGRAS DE CONTEXTO):\n${JSON.stringify(contextoAnterior)}\n\n`
        : '';

      const ordenado = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);
      const textoFormatado = ordenado
        .map(it => `"${it.texto}" @ (${it.x},${it.y})${it.camada ? ` [camada:${it.camada}]` : ''}`)
        .join('\n');

      const contents = [{
        role:  'user',
        parts: [{
          text: `${contextText}Lista de textos extraídos desta página/arquivo, com posição (x,y em pontos/unidades do desenho, origem no canto superior esquerdo):\n\n${textoFormatado}\n\nAnalise e extraia os itens conforme instruído. Retorne o JSON array dos itens encontrados.`,
        }],
      }];

      const model    = getModel(genAI, null, MODEL_PRIMARY,  { temperature: 0 });
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
