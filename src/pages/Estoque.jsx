import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import EtiquetasModal from '../components/estoque/EtiquetasModal';

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIAS_PEDRA = [
  { value: 'granito',   label: 'Granito' },
  { value: 'marmore',   label: 'Mármore' },
  { value: 'quartzito', label: 'Quartzito' },
  { value: 'quartzo',   label: 'Quartzo' },
  { value: 'lamina',    label: 'Lâmina' },
  { value: 'nanoglass', label: 'Nanoglass' },
];

const MEDIDAS_FIXAS = {
  lamina:    { largura_cm: 320, altura_cm: 160 },
  nanoglass: { largura_cm: 320, altura_cm: 160 },
};

const CATS_PRODUTO = ['Cuba', 'Torneira', 'Grapa', 'Perfil', 'Suporte', 'Outro'];
const CATS_INSUMO  = ['Lixa', 'Cola', 'Resina', 'Rejunte', 'Impermeabilizante', 'Outro'];

const BUCKET = 'estoque-fotos';

// Mapeia categoria do estoque → valores da coluna categoria na tabela materiais
// (materiais usa: 'Granito', 'Mármore', 'Lâmina ultra compacta', etc.)
const CATEGORIA_MATERIAIS_MAP = {
  granito:   ['Granito'],
  marmore:   ['Mármore', 'Marmore'],
  quartzito: ['Quartzito'],
  quartzo:   ['Quartzo'],
  lamina:    ['Lâmina ultra compacta', 'Lâmina', 'Lamina'],
  nanoglass: ['Nanoglass'],
};

// Keywords para fallback por nome quando categoria não bate
const CATEGORIA_NOME_KEYWORDS = {
  granito:   ['granito'],
  marmore:   ['marmore', 'mármore'],
  quartzito: ['quartzito'],
  quartzo:   ['quartzo'],
  lamina:    ['lâmina', 'lamina'],
  nanoglass: ['nanoglass'],
};

function filtrarMateriaisPorCategoria(todos, cat) {
  if (!cat) return todos;
  const cats = (CATEGORIA_MATERIAIS_MAP[cat] ?? []).map(c => c.toLowerCase());
  const porCategoria = todos.filter(m => cats.includes((m.categoria ?? '').toLowerCase()));
  if (porCategoria.length > 0) return porCategoria;
  const keywords = CATEGORIA_NOME_KEYWORDS[cat] ?? [cat];
  const porNome = todos.filter(m =>
    keywords.some(k => m.nome?.toLowerCase().includes(k))
  );
  return porNome.length > 0 ? porNome : todos;
}

// Categorias para o modal de cadastro de material (espelha AbaMateriaisArea)
const CATEGORIAS_MATERIAL = [
  'Granito', 'Mármore', 'Quartzito', 'Limestone', 'Dolomítico',
  'Quartzo', 'Lâmina ultra compacta', 'Ardósia', 'Nanoglass', 'Outros',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function catLabel(cat) {
  return CATEGORIAS_PEDRA.find(c => c.value === cat)?.label ?? cat;
}

function dim(item) {
  return `${item.largura_cm} × ${item.altura_cm} cm`;
}

function uploadFoto(file, empresaId) {
  const ext  = file.name.split('.').pop();
  const path = `${empresaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  return supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    .then(({ error }) => { if (error) throw error; return path; });
}

function fotoUrl(path) {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}


function emptyLinha(categoria) {
  const fixed = MEDIDAS_FIXAS[categoria];
  return {
    largura_cm:  fixed ? fixed.largura_cm : '',
    altura_cm:   fixed ? fixed.altura_cm  : '',
    espessura_cm: 2,
    quantidade:  1,
    tem_trinca:  false,
    tem_mula:    false,
    observacoes: '',
    foto:        null,
    projeto_reserva_id: '',
  };
}

// ── Componentes compartilhados ────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-mono text-[11px] uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400'
          : 'border-transparent text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ type }) {
  if (type === 'trinca')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Trinca</span>;
  if (type === 'mula')
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Mula</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">OK</span>;
}

function FotoThumb({ url, alt, onExpand }) {
  if (url)
    return (
      <button type="button" onClick={onExpand} title="Ampliar foto"
        className="shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-yellow-400">
        <img src={url} alt={alt} className="w-16 h-16 object-cover border border-zinc-200/80 dark:border-zinc-700 cursor-zoom-in hover:opacity-90 transition-opacity" />
      </button>
    );
  return (
    <div className="w-16 h-16 flex items-center justify-center rounded border border-zinc-200/80 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shrink-0">
      <iconify-icon icon="solar:gallery-linear" width="22" class="text-zinc-400 dark:text-zinc-600" />
    </div>
  );
}

function Lightbox({ url, alt, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85" onClick={onClose}>
      <div className="relative" onClick={e => e.stopPropagation()}>
        <img src={url} alt={alt ?? ''} className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl" />
        <button onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-lg text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors">
          <iconify-icon icon="solar:close-circle-linear" width="16" />
        </button>
      </div>
    </div>
  );
}

function ModalUsarPeca({ open, onClose, onConfirm, projetos, saving }) {
  const [projetoId, setProjetoId] = useState('');
  const [obs, setObs]             = useState('');

  useEffect(() => {
    if (open) { setProjetoId(''); setObs(''); }
  }, [open]);

  const projetoOptions = useMemo(
    () => projetos.map(p => ({ id: p.id, label: p.nome })),
    [projetos]
  );

  return (
    <Modal open={open} onClose={onClose} title="Registrar Uso">
      <div className="space-y-4">
        <div>
          <FieldLabel>Projeto *</FieldLabel>
          <Combobox
            value={projetoId}
            onChange={setProjetoId}
            options={projetoOptions}
            placeholder="Buscar projeto..."
          />
        </div>
        <div>
          <FieldLabel>Observação (opcional)</FieldLabel>
          <textarea rows={2} className={inputCls + ' resize-none'} value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Ex: usada no tampo da cozinha" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => projetoId && onConfirm(projetoId, obs)}
            disabled={!projetoId || saving}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
            {saving ? 'Registrando...' : 'Confirmar Uso'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Toggle compacto para célula de tabela
function MiniToggle({ value, onChange, trueColor = 'red' }) {
  const onCls = trueColor === 'red'
    ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-600/50 dark:text-red-400'
    : 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-600/50 dark:text-orange-400';
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-2 h-7 text-[10px] font-mono font-bold rounded border transition-colors ${
        value
          ? onCls
          : 'bg-white border-zinc-200/80 text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500'
      }`}
    >
      {value ? 'Sim' : 'Não'}
    </button>
  );
}

