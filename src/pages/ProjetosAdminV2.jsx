import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ModalNovoClienteInline from '../components/ModalNovoClienteInline';
// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const STATUS_CONFIG = {
  todos:      { label: 'Todos',      color: 'text-zinc-600 dark:text-zinc-400',      border: 'border-zinc-300 dark:border-zinc-700',         bg: 'bg-zinc-100 dark:bg-zinc-900',       dot: 'bg-zinc-400 dark:bg-zinc-500'    },
  orcado:     { label: 'Orçado',     color: 'text-orange-700 dark:text-zinc-400',    border: 'border-orange-200 dark:border-zinc-700',       bg: 'bg-orange-50 dark:bg-zinc-900',      dot: 'bg-orange-500 dark:bg-zinc-500'  },
  aprovado:   { label: 'Aprovado',   color: 'text-emerald-700 dark:text-green-400',  border: 'border-emerald-200 dark:border-green-500/30',  bg: 'bg-emerald-50 dark:bg-green-400/5',  dot: 'bg-emerald-500 dark:bg-green-400'  },
  produzindo: { label: 'Produzindo', color: 'text-violet-700 dark:text-violet-400',  border: 'border-violet-200 dark:border-violet-500/30',  bg: 'bg-violet-50 dark:bg-violet-400/5',  dot: 'bg-violet-500 dark:bg-violet-400' },
  entregue:   { label: 'Entregue',   color: 'text-blue-700 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-500/30',      bg: 'bg-blue-50 dark:bg-blue-400/5',      dot: 'bg-blue-500 dark:bg-blue-400'   },
  perdido:    { label: 'Perdido',    color: 'text-red-700 dark:text-red-400',        border: 'border-red-200 dark:border-red-500/30',        bg: 'bg-red-50 dark:bg-red-400/5',        dot: 'bg-red-500 dark:bg-red-400'     },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
  return (
    <span className={`px-2.5 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max shrink-0 rounded-full dark:rounded-none`}>
      <span className={`w-1.5 h-1.5 ${cfg.dot} rounded-full`}></span>
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

  // ── Modal Novo Cliente inline ─────────────────────────────────────────────
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [clienteTemp, setClienteTemp] = useState(null); // dados em memória, ainda não salvos no banco

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
    setClienteTemp(null); // descarta cliente ainda não salvo
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

      // Se for cliente temporário, persiste no banco agora antes de criar o projeto
      let clienteIdReal = novoClienteId;
      if (clienteTemp && novoClienteId === 'temp') {
        const { id: _id, isTemporario: _t, ...dadosCliente } = clienteTemp;
        const payload = { ...dadosCliente, empresa_id: profile.empresa_id };
        const { data: cliSalvo, error: errCli } = await supabase
          .from('clientes')
          .insert(payload)
          .select('id, nome')
          .single();
        if (errCli) throw errCli;
        clienteIdReal = cliSalvo.id;
        setClientes(prev => [...prev, cliSalvo].sort((a, b) => a.nome.localeCompare(b.nome)));
        setClienteTemp(null);
      }

      const payload = {
        nome:                 novoNome.trim(),
        cliente_id:           clienteIdReal,
        arquiteto_id:         novoArquitetoId || null,
        rt_padrao_percentual: rtPadrao > 0 ? rtPadrao : 0,
        empresa_id:           profile.empresa_id,
        vendedor_id:          session.user.id,
      };
      if (editingProjetoId) {
        const { error } = await supabase.from('projetos').update(payload).eq('id', editingProjetoId);
        if (error) throw error;
        const cliNome = clientes.find(c => c.id === clienteIdReal)?.nome ?? clienteTemp?.nome ?? '—';
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
    <div className="page-enter bg-zinc-50 dark:bg-[#050505] text-zinc-700 dark:text-[#a1a1aa] min-h-screen font-sans">
      <main className="max-w-[1400px] mx-auto p-6 md:p-8">

      {/* Cabeçalho */}
      <div className="sys-reveal flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-2 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">04 // Projetos</div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight uppercase">Projetos</h1>
        </div>

        <button
          onClick={() => { setEditingProjetoId(null); setModalAberto(true); }}
          className="shrink-0 flex items-center justify-center gap-2 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono text-[11px] font-bold uppercase tracking-widest px-6 py-3 border border-orange-400 dark:border-transparent shadow-[0_4px_14px_0_rgba(249,115,22,0.39)] dark:shadow-none hover:shadow-[0_6px_20px_rgba(249,115,22,0.23)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:-translate-y-0.5 dark:hover:bg-yellow-300 transition-all rounded-xl dark:rounded-none w-full md:w-auto mt-4 md:mt-0 max-w-[200px]"
        >
          <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
          Novo projeto
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="sys-reveal sys-delay-100 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-50">
        <div className="flex gap-2 flex-wrap items-center bg-white/60 dark:bg-[#0a0a0a] backdrop-blur-md p-1.5 rounded-2xl dark:rounded-none border border-zinc-200/80 dark:border-zinc-800 shadow-sm dark:shadow-none">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFiltroStatus(key)}
              className={`px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer rounded-xl dark:rounded-none border ${
                filtroStatus === key
                  ? 'bg-white dark:bg-zinc-900 text-orange-600 dark:text-yellow-400 shadow-sm dark:shadow-none border-zinc-200/80 dark:border-zinc-700 font-bold'
                  : 'bg-transparent text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white border-transparent'
              }`}
            >
              {cfg.label}
            </button>
          ))}

          {isAdmin && (
            <div className="flex items-center gap-2 ml-0 md:ml-2 pl-0 md:pl-2 border-l-0 md:border-l border-zinc-200 dark:border-zinc-800">
              <span className="font-mono text-[9px] uppercase text-zinc-500 dark:text-zinc-500 ml-2 md:ml-0">Exibir:</span>
              <select
                value={filtroResponsabilidade}
                onChange={(e) => setFiltroResponsabilidade(e.target.value)}
                className="bg-white/80 dark:bg-[#050505] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-[10px] font-mono px-3 py-1.5 h-8 outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:ring-4 focus:ring-orange-500/10 dark:focus:ring-0 uppercase tracking-widest cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all rounded-lg dark:rounded-none shadow-sm dark:shadow-none"
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

        <div className="relative flex items-center w-full md:w-auto">
          <iconify-icon icon="solar:magnifer-linear" className="absolute left-3.5 text-zinc-400 dark:text-zinc-600 pointer-events-none" width="14"></iconify-icon>
          <input
            value={buscaInput}
            onChange={handleBuscaChange}
            placeholder="Buscar projeto ou cliente..."
            className="bg-white/80 dark:bg-zinc-950 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-[11px] font-mono pl-9 pr-4 h-10 w-full md:w-72 rounded-xl dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:ring-4 focus:ring-orange-500/10 dark:focus:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-all shadow-sm dark:shadow-none"
          />
        </div>
      </div>

      {/* Tabela */}
      <div>
        {loadingProjetos ? (
          <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black/40">
              <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Projeto / Cliente</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Status</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700 text-right">Ações</span>
            </div>
            {[0,1,2,3,4,5,6].map(i => (
              <div key={i} className={`grid grid-cols-12 items-center px-4 py-3.5 ${i < 6 ? 'border-b border-zinc-100 dark:border-zinc-900/50' : ''}`}>
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
          <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden sys-reveal">
            <div className="grid grid-cols-12 px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black/40">
              <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Projeto / Cliente</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Status</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 text-right">Ações</span>
            </div>

            {projetosFiltrados.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center gap-3 border-b border-zinc-100 dark:border-zinc-900">
                <iconify-icon icon="solar:box-linear" width="32" className="text-zinc-300 dark:text-zinc-800"></iconify-icon>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Nenhum projeto encontrado</span>
              </div>
            ) : (
              projetosPaginados.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projetos/${p.id}`)}
                  className={`card-interactive grid grid-cols-12 items-center px-6 py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.02] group ${
                    i < projetosPaginados.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-900/50' : ''
                  }`}
                >
                  <div className="col-span-5 flex flex-col min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-900 dark:text-white font-medium truncate group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors">{p.nome}</span>
                      {isAdmin && p.vendedor_id !== session?.user?.id && (
                        <span className="px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-[8px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 shrink-0 rounded-md dark:rounded-none">
                          OP: {vendedores.find(v => v.id === p.vendedor_id)?.nome?.split(' ')[0] || 'Vendedor'}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600 mt-0.5 truncate uppercase tracking-tighter">{p.cliente}</span>
                  </div>
                  <div className="col-span-2">
                    <StatusPill status={p.status} />
                  </div>
                  <div className="col-span-2">
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600">{p.data}</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1.5 sm:gap-3">
                    <button
                      onClick={(e) => handleEditProjeto(e, p)}
                      className="w-8 h-8 flex items-center justify-center text-zinc-400 dark:text-zinc-600 hover:text-orange-500 hover:bg-orange-50 dark:hover:text-white dark:hover:bg-white/5 rounded-lg dark:rounded-none transition-all"
                    >
                      <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDuplicateProjeto(e, p)}
                        className="w-8 h-8 flex items-center justify-center text-zinc-400 dark:text-zinc-600 hover:text-orange-500 hover:bg-orange-50 dark:hover:text-yellow-400 dark:hover:bg-yellow-400/10 rounded-lg dark:rounded-none transition-all"
                      >
                        <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDeleteProjeto(e, p.id)}
                        className="w-8 h-8 flex items-center justify-center text-zinc-400 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-400/10 rounded-lg dark:rounded-none transition-all"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    )}
                    <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1"></span>
                    <iconify-icon icon="solar:arrow-right-linear" width="14" className="text-zinc-300 dark:text-zinc-800 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
                  </div>
                </div>
              ))
            )}

            {projetosFiltrados.length > PAGE_SIZE && (
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-transparent flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">
                  Página {currentPage + 1} de {totalPages}
                  <span className="text-zinc-300 dark:text-zinc-800 mx-2">·</span>
                  {projetosFiltrados.length} projetos
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent text-zinc-600 dark:text-zinc-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50 dark:hover:border-zinc-600 dark:hover:text-white dark:hover:bg-transparent transition-all rounded-xl dark:rounded-none shadow-sm dark:shadow-none disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <iconify-icon icon="solar:arrow-left-linear" width="11"></iconify-icon>
                    Anterior
                  </button>
                  <button
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent text-zinc-600 dark:text-zinc-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50 dark:hover:border-zinc-600 dark:hover:text-white dark:hover:bg-transparent transition-all rounded-xl dark:rounded-none shadow-sm dark:shadow-none disabled:opacity-30 disabled:cursor-not-allowed"
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
      </main>

      {/* Modal: Novo/Editar */}
      {modalAberto && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl rounded-2xl dark:rounded-none">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6 uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-orange-500 dark:bg-yellow-400 rounded-full dark:rounded-none"></span>
              {editingProjetoId ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>
            <form onSubmit={handleSaveProjeto} className="flex flex-col gap-5">
              <div>
                <label className="text-[9px] font-mono uppercase text-zinc-500 dark:text-zinc-500 mb-1.5 block">Nome do Projeto</label>
                <input
                  required
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-lg dark:rounded-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[9px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Cliente</label>
                  <button
                    type="button"
                    onClick={() => setModalNovoCliente(true)}
                    className="flex items-center gap-1 font-mono text-[9px] uppercase text-orange-600 dark:text-yellow-400 hover:text-orange-500 dark:hover:text-yellow-300 transition-colors"
                  >
                    <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                    Novo Cliente
                  </button>
                </div>
                <select
                  required
                  value={novoClienteId}
                  onChange={e => setNovoClienteId(e.target.value)}
                  className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-lg dark:rounded-none"
                >
                  <option value="">Selecionar...</option>
                  {clienteTemp && (
                    <option value="temp">{clienteTemp.nome} (novo — não salvo)</option>
                  )}
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-zinc-500 dark:text-zinc-500 mb-1.5 block">
                  Arquiteto Parceiro <span className="text-zinc-400 dark:text-zinc-700">(opcional)</span>
                </label>
                <select
                  value={novoArquitetoId}
                  onChange={e => setNovoArquitetoId(e.target.value)}
                  className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-lg dark:rounded-none"
                >
                  <option value="">Nenhum</option>
                  {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-mono uppercase text-zinc-500 dark:text-zinc-500 mb-1.5 block">
                  % RT Padrão <span className="text-zinc-400 dark:text-zinc-700">(opcional — preenchido automaticamente no orçamento)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={novoRtPadrao}
                    onChange={e => setNovoRtPadrao(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-lg dark:rounded-none"
                  />
                  <span className="text-zinc-400 dark:text-zinc-500 font-mono text-sm shrink-0">%</span>
                </div>
              </div>

              {erroModal && <div className="text-[10px] font-mono text-red-600 dark:text-red-400 uppercase tracking-widest">{erroModal}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleCloseModal} className="flex-1 font-mono text-[10px] uppercase border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-[#a1a1aa] py-3 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-lg dark:rounded-none">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-orange-600 dark:hover:bg-yellow-300 disabled:opacity-50 transition-colors rounded-lg dark:rounded-none">
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
          <div className="modal-content bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl rounded-2xl dark:rounded-none">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 uppercase tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full dark:rounded-none"></span>
              Excluir Projeto
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">Tem certeza que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setProjetoToDelete(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-[#a1a1aa] py-3 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-lg dark:rounded-none">Cancelar</button>
              <button onClick={confirmDeleteProjeto} className="flex-1 bg-red-500/10 text-red-600 dark:text-red-500 font-mono font-bold text-[10px] uppercase py-3 border border-red-400/30 dark:border-red-500/30 hover:bg-red-500 hover:text-white transition-all rounded-lg dark:rounded-none">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {modalNovoCliente && (
        <ModalNovoClienteInline
          onClose={() => setModalNovoCliente(false)}
          onCreated={dados => {
            setClienteTemp(dados);   // guarda em memória, sem tocar no banco
            setNovoClienteId('temp');
            setModalNovoCliente(false);
          }}
        />
      )}
    </div>
  );
}
