import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Prévia esquemática das peças extraídas ───────────────────────────────────────
// Diagrama desenhado do zero a partir dos dados já extraídos pela IA (dimensões,
// ambiente, tipo, recortes) — não depende de coordenada/geometria real do DXF.
// Ver DxfRealDrawingPreview.jsx pro modo que sobrepõe a geometria real do arquivo
// (LINE/LWPOLYLINE/ARC/blocks) — componente TOTALMENTE separado e independente
// (canvas, câmera de pan/zoom e state próprios), por decisão explícita: os dois
// modos compartilhando `viewRef`/`fit()` já causou bug cruzado (diagrama herdando
// a escala de mundo do desenho real ao trocar de aba) — risco demais pelo ganho.

// Extrai {comprimento, largura} (metros) de "X,XX m × Y,YY m" — mesma lógica usada
// em AbaImportarPDF.jsx pra calcular área ao gerar o orçamento.
function parseDimensoes(str) {
  if (!str) return null;
  const nums = [...str.matchAll(/(\d+)[,.](\d+)/g)].map(m => parseFloat(`${m[1]}.${m[2]}`));
  if (nums.length < 2 || !(nums[0] > 0) || !(nums[1] > 0)) return null;
  return { comprimento: nums[0], largura: nums[1] };
}

// Uma cor por peça (cicla pelo índice) — distingue peças vizinhas no layout.
const MARKER_PALETTE = ['#1D9E75', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#84CC16', '#06B6D4'];
const TODOS_AMBIENTES = '__todos__';

// Layout em duas passadas: 1) cada ambiente vira uma "seção" independente (título +
// peças em linhas, quebrando ao atingir MAX_ROW_W) calculada na origem (0,0); 2) as
// seções são empacotadas lado a lado num "quadro" (quebra de linha de seções ao
// atingir MAX_BOARD_W) — um grid de ambientes, não uma pilha vertical solta. Sem
// nenhuma relação espacial com a planta real, é um diagrama. Unidades = metros
// (mesma unidade de `dimensoes`), viram o "mundo" desenhado.
const MIN_LADO        = 0.25; // lado mínimo do retângulo quando a dimensão é "a medir"
const GAP             = 0.12; // espaço entre peças na mesma linha
const ROW_GAP         = 0.45; // espaço entre linhas dentro do mesmo ambiente
const SECTION_GAP     = 0.6;  // espaço entre seções (mesma linha ou linha seguinte de seções)
const SECTION_TITLE_H = 0.4;  // faixa reservada pro nome do ambiente, acima da 1ª linha
const MAX_ROW_W       = 5;    // largura (m) de uma seção antes de quebrar linha de peças
const MAX_BOARD_W     = 11;   // largura (m) do quadro inteiro antes de quebrar linha de seções

function buildPecasBase(items) {
  return (items ?? [])
    .filter(it => it.tipo && it.tipo !== 'outro')
    .map((item, i) => ({ item, idx: i + 1, color: MARKER_PALETTE[i % MARKER_PALETTE.length] }));
}

// Layout local de uma seção (peças de UM ambiente), origem em (0,0) — devolve a
// caixa ocupada (width/height) e a posição local de cada peça dentro dela.
function layoutSecao(pecasBaseDoAmb) {
  let rowX = 0, rowY = SECTION_TITLE_H, rowH = 0, usedW = 0;
  const locais = [];
  for (const pb of pecasBaseDoAmb) {
    const dims = parseDimensoes(pb.item.dimensoes);
    const aproximado = !dims;
    const w = Math.max(dims?.comprimento ?? MIN_LADO, MIN_LADO);
    const h = Math.max(dims?.largura ?? MIN_LADO, MIN_LADO);
    if (rowX > 0 && rowX + w > MAX_ROW_W) {
      rowY += rowH + ROW_GAP;
      rowX = 0; rowH = 0;
    }
    locais.push({ pb, aproximado, x: rowX, y: rowY, w, h });
    usedW = Math.max(usedW, rowX + w);
    rowX += w + GAP;
    rowH = Math.max(rowH, h);
  }
  return { width: Math.max(usedW, 1), height: rowY + rowH, locais };
}

function buildSchematic(pecasBase) {
  if (!pecasBase.length) return { pecas: [], bbox: null, secoes: [] };

  const grupos = new Map(); // preserva a ordem de extração
  pecasBase.forEach(pb => {
    const amb = pb.item.ambiente || 'Geral';
    if (!grupos.has(amb)) grupos.set(amb, []);
    grupos.get(amb).push(pb);
  });

  const placed = [];
  const secoes = [];
  let boardX = 0, boardY = 0, boardRowH = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const [amb, pecasDoAmb] of grupos) {
    const { width, height, locais } = layoutSecao(pecasDoAmb);
    if (boardX > 0 && boardX + width > MAX_BOARD_W) {
      boardY += boardRowH + SECTION_GAP;
      boardX = 0; boardRowH = 0;
    }
    const originX = boardX, originY = boardY;
    secoes.push({ ambiente: amb, x: originX, y: -originY }); // âncora (canto sup. esq.) em coordenada de mundo

    locais.forEach(({ pb, aproximado, x, y, w, h }) => {
      // layout Y cresce pra baixo (mais intuitivo pro algoritmo de fluxo); mundo é
      // Y-up, inverte só na hora de converter.
      const wx0 = originX + x, wx1 = wx0 + w;
      const wy1 = -(originY + y), wy0 = wy1 - h;
      placed.push({ ...pb, aproximado, minX: wx0, maxX: wx1, minY: wy0, maxY: wy1, cx: (wx0 + wx1) / 2, cy: (wy0 + wy1) / 2, w, h });
      minX = Math.min(minX, wx0); maxX = Math.max(maxX, wx1);
      minY = Math.min(minY, wy0); maxY = Math.max(maxY, wy1);
    });

    minX = Math.min(minX, originX);
    maxY = Math.max(maxY, -originY); // reserva espaço pro título acima da 1ª linha
    boardX += width + SECTION_GAP;
    boardRowH = Math.max(boardRowH, height);
  }

  return { pecas: placed, bbox: { minX, minY, maxX, maxY }, secoes };
}

