// Agrupamento de textos extraídos (PDF vetorial via getTextContent, ou DXF) em
// BLOCOS de desenho — pra parar de mandar pro modelo uma lista plana ordenada
// só por (y,x) e esperar que ele adivinhe sozinho onde um desenho termina e o
// próximo começa. Puro texto+coordenadas, sem chamada de IA — importado tanto
// pelo pipeline de dev (src/services/aiService.js) quanto pelo proxy de
// produção (api/gemini.js).
//
// Estratégia (em ordem de confiança, sempre degradando com segurança):
//  1. Isola a coluna de LEGENDA/ÍNDICE (lista numerada de ambientes repetida em
//     toda folha do projeto) — nunca elegível a herdar cota/material de outro bloco.
//  2. Detecta títulos de desenho ("VISTA X", "PLANTA BAIXA", "ISOMÉTRICA",
//     "DETALHE"/"DET.", "SEÇÃO") no texto restante — cada título vira uma
//     "âncora" de bloco; o conteúdo entre um título e o título anterior (na
//     leitura de cima pra baixo da página) pertence a esse bloco.
//  3. Sem título nenhum na página: agrupa por salto de espaço vertical (gap)
//     entre linhas — heurística mais fraca, só usada como rede de segurança.
//  4. Sem título e sem gap claro: um bloco único com tudo — o comportamento de
//     antes dessa mudança.

const TITULO_REGEX = /(VISTA\s+\S.*|PLANTA\s+BAIXA.*|ISOM[ÉE]TRICA.*|DETALHE.*|DET\..*|SE[ÇC][ÃA]O.*|SOLEIRA.*)/i;
// Palavras-chave de título pro reparo de fragmento quebrado (ver
// repararTituloQuebrado) — mesmas âncoras de TITULO_REGEX, só sem acento/sem
// grupo de captura, pra comparação simples de prefixo em maiúsculas.
const TITULO_PALAVRAS_CHAVE = ['VISTA', 'PLANTA', 'ISOMETRICA', 'ISOMÉTRICA', 'DETALHE', 'DET.', 'SECAO', 'SEÇÃO', 'SOLEIRA'];
const ROW_TOL = 45;       // pt — títulos com diferença de y menor que isso formam a mesma "fileira" de desenhos
const LINHA_TOL = 8;      // pt — tolerância pra juntar glifos soltos em "linha" só pra detectar título/legenda
const LEGENDA_MIN_STACK = 5; // linhas empilhadas mínimas pra reconhecer uma coluna de legenda/índice
const LEGENDA_X_TOL = 25; // pt — tolerância de x pra considerar linhas da legenda na mesma coluna
const GAP_FALLBACK_FACTOR = 3; // fallback por gap: corta quando o salto de y for > 3x o salto típico

const X_GAP_MAX = 150; // pt — salto horizontal maior que isso é outra legenda/título, não continuação da mesma linha

// Junta glifos soltos em "linha" só pra reconhecer título/legenda (a
// classificação final das cotas usa o item bruto, não a linha). Duas
// condições, as duas na âncora fixa do primeiro item — nunca no último
// inserido, senão uma cadeia de itens cada um a poucos pt do vizinho anterior
// "arrasta" a linha por dezenas de pt (efeito encadeamento):
//  - proximidade vertical (mesma altura de texto)
//  - continuidade horizontal (sem voltar pra trás nem saltar muito em x) —
//    sem isso, duas legendas/títulos que calham de ter y parecido mas ficam
//    em lados opostos da página (ex: coluna de legenda geral x~1000 vs. título
//    de um desenho x~150) se colam numa linha só, e viram um bloco falso.
export function agruparEmLinhas(items, tolerancia = LINHA_TOL) {
  const ordenado = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of ordenado) {
    const atual = linhas[linhas.length - 1];
    const mesmaAltura   = atual && Math.abs(it.y - atual.yAncora) <= tolerancia;
    const continuaEmX   = atual && it.x >= atual.xUltimo - 20 && (it.x - atual.xUltimo) <= X_GAP_MAX;
    if (mesmaAltura && continuaEmX) {
      atual.texto += ' ' + it.texto;
      atual.xMax = Math.max(atual.xMax, it.x);
      atual.xUltimo = it.x;
      atual.itens.push(it);
    } else {
      linhas.push({ y: it.y, yAncora: it.y, xMin: it.x, xMax: it.x, xUltimo: it.x, texto: it.texto, itens: [it] });
    }
  }
  return linhas;
}

function extrairNumeroLegenda(texto) {
  const m = texto.match(/^\(?(\d{1,2})\)?\b/);
  return m ? parseInt(m[1], 10) : null;
}

