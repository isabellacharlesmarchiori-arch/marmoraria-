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
//  3. Sem título nenhum na página, mas com posição de imagem embutida
//     disponível (ver vetorialImagens.js — cada isométrica/vista nesses PDFs
//     é uma foto/render colado, não vetor de CAD): agrupa por proximidade da
//     imagem mais perto — mais confiável que gap vertical porque usa onde o
//     desenho de fato está, não só espaço em branco.
//  4. Sem título e sem imagem: agrupa por salto de espaço vertical (gap)
//     entre linhas — heurística mais fraca, só usada como rede de segurança.
//  5. Sem título, sem imagem e sem gap claro: um bloco único com tudo — o
//     comportamento de antes dessa mudança.
//
// `imagePositions` (opcional, default []) e `pageSize` (opcional, default
// null) são retrocompatíveis: omitidos, o comportamento é IDÊNTICO ao de
// antes dessa mudança (nenhum caller existente precisa mudar). Quando
// fornecidos, cada bloco retornado ganha um campo `imagem` (bbox associado
// ou null) — usado pelo passo 3 acima e, fora do escopo desta função, pra
// gerar um preview visual recortado do desenho de cada bloco.

// Âncoras genéricas de vista/detalhe (VISTA/PLANTA BAIXA/ISOMÉTRICA/DETALHE/
// DET./SEÇÃO) + tipos de peça (ver PLANTA_TIPOS_E_REGRAS em plantaPrompts.js)
// que também aparecem como título real de desenho nessa convenção de projeto
// — mesmo formato "<TIPO> <NOME>" da legenda (ex: título real "BORDA PISCINA"
// escrito direto na página, achado real na pág. 47 de um PDF de teste, fora
// da legenda numerada). Seguro incluir tipo de peça aqui MESMO sabendo que a
// legenda numerada lista as mesmas palavras — isolarLegenda (ver
// pareceLinhaDeLegenda) não depende mais de TITULO_REGEX pra decidir o que é
// legenda desde o Fix A (proteção por formato de linha + coluna de x, não por
// palavra) — só falha nesse ponto se a legenda da página tiver MENOS de
// LEGENDA_MIN_STACK linhas na mesma coluna, caso-limite que já valia pra
// SOLEIRA antes de virem as outras palavras.
//
// Âncoras genéricas: case-insensitive (termos técnicos, baixo risco de
// aparecer em frase comum). Tipos de peça: SEM case-insensitive — exige
// maiúsculas. Achado real (pág. 47, mesmo PDF de teste): a anotação de
// material "Borda em Itaúnas escovado" (frase normal, só inicial maiúscula)
// batia em `BORDA.*` case-insensitive e virava um SEGUNDO título falso na
// mesma página — como ele fica longe (>ROW_TOL) do título real "BORDA
// PISCINA", a peça era cortada em 2 blocos (10 itens + 4 itens), gerando 2
// linhas duplicadas com dimensão incompleta. Título/legenda de verdade nesses
// PDFs são sempre escritos em CAIXA ALTA ("BORDA PISCINA", "SOLEIRA ENTRADA
// GOURMET", toda a legenda) — exigir maiúscula filtra a frase comum sem
// perder o título real. Risco residual aceito (mesma categoria seguro que o
// Fix A já tinha): se um projeto de outro escritório escrever legenda/título
// em minúscula ou caixa mista, essa página deixa de ter título reconhecido e
// cai no fallback mais fraco — nunca gera nome errado, só fica sem nome.
const TITULO_REGEX_VISTA = /(VISTA\s+\S.*|PLANTA\s+BAIXA.*|ISOM[ÉE]TRICA.*|DETALHE.*|DET\..*|SE[ÇC][ÃA]O.*)/i;
const TITULO_REGEX_PECA  = /(SOLEIRA|BANCADA|TAMPO|BORDA|PRATELEIRA|MESA|FAIXA|SAIA|PEITORIL|FRONT[ÃA]O|ESPELHO|PEN[ÍI]NSULA).*/;
const TITULO_REGEX = { test: t => TITULO_REGEX_VISTA.test(t) || TITULO_REGEX_PECA.test(t) };
// Palavras-chave de título pro reparo de fragmento quebrado (ver
// repararTituloQuebrado) — mesmas âncoras de TITULO_REGEX, só sem acento/sem
// grupo de captura, pra comparação simples de prefixo em maiúsculas.
const TITULO_PALAVRAS_CHAVE = [
  'VISTA', 'PLANTA', 'ISOMETRICA', 'ISOMÉTRICA', 'DETALHE', 'DET.', 'SECAO', 'SEÇÃO', 'SOLEIRA',
  'BANCADA', 'TAMPO', 'BORDA', 'PRATELEIRA', 'MESA', 'FAIXA', 'SAIA', 'PEITORIL',
  'FRONTAO', 'FRONTÃO', 'ESPELHO', 'PENINSULA', 'PENÍNSULA',
];
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