function PillToggle({ label, value, onChange, simVerde = false }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1">{label}</div>
      <div className="flex gap-1">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors ${
              value === v
                ? (v === simVerde)
                  ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-400'
                  : 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-400'
                : 'bg-white border-zinc-200/80 text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500'
            }`}
          >
            {v ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </div>
  );
}

// size: 'md' (max-w-lg) | 'xl' (max-w-3xl)
function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const widthCls = size === 'xl' ? 'max-w-3xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative z-10 w-full ${widthCls} bg-white/95 dark:bg-zinc-950 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 rounded-2xl dark:rounded-none shadow-xl shadow-zinc-300/40 dark:shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
          <span className="font-mono text-[12px] uppercase tracking-widest text-zinc-900 dark:text-white font-bold">{title}</span>
          <button onClick={onClose} className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            <iconify-icon icon="solar:close-circle-linear" width="18" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1">{children}</label>;
}

const inputCls = 'w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white text-[12px] font-mono px-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 transition-colors';
const selectCls = inputCls;
const cellInputCls = 'w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white text-[11px] font-mono px-2 py-1.5 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

// ── Combobox reutilizável com busca por digitação ─────────────────────────────
// value: id string | ''
// onChange(id): chamado ao selecionar ('') ao limpar
// options: [{ id, label }]
// extraAction: { label, onSelect } — item especial no final da lista (opcional)

function Combobox({ value, onChange, options, placeholder, disabled, extraAction }) {
  const [inputText, setInputText] = useState('');
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef();

  const selectedLabel = useMemo(
    () => options.find(o => o.id === value)?.label ?? '',
    [options, value]
  );

  // Sincroniza o input com o label selecionado ao fechar
  useEffect(() => {
    if (!open) setInputText(selectedLabel);
  }, [open, selectedLabel]);

  const filtered = useMemo(() => {
    const q = inputText.trim().toLowerCase();
    if (!q || inputText === selectedLabel) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, inputText, selectedLabel]);

  function handleFocus() {
    setInputText('');
    setOpen(true);
  }

  function handleBlur(e) {
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setOpen(false);
    }
  }

  function handleInput(e) {
    setInputText(e.target.value);
    if (!open) setOpen(true);
    if (!e.target.value) onChange('');
  }

  function handleSelect(id, label) {
    onChange(id);
    setInputText(label);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={inputCls + ' pr-7' + (disabled ? ' opacity-50 cursor-not-allowed' : '')}
        value={open ? inputText : selectedLabel}
        onChange={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
      {!open && value ? (
        <button type="button"
          onMouseDown={e => { e.preventDefault(); onChange(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
          <iconify-icon icon="solar:close-circle-linear" width="13" />
        </button>
      ) : (
        <iconify-icon icon="solar:alt-arrow-down-linear" width="13"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" />
      )}
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-0.5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 rounded shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && !extraAction && (
            <div className="px-3 py-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">Nenhum resultado</div>
          )}
          {filtered.map(o => (
            <button key={o.id} type="button"
              onMouseDown={() => handleSelect(o.id, o.label)}
              className={`w-full text-left px-3 py-2 font-mono text-[12px] transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                o.id === value
                  ? 'text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/5'
                  : 'text-zinc-900 dark:text-zinc-100'
              }`}>
              {o.label}
            </button>
          ))}
          {extraAction && (
            <button type="button"
              onMouseDown={extraAction.onSelect}
              className="w-full text-left px-3 py-2 font-mono text-[12px] text-orange-600 dark:text-yellow-400 hover:bg-orange-50 dark:hover:bg-yellow-400/5 border-t border-zinc-200/80 dark:border-zinc-800 transition-colors">
              {extraAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal de cadastro rápido de material ──────────────────────────────────────
// z-[110] para ficar por cima do modal de chapas (z-50)

function ModalNovoMaterial({ empresaId, categoriaSugerida, onClose, onCreated }) {
  const [nome, setNome]           = useState('');
  const [categoria, setCategoria] = useState(() => {
    // Tenta pré-selecionar a categoria sugerida pelo estoque
    const map = {
      granito: 'Granito', marmore: 'Mármore', quartzito: 'Quartzito',
      quartzo: 'Quartzo', lamina: 'Lâmina ultra compacta', nanoglass: 'Nanoglass',
    };
    return map[categoriaSugerida] ?? 'Granito';
  });
  const [saving, setSaving] = useState('');

  async function handleSave() {
    if (!nome.trim()) { setSaving(''); return; }
    setSaving('saving');
    const { data, error } = await supabase.from('materiais')
      .insert({ nome: nome.trim(), categoria, empresa_id: empresaId, ativo: true })
      .select('id, nome, categoria')
      .single();
    if (error) { setSaving(error.message); return; }
    onCreated(data);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60">
      <div className="relative w-full max-w-sm bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700 rounded-2xl dark:rounded-none shadow-xl shadow-zinc-300/40 dark:shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-orange-500 dark:bg-yellow-400" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-900 dark:text-white font-bold">Novo Material</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            <iconify-icon icon="solar:close-circle-linear" width="16" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <FieldLabel>Nome *</FieldLabel>
            <input autoFocus className={inputCls} value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Ex: Verde Ubatuba" />
          </div>
          <div>
            <FieldLabel>Categoria</FieldLabel>
            <select className={selectCls} value={categoria} onChange={e => setCategoria(e.target.value)}>
              {CATEGORIAS_MATERIAL.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {saving && saving !== 'saving' && (
            <p className="font-mono text-[10px] text-red-500">{saving}</p>
          )}
          <p className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">
            Preços e variações podem ser configurados depois em Configurações → Matéria Prima.
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button onClick={handleSave} disabled={saving === 'saving' || !nome.trim()}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
            {saving === 'saving' ? 'Salvando...' : 'Criar e usar'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aba Chapas ────────────────────────────────────────────────────────────────

function AbaChapas({ empresaId, todosMateirais, projetos, onMaterialCreated }) {
  const [chapas, setChapas]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');
  const [novoMatOpen, setNovoMatOpen] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('disponivel');
  const [busca, setBusca]               = useState('');
  const [usarItem, setUsarItem]         = useState(null);
  const [lightboxUrl, setLightboxUrl]   = useState(null);
  const [etiquetasOpen, setEtiquetasOpen]       = useState(false);
  const [etiquetasContext, setEtiquetasContext] = useState(null);

  const [cab, setCab] = useState({ categoria: '', material_id: '', projeto_reserva_id: '' });
  const [linhas, setLinhas] = useState([emptyLinha('')]);
  const [editForm, setEditForm] = useState({});

  // File input compartilhado para as linhas
  const lineFileRef    = useRef();
  const activeLineIdx  = useRef(null);
  // File input para edição
  const editFileRef = useRef();

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('estoque_chapas')
      .select('*, materiais(id, nome), projetos_uso:projeto_uso_id(id, nome), projetos_reserva:projeto_reserva_id(id, nome)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (!error) setChapas(data ?? []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const materiaisFiltrados = useMemo(
    () => filtrarMateriaisPorCategoria(todosMateirais, cab.categoria),
    [todosMateirais, cab.categoria]
  );
  const materiaisEdit = useMemo(
    () => filtrarMateriaisPorCategoria(todosMateirais, editForm.categoria ?? ''),
    [todosMateirais, editForm.categoria]
  );

  function openNew() {
    setEditItem(null);
    setCab({ categoria: '', material_id: '', projeto_reserva_id: '' });
    setLinhas([emptyLinha('')]);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm({
      categoria:        item.categoria,
      material_id:      item.material_id,
      largura_cm:       item.largura_cm,
      altura_cm:        item.altura_cm,
      espessura_cm:     item.espessura_cm,
      tem_trinca:       item.tem_trinca,
      tem_mula:         item.tem_mula,
      etiqueta_impressa: item.etiqueta_impressa ?? false,
      observacoes:      item.observacoes ?? '',
      foto:             null,
    });
    setModalOpen(true);
  }

  function handleCabCategoria(cat) {
    setCab(c => ({ ...c, categoria: cat, material_id: '' }));
    setLinhas(ls => ls.map(() => emptyLinha(cat)));
    setEditForm(f => ({ ...f, categoria: cat, material_id: '' }));
  }

  function addLinha() {
    setLinhas(ls => [...ls, emptyLinha(cab.categoria)]);
  }

  function removeLinha(idx) {
    setLinhas(ls => ls.filter((_, i) => i !== idx));
  }

  function updateLinha(idx, field, value) {
    setLinhas(ls => ls.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function openLinhaFile(idx) {
    activeLineIdx.current = idx;
    lineFileRef.current?.click();
  }

  function handleLinhaFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const idx = activeLineIdx.current;
    if (idx !== null) updateLinha(idx, 'foto', file);
    e.target.value = '';
  }

  const isFixed = MEDIDAS_FIXAS[cab.categoria];
  const isEditFixed = MEDIDAS_FIXAS[editForm.categoria ?? ''];

  function handleMaterialCriado(newMat) {
    onMaterialCreated(newMat);
    setCab(c => ({ ...c, material_id: newMat.id }));
    setNovoMatOpen(false);
  }

  async function handleSaveNew() {
    if (!cab.categoria || !cab.material_id)
      return showToast('Selecione categoria e material.');
    if (linhas.length === 0)
      return showToast('Adicione ao menos uma linha.');
    for (const [i, l] of linhas.entries()) {
      if (!l.largura_cm || !l.altura_cm)
        return showToast(`Linha ${i + 1}: preencha largura e altura.`);
    }
    setSaving(true);
    try {
      // Cada linha pode ter quantidade > 1 — expande em múltiplos registros
      const allRows = [];
      for (const l of linhas) {
        let foto_url = null;
        if (l.foto) foto_url = await uploadFoto(l.foto, empresaId);
        const base = {
          empresa_id:          empresaId,
          material_id:         cab.material_id,
          categoria:           cab.categoria,
          largura_cm:          Number(l.largura_cm),
          altura_cm:           Number(l.altura_cm),
          espessura_cm:        Number(l.espessura_cm) || 2,
          tem_trinca:          l.tem_trinca,
          tem_mula:            l.tem_mula,
          observacoes:         l.observacoes || null,
          foto_url,
          projeto_reserva_id:  cab.projeto_reserva_id || null,
          status:              cab.projeto_reserva_id ? 'reservada' : 'disponivel',
        };
        const qty = Math.max(1, Number(l.quantidade) || 1);
        for (let k = 0; k < qty; k++) allRows.push(base);
      }
      const { error } = await supabase.from('estoque_chapas').insert(allRows);
      if (error) throw error;
      setModalOpen(false);
      showToast(`${allRows.length} chapa${allRows.length > 1 ? 's' : ''} cadastrada${allRows.length > 1 ? 's' : ''}.`);
      load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editForm.categoria || !editForm.material_id || !editForm.largura_cm || !editForm.altura_cm)
      return showToast('Preencha categoria, material e dimensões.');
    setSaving(true);
    try {
      let foto_url = editItem.foto_url ?? null;
      if (editForm.foto) foto_url = await uploadFoto(editForm.foto, empresaId);
      const { error } = await supabase.from('estoque_chapas').update({
        material_id:       editForm.material_id,
        categoria:         editForm.categoria,
        largura_cm:        Number(editForm.largura_cm),
        altura_cm:         Number(editForm.altura_cm),
        espessura_cm:      Number(editForm.espessura_cm) || 2,
        tem_trinca:        editForm.tem_trinca,
        tem_mula:          editForm.tem_mula,
        etiqueta_impressa: editForm.etiqueta_impressa,
        observacoes:       editForm.observacoes || null,
        foto_url,
      }).eq('id', editItem.id);
      if (error) throw error;
      setModalOpen(false);
      showToast('Chapa atualizada.');
      load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta chapa?')) return;
    const { error } = await supabase.from('estoque_chapas').delete().eq('id', id);
    if (error) { showToast(`Erro: ${error.message}`); return; }
    showToast('Chapa excluída.'); load();
  }

  async function handleConfirmarUso(projetoId, obs) {
    if (!usarItem) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('estoque_chapas').update({
        status: 'utilizada',
        projeto_uso_id: projetoId,
        data_uso: new Date().toISOString(),
        obs_uso: obs || null,
      }).eq('id', usarItem.id);
      if (error) throw error;
      setUsarItem(null);
      showToast('Uso registrado.');
      load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const chapasFiltradas = useMemo(() => {
    let arr = chapas;
    if (filtroStatus === 'disponivel') arr = arr.filter(c => c.status !== 'utilizada');
    else if (filtroStatus === 'utilizada') arr = arr.filter(c => c.status === 'utilizada');
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(c =>
        c.materiais?.nome?.toLowerCase().includes(q) ||
        catLabel(c.categoria).toLowerCase().includes(q) ||
        (c.observacoes ?? '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [chapas, filtroStatus, busca]);

  const porMaterial = useMemo(() =>
    chapasFiltradas.reduce((acc, c) => {
      const nome = c.materiais?.nome ?? 'Material desconhecido';
      if (!acc[nome]) acc[nome] = [];
      acc[nome].push(c);
      return acc;
    }, {}),
    [chapasFiltradas]
  );

  return (
    <div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] font-mono px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            {chapasFiltradas.length} chapa{chapasFiltradas.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEtiquetasContext(null); setEtiquetasOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:text-zinc-200 text-[11px] font-mono uppercase tracking-widest font-bold rounded transition-colors"
            >
              <iconify-icon icon="solar:tag-price-linear" width="14" />
              Etiquetas
            </button>
            <button onClick={openNew} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
              <iconify-icon icon="solar:add-square-linear" width="14" />
              Adicionar Chapas
            </button>
          </div>
        </div>
        <div className="relative">
          <iconify-icon icon="solar:magnifer-linear" width="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" />
          <input
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white text-[12px] font-mono pl-9 pr-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 transition-colors"
            placeholder="Buscar por material, categoria, observação..."
            value={busca} onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: 'disponivel', label: 'Disponíveis' },
            { key: 'todas',      label: 'Todas' },
            { key: 'utilizada',  label: 'Utilizadas' },
          ].map(f => (
            <button key={f.key} onClick={() => setFiltroStatus(f.key)}
              className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${
                filtroStatus === f.key
                  ? 'bg-orange-500 text-white dark:bg-yellow-400 dark:text-black'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Carregando...</div>
      ) : Object.keys(porMaterial).length === 0 ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
          {busca || filtroStatus !== 'todas' ? 'Nenhuma chapa encontrada' : 'Nenhuma chapa cadastrada'}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(porMaterial).map(([nome, items]) => (
            <div key={nome}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-900 dark:text-zinc-200 font-bold">{nome}</span>
                <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{items.length} peça{items.length !== 1 ? 's' : ''}</span>
                <div className="flex-1 border-t border-zinc-200/80 dark:border-zinc-800" />
              </div>
              <div className="space-y-2">
                {items.map(c => (
                  <ChapasRow key={c.id} item={c} onEdit={openEdit} onDelete={handleDelete}
                    onUsar={setUsarItem} onLightbox={setLightboxUrl}
                    onPrint={item => { setEtiquetasContext(item); setEtiquetasOpen(true); }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal NOVO — multi-linha */}
      <Modal open={modalOpen && !editItem} onClose={() => setModalOpen(false)} title="Adicionar Chapas" size="xl">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <FieldLabel>Categoria *</FieldLabel>
            <select className={selectCls} value={cab.categoria} onChange={e => handleCabCategoria(e.target.value)}>
              <option value="">Selecione...</option>
              {CATEGORIAS_PEDRA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Material *</FieldLabel>
            <Combobox
              value={cab.material_id}
              onChange={id => setCab(c => ({ ...c, material_id: id }))}
              options={materiaisFiltrados.map(m => ({ id: m.id, label: m.nome }))}
              placeholder={!cab.categoria ? 'Selecione a categoria primeiro' : (materiaisFiltrados.length ? 'Buscar material...' : 'Nenhum material nesta categoria')}
              disabled={!cab.categoria}
              extraAction={{ label: '+ Cadastrar novo material', onSelect: () => setNovoMatOpen(true) }}
            />
          </div>
        </div>
        <div className="mb-4">
          <FieldLabel>Reservar para projeto (opcional)</FieldLabel>
          <Combobox
            value={cab.projeto_reserva_id}
            onChange={id => setCab(c => ({ ...c, projeto_reserva_id: id }))}
            options={projetos.map(p => ({ id: p.id, label: p.nome }))}
            placeholder="Nenhum — entrada em estoque livre"
          />
        </div>
        {isFixed && (
          <p className="mb-3 font-mono text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/30 rounded px-3 py-2">
            {catLabel(cab.categoria)}: medida fixa {MEDIDAS_FIXAS[cab.categoria].largura_cm} × {MEDIDAS_FIXAS[cab.categoria].altura_cm} cm — dimensões preenchidas automaticamente
          </p>
        )}

        {/* Tabela de linhas */}
        <div className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800">
                {['Larg. (cm)', 'Alt. (cm)', 'Esp. (cm)', 'Qtd', 'Trinca', 'Mula', 'Observações', 'Foto', ''].map(h => (
                  <th key={h} className="text-left py-1.5 px-1 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-b border-zinc-200/80 dark:border-zinc-900">
                  <td className="py-1 px-1">
                    <input type="number" className={cellInputCls} style={{ width: 68 }} value={l.largura_cm} disabled={!!isFixed}
                      onChange={e => updateLinha(i, 'largura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" className={cellInputCls} style={{ width: 68 }} value={l.altura_cm} disabled={!!isFixed}
                      onChange={e => updateLinha(i, 'altura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" step="0.5" className={cellInputCls} style={{ width: 52 }} value={l.espessura_cm}
                      onChange={e => updateLinha(i, 'espessura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" min="1" className={cellInputCls} style={{ width: 44 }} value={l.quantidade}
                      onChange={e => updateLinha(i, 'quantidade', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <MiniToggle value={l.tem_trinca} onChange={v => updateLinha(i, 'tem_trinca', v)} trueColor="red" />
                  </td>
                  <td className="py-1 px-1">
                    <MiniToggle value={l.tem_mula} onChange={v => updateLinha(i, 'tem_mula', v)} trueColor="orange" />
                  </td>
                  <td className="py-1 px-1">
                    <input className={cellInputCls} style={{ width: 120 }} value={l.observacoes}
                      onChange={e => updateLinha(i, 'observacoes', e.target.value)} placeholder="Opcional" />
                  </td>
                  <td className="py-1 px-1">
                    <button type="button" onClick={() => openLinhaFile(i)}
                      title={l.foto ? l.foto.name : 'Adicionar foto'}
                      className={`w-9 h-7 flex items-center justify-center rounded border transition-colors ${
                        l.foto
                          ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/10'
                          : 'border-zinc-200/80 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                      }`}>
                      <iconify-icon icon="solar:camera-add-linear" width="13" />
                    </button>
                  </td>
                  <td className="py-1 px-1">
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => removeLinha(i)}
                        className="w-7 h-7 flex items-center justify-center text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <iconify-icon icon="solar:close-circle-linear" width="14" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <input ref={lineFileRef} type="file" accept="image/*" className="hidden" onChange={handleLinhaFile} />

        <button type="button" onClick={addLinha}
          className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors mb-4">
          <iconify-icon icon="solar:add-square-linear" width="13" />
          Adicionar linha
        </button>

        <div className="flex gap-2">
          <button onClick={handleSaveNew} disabled={saving}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
            {saving ? 'Salvando...' : `Cadastrar ${linhas.reduce((s, l) => s + Math.max(1, Number(l.quantidade) || 1), 0)} chapa${linhas.reduce((s, l) => s + Math.max(1, Number(l.quantidade) || 1), 0) !== 1 ? 's' : ''}`}
          </button>
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
            Cancelar
          </button>
        </div>
      </Modal>

      {/* Modal EDIÇÃO — formulário único */}
      <Modal open={modalOpen && !!editItem} onClose={() => setModalOpen(false)} title="Editar Chapa">
        <div className="space-y-4">
          <div>
            <FieldLabel>Categoria *</FieldLabel>
            <select className={selectCls} value={editForm.categoria ?? ''} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value, material_id: '' }))}>
              <option value="">Selecione...</option>
              {CATEGORIAS_PEDRA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Material *</FieldLabel>
            <Combobox
              value={editForm.material_id ?? ''}
              onChange={id => setEditForm(f => ({ ...f, material_id: id }))}
              options={materiaisEdit.map(m => ({ id: m.id, label: m.nome }))}
              placeholder="Buscar material..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Largura (cm) *</FieldLabel>
              <input type="number" className={inputCls} value={editForm.largura_cm ?? ''} disabled={!!isEditFixed}
                onChange={e => setEditForm(f => ({ ...f, largura_cm: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Altura (cm) *</FieldLabel>
              <input type="number" className={inputCls} value={editForm.altura_cm ?? ''} disabled={!!isEditFixed}
                onChange={e => setEditForm(f => ({ ...f, altura_cm: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Espessura (cm)</FieldLabel>
              <input type="number" step="0.5" className={inputCls} value={editForm.espessura_cm ?? 2}
                onChange={e => setEditForm(f => ({ ...f, espessura_cm: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PillToggle label="Trinca" value={editForm.tem_trinca ?? false} onChange={v => setEditForm(f => ({ ...f, tem_trinca: v }))} />
            <PillToggle label="Mula"   value={editForm.tem_mula ?? false}   onChange={v => setEditForm(f => ({ ...f, tem_mula: v }))} />
          </div>
          <PillToggle label="Etiqueta já impressa" simVerde value={editForm.etiqueta_impressa ?? false} onChange={v => setEditForm(f => ({ ...f, etiqueta_impressa: v }))} />
          <div>
            <FieldLabel>Observações</FieldLabel>
            <textarea rows={2} className={inputCls + ' resize-none'} value={editForm.observacoes ?? ''}
              onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>Foto</FieldLabel>
            <input ref={editFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => setEditForm(f => ({ ...f, foto: e.target.files[0] ?? null }))} />
            <button type="button" onClick={() => editFileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 border border-zinc-200/80 dark:border-zinc-700 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 rounded transition-colors">
              <iconify-icon icon="solar:camera-add-linear" width="14" />
              {editForm.foto ? editForm.foto.name : (editItem?.foto_url ? 'Trocar foto' : 'Selecionar foto')}
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSaveEdit} disabled={saving}
              className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {novoMatOpen && (
        <ModalNovoMaterial
          empresaId={empresaId}
          categoriaSugerida={cab.categoria}
          onClose={() => setNovoMatOpen(false)}
          onCreated={handleMaterialCriado}
        />
      )}

      <ModalUsarPeca
        open={!!usarItem}
        onClose={() => setUsarItem(null)}
        onConfirm={handleConfirmarUso}
        projetos={projetos}
        saving={saving}
      />

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      <EtiquetasModal
        open={etiquetasOpen}
        onClose={() => setEtiquetasOpen(false)}
        items={chapas}
        tipo="chapas"
        contextItem={etiquetasContext}
        empresaId={empresaId}
        onMarcadas={load}
      />
    </div>
  );
}

function ChapasRow({ item, onEdit, onDelete, onUsar, onLightbox, onPrint }) {
  const url       = fotoUrl(item.foto_url);
  const utilizada = item.status === 'utilizada';
  const reservada = item.status === 'reservada';
  const temDefeito = item.tem_trinca || item.tem_mula;
  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg dark:rounded-none transition-all ${
      utilizada
        ? 'bg-zinc-100/60 dark:bg-zinc-900/20 border-zinc-200/80 dark:border-zinc-800/50 opacity-60'
        : 'bg-white dark:bg-zinc-900/50 border-zinc-200/80 dark:border-zinc-800'
    }`}>
      <FotoThumb url={url} alt={item.materiais?.nome}
        onExpand={url ? () => onLightbox(url) : undefined} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100 font-medium">{dim(item)}</span>
          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">esp. {item.espessura_cm}cm</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500 dark:text-zinc-400">{catLabel(item.categoria)}</span>
          {item.numero_serie && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded text-blue-600 dark:text-blue-400">
              {item.numero_serie}
            </span>
          )}
          {item.etiqueta_impressa && (
            <span className="font-mono text-[9px] px-1 py-px bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded">✓ etiq.</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {utilizada ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">Utilizada</span>
          ) : (
            <>
              {item.tem_trinca && <Badge type="trinca" />}
              {item.tem_mula   && <Badge type="mula" />}
              {!temDefeito     && <Badge type="ok" />}
            </>
          )}
          {reservada && !utilizada && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Reservada{item.projetos_reserva?.nome ? ` — ${item.projetos_reserva.nome}` : ''}
            </span>
          )}
          {utilizada && item.projetos_uso?.nome && (
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">→ {item.projetos_uso.nome}</span>
          )}
          {item.observacoes && !utilizada && (
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-xs">{item.observacoes}</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onPrint(item)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Imprimir etiqueta">
          <iconify-icon icon="solar:printer-linear" width="14" />
        </button>
        {!utilizada && (
          <button onClick={() => onUsar(item)}
            className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors" title="Registrar uso">
            <iconify-icon icon="solar:export-linear" width="14" />
          </button>
        )}
        <button onClick={() => onEdit(item)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors" title="Editar">
          <iconify-icon icon="solar:pen-linear" width="14" />
        </button>
        <button onClick={() => onDelete(item.id)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Excluir">
          <iconify-icon icon="solar:trash-bin-minimalistic-linear" width="14" />
        </button>
      </div>
    </div>
  );
}

// ── Aba Pedaceiras ────────────────────────────────────────────────────────────

function AbaPedaceiras({ empresaId, todosMateirais, projetos, onMaterialCreated }) {
  const [pedaceiras, setPedaceiras] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState('');
  const [novoMatOpen, setNovoMatOpen]   = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('disponivel');
  const [busca, setBusca]               = useState('');
  const [usarItem, setUsarItem]         = useState(null);
  const [lightboxUrl, setLightboxUrl]   = useState(null);
  const [etiquetasOpen, setEtiquetasOpen]       = useState(false);
  const [etiquetasContext, setEtiquetasContext] = useState(null);

  const [cab, setCab]     = useState({ categoria: '', material_id: '', origem_projeto_id: '' });
  const [linhas, setLinhas] = useState([emptyLinha('')]);
  const [editForm, setEditForm] = useState({});

  const lineFileRef   = useRef();
  const activeLineIdx = useRef(null);
  const editFileRef   = useRef();

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('estoque_pedaceiras')
      .select('*, materiais(id, nome), projetos_origem:origem_projeto_id(id, nome), projetos_uso:projeto_uso_id(id, nome)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (!error) setPedaceiras(data ?? []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const materiaisFiltrados = useMemo(
    () => filtrarMateriaisPorCategoria(todosMateirais, cab.categoria),
    [todosMateirais, cab.categoria]
  );
  const materiaisEdit = useMemo(
    () => filtrarMateriaisPorCategoria(todosMateirais, editForm.categoria ?? ''),
    [todosMateirais, editForm.categoria]
  );

  function handleMaterialCriado(newMat) {
    onMaterialCreated(newMat);
    setCab(c => ({ ...c, material_id: newMat.id }));
    setNovoMatOpen(false);
  }

  function openNew() {
    setEditItem(null);
    setCab({ categoria: '', material_id: '', origem_projeto_id: '' });
    setLinhas([emptyLinha('')]);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm({
      categoria:          item.categoria,
      material_id:        item.material_id,
      largura_cm:         item.largura_cm,
      altura_cm:          item.altura_cm,
      espessura_cm:       item.espessura_cm,
      tem_trinca:         item.tem_trinca,
      tem_mula:           item.tem_mula,
      etiqueta_impressa:  item.etiqueta_impressa ?? false,
      observacoes:        item.observacoes ?? '',
      origem_projeto_id:  item.origem_projeto_id ?? '',
      foto:               null,
    });
    setModalOpen(true);
  }

  function handleCabCategoria(cat) {
    setCab(c => ({ ...c, categoria: cat, material_id: '' }));
    setLinhas(ls => ls.map(() => emptyLinha(cat)));
  }

  function addLinha()         { setLinhas(ls => [...ls, emptyLinha(cab.categoria)]); }
  function removeLinha(idx)   { setLinhas(ls => ls.filter((_, i) => i !== idx)); }
  function updateLinha(idx, f, v) { setLinhas(ls => ls.map((l, i) => i === idx ? { ...l, [f]: v } : l)); }

  function openLinhaFile(idx) {
    activeLineIdx.current = idx;
    lineFileRef.current?.click();
  }

  function handleLinhaFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const idx = activeLineIdx.current;
    if (idx !== null) updateLinha(idx, 'foto', file);
    e.target.value = '';
  }

  async function handleSaveNew() {
    if (!cab.categoria || !cab.material_id) return showToast('Selecione categoria e material.');
    if (linhas.length === 0) return showToast('Adicione ao menos uma linha.');
    for (const [i, l] of linhas.entries()) {
      if (!l.largura_cm || !l.altura_cm) return showToast(`Linha ${i + 1}: preencha largura e altura.`);
    }
    setSaving(true);
    try {
      const allRows = [];
      for (const l of linhas) {
        let foto_url = null;
        if (l.foto) foto_url = await uploadFoto(l.foto, empresaId);
        const base = {
          empresa_id: empresaId, material_id: cab.material_id, categoria: cab.categoria,
          largura_cm: Number(l.largura_cm), altura_cm: Number(l.altura_cm),
          espessura_cm: Number(l.espessura_cm) || 2,
          tem_trinca: l.tem_trinca, tem_mula: l.tem_mula,
          observacoes: l.observacoes || null, foto_url,
          origem_projeto_id: cab.origem_projeto_id || null,
        };
        const qty = Math.max(1, Number(l.quantidade) || 1);
        for (let k = 0; k < qty; k++) allRows.push(base);
      }
      const { error } = await supabase.from('estoque_pedaceiras').insert(allRows);
      if (error) throw error;
      setModalOpen(false);
      showToast(`${allRows.length} pedaceira${allRows.length > 1 ? 's' : ''} cadastrada${allRows.length > 1 ? 's' : ''}.`);
      load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editForm.categoria || !editForm.material_id || !editForm.largura_cm || !editForm.altura_cm)
      return showToast('Preencha categoria, material e dimensões.');
    setSaving(true);
    try {
      let foto_url = editItem.foto_url ?? null;
      if (editForm.foto) foto_url = await uploadFoto(editForm.foto, empresaId);
      const { error } = await supabase.from('estoque_pedaceiras').update({
        material_id:       editForm.material_id,
        categoria:         editForm.categoria,
        largura_cm:        Number(editForm.largura_cm),
        altura_cm:         Number(editForm.altura_cm),
        espessura_cm:      Number(editForm.espessura_cm) || 2,
        tem_trinca:        editForm.tem_trinca,
        tem_mula:          editForm.tem_mula,
        etiqueta_impressa: editForm.etiqueta_impressa,
        observacoes:       editForm.observacoes || null,
        foto_url,
        origem_projeto_id: editForm.origem_projeto_id || null,
      }).eq('id', editItem.id);
      if (error) throw error;
      setModalOpen(false); showToast('Pedaceira atualizada.'); load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta pedaceira?')) return;
    const { error } = await supabase.from('estoque_pedaceiras').delete().eq('id', id);
    if (error) { showToast(`Erro: ${error.message}`); return; }
    showToast('Pedaceira excluída.'); load();
  }

  async function handleConfirmarUso(projetoId, obs) {
    if (!usarItem) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('estoque_pedaceiras').update({
        status: 'utilizada',
        projeto_uso_id: projetoId,
        data_uso: new Date().toISOString(),
        obs_uso: obs || null,
      }).eq('id', usarItem.id);
      if (error) throw error;
      setUsarItem(null);
      showToast('Uso registrado.');
      load();
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const pedaceirasFiltradas = useMemo(() => {
    let arr = pedaceiras;
    if (filtroStatus === 'disponivel') arr = arr.filter(p => p.status !== 'utilizada');
    else if (filtroStatus === 'utilizada') arr = arr.filter(p => p.status === 'utilizada');
    if (busca.trim()) {
      const q = busca.toLowerCase();
      arr = arr.filter(p =>
        p.materiais?.nome?.toLowerCase().includes(q) ||
        catLabel(p.categoria).toLowerCase().includes(q) ||
        (p.observacoes ?? '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [pedaceiras, filtroStatus, busca]);

  const porMaterial = useMemo(() =>
    pedaceirasFiltradas.reduce((acc, p) => {
      const nome = p.materiais?.nome ?? 'Material desconhecido';
      if (!acc[nome]) acc[nome] = [];
      acc[nome].push(p);
      return acc;
    }, {}),
    [pedaceirasFiltradas]
  );

  const isFixed     = MEDIDAS_FIXAS[cab.categoria ?? ''];
  const isEditFixed = MEDIDAS_FIXAS[editForm.categoria ?? ''];

  return (
    <div>
      {toast && <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] font-mono px-4 py-2 rounded shadow-lg">{toast}</div>}

      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            {pedaceirasFiltradas.length} pedaço{pedaceirasFiltradas.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEtiquetasContext(null); setEtiquetasOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:text-zinc-200 text-[11px] font-mono uppercase tracking-widest font-bold rounded transition-colors"
            >
              <iconify-icon icon="solar:tag-price-linear" width="14" />
              Etiquetas
            </button>
            <button onClick={openNew} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
              <iconify-icon icon="solar:add-square-linear" width="14" />
              Adicionar Pedaceiras
            </button>
          </div>
        </div>
        <div className="relative">
          <iconify-icon icon="solar:magnifer-linear" width="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" />
          <input
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white text-[12px] font-mono pl-9 pr-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 transition-colors"
            placeholder="Buscar por material, categoria, observação..."
            value={busca} onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: 'disponivel', label: 'Disponíveis' },
            { key: 'todas',      label: 'Todas' },
            { key: 'utilizada',  label: 'Utilizadas' },
          ].map(f => (
            <button key={f.key} onClick={() => setFiltroStatus(f.key)}
              className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${
                filtroStatus === f.key
                  ? 'bg-orange-500 text-white dark:bg-yellow-400 dark:text-black'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Carregando...</div>
      ) : Object.keys(porMaterial).length === 0 ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
          {busca || filtroStatus !== 'todas' ? 'Nenhuma pedaceira encontrada' : 'Nenhuma pedaceira cadastrada'}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(porMaterial).map(([nome, items]) => (
            <div key={nome}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-900 dark:text-zinc-200 font-bold">{nome}</span>
                <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{items.length} peça{items.length !== 1 ? 's' : ''}</span>
                <div className="flex-1 border-t border-zinc-200/80 dark:border-zinc-800" />
              </div>
              <div className="space-y-2">
                {items.map(p => {
                  const pUrl = fotoUrl(p.foto_url);
                  const utilizada = p.status === 'utilizada';
                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-3 border rounded-lg dark:rounded-none transition-all ${
                      utilizada
                        ? 'bg-zinc-100/60 dark:bg-zinc-900/20 border-zinc-200/80 dark:border-zinc-800/50 opacity-60'
                        : 'bg-white dark:bg-zinc-900/50 border-zinc-200/80 dark:border-zinc-800'
                    }`}>
                      <FotoThumb url={pUrl} alt={p.materiais?.nome}
                        onExpand={pUrl ? () => setLightboxUrl(pUrl) : undefined} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100 font-medium">{dim(p)}</span>
                          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">esp. {p.espessura_cm}cm</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500 dark:text-zinc-400">{catLabel(p.categoria)}</span>
                          {p.numero_serie && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded text-blue-600 dark:text-blue-400">
                              {p.numero_serie}
                            </span>
                          )}
                          {p.etiqueta_impressa && (
                            <span className="font-mono text-[9px] px-1 py-px bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded">✓ etiq.</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {utilizada ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">Utilizada</span>
                          ) : (
                            <>
                              {p.tem_trinca && <Badge type="trinca" />}
                              {p.tem_mula   && <Badge type="mula" />}
                              {!p.tem_trinca && !p.tem_mula && <Badge type="ok" />}
                            </>
                          )}
                          {utilizada && p.projetos_uso?.nome && (
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">→ {p.projetos_uso.nome}</span>
                          )}
                          {p.projetos_origem?.nome && !utilizada && (
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">Origem: {p.projetos_origem.nome}</span>
                          )}
                          {p.observacoes && !utilizada && (
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-xs">{p.observacoes}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => { setEtiquetasContext(p); setEtiquetasOpen(true); }}
                          className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Imprimir etiqueta">
                          <iconify-icon icon="solar:printer-linear" width="14" />
                        </button>
                        {!utilizada && (
                          <button onClick={() => setUsarItem(p)}
                            className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors" title="Registrar uso">
                            <iconify-icon icon="solar:export-linear" width="14" />
                          </button>
                        )}
                        <button onClick={() => openEdit(p)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors" title="Editar">
                          <iconify-icon icon="solar:pen-linear" width="14" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Excluir">
                          <iconify-icon icon="solar:trash-bin-minimalistic-linear" width="14" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal NOVO — multi-linha */}
      <Modal open={modalOpen && !editItem} onClose={() => setModalOpen(false)} title="Adicionar Pedaceiras" size="xl">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <FieldLabel>Categoria *</FieldLabel>
            <select className={selectCls} value={cab.categoria} onChange={e => handleCabCategoria(e.target.value)}>
              <option value="">Selecione...</option>
              {CATEGORIAS_PEDRA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Material *</FieldLabel>
            <Combobox
              value={cab.material_id}
              onChange={id => setCab(c => ({ ...c, material_id: id }))}
              options={materiaisFiltrados.map(m => ({ id: m.id, label: m.nome }))}
              placeholder={!cab.categoria ? 'Selecione a categoria primeiro' : (materiaisFiltrados.length ? 'Buscar material...' : 'Nenhum material nesta categoria')}
              disabled={!cab.categoria}
              extraAction={{ label: '+ Cadastrar novo material', onSelect: () => setNovoMatOpen(true) }}
            />
          </div>
        </div>
        <div className="mb-3">
          <FieldLabel>Projeto de origem (opcional)</FieldLabel>
          <Combobox
            value={cab.origem_projeto_id}
            onChange={id => setCab(c => ({ ...c, origem_projeto_id: id }))}
            options={projetos.map(p => ({ id: p.id, label: p.nome }))}
            placeholder="Nenhum"
          />
        </div>

        <div className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800">
                {['Larg. (cm)', 'Alt. (cm)', 'Esp. (cm)', 'Qtd', 'Trinca', 'Mula', 'Observações', 'Foto', ''].map(h => (
                  <th key={h} className="text-left py-1.5 px-1 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-b border-zinc-200/80 dark:border-zinc-900">
                  <td className="py-1 px-1">
                    <input type="number" className={cellInputCls} style={{ width: 68 }} value={l.largura_cm} disabled={!!isFixed}
                      onChange={e => updateLinha(i, 'largura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" className={cellInputCls} style={{ width: 68 }} value={l.altura_cm} disabled={!!isFixed}
                      onChange={e => updateLinha(i, 'altura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" step="0.5" className={cellInputCls} style={{ width: 52 }} value={l.espessura_cm}
                      onChange={e => updateLinha(i, 'espessura_cm', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <input type="number" min="1" className={cellInputCls} style={{ width: 44 }} value={l.quantidade}
                      onChange={e => updateLinha(i, 'quantidade', e.target.value)} />
                  </td>
                  <td className="py-1 px-1">
                    <MiniToggle value={l.tem_trinca} onChange={v => updateLinha(i, 'tem_trinca', v)} trueColor="red" />
                  </td>
                  <td className="py-1 px-1">
                    <MiniToggle value={l.tem_mula} onChange={v => updateLinha(i, 'tem_mula', v)} trueColor="orange" />
                  </td>
                  <td className="py-1 px-1">
                    <input className={cellInputCls} style={{ width: 120 }} value={l.observacoes}
                      onChange={e => updateLinha(i, 'observacoes', e.target.value)} placeholder="Opcional" />
                  </td>
                  <td className="py-1 px-1">
                    <button type="button" onClick={() => openLinhaFile(i)}
                      title={l.foto ? l.foto.name : 'Adicionar foto'}
                      className={`w-9 h-7 flex items-center justify-center rounded border transition-colors ${
                        l.foto
                          ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/10'
                          : 'border-zinc-200/80 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                      }`}>
                      <iconify-icon icon="solar:camera-add-linear" width="13" />
                    </button>
                  </td>
                  <td className="py-1 px-1">
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => removeLinha(i)}
                        className="w-7 h-7 flex items-center justify-center text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <iconify-icon icon="solar:close-circle-linear" width="14" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <input ref={lineFileRef} type="file" accept="image/*" className="hidden" onChange={handleLinhaFile} />

        <button type="button" onClick={addLinha}
          className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors mb-4">
          <iconify-icon icon="solar:add-square-linear" width="13" />
          Adicionar linha
        </button>

        <div className="flex gap-2">
          <button onClick={handleSaveNew} disabled={saving}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
            {saving ? 'Salvando...' : (() => { const n = linhas.reduce((s, l) => s + Math.max(1, Number(l.quantidade) || 1), 0); return `Cadastrar ${n} pedaceira${n !== 1 ? 's' : ''}`; })()}
          </button>
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
            Cancelar
          </button>
        </div>
      </Modal>

      {/* Modal EDIÇÃO */}
      <Modal open={modalOpen && !!editItem} onClose={() => setModalOpen(false)} title="Editar Pedaceira">
        <div className="space-y-4">
          <div>
            <FieldLabel>Categoria *</FieldLabel>
            <select className={selectCls} value={editForm.categoria ?? ''} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value, material_id: '' }))}>
              <option value="">Selecione...</option>
              {CATEGORIAS_PEDRA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Material *</FieldLabel>
            <Combobox
              value={editForm.material_id ?? ''}
              onChange={id => setEditForm(f => ({ ...f, material_id: id }))}
              options={materiaisEdit.map(m => ({ id: m.id, label: m.nome }))}
              placeholder="Buscar material..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Largura (cm) *</FieldLabel>
              <input type="number" className={inputCls} value={editForm.largura_cm ?? ''} disabled={!!isEditFixed}
                onChange={e => setEditForm(f => ({ ...f, largura_cm: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Altura (cm) *</FieldLabel>
              <input type="number" className={inputCls} value={editForm.altura_cm ?? ''} disabled={!!isEditFixed}
                onChange={e => setEditForm(f => ({ ...f, altura_cm: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Espessura (cm)</FieldLabel>
              <input type="number" step="0.5" className={inputCls} value={editForm.espessura_cm ?? 2}
                onChange={e => setEditForm(f => ({ ...f, espessura_cm: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PillToggle label="Trinca" value={editForm.tem_trinca ?? false} onChange={v => setEditForm(f => ({ ...f, tem_trinca: v }))} />
            <PillToggle label="Mula"   value={editForm.tem_mula ?? false}   onChange={v => setEditForm(f => ({ ...f, tem_mula: v }))} />
          </div>
          <PillToggle label="Etiqueta já impressa" simVerde value={editForm.etiqueta_impressa ?? false} onChange={v => setEditForm(f => ({ ...f, etiqueta_impressa: v }))} />
          <div>
            <FieldLabel>Projeto de origem (opcional)</FieldLabel>
            <select className={selectCls} value={editForm.origem_projeto_id ?? ''} onChange={e => setEditForm(f => ({ ...f, origem_projeto_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Observações</FieldLabel>
            <textarea rows={2} className={inputCls + ' resize-none'} value={editForm.observacoes ?? ''}
              onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>Foto</FieldLabel>
            <input ref={editFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => setEditForm(f => ({ ...f, foto: e.target.files[0] ?? null }))} />
            <button type="button" onClick={() => editFileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 border border-zinc-200/80 dark:border-zinc-700 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 rounded transition-colors">
              <iconify-icon icon="solar:camera-add-linear" width="14" />
              {editForm.foto ? editForm.foto.name : (editItem?.foto_url ? 'Trocar foto' : 'Selecionar foto')}
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSaveEdit} disabled={saving}
              className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      {novoMatOpen && (
        <ModalNovoMaterial
          empresaId={empresaId}
          categoriaSugerida={cab.categoria}
          onClose={() => setNovoMatOpen(false)}
          onCreated={handleMaterialCriado}
        />
      )}

      <ModalUsarPeca
        open={!!usarItem}
        onClose={() => setUsarItem(null)}
        onConfirm={handleConfirmarUso}
        projetos={projetos}
        saving={saving}
      />

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      <EtiquetasModal
        open={etiquetasOpen}
        onClose={() => setEtiquetasOpen(false)}
        items={pedaceiras}
        tipo="pedaceiras"
        contextItem={etiquetasContext}
        empresaId={empresaId}
        onMarcadas={load}
      />
    </div>
  );
}

// ── Aba Produtos Avulsos ──────────────────────────────────────────────────────

function AbaProdutosAvulsos({ empresaId }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');

  const emptyForm = { nome: '', categoria: '', quantidade: 0, unidade: '', observacoes: '', foto: null };
  const [form, setForm] = useState(emptyForm);
  const fileRef = useRef();

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('estoque_produtos_avulsos')
      .select('*').eq('empresa_id', empresaId).order('nome');
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditItem(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = item => {
    setEditItem(item);
    setForm({ nome: item.nome, categoria: item.categoria ?? '', quantidade: item.quantidade, unidade: item.unidade ?? '', observacoes: item.observacoes ?? '', foto: null });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) return showToast('Informe o nome do produto.');
    setSaving(true);
    try {
      let foto_url = editItem?.foto_url ?? null;
      if (form.foto) foto_url = await uploadFoto(form.foto, empresaId);
      const payload = {
        empresa_id: empresaId, nome: form.nome.trim(),
        categoria: form.categoria || null, quantidade: Number(form.quantidade) || 0,
        unidade: form.unidade || null, observacoes: form.observacoes || null, foto_url,
      };
      if (editItem) {
        const { error } = await supabase.from('estoque_produtos_avulsos').update(payload).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('estoque_produtos_avulsos').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false); showToast(editItem ? 'Produto atualizado.' : 'Produto cadastrado.'); load();
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Excluir este produto?')) return;
    const { error } = await supabase.from('estoque_produtos_avulsos').delete().eq('id', id);
    if (error) { showToast(`Erro: ${error.message}`); return; }
    showToast('Produto excluído.'); load();
  };

  return (
    <div>
      {toast && <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] font-mono px-4 py-2 rounded shadow-lg">{toast}</div>}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">{items.length} produto{items.length !== 1 ? 's' : ''}</span>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
          <iconify-icon icon="solar:add-square-linear" width="14" />
          Adicionar Produto
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Nenhum produto cadastrado</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800">
                {['Foto', 'Nome', 'Categoria', 'Qtd', 'Unidade', 'Observações', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-zinc-200/80 dark:border-zinc-900 hover:bg-white dark:hover:bg-zinc-900/40 transition-colors">
                  <td className="py-2 px-3"><FotoThumb url={fotoUrl(item.foto_url)} alt={item.nome} /></td>
                  <td className="py-2 px-3 font-medium text-zinc-900 dark:text-zinc-100">{item.nome}</td>
                  <td className="py-2 px-3 text-zinc-500 dark:text-zinc-500">{item.categoria ?? '—'}</td>
                  <td className="py-2 px-3 font-mono text-zinc-900 dark:text-zinc-100">{item.quantidade}</td>
                  <td className="py-2 px-3 text-zinc-500 dark:text-zinc-500">{item.unidade ?? '—'}</td>
                  <td className="py-2 px-3 text-zinc-400 dark:text-zinc-600 max-w-xs truncate">{item.observacoes ?? '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"><iconify-icon icon="solar:pen-linear" width="14" /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"><iconify-icon icon="solar:trash-bin-minimalistic-linear" width="14" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Editar Produto' : 'Adicionar Produto'}>
        <div className="space-y-4">
          <div><FieldLabel>Nome *</FieldLabel><input className={inputCls} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Categoria</FieldLabel>
              <select className={selectCls} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Selecione...</option>
                {CATS_PRODUTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><FieldLabel>Unidade</FieldLabel><input className={inputCls} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} placeholder="ex: peça, caixa" /></div>
          </div>
          <div><FieldLabel>Quantidade</FieldLabel><input type="number" min="0" className={inputCls} value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
          <div><FieldLabel>Observações</FieldLabel><textarea rows={2} className={inputCls + ' resize-none'} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
          <div>
            <FieldLabel>Foto</FieldLabel>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => setForm(f => ({ ...f, foto: e.target.files[0] ?? null }))} />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 border border-zinc-200/80 dark:border-zinc-700 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 rounded transition-colors">
              <iconify-icon icon="solar:camera-add-linear" width="14" />
              {form.foto ? form.foto.name : (editItem?.foto_url ? 'Trocar foto' : 'Selecionar foto')}
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">{saving ? 'Salvando...' : editItem ? 'Salvar' : 'Cadastrar'}</button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Aba Insumos ───────────────────────────────────────────────────────────────

function AbaInsumos({ empresaId }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');

  const emptyForm = { nome: '', categoria: '', quantidade: 0, unidade: '', observacoes: '' };
  const [form, setForm] = useState(emptyForm);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('estoque_insumos')
      .select('*').eq('empresa_id', empresaId).order('nome');
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditItem(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = item => {
    setEditItem(item);
    setForm({ nome: item.nome, categoria: item.categoria ?? '', quantidade: item.quantidade, unidade: item.unidade ?? '', observacoes: item.observacoes ?? '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) return showToast('Informe o nome do insumo.');
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaId, nome: form.nome.trim(),
        categoria: form.categoria || null, quantidade: Number(form.quantidade) || 0,
        unidade: form.unidade || null, observacoes: form.observacoes || null,
      };
      if (editItem) {
        const { error } = await supabase.from('estoque_insumos').update(payload).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('estoque_insumos').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false); showToast(editItem ? 'Insumo atualizado.' : 'Insumo cadastrado.'); load();
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Excluir este insumo?')) return;
    const { error } = await supabase.from('estoque_insumos').delete().eq('id', id);
    if (error) { showToast(`Erro: ${error.message}`); return; }
    showToast('Insumo excluído.'); load();
  };

  return (
    <div>
      {toast && <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 dark:bg-zinc-800 text-white text-[11px] font-mono px-4 py-2 rounded shadow-lg">{toast}</div>}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">{items.length} insumo{items.length !== 1 ? 's' : ''}</span>
        <button onClick={openNew} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black text-[11px] font-mono uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">
          <iconify-icon icon="solar:add-square-linear" width="14" />
          Adicionar Insumo
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 font-mono text-[11px] text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Nenhum insumo cadastrado</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800">
                {['Nome', 'Categoria', 'Quantidade', 'Unidade', 'Observações', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-zinc-200/80 dark:border-zinc-900 hover:bg-white dark:hover:bg-zinc-900/40 transition-colors">
                  <td className="py-2 px-3 font-medium text-zinc-900 dark:text-zinc-100">{item.nome}</td>
                  <td className="py-2 px-3 text-zinc-500 dark:text-zinc-500">{item.categoria ?? '—'}</td>
                  <td className="py-2 px-3 font-mono text-zinc-900 dark:text-zinc-100">{item.quantidade}</td>
                  <td className="py-2 px-3 text-zinc-500 dark:text-zinc-500">{item.unidade ?? '—'}</td>
                  <td className="py-2 px-3 text-zinc-400 dark:text-zinc-600 max-w-xs truncate">{item.observacoes ?? '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"><iconify-icon icon="solar:pen-linear" width="14" /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"><iconify-icon icon="solar:trash-bin-minimalistic-linear" width="14" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Editar Insumo' : 'Adicionar Insumo'}>
        <div className="space-y-4">
          <div><FieldLabel>Nome *</FieldLabel><input className={inputCls} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Categoria</FieldLabel>
              <select className={selectCls} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Selecione...</option>
                {CATS_INSUMO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><FieldLabel>Unidade</FieldLabel><input className={inputCls} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} placeholder="ex: litro, rolo, kg" /></div>
          </div>
          <div><FieldLabel>Quantidade</FieldLabel><input type="number" min="0" step="0.001" className={inputCls} value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
          <div><FieldLabel>Observações</FieldLabel><textarea rows={2} className={inputCls + ' resize-none'} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 disabled:opacity-40 text-white dark:text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded-xl dark:rounded-none transition-colors">{saving ? 'Salvando...' : editItem ? 'Salvar' : 'Cadastrar'}</button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-zinc-200/80 dark:border-zinc-700 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 rounded transition-colors">Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'chapas',     label: 'Chapas' },
  { key: 'pedaceiras', label: 'Pedaceiras' },
  { key: 'produtos',   label: 'Produtos Avulsos' },
  { key: 'insumos',    label: 'Insumos' },
];

export default function Estoque() {
  const { profile, profileLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]                 = useState('chapas');
  const [todosMateirais, setTodosMateirais] = useState([]);
  const [projetos, setProjetos]       = useState([]);

  useEffect(() => {
    if (!profileLoading && profile?.perfil !== 'admin') navigate('/dashboard', { replace: true });
  }, [profile, profileLoading, navigate]);

  useEffect(() => {
    if (!profile?.empresa_id) return;

    // Carrega materiais com categoria para filtragem nos modais
    supabase.from('materiais')
      .select('id, nome, categoria')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setTodosMateirais(data ?? []));

    supabase.from('projetos')
      .select('id, nome')
      .eq('empresa_id', profile.empresa_id)
      .order('nome')
      .then(({ data }) => setProjetos(data ?? []));
  }, [profile?.empresa_id]);

  function handleMaterialCriado(newMat) {
    setTodosMateirais(prev => [...prev, newMat].sort((a, b) => a.nome.localeCompare(b.nome)));
  }

  if (profileLoading || !profile) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <iconify-icon icon="solar:box-linear" width="20" class="text-orange-500 dark:text-yellow-400" />
            <h1 className="font-mono text-[14px] uppercase tracking-widest font-bold text-zinc-900 dark:text-white">Estoque</h1>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            Chapas · Pedaceiras · Produtos · Insumos
          </p>
        </div>

        <div className="border-b border-zinc-200/80 dark:border-zinc-800 mb-6 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </TabButton>
          ))}
        </div>

        {tab === 'chapas'     && <AbaChapas          empresaId={profile.empresa_id} todosMateirais={todosMateirais} projetos={projetos} onMaterialCreated={handleMaterialCriado} />}
        {tab === 'pedaceiras' && <AbaPedaceiras       empresaId={profile.empresa_id} todosMateirais={todosMateirais} projetos={projetos} onMaterialCreated={handleMaterialCriado} />}
        {tab === 'produtos'   && <AbaProdutosAvulsos  empresaId={profile.empresa_id} />}
        {tab === 'insumos'    && <AbaInsumos          empresaId={profile.empresa_id} />}
      </div>
    </div>
  );
}