// "N NOME EM CAIXA ALTA" curto, sem palavras de vista/escala — assinatura da
// lista de ambientes repetida em toda folha de marmoraria do projeto.
function pareceLinhaDeLegenda(linha) {
  const t = linha.texto.trim();
  if (!/^\d{1,2}\s+[A-ZÀ-Ú][A-ZÀ-Ú\s]{2,40}$/.test(t)) return false;
  if (TITULO_REGEX.test(t)) return false;
  if (/ESCALA|CONTEÚDO|PROJETO|CLIENTE|AUTOR/i.test(t)) return false;
  return true;
}

// Isola a maior pilha de linhas "de legenda" alinhadas na mesma coluna (x
// aproximado) — essa pilha é a LEGENDA/ÍNDICE da folha; o resto segue pro
// agrupamento por bloco de desenho.
function isolarLegenda(linhas) {
  const candidatas = linhas.filter(pareceLinhaDeLegenda);
  if (candidatas.length < LEGENDA_MIN_STACK) return { legendaLinhas: [], resto: linhas };

  const colunas = [];
  for (const l of candidatas) {
    let col = colunas.find(c => Math.abs(c.xRef - l.xMin) <= LEGENDA_X_TOL);
    if (!col) { col = { xRef: l.xMin, linhas: [] }; colunas.push(col); }
    col.linhas.push(l);
  }
  const maior = colunas.sort((a, b) => b.linhas.length - a.linhas.length)[0];
  if (!maior || maior.linhas.length < LEGENDA_MIN_STACK) return { legendaLinhas: [], resto: linhas };

  const set = new Set(maior.linhas);
  return { legendaLinhas: maior.linhas, resto: linhas.filter(l => !set.has(l)) };
}

// Corrige título de bloco quebrado em duas "linhas" por um glifo/ícone
// intruso no meio da palavra (ex: ícone numerado da legenda entre "S" e
// "OLEIRA" faz o texto sair como "S" / "OLEIRA ÁREA GOURMET" em vez de uma só
// "SOLEIRA ÁREA GOURMET") — sem isso, TITULO_REGEX nunca reconhece o título e
// o bloco inteiro (com eventual amostra de material) cai em "sem bloco
// identificado". Só funde quando a concatenação de um fragmento CURTO (≤4
// caracteres, sinal de glifo isolado, não palavra normal) com a linha vizinha
// bate o INÍCIO de uma palavra-chave de título conhecida — não mexe em mais
// nada do agrupamento.
function repararTituloQuebrado(linhasOrdenadas) {
  const resultado = [];
  for (let i = 0; i < linhasOrdenadas.length; i++) {
    const atual = linhasOrdenadas[i];
    const proxima = linhasOrdenadas[i + 1];
    const fragmentoCurto = atual.texto.length <= 4 && !atual.texto.includes(' ');
    const mesmaAltura = proxima && Math.abs(proxima.y - atual.yAncora) <= LINHA_TOL;
    const xProximo = proxima && proxima.xMin >= atual.xMax && (proxima.xMin - atual.xMax) <= X_GAP_MAX;
    if (fragmentoCurto && mesmaAltura && xProximo) {
      const juntoUpper = (atual.texto + proxima.texto).toUpperCase();
      const bateu = TITULO_PALAVRAS_CHAVE.some(k => juntoUpper.startsWith(k));
      if (bateu) {
        resultado.push({
          y: atual.y, yAncora: atual.yAncora,
          xMin: atual.xMin, xMax: proxima.xMax, xUltimo: proxima.xUltimo,
          texto: atual.texto + proxima.texto,
          itens: [...atual.itens, ...proxima.itens],
        });
        i++; // já consumiu a próxima linha na fusão
        continue;
      }
    }
    resultado.push(atual);
  }
  return resultado;
}

// Fallback quando não há título reconhecível: corta em grupos sempre que o
// salto vertical entre linhas consecutivas passar de GAP_FALLBACK_FACTOR vezes
// o salto "típico" da página — aproxima blocos por espaço em branco.
function agruparPorGap(linhasOrdenadas) {
  if (linhasOrdenadas.length === 0) return [];
  if (linhasOrdenadas.length === 1) return [[linhasOrdenadas[0]]];
  const deltas = [];
  for (let i = 1; i < linhasOrdenadas.length; i++) deltas.push(linhasOrdenadas[i].y - linhasOrdenadas[i - 1].y);
  const ordenados = [...deltas].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)] || 10;
  const limiar = Math.max(15, mediana * GAP_FALLBACK_FACTOR);

  const grupos = [[linhasOrdenadas[0]]];
  for (let i = 1; i < linhasOrdenadas.length; i++) {
    if (linhasOrdenadas[i].y - linhasOrdenadas[i - 1].y > limiar) grupos.push([]);
    grupos[grupos.length - 1].push(linhasOrdenadas[i]);
  }
  return grupos;
}