// "N NOME EM CAIXA ALTA" curto — assinatura da lista de ambientes repetida em
// toda folha de marmoraria do projeto. NÃO exclui linha só por bater em
// TITULO_REGEX (ex: "10 SOLEIRA ENTRADA GOURMET") — a legenda sempre lista
// peças cujo nome pode coincidir com uma palavra-chave de título (SOLEIRA é
// ao mesmo tempo tipo de peça e âncora de título real). Excluir aqui arrancava
// essas linhas da pilha de legenda e as promovia a título de bloco falso,
// sequestrando o conteúdo real da página inteira sob o nome errado (achado
// real: pág. 47 de um PDF de teste, bloco "Soleira Entrada Gourmet" absorveu
// todas as cotas de um desenho de borda de piscina não relacionado). A defesa
// contra engolir um título de desenho VERDADEIRO continua de pé via
// isolarLegenda (só vira legenda quem cai na MESMA coluna de x de ≥5 outras
// linhas nesse formato — LEGENDA_X_TOL — um título real, impresso perto do
// desenho, normalmente não coincide em x com a coluna fixa da legenda).
function pareceLinhaDeLegenda(linha) {
  const t = linha.texto.trim();
  if (!/^\d{1,2}\s+[A-ZÀ-Ú][A-ZÀ-Ú\s]{2,40}$/.test(t)) return false;
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

// ── Associação bloco ↔ imagem embutida (opcional — ver cabeçalho do arquivo) ─

// Blocos de borda (primeiro/último título de uma fileira/coluna) têm bounds
// ±Infinity de propósito (todo texto até a borda da página pertence a eles).
// Pra comparar sobreposição de área com o bbox de uma imagem, isso precisa
// virar número real primeiro — sem clamp, um bound infinito teria overlap
// não-nulo com QUALQUER imagem e a métrica nunca discrimina nada.
function clampRect(rect, pageSize) {
  return {
    xEsq: Math.max(0, Number.isFinite(rect.xEsq) ? rect.xEsq : 0),
    xDir: Math.min(pageSize.width, Number.isFinite(rect.xDir) ? rect.xDir : pageSize.width),
    yTop: Math.max(0, Number.isFinite(rect.yTop) ? rect.yTop : 0),
    yBottom: Math.min(pageSize.height, Number.isFinite(rect.yBottom) ? rect.yBottom : pageSize.height),
  };
}

function areaRect(r) {
  return Math.max(0, r.xDir - r.xEsq) * Math.max(0, r.yBottom - r.yTop);
}

function iou(a, b) {
  const inter = {
    xEsq: Math.max(a.xEsq, b.xEsq), xDir: Math.min(a.xDir, b.xDir),
    yTop: Math.max(a.yTop, b.yTop), yBottom: Math.min(a.yBottom, b.yBottom),
  };
  const areaInter = areaRect(inter);
  if (areaInter === 0) return 0;
  const uniao = areaRect(a) + areaRect(b) - areaInter;
  return uniao > 0 ? areaInter / uniao : 0;
}

function centroDentro(imagem, rect) {
  const cx = (imagem.xEsq + imagem.xDir) / 2;
  const cy = (imagem.yTop + imagem.yBottom) / 2;
  return cx >= rect.xEsq && cx <= rect.xDir && cy >= rect.yTop && cy <= rect.yBottom;
}

// Associa a UMA imagem o retângulo de um bloco já delimitado (por título) —
// IoU primeiro (bloco e imagem realmente se sobrepõem); sem overlap nenhum
// (comum quando o título fica bem acima/abaixo da imagem, sem tocar o
// retângulo do bloco), cai pro fallback "centro da imagem cai dentro do
// retângulo do bloco".
// DÍVIDA TÉCNICA CONHECIDA: em blocos com retângulo largo/sem limite (comum
// no primeiro/último bloco de uma fileira, com xEsq ou xDir clampado na
// borda da página), o IoU pode favorecer uma imagem que cabe dentro desse
// retângulo largo mas está longe de onde o título/conteúdo do bloco de fato
// está — só afeta qual imagem aparece no preview ("ver desenho"), não o
// texto agrupado (que vem 100% da posição de título, sem depender disso).
// Achado real: pág. 42 de um PDF de teste, bloco "Soleira Preto São
// Gabriel..." pegou a imagem errada (um elemento sem relação, não a
// isométrica da peça). Não corrigido ainda — priorizado depois da Fase 2.
function associarImagemAoBloco(blocoRectClamped, imagePositions) {
  let melhor = null, melhorScore = 0;
  for (const img of imagePositions) {
    const score = iou(blocoRectClamped, img);
    if (score > melhorScore) { melhorScore = score; melhor = img; }
  }
  if (melhor) return melhor;
  return imagePositions.find(img => centroDentro(img, blocoRectClamped)) ?? null;
}

// pt — raio de proximidade pro fallback por imagem (agruparPorProximidadeDeImagem);
// mesma ordem de grandeza da margem usada no recorte de preview.
const MARGEM_PROXIMIDADE_IMAGEM = 60;

function distanciaAteRect(px, py, rect) {
  const dx = Math.max(rect.xEsq - px, 0, px - rect.xDir);
  const dy = Math.max(rect.yTop - py, 0, py - rect.yBottom);
  return Math.hypot(dx, dy);
}

// pt — distância mínima ENTRE imagens (borda a borda) pra elas contarem como
// "desenhos distintos" na hora de decidir sub-particionar. Sem isso, um único
// desenho com ícones/recortes próximos (ex: soleira com símbolo de cuba do
// lado) fragmentaria à toa, separando segmentos de cota que precisam ficar
// no MESMO bloco pra regra de soma funcionar (ver PLANTA_TIPOS_E_REGRAS,
// "REGRAS PARA SOMAR SEGMENTOS DE COTA"). Calibrado com 2 casos reais
// inspecionados num PDF de teste: pino-de-mapa x isométrica real (~162pt de
// distância — deve separar) vs. 3 imagens de uma mesma soleira (~86-91pt —
// NÃO deve separar).
const MARGEM_MINIMA_SUBPARTICAO = 120;

function distanciaEntreRects(a, b) {
  const dx = Math.max(a.xEsq - b.xDir, b.xEsq - a.xDir, 0);
  const dy = Math.max(a.yTop - b.yBottom, b.yTop - a.yBottom, 0);
  return Math.hypot(dx, dy);
}

// Agrupa imagens próximas (distância < margemMinima) em "clusters" por
// encadeamento (single-linkage) — NÃO um filtro par-a-par simples: um logo
// no canto e um mapa de pinos logo abaixo dele podem estar perto um do outro
// mas longe de uma terceira imagem (a isométrica real) — um filtro
// "isolada de TODAS as outras" reprovaria logo+mapa (por estarem perto entre
// si) sem nunca reconhecer que, JUNTOS, formam um cluster bem separado da
// isométrica. Clusterizar primeiro e comparar CLUSTERS (não imagens
// individuais) resolve isso. Retorna um bbox (união) por cluster.
function clusterizarImagens(imagens, margemMinima) {
  let clusters = imagens.map(img => [img]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i < clusters.length && !mudou; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const perto = clusters[i].some(a => clusters[j].some(b => distanciaEntreRects(a, b) < margemMinima));
        if (perto) {
          clusters[i] = clusters[i].concat(clusters[j]);
          clusters.splice(j, 1);
          mudou = true;
          break;
        }
      }
    }
  }
  return clusters.map(grupo => ({
    xEsq: Math.min(...grupo.map(g => g.xEsq)),
    xDir: Math.max(...grupo.map(g => g.xDir)),
    yTop: Math.min(...grupo.map(g => g.yTop)),
    yBottom: Math.max(...grupo.map(g => g.yBottom)),
  }));
}

