import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Prévia da geometria real do DXF ──────────────────────────────────────────────
// Componente TOTALMENTE independente do DxfCanvasPreview (diagrama esquemático) —
// canvas, câmera de pan/zoom (viewRef/fit/draw) e state próprios, zero
// compartilhamento. Os dois já dividiram uma câmera antes e isso causou o
// diagrama herdar a escala de mundo do desenho real ao trocar de aba (bug
// cruzado silencioso) — risco demais pelo ganho de reuso.
// Renderiza LINE/LWPOLYLINE/ARC + blocks (INSERT) resolvidos como fundo apagado,
// com marcadores numerados nas posições reais (resolvePosicao via trecho_origem).

// Bulge (grupo 42 da LWPOLYLINE) → arco entre p1 e p2. bulge = tan(θ/4), θ = ângulo
// incluso (sinal = sentido: positivo CCW). Resolve o centro por rotação de p1 por θ
// (via número complexo, evita ambiguidade de sinal em vez de derivar geometricamente).
function bulgeToArc(p1, p2, bulge) {
  const theta = 4 * Math.atan(bulge);
  if (!Number.isFinite(theta) || Math.abs(theta) < 1e-9) return null;
  const c = Math.cos(theta), s = Math.sin(theta);
  const z1eRe = p1.x * c - p1.y * s, z1eIm = p1.x * s + p1.y * c;
  const numRe = p2.x - z1eRe, numIm = p2.y - z1eIm;
  const denRe = 1 - c, denIm = -s;
  const denomSq = denRe * denRe + denIm * denIm;
  if (denomSq < 1e-12) return null;
  const cx = (numRe * denRe + numIm * denIm) / denomSq;
  const cy = (numIm * denRe - numRe * denIm) / denomSq;
  const r  = Math.hypot(p1.x - cx, p1.y - cy);
  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  return { cx, cy, r, startAngle, endAngle: startAngle + theta, ccw: theta < 0 };
}

