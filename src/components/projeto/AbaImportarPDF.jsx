import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_ITEMS = [
  { id: '1', descricao: 'Bancada cozinha', dimensoes: '3,20 m × 0,60 m', ambiente: 'Cozinha',   confianca: 95, pagina: 1 },
  { id: '2', descricao: 'Bancada banheiro suíte', dimensoes: '1,80 m × 0,55 m', ambiente: 'Suíte', confianca: 72, pagina: 2 },
  { id: '3', descricao: 'Soleira entrada', dimensoes: '1,20 m × 0,15 m', ambiente: 'Hall',       confianca: 40, pagina: 1 },
  { id: '4', descricao: 'Balcão lavabo',  dimensoes: '0,90 m × 0,45 m', ambiente: 'Lavabo',      confianca: 88, pagina: 3 },
];

const MOCK_CHAT = [
  { role: 'assistant', text: 'Faça upload de um PDF de projeto para eu extrair os itens automaticamente.' },
];

function confidenceColor(pct) {
  if (pct >= 80) return '#10B981';
  if (pct >= 55) return '#F59E0B';
  return '#EF4444';
}

function ConfidenceBar({ pct }) {
  const color = confidenceColor(pct);
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, backgroundColor: color }} className="h-full rounded-full" />
      </div>
      <span className="font-mono text-[9px] shrink-0 tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────

