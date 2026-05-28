import { useState, useRef, useEffect, Fragment } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { analyzePlantPDF, callGemini, PLANTA_CHAT_SYSTEM, isConfigured } from '../../services/aiService';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MAX_PDF_PAGES = 10; // limite de páginas enviadas ao Gemini

const INITIAL_CHAT = [
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

const MEDIDAS_PADRAO_CM = {
  espelho: 10, saia: 10, frontao: 10,
  soleira: 15, peitoril: 15,
  prateleira: 30,
  tampo: 60, bancada: 60,
};

function parseDimensoes(str) {
  if (!str || str === 'a medir') return null;
  const matches = [...str.matchAll(/(\d+)[,.](\d+)/g)].map(m => parseFloat(`${m[1]}.${m[2]}`));
  if (matches.length < 2) return null;
  return { comprimento: matches[0], largura: matches[1] };
}

// Returns {comprimento, largura} where one is a "X,XX" string and the other is null,
// when str has the format "X × a medir" or "a medir × Y" (exactly one side unknown).
// Returns null for fully unknown ('a medir'), fully known, or unrecognised formats.
function parsePartialDim(str) {
  if (!str || str === 'a medir') return null;
  const xIdx = str.indexOf('×');
  if (xIdx === -1) return null;
  const left  = str.slice(0, xIdx).trim();
  const right = str.slice(xIdx + 1).trim();
  const numOf = s => { const m = s.match(/(\d+)[,.](\d+)/); return m ? `${m[1]},${m[2]}` : null; };
  const c = numOf(left);
  const l = numOf(right);
  if ((c && l) || (!c && !l)) return null; // both known or both unknown
  return { comprimento: c, largura: l };
}

function fuzzyMatchMaterial(query, candidates) {
  if (!query || !candidates.length) return null;
  const norm = s => (s ?? '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(query);
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const n = norm(c.nome);
    let score = 0;
    if (n === q) score = 100;
    else if (n.includes(q) || q.includes(n)) score = 75;
    else {
      const qt = q.split(' ').filter(Boolean);
      const nt = new Set(n.split(' ').filter(Boolean));
      const shared = qt.filter(t => nt.has(t)).length;
      const total  = new Set([...qt, ...n.split(' ').filter(Boolean)]).size;
      if (total > 0) score = Math.round(shared / total * 60);
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 50 ? best : null;
}

function getPrecoM2(materialObj, espessuraCm = 2) {
  if (!materialObj?.variacoes_precos?.length) return 0;
  const esp = Number(espessuraCm) || 2;
  const v = materialObj.variacoes_precos.find(x => (parseInt(x.espessura) || 0) === esp)
         ?? materialObj.variacoes_precos[0];
  return Number(v?.preco_venda ?? 0);
}

const TOOL_ATUALIZAR_ITEMS = {
  function: {
    name: 'atualizar_items_pdf',
    description: 'Atualiza campos (material, espessura, dimensões) de itens selecionados da tabela de revisão do PDF. Use quando o usuário pedir para alterar propriedades de itens.',
    parameters: {
      type: 'object',
      properties: {
        filtro: {
          type: 'object',
          description: 'Critérios para selecionar os itens. Todos opcionais — se vazio, seleciona todos.',
          properties: {
            ambiente:  { type: 'string', description: 'Filtra por nome do ambiente (parcial, ex: "W.C.", "Cozinha")' },
            tipo:      { type: 'string', description: 'Filtra por tipo da peça (ex: "bancada", "soleira", "espelho")' },
            descricao: { type: 'string', description: 'Filtra por trecho da descrição (parcial)' },
          },
        },
        campos: {
          type: 'object',
          description: 'Campos a atualizar. Pelo menos um deve ser informado.',
          properties: {
            material_nome: { type: 'string', description: 'Nome do material a aplicar (buscado no catálogo por similaridade)' },
            espessura_cm:  { type: 'number', description: 'Nova espessura em cm (aceito: 1, 2 ou 3)' },
            dimensoes:     { type: 'string', description: 'Novas dimensões no formato "X,XX m × Y,YY m"' },
          },
        },
      },
      required: ['filtro', 'campos'],
    },
  },
};

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
  const { profile, session } = useAuth();
  const empresaId   = profile?.empresa_id ?? null;
  const navigate    = useNavigate();

  const [pdfDoc,       setPdfDoc]       = useState(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [scale,        setScale]        = useState(1.2);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [fileName,     setFileName]     = useState('');
  const [items,        setItems]        = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT);
  const [chatInput,    setChatInput]    = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [fileList,     setFileList]     = useState(initialFiles ?? []);
  const [activeFileIdx,    setActiveFileIdx]    = useState(0);
  const [pendentes,        setPendentes]        = useState(new Set());
  const [digitandoId,      setDigitandoId]      = useState(null);
  const [digitandoValor,   setDigitandoValor]   = useState('');
  const [gerandoOrcamento, setGerandoOrcamento] = useState(false);
  const [msgArquiteto,     setMsgArquiteto]     = useState('');
  const [materiais,        setMateriais]        = useState([]);
  const [imageUrl,         setImageUrl]         = useState(null);

  // Gemini-format chat history (separate from display messages)
  const chatHistoryRef = useRef([]);
  const materiaisRef   = useRef([]);

  const fileInputRef  = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-load first file from initialFiles on mount
  useEffect(() => {
    if (initialFiles?.length > 0) {
      if (initialFiles[0]?.type.startsWith('image/')) loadImage(initialFiles[0]);
      else loadPDF(initialFiles[0]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load company materials for fuzzy matching
  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from('materiais').select('id, nome, variacoes_precos(espessura, preco_venda)')
      .eq('empresa_id', empresaId).eq('ativo', true).order('nome')
      .then(({ data }) => {
        if (!data) return;
        setMateriais(data);
        materiaisRef.current = data;
        // Re-match items already loaded before materiais arrived (skip resolved ones)
        setItems(prev => prev.length === 0 ? prev : prev.map(item => {
          if (item.material_resolved) return item;
          return { ...item, material_id: item.material ? (fuzzyMatchMaterial(item.material, data)?.id ?? null) : null };
        }));
      });
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PDF → images helper ────────────────────────────────────────────────────
  async function pdfToImages(doc) {
    const count  = Math.min(doc.numPages, MAX_PDF_PAGES);
    const images = [];
    for (let i = 1; i <= count; i++) {
      const page     = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.85));
    }
    return images;
  }

  // ── PDF loading ────────────────────────────────────────────────────────────
  async function loadPDF(file) {
    if (!file || file.type !== 'application/pdf') return;
    setLoading(true);
    setFileName(file.name);
    setItems([]);
    setImageUrl(null);
    chatHistoryRef.current = [];

    try {
      const buffer = await file.arrayBuffer();
      const doc    = await pdfjsLib.getDocument({ data: buffer }).promise;
      setPdfDoc(doc);
      setCurrentPage(1);

      if (!isConfigured) {
        setChatMessages(prev => [...prev, {
          role: 'error',
          text: 'VITE_GEMINI_API_KEY não configurada. Adicione ao .env.local e reinicie.',
        }]);
        setLoading(false);
        return;
      }

      setChatMessages(prev => [...prev, { role: 'assistant', text: `Renderizando "${file.name}"…` }]);

      const pageImages  = await pdfToImages(doc);
      const extracted   = await analyzePlantPDF({ pageImages, empresaId });

      // Normalize ids to strings and fill new fields from enriched prompt
      const normalizedItems = extracted.map((item, i) => {
        const rawEsp = item.espessura_cm != null ? Number(item.espessura_cm) : null;
        const esp    = rawEsp != null && rawEsp >= 1 && rawEsp <= 3 ? rawEsp : null;
        const match  = fuzzyMatchMaterial(item.material, materiaisRef.current);
        return {
          ...item,
          id:           String(item.id ?? i + 1),
          pagina:       Number(item.pagina ?? 1),
          confianca:    Number(item.confianca ?? 50),
          material:     item.material ?? null,
          espessura_cm: esp,
          tipo:         item.tipo ?? 'outro',
          furos:        Array.isArray(item.furos) ? item.furos : [],
          trecho_origem:    item.trecho_origem ?? null,
          material_id:      match?.id ?? null,
          material_resolved: false,
        };
      });

      setItems(normalizedItems);

      const summary = `Analisei "${file.name}" (${doc.numPages} pág.) e encontrei ${normalizedItems.length} item(ns). Revise abaixo e me diga se algo precisa ser ajustado.`;
      setChatMessages(prev => [
        ...prev.slice(0, -1), // remove a mensagem de "Renderizando..."
        { role: 'assistant', text: summary },
      ]);

      // Detectar materiais sugeridos pela IA que não foram encontrados no catálogo
      const materiaisAmbiguos = [...new Set(
        normalizedItems
          .filter(it => it.material && !it.material_id)
          .map(it => it.material)
      )];

      // Texto que vai no seed do histórico (sempre presente, para contexto da IA)
      let modelSeedText = `${summary}\n\nItens extraídos:\n${JSON.stringify(normalizedItems, null, 2)}`;

      if (materiaisAmbiguos.length > 0) {
        const pergunta = `Encontrei os seguintes materiais que não estão no catálogo: ${materiaisAmbiguos.join(', ')}. Para cada um, qual material do sistema devo usar? Ou posso cadastrar como novo?`;
        setChatMessages(prev => [...prev, { role: 'assistant', text: pergunta }]);
        // Inclui a pergunta no mesmo turn do model seed para manter o histórico alternado (user→model)
        modelSeedText += `\n\n${pergunta}`;
      }

      // Seed chat history with a valid user/model pair so sanitizeGeminiHistory
      // doesn't strip it (Gemini requires history to start with a user turn).
      chatHistoryRef.current = [
        { role: 'user',  parts: [{ text: 'PDF analisado. Quais itens foram encontrados?' }] },
        { role: 'model', parts: [{ text: modelSeedText }] },
      ];
    } catch (err) {
      setChatMessages(prev => [
        ...prev.filter(m => m.text !== `Renderizando "${file.name}"…`),
        { role: 'error', text: `Erro ao analisar PDF: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Image loading ───────────────────────────────────────────────────────────
  async function loadImage(file) {
    setLoading(true);
    setFileName(file.name);
    setItems([]);
    setPdfDoc(null);
    chatHistoryRef.current = [];

    try {
      if (!isConfigured) {
        setChatMessages(prev => [...prev, {
          role: 'error',
          text: 'VITE_GEMINI_API_KEY não configurada. Adicione ao .env.local e reinicie.',
        }]);
        return;
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImageUrl(dataUrl);

      setChatMessages(prev => [...prev, { role: 'assistant', text: `Analisando "${file.name}"…` }]);

      const extracted = await analyzePlantPDF({ pageImages: [dataUrl], empresaId });

      const normalizedItems = extracted.map((item, i) => {
        const rawEsp = item.espessura_cm != null ? Number(item.espessura_cm) : null;
        const esp    = rawEsp != null && rawEsp >= 1 && rawEsp <= 3 ? rawEsp : null;
        const match  = fuzzyMatchMaterial(item.material, materiaisRef.current);
        return {
          ...item,
          id:           String(item.id ?? i + 1),
          pagina:       Number(item.pagina ?? 1),
          confianca:    Number(item.confianca ?? 50),
          material:     item.material ?? null,
          espessura_cm: esp,
          tipo:         item.tipo ?? 'outro',
          furos:        Array.isArray(item.furos) ? item.furos : [],
          trecho_origem:     item.trecho_origem ?? null,
          material_id:       match?.id ?? null,
          material_resolved: false,
        };
      });

      setItems(normalizedItems);

      const summary = `Analisei "${file.name}" e encontrei ${normalizedItems.length} item(ns). Revise abaixo e me diga se algo precisa ser ajustado.`;
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', text: summary },
      ]);

      const materiaisAmbiguos = [...new Set(
        normalizedItems
          .filter(it => it.material && !it.material_id)
          .map(it => it.material)
      )];

      let modelSeedText = `${summary}\n\nItens extraídos:\n${JSON.stringify(normalizedItems, null, 2)}`;

      if (materiaisAmbiguos.length > 0) {
        const pergunta = `Encontrei os seguintes materiais que não estão no catálogo: ${materiaisAmbiguos.join(', ')}. Para cada um, qual material do sistema devo usar? Ou posso cadastrar como novo?`;
        setChatMessages(prev => [...prev, { role: 'assistant', text: pergunta }]);
        modelSeedText += `\n\n${pergunta}`;
      }

      chatHistoryRef.current = [
        { role: 'user',  parts: [{ text: 'Imagem analisada. Quais itens foram encontrados?' }] },
        { role: 'model', parts: [{ text: modelSeedText }] },
      ];
    } catch (err) {
      setChatMessages(prev => [
        ...prev.filter(m => m.text !== `Analisando "${file.name}"…`),
        { role: 'error', text: `Erro ao analisar imagem: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setFileList([]); setActiveFileIdx(0);
      if (file.type.startsWith('image/')) loadImage(file);
      else loadPDF(file);
    }
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileList([]); setActiveFileIdx(0);
      if (file.type.startsWith('image/')) loadImage(file);
      else loadPDF(file);
    }
  }

  function switchFile(idx) {
    if (idx === activeFileIdx) return;
    setActiveFileIdx(idx);
    setPdfDoc(null);
    setImageUrl(null);
    setItems([]);
    setSelectedItem(null);
    const file = fileList[idx];
    if (file.type?.startsWith('image/')) loadImage(file);
    else loadPDF(file);
  }

  // ── Item click → jump to page ──────────────────────────────────────────────
  function handleItemClick(item) {
    setSelectedItem(item.id);
    setCurrentPage(item.pagina);
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatLoading(true);

    const userTurn      = { role: 'user', parts: [{ text }] };
    let loopHistory     = [...chatHistoryRef.current.slice(-6), userTurn];
    const activeTools   = items.length > 0 ? [TOOL_ATUALIZAR_ITEMS] : undefined;
    // Include current items in system prompt so the model always has context,
    // even when sanitizeGeminiHistory strips old history turns.
    const itemsCtx = items.map(it => ({
      id: it.id, descricao: it.descricao, ambiente: it.ambiente ?? 'Geral',
      dimensoes: it.dimensoes, material: it.material ?? null,
      tipo: it.tipo, espessura_cm: it.espessura_cm,
    }));
    const chatSystemPrompt = items.length > 0
      ? [
          PLANTA_CHAT_SYSTEM,
          '',
          'Itens atuais extraídos do PDF (use para interpretar pedidos do usuário):',
          JSON.stringify(itemsCtx, null, 2),
          '',
          `Materiais disponíveis no catálogo: ${materiais.map(m => m.nome).join(', ') || 'nenhum'}.`,
          '',
          "Use a tool 'atualizar_items_pdf' SEMPRE que o usuário pedir para alterar material, espessura ou dimensões de itens. Após executar a tool, confirme ao usuário exatamente o que foi alterado.",
        ].join('\n')
      : PLANTA_CHAT_SYSTEM;

    try {
      const { text: responseText, functionCalls } = await callGemini({
        systemPrompt: chatSystemPrompt,
        history:      loopHistory,
        tools:        activeTools,
        fluxo:        'analise_planta',
        empresaId,
      });

      if (functionCalls?.length > 0) {
        loopHistory.push({ role: 'model', parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })) });
        const responseParts = [];
        for (const fc of functionCalls) {
          const result = fc.name === 'atualizar_items_pdf'
            ? executarAtualizarItems(fc.args ?? {})
            : { erro: 'Tool desconhecida.' };
          responseParts.push({ functionResponse: { name: fc.name, response: result } });
        }
        loopHistory.push({ role: 'user', parts: responseParts });

        const { text: finalText } = await callGemini({
          systemPrompt: chatSystemPrompt,
          history:      loopHistory,
          fluxo:        'analise_planta',
          empresaId,
        });
        const reply = finalText ?? 'Atualização concluída.';
        // Keep only plain text turns in persistent history to avoid functionCall/Response orphans
        const plainHistory = loopHistory.filter(m =>
          Array.isArray(m.parts) && m.parts.every(p => !('functionCall' in p) && !('functionResponse' in p))
        );
        chatHistoryRef.current = [...plainHistory, { role: 'model', parts: [{ text: reply }] }];
        setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      } else {
        const reply = responseText ?? 'Não consegui processar sua mensagem.';
        chatHistoryRef.current = [...loopHistory, { role: 'model', parts: [{ text: reply }] }];
        setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'error', text: `Erro: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Usar padrão ─────────────────────────────────────────────────────────────
  function usarPadrao(item) {
    const largPadrao = MEDIDAS_PADRAO_CM[item.tipo];
    const largM      = largPadrao != null ? (largPadrao / 100).toFixed(2).replace('.', ',') : null;
    // Grava dimensoes como parcial ("a medir × 0,10 m") para que parsePartialDim
    // renderize "[____] × 0,10 m" inline na célula com autoFocus no comprimento.
    setItems(prev => prev.map(it =>
      it.id === item.id ? {
        ...it,
        espessura_cm: it.espessura_cm ?? 2,
        ...(largM != null ? { dimensoes: `a medir × ${largM} m` } : {}),
      } : it
    ));
    setDigitandoId(item.id);
    setDigitandoValor('');
  }

  // ── Salvar dimensão parcial ──────────────────────────────────────────────────
  function savePartialDim(item, partial, rawVal) {
    const m = rawVal.trim().match(/(\d+)[,.](\d+)/);
    if (!m) { setDigitandoId(null); return; }
    const val  = `${m[1]},${m[2]}`;
    const full = partial.comprimento === null
      ? `${val} m × ${partial.largura} m`
      : `${partial.comprimento} m × ${val} m`;
    setItems(prev => prev.map(it =>
      it.id === item.id ? { ...it, dimensoes: full, confianca: Math.max(it.confianca, 70) } : it
    ));
    setDigitandoId(null);
  }

  // ── Executar tool atualizar_items_pdf ────────────────────────────────────────
  function executarAtualizarItems({ filtro = {}, campos = {} }) {
    const normStr = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const matched = items.filter(item => {
      if (filtro.ambiente  && !normStr(item.ambiente  ?? '').includes(normStr(filtro.ambiente)))  return false;
      if (filtro.tipo      && normStr(item.tipo  ?? '') !== normStr(filtro.tipo))                  return false;
      if (filtro.descricao && !normStr(item.descricao ?? '').includes(normStr(filtro.descricao))) return false;
      return true;
    });
    if (matched.length === 0) return { atualizados: 0, mensagem: 'Nenhum item encontrado.' };
    const matchedIds = new Set(matched.map(it => it.id));
    setItems(prev => prev.map(item => {
      if (!matchedIds.has(item.id)) return item;
      const update = {};
      if (campos.material_nome) {
        const match = fuzzyMatchMaterial(campos.material_nome, materiaisRef.current);
        update.material = campos.material_nome;
        update.material_id = match?.id ?? null;
        update.material_resolved = !!match;
      }
      if (campos.espessura_cm != null) {
        const esp = Number(campos.espessura_cm);
        if (esp >= 1 && esp <= 3) update.espessura_cm = esp;
      }
      if (campos.dimensoes) {
        update.dimensoes = campos.dimensoes;
        if (parseDimensoes(campos.dimensoes)) update.confianca = Math.max(item.confianca, 70);
      }
      return { ...item, ...update };
    }));
    return { atualizados: matched.length, itens: matched.map(it => `${it.descricao} (${it.ambiente ?? 'Geral'})`) };
  }

  // ── Gerar Orçamento ─────────────────────────────────────────────────────────
  async function gerarOrcamento() {
    const vendedorId = session?.user?.id ?? null;
    if (!empresaId || !vendedorId) { alert('Sessão inválida.'); return; }
    setGerandoOrcamento(true);
    try {
      const itemsParaOrcamento = items.filter(it => !pendentes.has(it.id));
      if (itemsParaOrcamento.length === 0) { alert('Nenhum item para orçar.'); return; }

      // 1. Criar um ambiente por nome único
      const ambienteNomes = [...new Set(itemsParaOrcamento.map(it => it.ambiente ?? 'Geral'))];
      const ambMapping = {};
      for (const nome of ambienteNomes) {
        const ambId = crypto.randomUUID();
        const { error } = await supabase.from('ambientes').insert({
          id: ambId, empresa_id: empresaId, projeto_id: projetoId, nome,
          created_at: new Date().toISOString(),
        });
        if (!error) ambMapping[nome] = ambId;
        else console.error('[PDF→Orc] Erro ambiente:', nome, error.message);
      }
      const firstAmbId = Object.values(ambMapping)[0];
      if (!firstAmbId) throw new Error('Falha ao criar ambientes.');

      // 2. Criar todas as peças (cada uma no seu ambiente correto)
      const allPecasRows = itemsParaOrcamento.map(item => {
        const dims = parseDimensoes(item.dimensoes);
        const area = dims ? Math.round(dims.comprimento * dims.largura * 10000) / 10000 : 0;
        return {
          id: crypto.randomUUID(), empresa_id: empresaId,
          ambiente_id: ambMapping[item.ambiente ?? 'Geral'] ?? firstAmbId,
          tipo: 'retangulo', nome_livre: item.descricao,
          espessura_cm: item.espessura_cm ?? 2,
          area_bruta_m2: area, area_liquida_m2: area,
          dimensoes: dims ?? {},
          arestas: { meia_esquadria_ml: 0, reto_simples_ml: 0 },
          recortes: (item.furos ?? []).map(f => ({ tipo: f, quantidade: 1 })),
          incluida: true, created_at: new Date().toISOString(),
        };
      });

      const { error: errPecas } = await supabase.from('pecas').insert(allPecasRows);
      if (errPecas) throw new Error('Erro ao criar peças: ' + errPecas.message);

      // 3. Calcular preços por peça
      const opcRows = allPecasRows.map((p, idx) => {
        const item      = itemsParaOrcamento[idx];
        const mat       = item.material_id ? materiais.find(m => m.id === item.material_id) : null;
        const precoM2   = getPrecoM2(mat, p.espessura_cm);
        const valorArea = Math.round(p.area_liquida_m2 * precoM2 * 100) / 100;
        return {
          peca_id: p.id, material_id: item.material_id ?? null,
          item_nome: item.descricao,
          valor_area: valorArea, valor_acabamentos: 0, valor_recortes: 0,
          valor_total: valorArea,
          acabamentos: [], recortes: p.recortes,
        };
      });

      const valorTotalOrc = Math.round(opcRows.reduce((s, r) => s + r.valor_total, 0) * 100) / 100;

      // 4. Criar UM orçamento com o total calculado
      const { data: orc, error: errOrc } = await supabase
        .from('orcamentos')
        .insert({
          empresa_id: empresaId, ambiente_id: firstAmbId, vendedor_id: vendedorId,
          nome_versao: 'Orçamento PDF', status: 'rascunho',
          desconto_total: 0, valor_total: valorTotalOrc,
        })
        .select('id').single();
      if (errOrc) throw new Error('Erro ao criar orçamento: ' + errOrc.message);

      const { error: errOpc } = await supabase
        .from('orcamento_pecas')
        .insert(opcRows.map(r => ({ ...r, orcamento_id: orc.id })));
      if (errOpc) console.error('[PDF→Orc] Erro orcamento_pecas:', errOpc.message);

      navigate(`/projetos/${projetoId}`, { state: { activeTab: 'orcamentos' } });
    } catch (err) {
      alert('Erro ao gerar orçamento: ' + err.message);
    } finally {
      setGerandoOrcamento(false);
    }
  }

  // ── Gerar Mensagem para Arquiteto ────────────────────────────────────────────
  function gerarMsgArquiteto() {
    const itensPendentes = items.filter(it => pendentes.has(it.id));
    if (itensPendentes.length === 0) return;
    const linhas = itensPendentes.map(it =>
      `• ${it.descricao} (${it.ambiente ?? 'Geral'}): ${it.dimensoes === 'a medir' ? 'preciso das medidas' : `confirmar: ${it.dimensoes}`}`
    );
    setMsgArquiteto(
      `Olá! Para finalizar o orçamento do seu projeto, preciso de algumas informações:\n\n${linhas.join('\n')}\n\nSe possível, me envie as medidas em metros. Ex: 2,50 × 0,60.`
    );
  }

  const ambiguosNaoResolvidos = items.filter(it =>
    !pendentes.has(it.id) &&
    it.material !== null &&
    it.material_id === null &&
    it.material_resolved !== true
  ).length;

  return (
    <>
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

          {!pdfDoc && !loading && !imageUrl && (
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
                Arraste um PDF ou imagem (PNG, JPG) ou <span className="text-yellow-400">clique para selecionar</span>
              </p>
            </div>
          )}


          {items.length === 0 && pdfDoc && !loading && (
            <p className="px-4 py-4 font-mono text-[10px] text-zinc-700 text-center">Analisando PDF...</p>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-950 border-b border-zinc-800 sticky top-0">
                    <th className="text-left px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Descrição</th>
                    <th className="text-left px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Ambiente</th>
                    <th className="text-left px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Material</th>
                    <th className="text-left px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Dimensões</th>
                    <th className="text-right px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Esp.</th>
                    <th className="text-right px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isPendente  = pendentes.has(item.id);
                    const partialDim  = parsePartialDim(item.dimensoes);
                    const needsReview = !isPendente && (item.confianca < 50 || item.dimensoes === 'a medir' || partialDim !== null);
                    const isEditing   = digitandoId === item.id;
                    const cellEditing = isEditing && !partialDim; // input fica na célula só quando não é parcial
                    const isSelected  = selectedItem === item.id;
                    const rowBg       = isPendente  ? 'bg-orange-400/5'
                                      : needsReview ? 'bg-yellow-400/5'
                                      : isSelected  ? 'bg-zinc-800/40' : '';
                    return (
                      <Fragment key={item.id}>
                        <tr
                          onClick={() => handleItemClick(item)}
                          className={`border-b border-zinc-800/40 cursor-pointer hover:bg-zinc-800/30 transition-colors ${rowBg}`}
                        >
                          <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-200 max-w-[110px]">
                            <span className="block truncate">{item.descricao}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-500 max-w-[70px]">
                            <span className="block truncate">{item.ambiente}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">
                            {item.material_id != null ? (
                              <div className="flex items-center gap-1">
                                <span className="truncate text-zinc-300 max-w-[110px] block">
                                  {materiais.find(m => m.id === item.material_id)?.nome ?? item.material}
                                </span>
                                <button
                                  onClick={e => { e.stopPropagation(); setItems(prev => prev.map(it => it.id === item.id ? { ...it, material_id: null, material_resolved: false } : it)); }}
                                  className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors leading-none"
                                  title="Remover"
                                >×</button>
                              </div>
                            ) : item.material_resolved ? (
                              <div className="flex items-center gap-1">
                                <span className="text-zinc-600">sem material</span>
                                <button
                                  onClick={e => { e.stopPropagation(); setItems(prev => prev.map(it => it.id === item.id ? { ...it, material_resolved: false } : it)); }}
                                  className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors leading-none"
                                  title="Reverter"
                                >×</button>
                              </div>
                            ) : item.material ? (
                              <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                                <span className="text-yellow-500 text-[9px] truncate max-w-[130px]" title={`IA sugeriu: "${item.material}"`}>
                                  {item.material} ?
                                </span>
                                <select
                                  value=""
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    setItems(prev => prev.map(it => it.id === item.id
                                      ? { ...it, material_id: val === '__sem__' ? null : val, material_resolved: true }
                                      : it));
                                  }}
                                  className="bg-zinc-900 border border-amber-700 text-zinc-400 text-[9px] py-0.5 px-1 outline-none focus:border-yellow-400 max-w-[130px] cursor-pointer"
                                >
                                  <option value="">Selecionar...</option>
                                  {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                  <option value="__sem__">— sem material —</option>
                                </select>
                              </div>
                            ) : (
                              <select
                                value=""
                                onChange={e => {
                                  const val = e.target.value;
                                  if (!val) return;
                                  setItems(prev => prev.map(it => it.id === item.id
                                    ? { ...it, material_id: val === '__sem__' ? null : val, material_resolved: true }
                                    : it));
                                }}
                                onClick={e => e.stopPropagation()}
                                className="bg-zinc-900 border border-zinc-800 text-zinc-600 text-[9px] py-0.5 px-1 outline-none focus:border-zinc-600 max-w-[130px] cursor-pointer"
                              >
                                <option value="">Selecionar material</option>
                                {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                <option value="__sem__">— sem material —</option>
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] whitespace-nowrap">
                            {cellEditing ? (
                              <input
                                autoFocus
                                value={digitandoValor}
                                onChange={e => setDigitandoValor(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const v = digitandoValor.trim();
                                    setItems(prev => prev.map(it => it.id === item.id
                                      ? { ...it, dimensoes: v || it.dimensoes, confianca: Math.max(it.confianca, 70) }
                                      : it));
                                    setDigitandoId(null);
                                  } else if (e.key === 'Escape') {
                                    setDigitandoId(null);
                                  }
                                }}
                                onClick={e => e.stopPropagation()}
                                placeholder="ex: 3,20 m × 0,60 m"
                                className="bg-zinc-900 border border-yellow-400 text-white text-[10px] font-mono px-1.5 py-0.5 w-32 outline-none"
                              />
                            ) : partialDim ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                {partialDim.comprimento === null ? (
                                  <>
                                    <input
                                      autoFocus={isEditing}
                                      value={isEditing ? digitandoValor : ''}
                                      onFocus={() => { setDigitandoId(item.id); setDigitandoValor(''); }}
                                      onChange={e => setDigitandoValor(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') savePartialDim(item, partialDim, digitandoValor);
                                        else if (e.key === 'Escape') setDigitandoId(null);
                                      }}
                                      placeholder="ex: 3,20"
                                      className="bg-zinc-900 border border-yellow-400 text-white text-[10px] font-mono px-1.5 py-0.5 w-16 outline-none"
                                    />
                                    <span className="text-zinc-400 whitespace-nowrap shrink-0">× {partialDim.largura} m</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-zinc-400 whitespace-nowrap shrink-0">{partialDim.comprimento} m ×</span>
                                    <input
                                      autoFocus={isEditing}
                                      value={isEditing ? digitandoValor : ''}
                                      onFocus={() => { setDigitandoId(item.id); setDigitandoValor(''); }}
                                      onChange={e => setDigitandoValor(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') savePartialDim(item, partialDim, digitandoValor);
                                        else if (e.key === 'Escape') setDigitandoId(null);
                                      }}
                                      placeholder="ex: 0,60"
                                      className="bg-zinc-900 border border-yellow-400 text-white text-[10px] font-mono px-1.5 py-0.5 w-16 outline-none"
                                    />
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className={item.dimensoes === 'a medir' ? 'text-yellow-400' : 'text-zinc-300'}>
                                {item.dimensoes}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-500 text-right whitespace-nowrap">
                            {item.espessura_cm != null ? `${item.espessura_cm}` : '—'}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-right whitespace-nowrap">
                            <span style={{ color: confidenceColor(item.confianca) }}>{item.confianca}%</span>
                          </td>
                        </tr>
                        {(needsReview || isPendente) && !cellEditing && (
                          <tr className={`border-b border-zinc-800/40 ${rowBg}`}>
                            <td colSpan={6} className="px-2 pb-1.5 pt-0">
                              {isPendente ? (
                                <div className="flex items-center gap-2">
                                  <iconify-icon icon="solar:clock-circle-linear" width="10" class="text-orange-400 shrink-0" />
                                  <span className="font-mono text-[9px] text-orange-400 uppercase tracking-widest">Aguardando arquiteto</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); setPendentes(p => { const s = new Set(p); s.delete(item.id); return s; }); }}
                                    className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
                                  >✕</button>
                                </div>
                              ) : partialDim ? (
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={e => { e.stopPropagation(); setPendentes(p => new Set([...p, item.id])); }}
                                    className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-orange-800 text-orange-500 hover:border-orange-600 hover:text-orange-300 transition-colors"
                                  >Perguntar ao arquiteto</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={e => { e.stopPropagation(); usarPadrao(item); }}
                                    className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                                  >Usar padrão</button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setDigitandoId(item.id); setDigitandoValor(item.dimensoes === 'a medir' ? '' : item.dimensoes); }}
                                    className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                                  >Digitar</button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setPendentes(p => new Set([...p, item.id])); }}
                                    className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-orange-800 text-orange-500 hover:border-orange-600 hover:text-orange-300 transition-colors"
                                  >Perguntar ao arquiteto</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
              disabled={!pdfDoc || chatLoading}
              placeholder={pdfDoc ? 'Ex: muda a medida da bancada da cozinha para 3,50 m' : 'Faça upload de um PDF para começar'}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white text-[11px] font-mono px-3 py-2 outline-none focus:border-yellow-400 placeholder:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim() || !pdfDoc || chatLoading}
              className="px-3 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest font-bold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {chatLoading
                ? <iconify-icon icon="solar:refresh-linear" width="13" class="animate-spin" />
                : <iconify-icon icon="solar:arrow-up-linear" width="13" />
              }
            </button>
          </div>
        </div>

        {/* Rodapé — Gerar Orçamento / Mensagem */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-zinc-800 p-3">
            {pendentes.size > 0 ? (
              <button
                onClick={gerarMsgArquiteto}
                className="w-full py-2.5 bg-orange-600/10 border border-orange-800 hover:bg-orange-600/20 text-orange-400 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2"
              >
                <iconify-icon icon="solar:chat-round-dots-linear" width="14" />
                Gerar mensagem ({pendentes.size} {pendentes.size === 1 ? 'pendente' : 'pendentes'})
              </button>
            ) : ambiguosNaoResolvidos > 0 ? (
              <div className="w-full py-2.5 flex items-center justify-center gap-2 font-mono text-[10px] text-yellow-600 border border-yellow-900/50 bg-yellow-900/10">
                <iconify-icon icon="solar:danger-triangle-linear" width="13" />
                Resolva {ambiguosNaoResolvidos} material{ambiguosNaoResolvidos > 1 ? 'is' : ''} antes de gerar
              </div>
            ) : (
              <button
                onClick={gerarOrcamento}
                disabled={gerandoOrcamento}
                className="w-full py-2.5 bg-[#1D9E75] hover:bg-[#18896A] text-white font-mono text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gerandoOrcamento
                  ? <iconify-icon icon="solar:refresh-linear" width="14" class="animate-spin" />
                  : <iconify-icon icon="solar:cart-large-minimalistic-linear" width="14" />
                }
                {gerandoOrcamento ? 'Gerando...' : `Gerar Orçamento (${items.length} ${items.length === 1 ? 'item' : 'itens'})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input oculto — acionado pelo botão "trocar" na toolbar */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/jpg"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ══ LADO DIREITO — PDF Viewer ou Image Preview ════════════════════ */}
      <div className="flex flex-col w-1/2 overflow-hidden">
        {imageUrl ? (
          <div className="flex flex-col h-full bg-[#0a0a0a] overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
              <iconify-icon icon="solar:gallery-linear" width="11" class="text-yellow-400 shrink-0" />
              <span className="font-mono text-[10px] text-zinc-400 truncate flex-1 min-w-0">{fileName}</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Trocar arquivo"
                className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <iconify-icon icon="solar:refresh-linear" width="11" />
              </button>
              <button
                onClick={() => { setImageUrl(null); setItems([]); setFileName(''); setSelectedItem(null); }}
                title="Fechar imagem"
                className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
              >
                <iconify-icon icon="solar:close-linear" width="11" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex justify-center p-4">
              <img src={imageUrl} alt={fileName} className="max-w-full object-contain shadow-xl" />
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>

    {/* Modal — Mensagem para arquiteto */}
    {msgArquiteto && (
      <>
        <div className="fixed inset-0 bg-black/80 z-50" onClick={() => setMsgArquiteto('')} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md pointer-events-auto flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Mensagem para o arquiteto</span>
              <button onClick={() => setMsgArquiteto('')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <iconify-icon icon="solar:close-linear" width="14" />
              </button>
            </div>
            <pre className="px-4 py-3 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {msgArquiteto}
            </pre>
            <div className="px-4 py-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(msgArquiteto)}
                className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
              >
                <iconify-icon icon="solar:copy-linear" width="12" />
                Copiar
              </button>
              <button
                onClick={() => setMsgArquiteto('')}
                className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </>
    )}
    </>
  );
}
