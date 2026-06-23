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
  todos:      { label: 'Todos',      color: 'text-zinc-400',      border: 'border-zinc-700',         bg: 'bg-zinc-900',       dot: 'bg-zinc-500'    },
  orcado:     { label: 'Orçado',     color: 'text-zinc-400',      border: 'border-zinc-700',         bg: 'bg-zinc-900',       dot: 'bg-zinc-500'   },
  aprovado:   { label: 'Aprovado',   color: 'text-green-400',     border: 'border-green-500/30',     bg: 'bg-green-400/5',    dot: 'bg-green-400'  },
  produzindo: { label: 'Produzindo', color: 'text-violet-400',    border: 'border-violet-500/30',    bg: 'bg-violet-400/5',   dot: 'bg-violet-400' },
  entregue:   { label: 'Entregue',   color: 'text-blue-400',      border: 'border-blue-500/30',      bg: 'bg-blue-400/5',     dot: 'bg-blue-400'   },
  perdido:    { label: 'Perdido',    color: 'text-red-400',       border: 'border-red-500/30',       bg: 'bg-red-400/5',      dot: 'bg-red-400'     },
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

  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [clienteTemp, setClienteTemp] = useState(null);

  const handleBuscaChange = useCallback((e) => {
    const val = e.target.value;
    setBuscaInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBusca(val), 300);
  }, []);

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
    } catch { }
  }, [profile?.empresa_id]);

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
        } catch { }

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
  }, [loadingProjetos, projetos]);

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

  const handleCloseModal = () => {
    setModalAberto(false);
    setErroModal('');
    setEditingProjetoId(null);
    setNovoNome('');
    setNovoClienteId('');
    setNovoArquitetoId('');
    setNovoRtPadrao('');
    setClienteTemp(null);
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
    <div className="selection:bg-white selection:text-black antialiased relative bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden scroll-smooth">
      {/* Background Global Assets */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-[length:40px_40px] bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)]"></div>
      <div className="fixed inset-0 pointer-events-none z-0 mix-blend-overlay bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.01),rgba(255,255,255,0.01))] bg-[length:100%_2px,3px_100%]"></div>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      {/* Main Container */}
      <main className="relative z-10 p-6 md:p-8 max-w-[1400px] mx-auto min-h-screen">

        {/* Cabeçalho da tela */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 sys-reveal sys-active">
            <div>
                <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                    01 // Projetos
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tighter uppercase">Projetos</h1>
            </div>
            
            <button onClick={() => { setEditingProjetoId(null); setModalAberto(true); }} className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] transition-shadow flex items-center justify-center gap-2 rounded-none cursor-pointer w-full md:w-auto mt-4 md:mt-0 max-w-[200px]">
                <iconify-icon icon="solar:add-circle-linear" width="16"></iconify-icon>
                Novo projeto
            </button>
        </div>

        {/* Barra de filtros */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 sys-reveal sys-active">
            <div className="flex gap-2 flex-wrap items-center">
                <button 
                  onClick={() => setFiltroStatus('todos')} 
                  className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all rounded-none cursor-pointer border ${
                    filtroStatus === 'todos' 
                      ? 'bg-yellow-400 text-black border-yellow-400 font-bold' 
                      : 'bg-transparent text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-600'
                  }`}>
                    Todos
                </button>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'todos').map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setFiltroStatus(key)}
                    className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all rounded-none cursor-pointer border ${
                      filtroStatus === key
                        ? 'bg-yellow-400 text-black border-yellow-400 font-bold' 
                        : 'bg-transparent text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-600'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}

                {isAdmin && (
                  <div className="flex items-center gap-2 ml-0 md:ml-4 border-l-0 md:border-l border-zinc-800 pl-0 md:pl-4">
                    <span className="font-mono text-[9px] uppercase text-zinc-500">Exibir:</span>
                    <select
                      value={filtroResponsabilidade}
                      onChange={(e) => setFiltroResponsabilidade(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 text-white text-[10px] font-mono px-3 py-1.5 h-7 outline-none focus:border-yellow-400 uppercase tracking-widest cursor-pointer hover:bg-zinc-900 transition-colors w-auto rounded-none"
                    >
                      <option value="todos">Todos</option>
                      <option value="meus">Meus Projetos</option>
                      {loadingProjetos ? (
                        <option value="" disabled>Carregando...</option>
                      ) : (
                        vendedores.map(v => (
                          <option key={v.id} value={v.id}>De: {v.nome.split(' ')[0]}</option>
                        ))
                      )}
                    </select>
                  </div>
                )}
            </div>

            <div className="relative flex items-center w-full md:w-auto">
                <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                <input 
                  type="text" 
                  value={buscaInput}
                  onChange={handleBuscaChange}
                  placeholder="Buscar por nome ou cliente..." 
                  className="bg-zinc-950 border border-zinc-800 text-white text-[11px] font-mono pl-8 pr-4 h-9 w-full md:w-64 rounded-none outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] placeholder:text-zinc-700 transition-all block"
                />
            </div>
        </div>

        {/* Tabela de projetos */}
        <div className="bg-[#0a0a0a] border border-zinc-800 sys-reveal sys-active rounded-none">
            {loadingProjetos ? (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_120px_110px_100px] items-center px-4 py-3 border-b border-zinc-900">
                    <div>
                        <div className="h-3 w-44 bg-zinc-800 animate-pulse mb-1.5 rounded-none"></div>
                        <div className="h-2 w-28 bg-zinc-800 animate-pulse rounded-none"></div>
                    </div>
                    <div className="h-3 w-24 bg-zinc-800 animate-pulse rounded-none"></div>
                    <div className="h-5 w-20 bg-zinc-800 animate-pulse rounded-none"></div>
                    <div className="h-3 w-16 bg-zinc-800 animate-pulse rounded-none"></div>
                    <div></div>
                </div>
              </div>
            ) : projetosFiltrados.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center">
                  <iconify-icon icon="solar:layers-linear" width="40" className="text-zinc-800 mb-4"></iconify-icon>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-700 mb-2">
                      Nenhum projeto encontrado
                  </div>
                  <div className="font-mono text-[9px] text-zinc-800">
                      Crie um novo projeto ou ajuste os filtros
                  </div>
              </div>
            ) : (
              <>
                {/* Tabela Cabeçalho */}
                <div className="grid grid-cols-[2fr_1fr_120px_110px_100px] gap-0 px-4 py-2 border-b border-zinc-800 hidden md:grid">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Cliente</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Criado em</span>
                    <span></span>
                </div>

                {projetosPaginados.map((p, i) => (
                  <div key={p.id} onClick={() => navigate(`/projetos/${p.id}`)} className={`grid grid-cols-1 md:grid-cols-[2fr_1fr_120px_110px_100px] items-center px-4 py-3 hover:bg-white/[0.015] cursor-pointer transition-colors gap-3 md:gap-0 group ${i < projetosPaginados.length - 1 ? 'border-b border-zinc-900' : ''}`}>
                      <div className="pr-2">
                          <div className="text-sm text-white font-medium truncate group-hover:text-yellow-400 transition-colors">{p.nome}</div>
                          {isAdmin && p.vendedor_id !== session?.user?.id && (
                            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                              OP: {vendedores.find(v => v.id === p.vendedor_id)?.nome?.split(' ')[0] || 'Vendedor'}
                            </div>
                          )}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 break-all md:break-normal pr-4 md:pr-0">
                          {p.cliente}
                      </div>
                      <div>
                          <StatusPill status={p.status} />
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600 hidden md:block">
                          {p.data}
                      </div>
                      <div className="flex justify-end pr-2 md:pr-0 self-start md:self-auto fixed-arrow md:static absolute right-4 md:right-auto gap-1">
                        <button
                          onClick={(e) => handleEditProjeto(e, p)}
                          className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-yellow-400 transition-colors"
                        >
                          <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDuplicateProjeto(e, p)}
                            className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-yellow-400 transition-colors"
                          >
                            <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDeleteProjeto(e, p.id)}
                            className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
                          >
                            <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                          </button>
                        )}
                        <span className="w-px h-3 bg-zinc-800 mx-1 mt-2 hidden md:block"></span>
                        <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 group-hover:translate-x-1 transition-all mt-1.5 hidden md:block"></iconify-icon>
                      </div>
                  </div>
                ))}
              </>
            )}

            {projetosFiltrados.length > PAGE_SIZE && (
              <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                  Página {currentPage + 1} de {totalPages}
                  <span className="text-zinc-800 mx-2">·</span>
                  {projetosFiltrados.length} projetos
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-transparent rounded-none cursor-pointer"
                  >
                    <iconify-icon icon="solar:arrow-left-linear" width="11"></iconify-icon>
                    Anterior
                  </button>
                  <button
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-transparent rounded-none cursor-pointer"
                  >
                    Próxima
                    <iconify-icon icon="solar:arrow-right-linear" width="11"></iconify-icon>
                  </button>
                </div>
              </div>
            )}
        </div>
      </main>

      {/* Modal: Novo/Editar */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-md p-6 relative rounded-none shadow-2xl">
                
                {/* Cabeçalho */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">{editingProjetoId ? 'Editar projeto' : 'Novo projeto'}</div>
                        <h2 className="text-lg font-bold text-white uppercase tracking-tighter">{editingProjetoId ? 'Editar Projeto' : 'Criar Projeto'}</h2>
                    </div>
                    <button onClick={handleCloseModal} className="text-zinc-600 hover:text-white transition-colors cursor-pointer" title="Fechar">
                        <iconify-icon icon="solar:close-circle-linear" width="20"></iconify-icon>
                    </button>
                </div>

                <form onSubmit={handleSaveProjeto}>
                  {/* Campo nome do projeto */}
                  <div className="mb-4">
                      <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                          Nome do projeto
                      </label>
                      <input 
                        type="text" 
                        required
                        value={novoNome}
                        onChange={e => setNovoNome(e.target.value)}
                        placeholder="Ex: Cozinha — Apartamento Centro" 
                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700"
                      />
                  </div>

                  {/* Campo cliente */}
                  <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                            Cliente
                        </label>
                        <button
                          type="button"
                          onClick={() => setModalNovoCliente(true)}
                          className="flex items-center gap-1 font-mono text-[9px] uppercase text-yellow-400 hover:text-yellow-300 transition-colors"
                        >
                          <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                          Novo Cliente
                        </button>
                      </div>
                      <select 
                        required
                        value={novoClienteId}
                        onChange={e => setNovoClienteId(e.target.value)}
                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 appearance-none"
                      >
                        <option value="">Selecionar cliente...</option>
                        {clienteTemp && (
                          <option value="temp">{clienteTemp.nome} (novo — não salvo)</option>
                        )}
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                  </div>

                  <div className="mb-4">
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                      Arquiteto Parceiro <span className="text-zinc-700">(opcional)</span>
                    </label>
                    <select
                      value={novoArquitetoId}
                      onChange={e => setNovoArquitetoId(e.target.value)}
                      className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 appearance-none"
                    >
                      <option value="">Nenhum</option>
                      {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </select>
                  </div>

                  <div className="mb-8">
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                      % RT Padrão <span className="text-zinc-700">(opcional)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={novoRtPadrao}
                        onChange={e => setNovoRtPadrao(e.target.value)}
                        placeholder="0"
                        className="flex-1 bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700"
                      />
                      <span className="text-zinc-500 font-mono text-sm shrink-0">%</span>
                    </div>
                  </div>

                  {erroModal && <div className="mb-4 text-[10px] font-mono text-red-500 uppercase tracking-widest">{erroModal}</div>}

                  {/* Botões */}
                  <div className="flex gap-3 mt-4">
                      <button type="button" onClick={handleCloseModal} className="flex-1 bg-transparent border border-zinc-800 text-zinc-400 text-xs font-mono uppercase tracking-widest py-3 hover:text-white hover:border-zinc-600 transition-all rounded-none cursor-pointer">
                          Cancelar
                      </button>
                      <button type="submit" disabled={salvando} className="flex-1 bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest py-3 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] transition-shadow flex items-center justify-center gap-2 rounded-none disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer">
                          {salvando ? (
                            <iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>
                          ) : (
                            <iconify-icon icon="solar:arrow-right-linear" width="14" className="group-hover:translate-x-1 transition-transform"></iconify-icon>
                          )}
                          {salvando ? 'Processando...' : (editingProjetoId ? 'Salvar' : 'Criar projeto')}
                      </button>
                  </div>
                </form>
            </div>
        </div>
      )}

      {/* Modal: Confirmar Deleção */}
      {projetoToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-sm p-6 shadow-2xl rounded-none relative">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">Atenção</div>
                    <h2 className="text-lg font-bold text-red-500 uppercase tracking-tighter">Excluir Projeto</h2>
                </div>
                <button onClick={() => setProjetoToDelete(null)} className="text-zinc-600 hover:text-white transition-colors cursor-pointer">
                    <iconify-icon icon="solar:close-circle-linear" width="20"></iconify-icon>
                </button>
            </div>
            <p className="text-zinc-400 text-sm mb-6">Tem certeza que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setProjetoToDelete(null)} className="flex-1 bg-transparent border border-zinc-800 text-zinc-400 text-xs font-mono uppercase tracking-widest py-3 hover:text-white hover:border-zinc-600 transition-all rounded-none cursor-pointer">Cancelar</button>
              <button onClick={confirmDeleteProjeto} className="flex-1 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-widest py-3 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all rounded-none cursor-pointer">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {modalNovoCliente && (
        <ModalNovoClienteInline
          onClose={() => setModalNovoCliente(false)}
          onCreated={dados => {
            setClienteTemp(dados);
            setNovoClienteId('temp');
            setModalNovoCliente(false);
          }}
        />
      )}
    </div>
  );
}
