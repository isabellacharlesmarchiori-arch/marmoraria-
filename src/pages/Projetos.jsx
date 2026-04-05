import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const STATUS_CONFIG = {
  todos:      { label: 'Todos',      color: 'text-zinc-400',   border: 'border-zinc-700',     bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
  orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',     bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
  aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30', bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
  produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30',bg: 'bg-violet-400/5',  dot: 'bg-violet-400' },
  entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',  bg: 'bg-blue-400/5',    dot: 'bg-blue-400'   },
  perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',   bg: 'bg-red-400/5',     dot: 'bg-red-400'    },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
  return (
    <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max shrink-0`}>
      <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
      {cfg.label}
    </span>
  );
}

export default function Projetos() {
  const navigate = useNavigate();
  const { profile, session } = useAuth();

  const [projetos, setProjetos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loadingProjetos, setLoadingProjetos] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modalAberto, setModalAberto] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoClienteId, setNovoClienteId] = useState('');
  const [editingProjetoId, setEditingProjetoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [erroModal, setErroModal] = useState('');
  const observerRef = useRef(null);

  // Fetch projetos e clientes
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!session || !empresaId) return;

    let isMounted = true;
    let fallbackTimeout;

    async function fetchData(attemptOrEvent) {
      if (!isMounted) return;
      const attempt = typeof attemptOrEvent === 'number' ? attemptOrEvent : 1;
      try {
        setLoadingProjetos(true);
        setFetchError(false);

        const { data: dataProjetos, error: errProjetos } = await supabase
          .from('projetos')
          .select('id, nome, status, created_at, clientes(id, nome)')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false });

        const { data: dataClientes, error: errClientes } = await supabase
          .from('clientes')
          .select('id, nome')
          .eq('empresa_id', empresaId)
          .order('nome');

        if (dataProjetos) {
          setProjetos(dataProjetos.map(p => {
             const cli = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
             return {
              id: p.id,
              nome: p.nome,
              status: p.status,
              cliente: cli?.nome ?? '—',
              cliente_id: cli?.id ?? null,
              data: p.created_at
                ? new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—',
            };
          }));
        }
        if (dataClientes) setClientes(dataClientes);
      } catch (err) {
        console.error('[fetchData] Erro:', err);
        setFetchError(true);
      } finally {
        if (isMounted) setLoadingProjetos(false);
      }
    }

    fallbackTimeout = setTimeout(fetchData, 300);
    return () => { isMounted = false; clearTimeout(fallbackTimeout); };
  }, [session, profile?.empresa_id]);

  // Observer para animações
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { threshold: 0.05 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal:not(.sys-active)').forEach(el => observer.observe(el));
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [projetos, loadingProjetos]);

  const projetosFiltrados = projetos.filter(p => {
    const matchBusca = busca === '' ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.cliente.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  // ── Handlers Tríade ────────────────────────────────────────────────────────

  const handleCloseModal = () => {
    setModalAberto(false);
    setErroModal('');
    setEditingProjetoId(null);
    setNovoNome('');
    setNovoClienteId('');
  };

  const handleEditProjeto = (e, proj) => {
    e.stopPropagation();
    setNovoNome(proj?.nome || '');
    setNovoClienteId(proj?.cliente_id || '');
    setEditingProjetoId(proj?.id);
    setModalAberto(true);
  };

  const handleDuplicateProjeto = (e, proj) => {
    e.stopPropagation();
    if (!proj) return;
    
    // Deep Clone para segurança total
    const clone = JSON.parse(JSON.stringify(proj));
    clone.id = crypto.randomUUID();
    clone.nome = `${proj.nome} (Cópia)`;

    setProjetos(prev => {
      const idx = prev.findIndex(p => p.id === proj.id);
      const novaLista = [...prev];
      if (idx !== -1) novaLista.splice(idx + 1, 0, clone);
      else novaLista.push(clone);
      return novaLista;
    });

    // Fire and forget opcional: salvar no banco se desejar
    console.log('Duplicado localmente:', clone.id);
  };

  const handleDeleteProjeto = (e, id) => {
    e.stopPropagation();
    if (!id) return;
    if (window.confirm('Tem certeza que deseja excluir este projeto?')) {
      setProjetos(prev => prev.filter(p => p.id !== id));
      // supabase.from('projetos').delete().eq('id', id)...
    }
  };

  async function handleSaveProjeto(e) {
    e.preventDefault();
    if (!novoNome.trim() || !novoClienteId) return setErroModal('Preencha os campos obrigatórios.');
    
    setSalvando(true);
    try {
      const payload = {
        nome: novoNome.trim(),
        cliente_id: novoClienteId,
        empresa_id: profile.empresa_id,
        vendedor_id: session.user.id,
      };

      if (editingProjetoId) {
        const { error } = await supabase.from('projetos').update(payload).eq('id', editingProjetoId);
        if (error) throw error;
        
        const cliNome = clientes.find(c => c.id === novoClienteId)?.nome || '—';
        setProjetos(prev => prev.map(p => p.id === editingProjetoId ? { 
           ...p, ...payload, cliente: cliNome 
        } : p));
      } else {
        const { data, error } = await supabase.from('projetos').insert({ ...payload, status: 'orcado' }).select().single();
        if (error) throw error;
        
        // Criar ambiente inicial (legado do sistema)
        await supabase.from('ambientes').insert({ 
           projeto_id: data.id, 
           empresa_id: profile.empresa_id, 
           nome: 'Ambiente 1' 
        });

        navigate(`/projetos/${data.id}`);
      }
      handleCloseModal();
    } catch (err) {
      setErroModal(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen font-sans">
      <div className="sys-reveal px-6 pt-6 pb-4 border-b border-zinc-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">04 // Projetos</div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Projetos</h1>
        </div>
        <button
          onClick={() => { setEditingProjetoId(null); setModalAberto(true); }}
          className="flex items-center gap-2 bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 hover:bg-yellow-300 transition-colors"
        >
          <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
          Novo projeto
        </button>
      </div>

      <div className="sys-reveal sys-delay-100 px-6 py-3 border-b border-zinc-800 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex items-center flex-1 max-w-xs">
          <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-600 text-sm pointer-events-none"></iconify-icon>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar projeto ou cliente..."
            className="w-full bg-zinc-950 border border-zinc-800 text-white text-[12px] font-mono pl-8 pr-3 py-2 outline-none focus:border-yellow-400 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFiltroStatus(key)}
              className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border transition-colors ${
                filtroStatus === key ? `${cfg.border} ${cfg.color} ${cfg.bg}` : 'border-zinc-800 text-zinc-600'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        {loadingProjetos ? (
          <div className="py-20 text-center flex flex-col items-center gap-2">
            <iconify-icon icon="solar:spinner-linear" width="24" className="animate-spin text-zinc-700"></iconify-icon>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Sincronizando...</span>
          </div>
        ) : (
          <div className="bg-[#0a0a0a] border border-zinc-800 sys-reveal">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800 bg-black/40">
              <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto / Cliente</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Ações</span>
            </div>

            {projetosFiltrados.map((p, i) => (
              <div
                key={p.id}
                onClick={() => navigate(`/projetos/${p.id}`)}
                className={`grid grid-cols-12 items-center px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] group transition-colors ${
                  i < projetosFiltrados.length - 1 ? 'border-b border-zinc-900/50' : ''
                }`}
              >
                <div className="col-span-5 flex flex-col min-w-0 pr-4">
                  <span className="text-sm text-white font-medium truncate group-hover:text-yellow-400 transition-colors">{p.nome}</span>
                  <span className="font-mono text-[9px] text-zinc-600 mt-0.5 truncate uppercase tracking-tighter">{p.cliente}</span>
                </div>
                <div className="col-span-2">
                  <StatusPill status={p.status} />
                </div>
                <div className="col-span-2">
                  <span className="font-mono text-[10px] text-zinc-600">{p.data}</span>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1.5 sm:gap-3">
                  {/* Tríade de Ações */}
                  <button 
                    onClick={(e) => handleEditProjeto(e, p)}
                    className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-600 hover:border-zinc-400 hover:text-white transition-colors"
                  >
                    <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                  </button>
                  <button 
                    onClick={(e) => handleDuplicateProjeto(e, p)}
                    className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-600 hover:border-yellow-400/50 hover:text-yellow-400 transition-colors"
                  >
                    <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                  </button>
                  <button 
                    onClick={(e) => handleDeleteProjeto(e, p.id)}
                    className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-600 hover:border-red-400/50 hover:text-red-400 transition-colors"
                  >
                    <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                  </button>
                  <span className="w-px h-4 bg-zinc-800 mx-1"></span>
                  <iconify-icon icon="solar:arrow-right-linear" width="14" className="text-zinc-800 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Novo/Editar */}
      {modalAberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-6 uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-yellow-400"></span>
              {editingProjetoId ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>
            <form onSubmit={handleSaveProjeto} className="flex flex-col gap-5">
              <div>
                <label className="text-[9px] font-mono uppercase text-zinc-500 mb-1.5 block">Nome do Projeto</label>
                <input
                  required
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-zinc-500 mb-1.5 block">Cliente</label>
                <select
                  required
                  value={novoClienteId}
                  onChange={e => setNovoClienteId(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-400"
                >
                  <option value="">Selecionar...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {erroModal && <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest">{erroModal}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleCloseModal} className="flex-1 font-mono text-[10px] uppercase border border-zinc-800 py-3 hover:text-white">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300 disabled:opacity-50">
                  {salvando ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
