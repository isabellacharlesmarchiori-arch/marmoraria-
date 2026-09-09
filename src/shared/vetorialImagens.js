import { OPS, Util } from 'pdfjs-dist';

// Posição (bbox) de cada imagem raster embutida numa página de PDF — sem
// decodificar pixel algum, só geometria. Necessário porque nesses PDFs de
// projeto de marmoraria cada isométrica/vista é uma foto/render colada como
// XObject de imagem (não vetor de CAD): o texto ao redor (cotas, título) só
// dá pra associar com confiança a "qual desenho" se soubermos onde a imagem
// em si está na página, não só onde estão os títulos (ver agruparEmBlocos em
// vetorialBlocos.js, que hoje agrupa só por título/gap).
//
// "Cola com pdfjs" sem JSX — fica separado de AbaImportarPDF.jsx pelo mesmo
// motivo de vetorialBlocos.js ficar separado: mais fácil de testar isolado e
// reusar fora do componente de import de PDF.

// Anda por page.getOperatorList() — que já devolve a lista LINEAR e achatada
// de operadores de desenho da página inteira, incluindo Form XObjects
// aninhados resolvidos recursivamente pelo próprio pdf.js (buildFormXObject)
// — não precisamos recursar manualmente em XObjects aninhados. Rastreamos uma
// pilha de CTM (Current Transformation Matrix) como um interpretador de PDF
// real faria:
//  - OPS.save/restore            → empilha/desempilha o CTM
//  - OPS.transform                → ctm = Util.transform(ctm, args), mesma
//    função que o renderer real do pdf.js usa em ctx.transform(...args)
//  - OPS.paintFormXObjectBegin/End → equivale a save+transform(matrix)/
//    restore MESMO sem save/restore explícitos ao redor — é assim que o
//    próprio pdf.js interpreta esses dois ops
//  - paintImageXObject/paintImageMaskXObject/paintInlineImageXObject → nesse
//    momento o CTM atual mapeia o quadrado unitário [0,1]x[0,1] pra
//    posição/tamanho/rotação da imagem em espaço de página;
//    Util.axialAlignedBoundingBox dá o bbox alinhado aos eixos (mesma função
//    que o pdf.js usa pra bbox de clipping de Form XObject)
//
// OPS.beginGroup/endGroup (grupos de transparência) são IGNORADOS de
// propósito: é bookkeeping de composição em canvas do renderer (cria um
// canvas offscreen isolado e reaplica a matriz do form relativa a ele) — não
// é uma transformação adicional do ponto de vista do espaço de página.
// Tratá-los como transform duplicaria a matriz e deslocaria o bbox.
//
// Não usamos page.objs.get(objId) em nenhum momento — w/h nos args de
// paintImageXObject são as dimensões em pixels da imagem (só usadas pro
// desenho real), o bbox geométrico vem inteiramente do CTM.
//
// DOIS DETALHES NÃO ÓBVIOS DA API, confirmados lendo o código-fonte do pdf.js
// (build/pdf.mjs) e validados cruzando contra a posição real de texto de
// extractPageTextItems num PDF de teste — sem os dois, o bbox sai
// sistematicamente errado (grudado na borda esquerda/superior da página, não
// na posição real da imagem), mas sem lançar exceção nenhuma:
//
// 1. Util.axialAlignedBoundingBox(rect, transform, output) ACUMULA min/max em
//    `output` (faz Math.min(output[0], ...) / Math.max(output[2], ...)) em vez
//    de sobrescrever — é feita pra ser chamada repetidamente construindo a
//    união de várias formas. Passar um array zerado (ex: `new Float32Array(4)`)
//    trava o mínimo em nunca passar de 0 e o máximo em nunca ficar abaixo de
//    0. Tem que semear com [Infinity, Infinity, -Infinity, -Infinity] antes
//    de cada chamada.
// 2. page.getOperatorList() devolve a MESMA lista de operadores que
//    page.render() usa pra desenhar direto num <canvas> — que é nativamente
//    Y-pra-baixo (origem superior-esquerda). Ao contrário de getTextContent()
//    (usado em extractPageTextItems, que devolve coordenada CRUA do PDF,
//    origem inferior-esquerda, exigindo o `viewport.height - y` de lá), aqui
//    a CTM acumulada JÁ está pronta em espaço Y-pra-baixo — aplicar
//    viewport.height-y de novo em cima disso desfaz a conversão (flip duplo).
export async function extractPageImagePositions(page) {
  const { fnArray, argsArray } = await page.getOperatorList();

  const IDENTITY = [1, 0, 0, 1, 0, 0];
  let ctm = IDENTITY;
  const stack = [];
  const posicoes = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      ctm = Util.transform(ctm, args); // args = [a,b,c,d,e,f], igual ao operador "cm" do PDF
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const [matrix] = args;
      if (matrix) ctm = Util.transform(ctm, matrix);
    } else if (fn === OPS.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.paintInlineImageXObject
    ) {
      // [xMin, yMin, xMax, yMax] — já em espaço Y-pra-baixo (ver nota 2 acima).
      // Semeado com ±Infinity: ver nota 1 acima (Util.axialAlignedBoundingBox acumula).
      const bbox = new Float32Array([Infinity, Infinity, -Infinity, -Infinity]);
      Util.axialAlignedBoundingBox([0, 0, 1, 1], ctm, bbox);
      posicoes.push({ xEsq: bbox[0], xDir: bbox[2], yTop: bbox[1], yBottom: bbox[3] });
    }
    // demais opcodes: irrelevantes pro CTM, ignorados de propósito.
  }

  return posicoes;
}