const MIN_SCALE_FACTOR = 0.05; // zoom-out máx. relativo ao fit inicial
const MAX_SCALE_FACTOR = 200;  // zoom-in máx.
const SUPERSAMPLE = 1.5;       // buffer renderizado maior que o CSS (nitidez extra em cima do devicePixelRatio)

export default function DxfCanvasPreview({ items, extracting, fileName, onSwap, onClose }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const viewRef      = useRef({ scale: 1, cx: 0, cy: 0 });
  const fitScaleRef  = useRef(1);
  const dragRef      = useRef(null);
  const rafRef       = useRef(null);

  const pecasBase = useMemo(() => buildPecasBase(items), [items]);
  const totalPecas = pecasBase.length;
  const schematic = useMemo(() => buildSchematic(pecasBase), [pecasBase]);
  const semMedida = useMemo(() => schematic.pecas.filter(p => p.aproximado).length, [schematic]);
  const { bbox, secoes } = schematic;

  const porAmbiente = useMemo(() => {
    const map = new Map();
    schematic.pecas.forEach(p => {
      const amb = p.item.ambiente || 'Geral';
      if (!map.has(amb)) map.set(amb, []);
      map.get(amb).push(p);
    });
    return map;
  }, [schematic]);
  const ambientesList = useMemo(() => [...porAmbiente.keys()], [porAmbiente]);

  const [activeAmbiente, setActiveAmbiente] = useState(TODOS_AMBIENTES);
  // Novo arquivo → volta pra visão geral. Ajuste de estado durante o render (não em
  // efeito) é o padrão recomendado do React pra "resetar estado quando uma prop
  // muda": descarta o render em andamento e recomeça antes de comitar.
  const [fileNameAnterior, setFileNameAnterior] = useState(fileName);
  if (fileName !== fileNameAnterior) {
    setFileNameAnterior(fileName);
    setActiveAmbiente(TODOS_AMBIENTES);
  }

  const pecasVisiveis = useMemo(
    () => (activeAmbiente === TODOS_AMBIENTES ? schematic.pecas : (porAmbiente.get(activeAmbiente) ?? [])),
    [activeAmbiente, schematic, porAmbiente]
  );
  const secoesVisiveis = useMemo(
    () => (activeAmbiente === TODOS_AMBIENTES ? secoes : secoes.filter(s => s.ambiente === activeAmbiente)),
    [activeAmbiente, secoes]
  );

  const activeBBox = useMemo(() => {
    if (activeAmbiente === TODOS_AMBIENTES || !bbox) return bbox;
    const ps = porAmbiente.get(activeAmbiente);
    if (!ps?.length) return bbox;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ps.forEach(p => {
      minX = Math.min(minX, p.minX); maxX = Math.max(maxX, p.maxX);
      minY = Math.min(minY, p.minY); maxY = Math.max(maxY, p.maxY);
    });
    const pad = 0.3;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad - SECTION_TITLE_H };
  }, [activeAmbiente, porAmbiente, bbox]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!bbox) return;
    const { scale, cx, cy } = viewRef.current;
    // Mesmo CTM y-flip de sempre — mundo Y-up, canvas Y-down.
    ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2 - scale * cx, canvas.height / 2 + scale * cy);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Retângulos das peças + recortes (mundo)
    pecasVisiveis.forEach(p => {
      ctx.beginPath();
      ctx.rect(p.minX, p.minY, p.w, p.h);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash(p.aproximado ? [0.06, 0.05] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      const recortes = p.item.recortes ?? [];
      const n = recortes.length;
      recortes.forEach((rc, i) => {
        const rx = p.minX + ((i + 1) / (n + 1)) * p.w;
        const ry = p.cy;
        ctx.beginPath();
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 1.5 / scale;
        if (rc.formato === 'circular') {
          const r = Math.max((rc.diametro_cm ?? 8) / 200, 0.03);
          ctx.arc(rx, ry, r, 0, Math.PI * 2);
        } else {
          const rw = Math.max((rc.largura_cm ?? 15) / 100, 0.06);
          const rh = Math.max((rc.altura_cm  ?? 10) / 100, 0.05);
          ctx.rect(rx - rw / 2, ry - rh / 2, rw, rh);
        }
        ctx.stroke();
      });
    });

    // Textos (números, nomes, títulos de seção): passe separado em screen-space,
    // tamanho fixo em px do buffer — se desenhado no mesmo transform do mundo,
    // ficaria ilegível de longe ou gigante de perto.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = (window.devicePixelRatio || 1) * SUPERSAMPLE;
    const toScreen = (wx, wy) => ({
      sx: canvas.width  / 2 + scale * (wx - cx),
      sy: canvas.height / 2 - scale * (wy - cy),
    });

    secoesVisiveis.forEach(s => {
      const { sx, sy } = toScreen(s.x, s.y);
      ctx.font = `bold ${12 * px}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText(s.ambiente.toUpperCase(), sx, sy + 2 * px);
    });

    pecasVisiveis.forEach(p => {
      const { sx, sy } = toScreen(p.cx, p.cy);
      ctx.font = `bold ${12 * px}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = 'rgba(10,10,10,0.9)';
      ctx.strokeText(String(p.idx), sx, sy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(p.idx), sx, sy);

      const { sx: bx, sy: by } = toScreen(p.cx, p.minY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${9 * px}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = '#d4d4d8';
      ctx.fillText(p.item.descricao, bx, by + 4 * px);
      ctx.font = `${8 * px}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = p.aproximado ? '#F59E0B' : '#71717a';
      ctx.fillText(p.item.dimensoes || '—', bx, by + 15 * px);
    });
  }, [bbox, pecasVisiveis, secoesVisiveis]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; draw(); });
  }, [draw]);

  // Repinta assim que `items` chega/muda de tamanho (fim da extração por IA).
  const lastDrawnLenRef = useRef(-1);
  useEffect(() => {
    const curLen = items?.length ?? 0;
    if (lastDrawnLenRef.current !== curLen) {
      lastDrawnLenRef.current = curLen;
      draw();
    }
  }, [items, draw]);

  // Auto-fit: diagrama inteiro por padrão (aba "Tudo"); ao trocar de aba, enquadra
  // só a seção do ambiente selecionado.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeBBox) return;
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const bw = Math.max(activeBBox.maxX - activeBBox.minX, 1e-6);
    const bh = Math.max(activeBBox.maxY - activeBBox.minY, 1e-6);
    const scale = Math.min(w / bw, h / bh) * 0.94; // margem de 6% (diagrama tem texto colado nas bordas)
    fitScaleRef.current = scale;
    viewRef.current = { scale, cx: (activeBBox.minX + activeBBox.maxX) / 2, cy: (activeBBox.minY + activeBBox.maxY) / 2 };
    draw();
  }, [activeBBox, draw]);

  // Canvas no tamanho real do container (device pixels) — refaz o fit ao redimensionar
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = (window.devicePixelRatio || 1) * SUPERSAMPLE;
      const w = Math.max(1, Math.round(container.clientWidth * dpr));
      const h = Math.max(1, Math.round(container.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
      }
      fit();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [fit]);

  // Novo arquivo/aba → reenquadra
  useEffect(() => { fit(); }, [fit]);

  // ── Pan (arrastar) ──────────────────────────────────────────────────────────
  function onPointerDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, view: { ...viewRef.current } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dpr = (window.devicePixelRatio || 1) * SUPERSAMPLE;
    const dx = (e.clientX - dragRef.current.x) * dpr;
    const dy = (e.clientY - dragRef.current.y) * dpr;
    const { scale, cx, cy } = dragRef.current.view;
    viewRef.current = { scale, cx: cx - dx / scale, cy: cy + dy / scale };
    scheduleDraw();
  }
  function onPointerUp() { dragRef.current = null; }

  // ── Zoom (roda do mouse, centrado no cursor) ─────────────────────────────────
  function onWheel(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !bbox) return;
    const rect = canvas.getBoundingClientRect();
    const dpr  = (window.devicePixelRatio || 1) * SUPERSAMPLE;
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const { scale, cx, cy } = viewRef.current;
    const worldXBefore = cx + (px - canvas.width / 2) / scale;
    const worldYBefore = cy - (py - canvas.height / 2) / scale;
    const minScale = fitScaleRef.current * MIN_SCALE_FACTOR;
    const maxScale = fitScaleRef.current * MAX_SCALE_FACTOR;
    const newScale = Math.min(maxScale, Math.max(minScale, scale * Math.exp(-e.deltaY * 0.0015)));
    const worldXAfter = cx + (px - canvas.width / 2) / newScale;
    const worldYAfter = cy - (py - canvas.height / 2) / newScale;
    viewRef.current = { scale: newScale, cx: cx + (worldXBefore - worldXAfter), cy: cy + (worldYBefore - worldYAfter) };
    scheduleDraw();
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <iconify-icon icon="solar:ruler-cross-pen-linear" width="11" class="text-yellow-400 shrink-0" />
        <span className="font-mono text-[10px] text-zinc-400 truncate flex-1 min-w-0">{fileName}</span>
        {extracting && totalPecas === 0 ? (
          // A extração por IA é 1 chamada por bloco de ~150 textos, sequencial (pode
          // passar de 1min em arquivos grandes) — sem isso, o preview fica vazio por
          // um bom tempo sem nenhum sinal de que peças ainda vêm, parece quebrado.
          <span className="font-mono text-[9px] text-yellow-500 shrink-0 animate-pulse">
            localizando peças…
          </span>
        ) : totalPecas > 0 && (
          <span className="font-mono text-[9px] text-[#1D9E75] shrink-0">
            {totalPecas} peças{semMedida > 0 ? ` (${semMedida} sem medida)` : ''}
          </span>
        )}
        <button onClick={fit} title="Ajustar à tela" className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors">
          <iconify-icon icon="solar:frame-linear" width="11" />
        </button>
        <button onClick={onSwap} title="Trocar arquivo" className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors">
          <iconify-icon icon="solar:refresh-linear" width="11" />
        </button>
        <button onClick={onClose} title="Fechar" className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors">
          <iconify-icon icon="solar:close-linear" width="11" />
        </button>
      </div>

      {ambientesList.length > 1 && (
        <div className="shrink-0 flex overflow-x-auto border-b border-zinc-800 bg-zinc-950">
          <button
            onClick={() => setActiveAmbiente(TODOS_AMBIENTES)}
            className={`shrink-0 px-3 py-1.5 font-mono text-[10px] border-r border-zinc-800 transition-colors ${
              activeAmbiente === TODOS_AMBIENTES ? 'bg-zinc-900 text-zinc-200 border-b-2 border-b-[#1D9E75]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
            }`}
          >
            Tudo ({totalPecas})
          </button>
          {ambientesList.map(amb => (
            <button
              key={amb}
              onClick={() => setActiveAmbiente(amb)}
              className={`shrink-0 px-3 py-1.5 font-mono text-[10px] border-r border-zinc-800 transition-colors truncate max-w-[140px] ${
                activeAmbiente === amb ? 'bg-zinc-900 text-zinc-200 border-b-2 border-b-[#1D9E75]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              {amb} ({porAmbiente.get(amb).length})
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {!bbox && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2">
            <iconify-icon icon={extracting ? 'solar:refresh-linear' : 'solar:widget-4-linear'} width="40" class={extracting ? 'animate-spin' : ''} />
            <p className="font-mono text-[11px] uppercase tracking-widest">
              {extracting ? 'Localizando peças…' : 'Nenhuma peça de pedra encontrada'}
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        />

        {pecasVisiveis.length > 0 && (
          <div className="absolute top-2 right-2 w-56 max-h-[75%] overflow-y-auto bg-zinc-950/90 border border-zinc-800 backdrop-blur-sm pointer-events-none">
            {pecasVisiveis.map(p => (
              <div key={p.item.id} className="flex items-start gap-1.5 px-2 py-1 border-b border-zinc-900 last:border-0">
                <span
                  className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white mt-px"
                  style={{ backgroundColor: p.color }}
                >
                  {p.idx}
                </span>
                <span className="font-mono text-[9px] text-zinc-200 leading-tight">
                  {p.item.descricao}
                  {p.item.dimensoes && <span className="text-zinc-500"> — {p.item.dimensoes}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