// Bbox exato do trecho VARRIDO de um arco (não do círculo completo) — arco de raio
// grande e sweep pequeno (comum em curvas topográficas/paredes curvas do Revit)
// tem bbox real minúsculo; usar centro±raio "estica" o enquadramento pra muito além
// do desenho. Os extremos só podem estar nos dois pontos-limite ou nos múltiplos de
// 90° cobertos pelo sweep — varre exatamente esses candidatos.
function extendArcBBox(extend, cx, cy, r, angleA, angleB) {
  const a0 = Math.min(angleA, angleB), a1 = Math.max(angleA, angleB);
  extend(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
  extend(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
  const step = Math.PI / 2;
  for (let k = Math.ceil(a0 / step) * step; k <= a1 + 1e-9; k += step) {
    extend(cx + r * Math.cos(k), cy + r * Math.sin(k));
  }
}

// Ponto local (dentro de um block) → coordenada absoluta, aplicando a transformação
// do INSERT que instancia esse block (posição, escala, rotação em Z). Mesma lógica
// (e mesma simplificação 2D) usada na extração de itens por IA em AbaImportarPDF.jsx.
function transformPontoDoBlock(local, insert) {
  const sx = insert.xScale ?? 1, sy = insert.yScale ?? 1;
  const rad = ((insert.rotation ?? 0) * Math.PI) / 180;
  const lx = (local.x ?? 0) * sx, ly = (local.y ?? 0) * sy;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: (insert.position?.x ?? 0) + (lx * cos - ly * sin),
    y: (insert.position?.y ?? 0) + (lx * sin + ly * cos),
  };
}

const BBOX_EXCLUDE_RE = /vegeta|topogr|curvas?\s+de\s+n[íi]vel/i; // fora do bbox do auto-fit (símbolos gigantes de árvore/terreno)
const PEDRA_LAYER_RE  = /bancada|pedra|granito|m[aá]rmore|\bpia\b/i; // vira "apoio" (mais opaco) em vez de fundo

// Resolve 1 nível de INSERT→block pra cada entidade LINE/LWPOLYLINE/ARC (raiz ou já
// dentro do block referenciado) e empilha no Path2D certo (fundo ou apoio).
function buildGeometry(dxf) {
  const entities = dxf?.entities ?? [];
  const blocks   = dxf?.blocks ?? {};
  const backgroundPath = new Path2D();
  const supportPath    = new Path2D();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;

  const extend = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  const noop = () => {};

  function emit(e, xf, layerName) {
    const p   = PEDRA_LAYER_RE.test(layerName) ? supportPath : backgroundPath;
    const ext = BBOX_EXCLUDE_RE.test(layerName) ? noop : extend;
    const tp  = xf ? (local => transformPontoDoBlock(local, xf)) : (local => local);

    if (e.type === 'LINE' && e.vertices?.length >= 2) {
      const p1 = tp(e.vertices[0]), p2 = tp(e.vertices[1]);
      if (!Number.isFinite(p1.x) || !Number.isFinite(p2.x)) return;
      p.moveTo(p1.x, p1.y);
      p.lineTo(p2.x, p2.y);
      ext(p1.x, p1.y); ext(p2.x, p2.y);
      count++;
    } else if (e.type === 'LWPOLYLINE' && e.vertices?.length >= 2) {
      const vs = e.vertices.map(v => ({ ...tp(v), bulge: v.bulge }));
      if (!Number.isFinite(vs[0].x)) return;
      p.moveTo(vs[0].x, vs[0].y);
      ext(vs[0].x, vs[0].y);
      const segment = (a, b) => {
        ext(b.x, b.y);
        const arc = a.bulge ? bulgeToArc(a, b, a.bulge) : null;
        if (arc) {
          p.arc(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw);
          extendArcBBox(ext, arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle);
        } else {
          p.lineTo(b.x, b.y);
        }
      };
      for (let i = 1; i < vs.length; i++) segment(vs[i - 1], vs[i]);
      if (e.shape) segment(vs[vs.length - 1], vs[0]);
      count++;
    } else if (e.type === 'ARC' && e.center && Number.isFinite(e.radius)) {
      let start = e.startAngle ?? 0, end = e.endAngle ?? Math.PI * 2;
      if (end < start) end += Math.PI * 2;
      const c = tp(e.center);
      const r = xf ? e.radius * (Math.abs(xf.xScale ?? 1) + Math.abs(xf.yScale ?? 1)) / 2 : e.radius;
      const rot = xf ? ((xf.rotation ?? 0) * Math.PI) / 180 : 0;
      const s = start + rot, en = end + rot;
      p.moveTo(c.x + r * Math.cos(s), c.y + r * Math.sin(s));
      p.arc(c.x, c.y, r, s, en, false);
      extendArcBBox(ext, c.x, c.y, r, s, en);
      count++;
    }
  }

  for (const e of entities) {
    if (e.type === 'INSERT' && e.name) {
      const block = blocks[e.name];
      (block?.entities ?? []).forEach(be => {
        if (be.type === 'INSERT') return; // só 1 nível de resolução
        emit(be, e, e.layer ?? '');
      });
    } else {
      emit(e, null, e.layer ?? '');
    }
  }

  return { backgroundPath, supportPath, count, bbox: minX === Infinity ? null : { minX, minY, maxX, maxY } };
}

// ── Marcadores: posição real via trecho_origem ───────────────────────────────────

const MARKER_PALETTE = ['#1D9E75', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#84CC16', '#06B6D4'];
const TODOS_AMBIENTES = '__todos__';

function buildPecasBase(items) {
  return (items ?? [])
    .filter(it => it.tipo && it.tipo !== 'outro')
    .map((item, i) => ({ item, idx: i + 1, color: MARKER_PALETTE[i % MARKER_PALETTE.length] }));
}

// `trecho_origem` ("pág. N — [origem]") é TEXTO livre que a IA usa pra citar a
// cota/anotação que originou a peça — não é uma referência de coordenada. Como
// aproximação honesta (não inventa posição): procura esse texto citado na lista
// crua de textos/cotas do DXF (que TEM x,y reais) e usa a posição de onde achou.
// Quando não acha, a peça fica sem marcador.
function origemTexto(trechoOrigem) {
  if (!trechoOrigem) return null;
  const i = trechoOrigem.search(/[—-]/);
  const t = (i >= 0 ? trechoOrigem.slice(i + 1) : trechoOrigem).trim();
  return t || null;
}
function resolvePosicao(alvo, textItems) {
  if (!alvo || !textItems?.length) return null;
  let hit = textItems.find(t => t.texto === alvo);
  if (!hit) hit = textItems.find(t => t.texto && (t.texto.includes(alvo) || alvo.includes(t.texto)));
  return hit ? { x: hit.x, y: hit.y } : null;
}
function buildMarcadores(pecasBase, textItems) {
  const resolvidos = [];
  for (const p of pecasBase) {
    const pos = resolvePosicao(origemTexto(p.item.trecho_origem), textItems);
    if (pos) resolvidos.push({ ...p, x: pos.x, y: pos.y });
  }
  return resolvidos;
}

const MIN_SCALE_FACTOR = 0.05; // zoom-out máx. relativo ao fit inicial
const MAX_SCALE_FACTOR = 200;  // zoom-in máx.
const SUPERSAMPLE = 1.5;       // buffer renderizado maior que o CSS (nitidez extra em cima do devicePixelRatio)

export default function DxfRealDrawingPreview({ dxf, items, textItems, extracting, fileName, onSwap, onClose }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const viewRef      = useRef({ scale: 1, cx: 0, cy: 0 });
  const fitScaleRef  = useRef(1);
  const dragRef      = useRef(null);
  const rafRef       = useRef(null);

  const { backgroundPath, supportPath, bbox, count } = useMemo(() => buildGeometry(dxf), [dxf]);
  const pecasBase  = useMemo(() => buildPecasBase(items), [items]);
  const totalPecas = pecasBase.length;
  const marcadores = useMemo(() => buildMarcadores(pecasBase, textItems), [pecasBase, textItems]);

  const markerRadius = useMemo(() => {
    if (!bbox) return 1;
    return Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.044;
  }, [bbox]);

  const porAmbiente = useMemo(() => {
    const map = new Map();
    marcadores.forEach(m => {
      const amb = m.item.ambiente || 'Geral';
      if (!map.has(amb)) map.set(amb, []);
      map.get(amb).push(m);
    });
    return map;
  }, [marcadores]);
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

  const marcadoresVisiveis = useMemo(
    () => (activeAmbiente === TODOS_AMBIENTES ? marcadores : (porAmbiente.get(activeAmbiente) ?? [])),
    [activeAmbiente, marcadores, porAmbiente]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!bbox) return;
    const { scale, cx, cy } = viewRef.current;
    // Mundo Y-up, canvas Y-down — inverte no próprio CTM (arcos ficam corretos
    // automaticamente); `scale` é o MESMO fator nos dois eixos (nunca escalas x/y
    // independentes), o que mantém quadrado quadrado e círculo círculo.
    ctx.setTransform(scale, 0, 0, -scale, canvas.width / 2 - scale * cx, canvas.height / 2 + scale * cy);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    ctx.lineWidth   = 3.5 / scale;
    ctx.strokeStyle = 'rgba(245,245,245,0.85)'; // fundo: parede/mobiliário/vegetação/topografia
    ctx.stroke(backgroundPath);

    ctx.lineWidth   = 4.5 / scale;
    ctx.strokeStyle = 'rgba(29,158,117,0.85)'; // apoio: layers com nome de pedra/bancada
    ctx.stroke(supportPath);

    marcadoresVisiveis.forEach(m => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 2.5 / scale;
      ctx.stroke();
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const px = (window.devicePixelRatio || 1) * SUPERSAMPLE;
    ctx.font = `bold ${13 * px}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    marcadoresVisiveis.forEach(m => {
      const sx = canvas.width  / 2 + scale * (m.x - cx);
      const sy = canvas.height / 2 - scale * (m.y - cy);
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = 'rgba(10,10,10,0.9)';
      ctx.strokeText(String(m.idx), sx, sy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(m.idx), sx, sy);
    });
  }, [backgroundPath, supportPath, bbox, marcadoresVisiveis, markerRadius]);

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

  // Auto-fit: SEMPRE a planta inteira (bbox de toda a geometria) — decisão já
  // confirmada, nunca recorta pros marcadores.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bbox) return;
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const bw = Math.max(bbox.maxX - bbox.minX, 1e-6);
    const bh = Math.max(bbox.maxY - bbox.minY, 1e-6);
    const scale = Math.min(w / bw, h / bh) * 0.98; // margem de 2%
    fitScaleRef.current = scale;
    viewRef.current = { scale, cx: (bbox.minX + bbox.maxX) / 2, cy: (bbox.minY + bbox.maxY) / 2 };
    draw();
  }, [bbox, draw]);

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
          <span className="font-mono text-[9px] text-yellow-500 shrink-0 animate-pulse">localizando peças…</span>
        ) : totalPecas > 0 && (
          <span
            className="font-mono text-[9px] shrink-0"
            style={{ color: marcadores.length > 0 ? '#1D9E75' : '#71717a' }}
            title="Posição aproximada, resolvida pelo texto/cota de origem da peça — nem toda peça tem correspondência"
          >
            {marcadores.length}/{totalPecas} peças posicionadas
          </span>
        )}
        {bbox && <span className="font-mono text-[9px] text-zinc-600 shrink-0">{count} entidades</span>}
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
            Tudo ({marcadores.length})
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
            <iconify-icon icon="solar:ruler-cross-pen-linear" width="40" />
            <p className="font-mono text-[11px] uppercase tracking-widest">Sem geometria pra desenhar</p>
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

        {marcadoresVisiveis.length > 0 && (
          <div className="absolute top-2 right-2 w-56 max-h-[75%] overflow-y-auto bg-zinc-950/90 border border-zinc-800 backdrop-blur-sm pointer-events-none">
            {marcadoresVisiveis.map(m => (
              <div key={m.item.id} className="flex items-start gap-1.5 px-2 py-1 border-b border-zinc-900 last:border-0">
                <span
                  className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white mt-px"
                  style={{ backgroundColor: m.color }}
                >
                  {m.idx}
                </span>
                <span className="font-mono text-[9px] text-zinc-200 leading-tight">
                  {m.item.descricao}
                  {m.item.dimensoes && <span className="text-zinc-500"> — {m.item.dimensoes}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