// Sub-particiona um bloco JÁ delimitado por título em vários, um por imagem,
// quando esse bloco abrange 2+ imagens distintas. Existe porque título
// sozinho não separa pino-de-mapa/localização de cota real quando os dois
// caem dentro da MESMA faixa geométrica de um único título — comum em vistas
// de detalhe que também trazem uma mini-planta de localização ao lado (ver
// investigação real: bloco "ISOMÉTRICA 14" continha tanto os pinos 3,4,5,6
// quanto a cota real 225/103, cada grupo perto de uma imagem diferente).
//
// Bloco com 0-1 imagem dentro sai INALTERADO (retorna array de 1 elemento,
// idêntico ao bloco recebido) — risco zero de regressão nos blocos que já
// tinham imagem única (a maioria).
//
// Mínimo de itens pra um cluster contar como "desenho distinto" (ganhar
// cartão próprio) — sem isso, um logo/carimbo de canto (pequeno, mas
// presente em toda página do documento) rouba 2-3 números soltos que
// calham de estar mais perto dele que do desenho de verdade, e vira um
// cartão quase vazio ("ISOMÉTRICA N" com 3 itens e a imagem do logo) ao
// lado do cartão de verdade — achado real inspecionando o PDF de teste
// (pág. 42: bloco "ISOMÉTRICA 1" saiu partido em 3 itens + 17 itens; os 3
// eram só ruído perto do logo do cabeçalho, repetido em TODA página do doc).
const MIN_ITENS_SUBBLOCO = 5;

