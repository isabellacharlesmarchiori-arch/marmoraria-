import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const STATUS_CONFIG = {
  todos:      { label: 'Todos',      color: 'text-gray-600 dark:text-zinc-400',     border: 'border-gray-300 dark:border-zinc-700',        bg: 'bg-gray-100 dark:bg-zinc-900',       dot: 'bg-gray-400 dark:bg-zinc-500'    },
  orcado:     { label: 'Orçado',     color: 'text-gray-600 dark:text-zinc-400',     border: 'border-gray-300 dark:border-zinc-700',        bg: 'bg-gray-100 dark:bg-zinc-900',       dot: 'bg-gray-400 dark:bg-zinc-500'    },
  aprovado:   { label: 'Aprovado',   color: 'text-green-700 dark:text-green-400',   border: 'border-green-400/40 dark:border-green-500/30', bg: 'bg-green-50 dark:bg-green-400/5',    dot: 'bg-green-600 dark:bg-green-400'  },
  produzindo: { label: 'Produzindo', color: 'text-violet-700 dark:text-violet-400', border: 'border-violet-400/40 dark:border-violet-500/30', bg: 'bg-violet-50 dark:bg-violet-400/5', dot: 'bg-violet-600 dark:bg-violet-400' },
  entregue:   { label: 'Entregue',   color: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-400/40 dark:border-blue-500/30',   bg: 'bg-blue-50 dark:bg-blue-400/5',      dot: 'bg-blue-600 dark:bg-blue-400'   },
  perdido:    { label: 'Perdido',    color: 'text-red-700 dark:text-red-400',       border: 'border-red-400/40 dark:border-red-500/30',     bg: 'bg-red-50 dark:bg-red-400/5',        dot: 'bg-red-600 dark:bg-red-400'     },
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
  const isAdmin = profile?.perfil === 'admin' || profile?.role === 'admin';

  const [projetos, setProjetos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const PAGE_SIZE = 20;
  const [loadingProjetos, setLoadingProjetos] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [busca, setBusca] = useState('');
  const [buscaInput, setBuscaInput] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroResponsabilidade, setFiltroResponsabilidade] = useState('todos');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [arquitetos, setArquitetos] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoClienteId, setNovoClienteId] = useState('');
  const [novoArquitetoId, setNovoArquitetoId] = useState('');
  const [novoRtPadrao, setNovoRtPadrao] = useState('');
  const [editingProjetoId, setEditingProjetoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [erroModal, setErroModal] = useState('');
  const [projetoToDelete, setProjetoToDelete] = useState(null);
  const debounceRef = useRef(null);
  const refreshingRef = useRef(false);

  // ── Debounce da busca (300ms) ──────────────────────────────────────────────
  const handleBuscaChange = useCallback((e) => {
    const val = e.target.value;
    setBuscaInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBusca(val), 300);
  }, []);

  // ── Hidratação do cache (localStorage) ───────────────────────────────────
  useLayoutEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;
    try {
      const cached = localStorage.getItem(`projetos_cache_${empresaId}`);
      if (cached) {
        const { projetos: p, clientes: c, arquitetos: a, vendedores: v } = JSON.parse(cached);
        if (p?.length) { setProjetos(p); setLoadingProjetos(false); }
        if (c?.length) setClientes(c);
        if (a?.length) setArquitetos(a);
        if (v?.length) setVendedores(v);
      }
    } catch { /* cache corrompido — ignora */ }
  }, [profile?.empresa_id]);

  // Fetch projetos e clientes
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    console.log('[Projetos] useEffect — session?.user?.id:', session?.user?.id, '| empresaId:', empresaId);
    if (!session || !empresaId) { setLoadingProjetos(false); return; }

    let isMounted = true;
    let fallbackTimeout;

    async function fetchData() {
      if (!isMounted) return;
      try {
        if (!refreshingRef.current) setLoadingProjetos(true);
        refreshingRef.current = true;
        setFetchError(false);

        let projetosQuery = supabase
          .from('projetos')
          .select('id, nome, status, created_at, vendedor_id, arquiteto_id, rt_padrao_percentual, clientes(id, nome), arquitetos(id, nome)')
          .eq('empresa_id', empresaId)
          .neq('status', 'perdido')
          .order('created_at', { ascending: false });

        if (!isAdmin) projetosQuery = projetosQuery.eq('vendedor_id', session.user.id);

        const queries = [
          projetosQuery,
          supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).order('nome'),
          supabase.from('arquitetos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        ];
        if (isAdmin) {
          queries.push(
            supabase.from('usuarios').select('id, nome').eq('empresa_id', empresaId).in('perfil', ['vendedor', 'admin'])
          );
        }

        const results = await Promise.allSettled(queries);
        if (!isMounted) return;

        const dataProjetos  = results[0].status === 'fulfilled' ? results[0].value.data : null;
        const dataClientes  = results[1].status === 'fulfilled' ? results[1].value.data : null;
        const dataArquitetos= results[2].status === 'fulfilled' ? results[2].value.data : null;
        const dataVendedores= isAdmin && results[3]?.status === 'fulfilled' ? results[3].value.data : null;

        const projetosNormalizados = dataProjetos ? dataProjetos.map(p => {
          const cli = Array.isArray(p.clientes)  ? p.clientes[0]  : p.clientes;
          const arq = Array.isArray(p.arquitetos) ? p.arquitetos[0] : p.arquitetos;
          return {
            id:                   p.id,
            nome:                 p.nome,
            status:               p.status,
            cliente:              cli?.nome ?? '—',
            cliente_id:           cli?.id  ?? null,
            arquiteto_id:         p.arquiteto_id ?? null,
            arquiteto_nome:       arq?.nome ?? null,
            rt_padrao_percentual: p.rt_padrao_percentual ?? 0,
            vendedor_id:          p.vendedor_id,
            data: p.created_at
              ? new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—',
          };
        }) : null;

        console.log('[Projetos] dados chegaram — projetos:', projetosNormalizados?.length ?? 0,
                    '| clientes:', dataClientes?.length ?? 0);

        if (projetosNormalizados) setProjetos(projetosNormalizados);
        if (dataClientes)         setClientes(dataClientes);
        if (dataArquitetos)       setArquitetos(dataArquitetos);
        if (dataVendedores)       setVendedores(dataVendedores);

        try {
          localStorage.setItem(`projetos_cache_${empresaId}`, JSON.stringify({
            projetos:   projetosNormalizados ?? [],
            clientes:   dataClientes    ?? [],
            arquitetos: dataArquitetos  ?? [],
            vendedores: dataVendedores  ?? [],
          }));
        } catch { /* quota excedida — ignora */ }

      } catch (err) {
        console.error('[fetchData] Erro:', err);
        setFetchError(true);
      } finally {
        if (isMounted) { setLoadingProjetos(false); refreshingRef.current = false; }
      }
    }

    fallbackTimeout = setTimeout(fetchData, 150);
    return () => { isMounted = false; clearTimeout(fallbackTimeout); };
  }, [session?.user?.id, profile?.empresa_id]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { threshold: 0.05 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal:not(.sys-active)').forEach(el => observer.observe(el));
    }, 100);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, [loadingProjetos]);

  useEffect(() => {
    setCurrentPage(0);
  }, [busca, filtroStatus, filtroResponsabilidade]);

  const projetosFiltrados = useMemo(() => projetos.filter(p => {
    const q = busca.toLowerCase();
    const matchBusca = !q ||
      p.nome.toLowerCase().includes(q) ||
      p.cliente.toLowerCase().includes(q);
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;

    let matchResponsabilidade = true;
    if (isAdmin) {
      if (filtroResponsabilidade === 'meus') matchResponsabilidade = p.vendedor_id === session?.user?.id;
      else if (filtroResponsabilidade !== 'todos') matchResponsabilidade = p.vendedor_id === filtroResponsabilidade;
    } else {
      matchResponsabilidade = p.vendedor_id === session?.user?.id;
    }

    return matchBusca && matchStatus && matchResponsabilidade;
  }), [projetos, busca, filtroStatus, filtroResponsabilidade, session?.user?.id, isAdmin]);

  const totalPages = Math.ceil(projetosFiltrados.length / PAGE_SIZE) || 1;
  const projetosPaginados = projetosFiltrados.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCloseModal = () => {
    setModalAberto(false);
    setErroModal('');
    setEditingProjetoId(null);
    setNovoNome('');
    setNovoClienteId('');
    setNovoArquitetoId('');
    setNovoRtPadrao('');
  };

  const handleEditProjeto = (e, proj) => {
    e.stopPropagation();
    setNovoNome(proj?.nome || '');
    setNovoClienteId(proj?.cliente_id || '');
    setNovoArquitetoId(proj?.arquiteto_id || '');
    setNovoRtPadrao(proj?.rt_padrao_percentual != null ? String(proj.rt_padrao_percentual) : '');
    setEditingProjetoId(proj?.id);
    setModalAberto(true);
  };

  const handleDuplicateProjeto = async (e, proj) => {
    e.stopPropagation();
    if (!proj) return;
    try {
      const payload = {
        nome: `${proj.nome} (Cópia)`,
        cliente_id: proj.cliente_id,
        empresa_id: profile.empresa_id,
        vendedor_id: session.user.id,
        status: proj.status,
      };
      const { data, error } = await supabase.from('projetos').insert(payload).select('id, nome, status, created_at, vendedor_id, clientes(id, nome)').single();
      if (error) throw error;
      const cli = Array.isArray(data.clientes) ? data.clientes[0] : data.clientes;
      const novoProj = {
          id: data.id,
          nome: data.nome,
          status: data.status,
          cliente: cli?.nome ?? '—',
          cliente_id: cli?.id ?? null,
          vendedor_id: data.vendedor_id,
          data: data.created_at ? new Date(data.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      };
      setProjetos(prev => [novoProj, ...prev]);
    } catch (err) {
      alert("Erro ao duplicar projeto: " + err.message);
    }
  };

  const confirmDeleteProjeto = async () => {
    if (!projetoToDelete) return;
    const idToDelete = projetoToDelete;
    setProjetos(prev => prev.filter(p => p.id !== idToDelete));
    setProjetoToDelete(null);
    const { error } = await supabase.from('projetos').delete().eq('id', idToDelete);
    if (error) {
      console.error('[delete] Erro:', error.message);
      alert('Erro ao excluir: ' + error.message);
    }
  };

  const handleDeleteProjeto = (e, id) => {
    e.stopPropagation();
    if (!id) return;
    setProjetoToDelete(id);
  };

  async function handleSaveProjeto(e) {
    e.preventDefault();
    if (!novoNome.trim() || !novoClienteId) return setErroModal('Preencha os campos obrigatórios.');
    setSalvando(true);
    try {
      const rtPadrao = parseFloat(String(novoRtPadrao).replace(',', '.')) || 0;
      const payload = {
        nome:                 novoNome.trim(),
        cliente_id:           novoClienteId,
        arquiteto_id:         novoArquitetoId || null,
        rt_padrao_percentual: rtPadrao > 0 ? rtPadrao : 0,
        empresa_id:           profile.empresa_id,
        vendedor_id:          session.user.id,
      };
      if (editingProjetoId) {
        const { error } = await supabase.from('projetos').update(payload).eq('id', editingProjetoId);
        if (error) throw error;
        const cliNome = clientes.find(c => c.id === novoClienteId)?.nome || '—';
        setProjetos(prev => prev.map(p => p.id === editingProjetoId ? { ...p, ...payload, cliente: cliNome } : p));
      } else {
        const { data, error } = await supabase.from('projetos').insert({ ...payload, status: 'orcado' }).select().single();
        if (error) throw error;
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
    <div className="page-enter bg-gray-100 dark:bg-[#050505] text-gray-700 dark:text-[#a1a1aa] min-h-screen font-sans">

      {/* Cabeçalho */}
      <div className="sys-reveal px-6 pt-6 pb-4 border-b border-gray-300 dark:border-zinc-800">
        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-1 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-0.5">04 // Projetos</div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Projetos</h1>
      </div>

      {/* Toolbar Principal */}
      <div className="sys-reveal sys-delay-100 px-6 py-4 border-b border-gray-300 dark:border-zinc-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-50">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex items-center w-full max-w-xs">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-400 dark:text-zinc-600 text-sm pointer-events-none"></iconify-icon>
            <input
              value={buscaInput}
              onChange={handleBuscaChange}
              placeholder="Buscar projeto ou cliente..."
              className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400 transition-colors placeholder:text-gray-400 dark:placeholder:text-zinc-600"
            />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 border-l border-gray-300 dark:border-zinc-800 pl-4">
              <span className="font-mono text-[9px] uppercase text-gray-500 dark:text-zinc-500">Exibir:</span>
              <select
                value={filtroResponsabilidade}
                onChange={(e) => setFiltroResponsabilidade(e.target.value)}
                className="bg-gray-50 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[10px] font-mono px-3 py-2 outline-none focus:border-yellow-500 dark:focus:border-yellow-400 uppercase tracking-widest cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
              >
                <option value="todos">Todos os Projetos</option>
                <option value="meus">Meus Projetos</option>
                {loadingProjetos ? (
                  <option value="" disabled>Carregando equipe...</option>
                ) : (
                  vendedores.map(v => (
                    <option key={v.id} value={v.id}>Projetos de: {v.nome}</option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={() => { setEditingProjetoId(null); setModalAberto(true); }}
          className="shrink-0 flex items-center gap-2 bg-yellow-400 text-black font-mono text-[11px] font-bold uppercase tracking-widest px-5 py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:bg-yellow-300 transition-all"
        >
          <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
          Novo projeto
        </button>
      </div>

      {/* Barra de Status */}
      <div className="sys-reveal sys-delay-100 px-6 py-2.5 border-b border-gray-300 dark:border-zinc-800 bg-gray-100 dark:bg-[#0a0a0a]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[9px] uppercase text-gray-500 dark:text-zinc-600 mr-2">Filtro de Status:</span>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFiltroStatus(key)}
              className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 border transition-colors ${
                filtroStatus === key
                  ? `${cfg.border} ${cfg.color} ${cfg.bg}`
                  : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="px-6 py-4">
        {loadingProjetos ? (
          <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800 bg-gray-100/50 dark:bg-black/40">
              <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Projeto / Cliente</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Status</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 text-right">Ações</span>
            </div>
            {[0,1,2,3,4,5,6].map(i => (
              <div key={i} className={`grid grid-cols-12 items-center px-4 py-3.5 ${i < 6 ? 'border-b border-gray-100 dark:border-zinc-900/50' : ''}`}>
                <div className="col-span-5 flex flex-col gap-1.5 pr-4">
                  <div className="sk h-3.5 rounded-sm" style={{ width: `${60 + (i % 4) * 10}%`, animationDelay: `${i * 60}ms` }}></div>
                  <div className="sk h-2.5 w-24 rounded-sm" style={{ animationDelay: `${i * 60 + 30}ms` }}></div>
                </div>
                <div className="col-span-2"><div className="sk h-5 w-16 rounded-sm" style={{ animationDelay: `${i * 60}ms` }}></div></div>
                <div className="col-span-2"><div className="sk h-2.5 w-20 rounded-sm" style={{ animationDelay: `${i * 60}ms` }}></div></div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <div className="sk w-8 h-8 rounded-sm"></div>
                  <div className="sk w-8 h-8 rounded-sm"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 sys-reveal">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800 bg-gray-100/50 dark:bg-black/40">
              <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Projeto / Cliente</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Status</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Ações</span>
            </div>

            {projetosFiltrados.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center gap-3 border-b border-gray-100 dark:border-zinc-900">
                <iconify-icon icon="solar:box-linear" width="32" className="text-gray-200 dark:text-zinc-800"></iconify-icon>
                <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Nenhum projeto encontrado</span>
              </div>
            ) : (
              projetosPaginados.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projetos/${p.id}`)}
                  className={`card-interactive grid grid-cols-12 items-center px-4 py-3.5 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] group ${
                    i < projetosPaginados.length - 1 ? 'border-b border-gray-100 dark:border-zinc-900/50' : ''
                  }`}
                >
                  <div className="col-span-5 flex flex-col min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-white font-medium truncate group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{p.nome}</span>
                      {isAdmin && p.vendedor_id !== session?.user?.id && (
                        <span className="px-1.5 py-0.5 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-[8px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-400 shrink-0">
                          OP: {vendedores.find(v => v.id === p.vendedor_id)?.nome?.split(' ')[0] || 'Vendedor'}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-0.5 truncate uppercase tracking-tighter">{p.cliente}</span>
                  </div>
                  <div className="col-span-2">
                    <StatusPill status={p.status} />
                  </div>
                  <div className="col-span-2">
                    <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600">{p.data}</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1.5 sm:gap-3">
                    <button
                      onClick={(e) => handleEditProjeto(e, p)}
                      className="w-8 h-8 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-gray-400 dark:hover:border-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDuplicateProjeto(e, p)}
                        className="w-8 h-8 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-yellow-400/50 dark:hover:border-yellow-400/50 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                      >
                        <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDeleteProjeto(e, p.id)}
                        className="w-8 h-8 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-red-400/50 dark:hover:border-red-400/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    )}
                    <span className="w-px h-4 bg-gray-200 dark:bg-zinc-800 mx-1"></span>
                    <iconify-icon icon="solar:arrow-right-linear" width="14" className="text-gray-300 dark:text-zinc-800 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
                  </div>
                </div>
              ))
            )}

            {projetosFiltrados.length > PAGE_SIZE && (
              <div className="px-4 py-3 border-t border-gray-300 dark:border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">
                  Página {currentPage + 1} de {totalPages}
                  <span className="text-gray-300 dark:text-zinc-800 mx-2">·</span>
                  {projetosFiltrados.length} projetos
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <iconify-icon icon="solar:arrow-left-linear" width="11"></iconify-icon>
                    Anterior
                  </button>
                  <button
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Próxima
                    <iconify-icon icon="solar:arrow-right-linear" width="11"></iconify-icon>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Novo/Editar */}
      {modalAberto && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="modal-content bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-yellow-500 dark:bg-yellow-400"></span>
              {editingProjetoId ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>
            <form onSubmit={handleSaveProjeto} className="flex flex-col gap-5">
              <div>
                <label className="text-[9px] font-mono uppercase text-gray-500 dark:text-zinc-500 mb-1.5 block">Nome do Projeto</label>
                <input
                  required
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-gray-500 dark:text-zinc-500 mb-1.5 block">Cliente</label>
                <select
                  required
                  value={novoClienteId}
                  onChange={e => setNovoClienteId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                >
                  <option value="">Selecionar...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-gray-500 dark:text-zinc-500 mb-1.5 block">
                  Arquiteto Parceiro <span className="text-gray-300 dark:text-zinc-700">(opcional)</span>
                </label>
                <select
                  value={novoArquitetoId}
                  onChange={e => setNovoArquitetoId(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                >
                  <option value="">Nenhum</option>
                  {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-gray-500 dark:text-zinc-500 mb-1.5 block">
                  % RT Padrão <span className="text-gray-300 dark:text-zinc-700">(opcional — preenchido automaticamente no orçamento)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={novoRtPadrao}
                    onChange={e => setNovoRtPadrao(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                  />
                  <span className="text-gray-400 dark:text-zinc-500 font-mono text-sm shrink-0">%</span>
                </div>
              </div>

              {erroModal && <div className="text-[10px] font-mono text-red-600 dark:text-red-400 uppercase tracking-widest">{erroModal}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleCloseModal} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 text-gray-700 dark:text-[#a1a1aa] py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300 disabled:opacity-50 transition-colors">
                  {salvando ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Deleção */}
      {projetoToDelete && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="modal-content bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500"></span>
              Excluir Projeto
            </h2>
            <p className="text-gray-600 dark:text-zinc-400 text-sm mb-6">Tem certeza que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setProjetoToDelete(null)} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 text-gray-700 dark:text-[#a1a1aa] py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
              <button onClick={confirmDeleteProjeto} className="flex-1 bg-red-500/10 text-red-600 dark:text-red-500 font-mono font-bold text-[10px] uppercase py-3 border border-red-400/30 dark:border-red-500/30 hover:bg-red-500 hover:text-white transition-all">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