function PDFViewer({ pdfDoc, currentPage, setCurrentPage, scale, setScale, fileName, onClose, onSwap }) {
  const pdfCanvasRef  = useRef(null);
  const annotCanvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [activeTool,  setActiveTool]  = useState(null);
  const [annotations, setAnnotations] = useState({});
  const [isDrawing,   setIsDrawing]   = useState(false);
  const drawRef = useRef({ tool: null, startX: 0, startY: 0, points: [] });

  const totalPages = pdfDoc?.numPages ?? 0;

  // ── Render PDF page ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    async function render() {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      const page     = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas   = pdfCanvasRef.current;
      const annot    = annotCanvasRef.current;
      if (!canvas || !annot || cancelled) return;

      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      annot.width   = viewport.width;
      annot.height  = viewport.height;

      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
        if (!cancelled) redrawAnnotations(currentPage, annotations, annot);
      } catch (e) {
        if (e.name !== 'RenderingCancelledException') console.error(e);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redraw annotations ─────────────────────────────────────────────────────
  function redrawAnnotations(page, allAnnotations, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (allAnnotations[page] ?? []).forEach(ann => {
      if (ann.type === 'highlight') {
        ctx.fillStyle = 'rgba(250,204,21,0.30)';
        ctx.fillRect(ann.x, ann.y, ann.w, ann.h);
      } else if (ann.type === 'pencil') {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        ann.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      }
    });
  }

  // ── Annotation mouse events ────────────────────────────────────────────────
  function getPos(e) {
    const rect = annotCanvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e) {
    if (!activeTool || activeTool === 'eraser') {
      setIsDrawing(activeTool === 'eraser');
      drawRef.current = { tool: activeTool, ...getPos(e), points: [getPos(e)] };
      return;
    }
    setIsDrawing(true);
    const pos = getPos(e);
    drawRef.current = { tool: activeTool, startX: pos.x, startY: pos.y, points: [pos] };
  }

  function onMouseMove(e) {
    if (!isDrawing || !activeTool) return;
    const pos = getPos(e);
    const { tool } = drawRef.current;

    if (tool === 'pencil') {
      drawRef.current.points.push(pos);
      const ctx = annotCanvasRef.current.getContext('2d');
      const pts = drawRef.current.points;
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === 'highlight') {
      const { startX, startY } = drawRef.current;
      const canvas = annotCanvasRef.current;
      const ctx = canvas.getContext('2d');
      redrawAnnotations(currentPage, annotations, canvas);
      ctx.fillStyle = 'rgba(250,204,21,0.30)';
      ctx.fillRect(startX, startY, pos.x - startX, pos.y - startY);
    } else if (tool === 'eraser') {
      const ctx = annotCanvasRef.current.getContext('2d');
      ctx.clearRect(pos.x - 15, pos.y - 15, 30, 30);
    }
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pos = getPos(e);
    const { tool, startX, startY, points } = drawRef.current;

    setAnnotations(prev => {
      const pageAnns = [...(prev[currentPage] ?? [])];
      if (tool === 'highlight') {
        pageAnns.push({ type: 'highlight', x: startX, y: startY, w: pos.x - startX, h: pos.y - startY });
      } else if (tool === 'pencil' && points.length > 1) {
        pageAnns.push({ type: 'pencil', points });
      }
      return { ...prev, [currentPage]: pageAnns };
    });
  }

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const cursor = activeTool === 'highlight' ? 'crosshair'
               : activeTool === 'pencil'    ? 'cell'
               : activeTool === 'eraser'    ? 'cell'
               : 'default';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        {[
          { id: 'highlight', icon: 'solar:pen-new-round-linear',  title: 'Marca-texto' },
          { id: 'pencil',    icon: 'solar:pen-linear',            title: 'Lápis'       },
          { id: 'eraser',    icon: 'solar:eraser-linear',         title: 'Borracha'    },
        ].map(tool => (
          <button
            key={tool.id}
            title={tool.title}
            onClick={() => setActiveTool(prev => prev === tool.id ? null : tool.id)}
            className={`w-7 h-7 flex items-center justify-center border transition-colors ${
              activeTool === tool.id
                ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
            }`}
          >
            <iconify-icon icon={tool.icon} width="13" />
          </button>
        ))}

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          title="Diminuir zoom"
          onClick={() => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1)))}
          className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <iconify-icon icon="solar:minus-linear" width="12" />
        </button>
        <span className="font-mono text-[10px] text-zinc-600 w-8 text-center">{Math.round(scale * 100)}%</span>
        <button
          title="Aumentar zoom"
          onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))}
          className="w-7 h-7 flex items-center justify-center border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <iconify-icon icon="solar:add-linear" width="12" />
        </button>

        {fileName && (
          <>
            <div className="w-px h-4 bg-zinc-800 mx-1" />
            <div className="flex items-center gap-1 min-w-0 max-w-[180px]">
              <iconify-icon icon="solar:file-text-bold" width="11" class="text-yellow-400 shrink-0" />
              <span className="font-mono text-[10px] text-zinc-400 truncate">{fileName}</span>
              <button
                onClick={onSwap}
                title="Trocar arquivo"
                className="shrink-0 w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <iconify-icon icon="solar:refresh-linear" width="11" />
              </button>
              <button
                onClick={onClose}
                title="Fechar arquivo"
                className="shrink-0 w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
              >
                <iconify-icon icon="solar:close-linear" width="11" />
              </button>
            </div>
          </>
        )}

        <div className="flex-1" />

        {totalPages > 0 && (
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            >
              <iconify-icon icon="solar:alt-arrow-left-linear" width="12" />
            </button>
            <span className="font-mono text-[10px] text-zinc-500">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
            >
              <iconify-icon icon="solar:alt-arrow-right-linear" width="12" />
            </button>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        {!pdfDoc ? (
          <div className="flex flex-col items-center justify-center text-zinc-700 gap-2 h-full">
            <iconify-icon icon="solar:file-text-linear" width="40" />
            <p className="font-mono text-[11px] uppercase tracking-widest">Nenhum PDF carregado</p>
          </div>
        ) : (
          <div className="relative inline-block">
            <canvas ref={pdfCanvasRef} className="block shadow-xl" />
            <canvas
              ref={annotCanvasRef}
              style={{ cursor }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              className="absolute inset-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AbaImportarPDF({ projetoId, initialFiles, fullscreen }) {
  const [pdfDoc,       setPdfDoc]       = useState(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [scale,        setScale]        = useState(1.2);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [fileName,     setFileName]     = useState('');
  const [items,        setItems]        = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT);
  const [chatInput,    setChatInput]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [fileList,     setFileList]     = useState(initialFiles ?? []);
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-load first file from initialFiles on mount
  useEffect(() => {
    if (initialFiles?.length > 0) loadPDF(initialFiles[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PDF loading ────────────────────────────────────────────────────────────
  async function loadPDF(file) {
    if (!file || file.type !== 'application/pdf') return;
    setLoading(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const doc    = await pdfjsLib.getDocument({ data: buffer }).promise;
      setPdfDoc(doc);
      setCurrentPage(1);
      // Simula extração pela IA após 1.5s
      setTimeout(() => {
        setItems(MOCK_ITEMS);
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', text: `Analisei "${file.name}" e encontrei ${MOCK_ITEMS.length} itens. Revise abaixo e me diga se algo precisa ser ajustado.` },
        ]);
        setLoading(false);
      }, 1500);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'error', text: `Erro ao carregar PDF: ${err.message}` }]);
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) { setFileList([]); setActiveFileIdx(0); loadPDF(file); }
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) { setFileList([]); setActiveFileIdx(0); loadPDF(file); }
  }

  function switchFile(idx) {
    if (idx === activeFileIdx) return;
    setActiveFileIdx(idx);
    setPdfDoc(null);
    setItems([]);
    setSelectedItem(null);
    loadPDF(fileList[idx]);
  }

  // ── Item click → jump to page ──────────────────────────────────────────────
  function handleItemClick(item) {
    setSelectedItem(item.id);
    setCurrentPage(item.pagina);
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  function handleChatSend() {
    const text = chatInput.trim();
    if (!text) return;
    setChatMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: 'Entendido. Ajuste anotado — implemente a integração real para que eu aplique as mudanças nos itens.' },
    ]);
    setChatInput('');
  }

  return (
    <div className={`flex gap-0 border border-zinc-800 ${fullscreen ? 'h-full' : 'h-[calc(100vh-220px)] min-h-[500px]'}`}>

      {/* ══ LADO ESQUERDO ════════════════════════════════════════════════════ */}
      <div className="flex flex-col w-1/2 border-r border-zinc-800 overflow-hidden">

        {/* File tabs — shown when multiple files were passed */}
        {fileList.length > 1 && (
          <div className="shrink-0 flex overflow-x-auto border-b border-zinc-800 bg-zinc-950">
            {fileList.map((f, i) => (
              <button
                key={i}
                onClick={() => switchFile(i)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] border-r border-zinc-800 transition-colors truncate max-w-[160px] ${
                  i === activeFileIdx
                    ? 'bg-zinc-900 text-zinc-200 border-b-2 border-b-yellow-400'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                }`}
              >
                <iconify-icon icon="solar:file-text-bold" width="11" class="shrink-0 text-yellow-400" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Itens extraídos */}
        <div className="shrink-0 border-b border-zinc-800">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-950">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Verificações {items.length > 0 && `· ${items.length}`}
            </span>
            {loading && (
              <span className="font-mono text-[9px] text-yellow-400 animate-pulse">Analisando...</span>
            )}
          </div>

          {!pdfDoc && !loading && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mx-4 mb-3 flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed cursor-pointer transition-colors ${
                isDragOver ? 'border-yellow-400 bg-yellow-400/5' : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <iconify-icon icon="solar:upload-linear" width="18" class="text-zinc-600" />
              <p className="font-mono text-[10px] text-zinc-600 text-center">
                Arraste um PDF ou <span className="text-yellow-400">clique para selecionar</span>
              </p>
            </div>
          )}

          {items.length === 0 && pdfDoc && !loading && (
            <p className="px-4 py-4 font-mono text-[10px] text-zinc-700 text-center">Analisando PDF...</p>
          )}

          <div className="max-h-56 overflow-y-auto">
            {items.map(item => {
              const isSelected = selectedItem === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left px-4 py-2.5 border-b border-zinc-800/50 transition-colors border-l-2 ${
                    isSelected
                      ? 'bg-yellow-400/5 border-l-yellow-400'
                      : 'border-l-transparent hover:bg-zinc-900/50'
                  }`}
                >
                  <p className="font-mono text-[11px] text-zinc-200 truncate leading-snug">{item.descricao}</p>
                  <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                    {item.dimensoes}
                    <span className="mx-1.5 text-zinc-700">·</span>
                    <span className="text-zinc-600">{item.ambiente}</span>
                    <span className="mx-1.5 text-zinc-700">·</span>
                    <span className="text-zinc-700">pág. {item.pagina}</span>
                  </p>
                  <div className="mt-1.5">
                    <ConfidenceBar pct={item.confianca} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Chat IA</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 font-mono text-[11px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-yellow-400/10 border border-yellow-400/20 text-yellow-100'
                    : msg.role === 'error'
                    ? 'bg-red-900/20 border border-red-700/40 text-red-300'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div className="shrink-0 border-t border-zinc-800 p-3 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChatSend()}
              disabled={!pdfDoc}
              placeholder={pdfDoc ? 'Ex: muda a medida da bancada da cozinha para 3,50 m' : 'Faça upload de um PDF para começar'}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white text-[11px] font-mono px-3 py-2 outline-none focus:border-yellow-400 placeholder:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || !pdfDoc}
              className="px-3 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest font-bold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <iconify-icon icon="solar:arrow-up-linear" width="13" />
            </button>
          </div>
        </div>

        {/* Rodapé — Gerar Orçamento */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-zinc-800 p-3">
            <button className="w-full py-2.5 bg-[#1D9E75] hover:bg-[#18896A] text-white font-mono text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2">
              <iconify-icon icon="solar:cart-large-minimalistic-linear" width="14" />
              Gerar Orçamento ({items.length} {items.length === 1 ? 'item' : 'itens'})
            </button>
          </div>
        )}
      </div>

      {/* Input oculto — acionado pelo botão "trocar" na toolbar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ══ LADO DIREITO — PDF Viewer ════════════════════════════════════════ */}
      <div className="flex flex-col w-1/2 overflow-hidden">
        <PDFViewer
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          scale={scale}
          setScale={setScale}
          fileName={fileName}
          onClose={() => { setPdfDoc(null); setItems([]); setFileName(''); setSelectedItem(null); }}
          onSwap={() => fileInputRef.current?.click()}
        />
      </div>
    </div>
  );
}