// items: [{texto, x, y, camada?}] de UMA página/arquivo (já no formato usado
// pelo pipeline vetorial). Retorna { blocos: [{titulo, numeroLegenda, itens}],
// legenda: [item...], semBloco: [item...] } — sempre as 3 chaves, mesmo vazias.
export function agruparEmBlocos(items) {
  if (!items?.length) return { blocos: [], legenda: [], semBloco: [] };

  const linhas = agruparEmLinhas(items);
  const { legendaLinhas, resto: restoBruto } = isolarLegenda(linhas);
  const legenda = legendaLinhas.flatMap(l => l.itens);

  const resto = repararTituloQuebrado([...restoBruto].sort((a, b) => a.y - b.y || a.xMin - b.xMin));
  const tituloLinhas = resto.filter(l => TITULO_REGEX.test(l.texto));

  if (tituloLinhas.length === 0) {
    // Sem título reconhecível: fallback por gap espacial. Se nem isso separar
    // nada (só 1 grupo), degrada sozinho pro bloco único de sempre.
    const restoOrdenado = [...resto].sort((a, b) => a.y - b.y);
    const grupos = agruparPorGap(restoOrdenado);
    const blocos = grupos
      .map(g => ({ titulo: null, numeroLegenda: null, itens: g.flatMap(l => l.itens) }))
      .filter(b => b.itens.length > 0);
    return { blocos, legenda, semBloco: [] };
  }

  const tituloItens = new Set(tituloLinhas.flatMap(l => l.itens));

  // Agrupa títulos em "fileiras" (mesma banda de y, desenhos lado a lado).
  const ordenadosPorY = [...tituloLinhas].sort((a, b) => a.y - b.y);
  const rows = [];
  for (const t of ordenadosPorY) {
    // compara contra a âncora (y do primeiro título da fileira) — mesmo motivo
    // do agruparEmLinhas: evita encadeamento juntando fileiras que na verdade
    // estão longe uma da outra na página
    const row = rows.find(r => Math.abs(r.yAncora - t.y) <= ROW_TOL);
    if (row) { row.titulos.push(t); row.y = Math.max(row.y, t.y); }
    else rows.push({ y: t.y, yAncora: t.y, titulos: [t] });
  }
  rows.sort((a, b) => a.y - b.y);

  // O conteúdo de um bloco fica ACIMA do seu próprio título (a legenda/rótulo
  // vem embaixo do desenho, não em cima) — confirmado nos PDFs reais
  // inspecionados. yTop/yBottom delimitam essa faixa vertical.
  const blocos = [];
  rows.forEach((row, ri) => {
    const yTop = ri === 0 ? -Infinity : rows[ri - 1].y;
    const yBottom = row.y;
    const colunas = [...row.titulos].sort((a, b) => a.xMin - b.xMin);
    colunas.forEach((t, ci) => {
      const xEsq = ci === 0 ? -Infinity : (colunas[ci - 1].xMax + t.xMin) / 2;
      const xDir = ci === colunas.length - 1 ? Infinity : (t.xMax + colunas[ci + 1].xMin) / 2;
      blocos.push({ titulo: t.texto.trim(), numeroLegenda: extrairNumeroLegenda(t.texto), yTop, yBottom, xEsq, xDir, itens: [] });
    });
  });

  const semBloco = [];
  const legendaSet = new Set(legenda);
  for (const item of items) {
    if (legendaSet.has(item) || tituloItens.has(item)) continue;
    const alvo = blocos.find(b => item.y > b.yTop && item.y <= b.yBottom && item.x >= b.xEsq && item.x < b.xDir);
    if (alvo) alvo.itens.push(item);
    else semBloco.push(item);
  }

  return { blocos: blocos.filter(b => b.itens.length > 0), legenda, semBloco };
}

function formatarItem(it) {
  return `"${it.texto}" @ (${it.x},${it.y})${it.camada ? ` [camada:${it.camada}]` : ''}`;
}

// Formata o resultado de agruparEmBlocos no texto enviado ao modelo — cada
// bloco com seu título e, quando reconhecido, o número da legenda associado.
export function formatarBlocosParaPrompt({ blocos, legenda, semBloco }) {
  const partes = [];

  blocos.forEach((b, i) => {
    const cabecalho = b.titulo
      ? `[BLOCO ${i + 1} — "${b.titulo}"${b.numeroLegenda != null ? ` — item da legenda: ${b.numeroLegenda}` : ''}]`
      : `[BLOCO ${i + 1} — sem título identificado]`;
    partes.push(`${cabecalho}\n${b.itens.map(formatarItem).join('\n')}`);
  });

  if (legenda.length > 0) {
    partes.push(`[LEGENDA/ÍNDICE DA FOLHA — lista geral de peças do projeto, SEM vista própria nesta página — NÃO associe cota nem material vindos de outro bloco a estes nomes]\n${legenda.map(formatarItem).join('\n')}`);
  }

  if (semBloco.length > 0) {
    partes.push(`[SEM BLOCO IDENTIFICADO — texto que não deu pra associar com confiança a um desenho específico; use com cautela]\n${semBloco.map(formatarItem).join('\n')}`);
  }

  return partes.join('\n\n');
}