// pt/cm — "parece cota": sinal imperfeito (o pipeline PDF-vetorial não marca
// cota com tag, ao contrário do DXF — texto de cota e de pino de
// locação/índice de legenda têm o MESMO formato bruto: número puro). Uso
// magnitude como proxy: nos casos reais inspecionados, pino/índice de
// legenda ficou sempre ≤14 (bate com a contagem de itens da legenda desse
// projeto — ver pareceLinhaDeLegenda, \d{1,2}), cota real (mesmo pequena,
// tipo os segmentos "20" da Borda Piscina) ficou ≥20. Viés do erro é seguro:
// um falso negativo aqui (uma cota pequena de verdade não reconhecida) só
// torna a checagem conservadora demais e desfaz uma separação que talvez
// fosse válida — nunca aceita uma separação ruim.
const LIMIAR_PARECE_COTA = 20;

function pareceCota(texto) {
  if (/^\[cota\b/i.test(texto)) return true; // DXF DIMENSION — já é cota estruturada, sem ambiguidade
  const m = texto.match(/\d+(?:[.,]\d+)?/);
  if (!m) return false;
  return parseFloat(m[0].replace(',', '.')) > LIMIAR_PARECE_COTA;
}

function subparticionarPorImagem(bloco, imagensDentro) {
  if (imagensDentro.length < 2) return [bloco];

  const grupos = imagensDentro.map(() => []);
  for (const item of bloco.itens) {
    let melhorIdx = 0, melhorDist = Infinity;
    imagensDentro.forEach((img, idx) => {
      const d = distanciaAteRect(item.x, item.y, img);
      if (d < melhorDist) { melhorDist = d; melhorIdx = idx; }
    });
    grupos[melhorIdx].push(item);
  }

  // Clusters "de menos" não ganham cartão próprio — provavelmente ruído
  // (logo, ícone, carimbo) perto de um item solto, não um desenho de
  // verdade. Redistribui os itens desses clusters pro cluster VÁLIDO mais
  // próximo (nunca descarta item), em vez de criar um cartão espúrio.
  const validos = grupos.map((_, i) => i).filter(i => grupos[i].length >= MIN_ITENS_SUBBLOCO);
  if (validos.length < 2) return [bloco]; // não sobrou separação real o suficiente — mantém como um bloco só

  for (let i = 0; i < grupos.length; i++) {
    if (validos.includes(i)) continue;
    for (const item of grupos[i]) {
      let melhorIdx = validos[0], melhorDist = Infinity;
      for (const vi of validos) {
        const d = distanciaAteRect(item.x, item.y, imagensDentro[vi]);
        if (d < melhorDist) { melhorDist = d; melhorIdx = vi; }
      }
      grupos[melhorIdx].push(item);
    }
  }

  // Checagem de segurança: cada sub-bloco final precisa ter pelo menos 1
  // número que pareça cota — senão, a separação pode estar isolando um
  // componente sem NENHUMA dimensão própria (achado real: pág. 46,
  // "ISOMÉTRICA 14" — a base ficou com todas as cotas 225/103/86/86/79, o
  // tampo ficou só com pinos de locação 3-14, sem cota nenhuma; a IA perdeu
  // a dimensão da peça inteira). Desfaz a separação INTEIRA nesse caso —
  // mais seguro manter tudo junto (o texto original, sem corte, ainda dá
  // pra IA achar a cota certa com mais contexto) do que garantir que um
  // sub-bloco fique sem cota nenhuma.
  if (!validos.every(idx => grupos[idx].some(it => pareceCota(it.texto)))) return [bloco];

  // Todo item do bloco original já pertence geometricamente a essa faixa de
  // título — nunca descarta item nem cria "sem bloco" aqui, só REDISTRIBUI
  // entre os sub-blocos pela imagem mais próxima.
  return validos
    .map(idx => ({ ...bloco, imagem: imagensDentro[idx], itens: grupos[idx] }))
    .filter(b => b.itens.length > 0);
}

// Fallback quando a página não tem título reconhecível MAS tem imagens
// embutidas (ver passo 3 no cabeçalho do arquivo) — mais forte que o
// fallback por gap: em vez de cortar por salto vertical às cegas, atribui
// cada linha de texto restante à imagem mais próxima. Cada imagem em
// `imagePositions` vira um bloco (na mesma ordem); texto que não cai perto
// de nenhuma imagem sobra pra quem chama tratar como "sem bloco".
function agruparPorProximidadeDeImagem(linhasOrdenadas, imagePositions) {
  const gruposPorImagem = imagePositions.map(() => []);
  const semImagem = [];

  for (const linha of linhasOrdenadas) {
    const px = (linha.xMin + linha.xMax) / 2;
    const py = linha.y;
    let melhorIdx = -1, melhorDist = Infinity;
    imagePositions.forEach((img, idx) => {
      const d = distanciaAteRect(px, py, img);
      if (d < melhorDist) { melhorDist = d; melhorIdx = idx; }
    });
    if (melhorIdx >= 0 && melhorDist <= MARGEM_PROXIMIDADE_IMAGEM) gruposPorImagem[melhorIdx].push(linha);
    else semImagem.push(linha);
  }

  return { gruposPorImagem, semImagem };
}

// items: [{texto, x, y, camada?}] de UMA página/arquivo (já no formato usado
// pelo pipeline vetorial). imagePositions: [{xEsq,xDir,yTop,yBottom}] opcional
// (ver vetorialImagens.js), pageSize: {width,height} opcional (necessário só
// pra associação bloco↔imagem via IoU no caminho por título — ver clampRect).
// Retorna { blocos: [{titulo, numeroLegenda, imagem, itens}], legenda:
// [item...], semBloco: [item...] } — sempre as 3 chaves, mesmo vazias.
export function agruparEmBlocos(items, imagePositions = [], pageSize = null) {
  if (!items?.length) return { blocos: [], legenda: [], semBloco: [] };

  const linhas = agruparEmLinhas(items);
  const { legendaLinhas, resto: restoBruto } = isolarLegenda(linhas);
  const legenda = legendaLinhas.flatMap(l => l.itens);

  const resto = repararTituloQuebrado([...restoBruto].sort((a, b) => a.y - b.y || a.xMin - b.xMin));
  const tituloLinhas = resto.filter(l => TITULO_REGEX.test(l.texto));

  if (tituloLinhas.length === 0) {
    const restoOrdenado = [...resto].sort((a, b) => a.y - b.y);

    // Sem título, mas com posição de imagem embutida disponível: agrupa por
    // proximidade de imagem (passo 3 do cabeçalho) em vez de gap espacial —
    // mais forte porque usa onde o desenho de fato está na página.
    if (imagePositions.length > 0) {
      const { gruposPorImagem, semImagem } = agruparPorProximidadeDeImagem(restoOrdenado, imagePositions);
      const blocos = gruposPorImagem
        .map((g, idx) => ({ titulo: null, numeroLegenda: null, imagem: imagePositions[idx], itens: g.flatMap(l => l.itens) }))
        .filter(b => b.itens.length > 0);
      return { blocos, legenda, semBloco: semImagem.flatMap(l => l.itens) };
    }

    // Sem título e sem imagem: fallback por gap espacial. Se nem isso separar
    // nada (só 1 grupo), degrada sozinho pro bloco único de sempre.
    const grupos = agruparPorGap(restoOrdenado);
    const blocos = grupos
      .map(g => ({ titulo: null, numeroLegenda: null, imagem: null, itens: g.flatMap(l => l.itens) }))
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

  const blocosComItens = blocos.filter(b => b.itens.length > 0);
  const blocosFinal = [];
  for (const b of blocosComItens) {
    if (!pageSize || imagePositions.length === 0) {
      b.imagem = null;
      blocosFinal.push(b);
      continue;
    }
    const rectClamped = clampRect(b, pageSize);
    // Sub-particiona ANTES de decidir a imagem única do bloco — um bloco que
    // abrange 2+ CLUSTERS de imagem bem separados entre si (ver
    // clusterizarImagens/MARGEM_MINIMA_SUBPARTICAO) vira 2+ blocos
    // (subparticionarPorImagem), cada um já com seu próprio `imagem` (o bbox
    // do cluster); imagens próximas entre si (prováveis ícones/recortes do
    // MESMO desenho) viram UM cluster só, não disparam split — só bloco com
    // <2 cluster segue pro caminho de sempre (associarImagemAoBloco).
    const imagensDentro = imagePositions.filter(img => centroDentro(img, rectClamped));
    const clusters = clusterizarImagens(imagensDentro, MARGEM_MINIMA_SUBPARTICAO);
    const resultado = clusters.length >= 2 ? subparticionarPorImagem(b, clusters) : [b];
    if (resultado.length > 1) {
      // sub-particionou de verdade — cada pedaço já saiu com sua própria
      // `imagem` (ver subparticionarPorImagem), nada mais a fazer.
      blocosFinal.push(...resultado);
      continue;
    }
    // Não sub-particionou (0-1 cluster geométrico, OU subparticionarPorImagem
    // recusou por falta de itens suficientes nos clusters — ver
    // MIN_ITENS_SUBBLOCO) — cai no caminho de sempre: associação de UMA
    // imagem só por IoU/centro. Sem isso, um bloco que quase separou mas foi
    // recusado ficava sem `imagem` nenhuma (regressão no preview).
    resultado[0].imagem = associarImagemAoBloco(rectClamped, imagePositions);
    blocosFinal.push(resultado[0]);
  }

  return { blocos: blocosFinal, legenda, semBloco };
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
