import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBRL, formatDate } from '../../utils/format';

const STATUS_LABEL = {
    aprovado:   'Aprovado',
    produzindo: 'Em Produção',
    entregue:   'Entregue',
    perdido:    'Perdido',
};

const STATUS_COR = {
    aprovado:   'text-yellow-400 border-yellow-400/40',
    produzindo: 'text-blue-400  border-blue-400/40',
    entregue:   'text-green-400 border-green-400/40',
    perdido:    'text-red-400   border-red-400/40',
};

export default function FinanceiroVisaoGeral() {
    const { profile } = useAuth();

    const [loading,    setLoading]    = useState(true);
    const [projetos,   setProjetos]   = useState([]);
    const [orcValores, setOrcValores] = useState({});
    const [vendedores, setVendedores] = useState([]);

    const hoje        = new Date();
    const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2,'0')}-01`;
    const ultimoDia   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

    const [periodoInicio, setPeriodoInicio] = useState(primeiroDia);
    const [periodoFim,    setPeriodoFim]    = useState(ultimoDia);
    const [filtroVend,    setFiltroVend]    = useState('todos');
    const [filtroStatus,  setFiltroStatus]  = useState('fechados');

    const [painelItem, setPainelItem] = useState(null);

    useEffect(() => {
        const empresaId = profile?.empresa_id;
        if (!empresaId) return;

        async function loadData() {
            setLoading(true);
            try {
                const [{ data: proj }, { data: orcs }, { data: perfs }] = await Promise.all([
                    supabase
                        .from('projetos')
                        .select('id, nome, status, created_at, vendedor_id, clientes(nome)')
                        .eq('empresa_id', empresaId)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('orcamentos')
                        .select('id, valor_total, ambiente_id, ambientes(projeto_id)')
                        .eq('empresa_id', empresaId),
                    supabase
                        .from('usuarios')
                        .select('id, nome')
                        .eq('empresa_id', empresaId)
                        .in('perfil', ['vendedor', 'admin']),
                ]);

                setProjetos(proj ?? []);
                setVendedores(perfs ?? []);

                const mapa = {};
                for (const o of orcs ?? []) {
                    const pid = o.ambientes?.projeto_id;
                    if (!pid) continue;
                    mapa[pid] = (mapa[pid] ?? 0) + (o.valor_total ?? 0);
                }
                setOrcValores(mapa);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [profile?.empresa_id]);

    useEffect(() => {
        const obs = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, [loading]);

    const projetosEnriquecidos = useMemo(() => projetos.map(p => ({
        ...p,
        clienteNome:  p.clientes?.nome ?? '—',
        vendedorNome: vendedores.find(v => v.id === p.vendedor_id)?.nome ?? '—',
        valor:        orcValores[p.id] ?? 0,
    })), [projetos, vendedores, orcValores]);

    const vendedoresUnicos = useMemo(() => {
        const nomes = projetosEnriquecidos.map(p => p.vendedorNome).filter(n => n !== '—');
        return [...new Set(nomes)].sort();
    }, [projetosEnriquecidos]);

    const fechamentosDB = useMemo(() =>
        projetosEnriquecidos.filter(p => ['aprovado','produzindo','entregue'].includes(p.status)),
    [projetosEnriquecidos]);

    const perdidosDB = useMemo(() =>
        projetosEnriquecidos.filter(p => p.status === 'perdido'),
    [projetosEnriquecidos]);

    const fechamentosFiltrados = useMemo(() => {
        const dataRef = p => (p.created_at ?? '').split('T')[0];
        return fechamentosDB.filter(p => {
            if (dataRef(p) < periodoInicio || dataRef(p) > periodoFim) return false;
            if (filtroVend !== 'todos' && p.vendedorNome !== filtroVend)  return false;
            return true;
        });
    }, [fechamentosDB, periodoInicio, periodoFim, filtroVend]);

    const perdidosFiltrados = useMemo(() => {
        const dataRef = p => (p.created_at ?? '').split('T')[0];
        return perdidosDB.filter(p => {
            if (dataRef(p) < periodoInicio || dataRef(p) > periodoFim) return false;
            if (filtroVend !== 'todos' && p.vendedorNome !== filtroVend) return false;
            return true;
        });
    }, [perdidosDB, periodoInicio, periodoFim, filtroVend]);

    const totalRecebido = fechamentosFiltrados.reduce((s, p) => s + p.valor, 0);
    const ticketMedio   = fechamentosFiltrados.length ? totalRecebido / fechamentosFiltrados.length : 0;
    const nFechamentos  = fechamentosFiltrados.length;

    const showFechados = filtroStatus === 'fechados' || filtroStatus === 'todos';
    const showPerdidos = filtroStatus === 'perdidos' || filtroStatus === 'todos';

    const inputCls  = "bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono px-3 py-2 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700 w-full";
    const selectCls = inputCls + " appearance-none cursor-pointer";

    return (
        <div className="bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">

            <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

                {/* ── 01 // Filtros ─────────────────────────────────── */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                        01 // Filtros
                    </div>
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            <div>
                                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Período — início</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:calendar-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                                    <input type="date" value={periodoInicio}
                                        onChange={e => setPeriodoInicio(e.target.value)}
                                        style={{ colorScheme: 'dark' }}
                                        className={inputCls + " pl-8"} />
                                </div>
                            </div>
                            <div>
                                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Período — fim</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:calendar-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                                    <input type="date" value={periodoFim}
                                        onChange={e => setPeriodoFim(e.target.value)}
                                        style={{ colorScheme: 'dark' }}
                                        className={inputCls + " pl-8"} />
                                </div>
                            </div>
                            <div>
                                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Vendedor</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                                    <select value={filtroVend} onChange={e => setFiltroVend(e.target.value)}
                                        className={selectCls + " pl-8 pr-7"}>
                                        <option value="todos">Todos</option>
                                        {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12"></iconify-icon>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-px border border-zinc-800 w-max">
                            {[
                                { id: 'fechados', label: 'Fechados', icon: 'solar:check-circle-linear'        },
                                { id: 'perdidos', label: 'Perdidos', icon: 'solar:close-circle-linear'        },
                                { id: 'todos',    label: 'Todos',    icon: 'solar:layers-minimalistic-linear' },
                            ].map(tab => (
                                <button key={tab.id} onClick={() => setFiltroStatus(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                                        filtroStatus === tab.id
                                            ? 'bg-yellow-400 text-black'
                                            : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'
                                    }`}>
                                    <iconify-icon icon={tab.icon} width="12"></iconify-icon>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 02 // Totais ──────────────────────────────────── */}
                <section className="mb-6 sys-reveal sys-delay-100">
                    <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                        02 // Totais do período
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:wallet-money-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Total em projetos</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
                                {loading ? (
                                    <div className="h-9 w-36 bg-zinc-800 animate-pulse rounded"></div>
                                ) : showFechados ? formatBRL(totalRecebido) : '—'}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">
                                {showFechados ? `${nFechamentos} projeto${nFechamentos !== 1 ? 's' : ''} no período` : 'Filtro: apenas perdidos'}
                            </div>
                        </div>
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:graph-up-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Ticket médio</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
                                {loading ? (
                                    <div className="h-9 w-28 bg-zinc-800 animate-pulse rounded"></div>
                                ) : showFechados && nFechamentos > 0 ? formatBRL(ticketMedio) : '—'}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">por projeto fechado</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:check-square-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Nº de fechamentos</div>
                            <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline gap-2">
                                {loading ? (
                                    <div className="h-9 w-16 bg-zinc-800 animate-pulse rounded"></div>
                                ) : (
                                    <>
                                        <span className="text-yellow-400">{showFechados ? nFechamentos : 0}</span>
                                        {showPerdidos && (
                                            <span className="text-base font-normal text-red-400 font-mono">{perdidosFiltrados.length} perd.</span>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">no período selecionado</div>
                        </div>
                    </div>
                </section>

                {/* ── 03 // Projetos fechados ────────────────────────── */}
                {showFechados && (
                    <section className="mb-6 sys-reveal sys-delay-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                                03 // Projetos fechados
                            </div>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
                                {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedor</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor</span>
                            </div>
                            {loading ? (
                                <div className="px-4 py-4 space-y-3">
                                    {[1,2,3].map(i => <div key={i} className="h-10 bg-zinc-900 animate-pulse rounded"></div>)}
                                </div>
                            ) : fechamentosFiltrados.length === 0 ? (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:wallet-money-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto fechado no período</p>
                                </div>
                            ) : fechamentosFiltrados.map((p, i) => (
                                <div key={p.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.015] cursor-pointer group transition-colors ${
                                        painelItem?.id === p.id ? 'bg-yellow-400/5 border-l-2 border-yellow-400' : ''
                                    } ${i < fechamentosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
                                    onClick={() => setPainelItem(painelItem?.id === p.id ? null : p)}
                                >
                                    <div className="col-span-1 font-mono text-[9px] text-zinc-600 leading-tight">{formatDate(p.created_at)}</div>
                                    <div className="col-span-3 pl-1">
                                        <span className="text-sm text-white font-medium truncate block group-hover:text-yellow-400 transition-colors">{p.clienteNome}</span>
                                    </div>
                                    <div className="col-span-3">
                                        <span className="font-mono text-[10px] text-zinc-500 truncate block">{p.nome}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1.5">
                                        <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                                            {p.vendedorNome !== '—' ? p.vendedorNome.split(' ').map(x => x[0]).join('').slice(0,2) : '??'}
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-500 truncate">{p.vendedorNome.split(' ')[0]}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase ${STATUS_COR[p.status] ?? 'text-zinc-500 border-zinc-700'}`}>
                                            {STATUS_LABEL[p.status] ?? p.status}
                                        </span>
                                    </div>
                                    <div className="col-span-1 text-right">
                                        {p.valor > 0
                                            ? <span className="font-mono text-[11px] text-white font-bold">{formatBRL(p.valor)}</span>
                                            : <span className="font-mono text-[11px] text-zinc-700">—</span>}
                                    </div>
                                </div>
                            ))}
                            {!loading && fechamentosFiltrados.length > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950">
                                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                                        {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''} · subtotal
                                    </span>
                                    <span className="font-mono text-sm font-bold text-yellow-400">{formatBRL(totalRecebido)}</span>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* ── 04 // Projetos perdidos ────────────────────────── */}
                {showPerdidos && (
                    <section className="sys-reveal sys-delay-300">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                                04 // Projetos perdidos
                            </div>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
                                {perdidosFiltrados.length} registro{perdidosFiltrados.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedor</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor (orç.)</span>
                            </div>
                            {loading ? (
                                <div className="px-4 py-4 space-y-3">
                                    {[1,2].map(i => <div key={i} className="h-10 bg-zinc-900 animate-pulse rounded"></div>)}
                                </div>
                            ) : perdidosFiltrados.length === 0 ? (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:close-circle-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto perdido no período</p>
                                </div>
                            ) : perdidosFiltrados.map((p, i) => (
                                <div key={p.id}
                                    className={`grid grid-cols-12 items-start px-4 py-3.5 hover:bg-white/[0.015] transition-colors ${i < perdidosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
                                >
                                    <div className="col-span-1 font-mono text-[9px] text-zinc-600 pt-0.5">{formatDate(p.created_at)}</div>
                                    <div className="col-span-3 pl-1">
                                        <span className="text-sm text-white font-medium truncate block">{p.clienteNome}</span>
                                    </div>
                                    <div className="col-span-4">
                                        <span className="font-mono text-[10px] text-zinc-500 truncate block">{p.nome}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1.5">
                                        <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                                            {p.vendedorNome !== '—' ? p.vendedorNome.split(' ').map(x => x[0]).join('').slice(0,2) : '??'}
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-500 truncate">{p.vendedorNome.split(' ')[0]}</span>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        {p.valor > 0
                                            ? <span className="font-mono text-[11px] text-zinc-400">{formatBRL(p.valor)}</span>
                                            : <span className="font-mono text-[11px] text-zinc-700">—</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

            </main>

            {/* ══ PAINEL LATERAL ════════════════════════════════════════ */}
            {painelItem && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setPainelItem(null)}></div>
                    <aside className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden"
                        style={{ animation: 'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                            <div>
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Detalhes do projeto</div>
                                <div className="text-white font-semibold text-sm truncate max-w-[280px]">{painelItem.clienteNome}</div>
                            </div>
                            <button onClick={() => setPainelItem(null)} className="text-zinc-600 hover:text-white transition-colors p-1 shrink-0">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <div className="px-5 py-4 border-b border-zinc-800">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Projeto</div>
                                <div className="text-zinc-300 text-sm">{painelItem.nome}</div>
                            </div>
                            <div className="grid grid-cols-2 border-b border-zinc-800">
                                <div className="px-5 py-4 border-r border-zinc-800">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Valor (orçamentos)</div>
                                    <div className="font-mono text-2xl font-bold text-yellow-400 tracking-tighter">
                                        {painelItem.valor > 0 ? formatBRL(painelItem.valor) : '—'}
                                    </div>
                                </div>
                                <div className="px-5 py-4">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Data criação</div>
                                    <div className="font-mono text-sm font-semibold text-white">{formatDate(painelItem.created_at)}</div>
                                </div>
                            </div>
                            <div className="px-5 py-4 border-b border-zinc-800">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Status</div>
                                <span className={`px-2 py-1 border font-mono text-[9px] uppercase ${STATUS_COR[painelItem.status] ?? 'text-zinc-500 border-zinc-700'}`}>
                                    {STATUS_LABEL[painelItem.status] ?? painelItem.status}
                                </span>
                            </div>
                            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
                                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[10px] text-zinc-400 shrink-0">
                                    {painelItem.vendedorNome !== '—'
                                        ? painelItem.vendedorNome.split(' ').map(p => p[0]).join('').slice(0,2)
                                        : '??'}
                                </div>
                                <div>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Vendedor</div>
                                    <div className="text-white text-sm font-medium">{painelItem.vendedorNome}</div>
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
                            <button onClick={() => setPainelItem(null)}
                                className="w-full border border-zinc-700 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2">
                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                Fechar
                            </button>
                        </div>
                    </aside>
                </>
            )}

            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to   { transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
