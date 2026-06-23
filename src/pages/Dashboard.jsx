import React, { useEffect, useState, Component, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-orange-700 dark:text-zinc-400',   border: 'border-orange-200 dark:border-zinc-700',         bg: 'bg-orange-50 dark:bg-zinc-900',        dot: 'bg-orange-500 dark:bg-zinc-500'   },
    aprovado:   { label: 'Aprovado',   color: 'text-emerald-700 dark:text-green-400', border: 'border-emerald-200 dark:border-green-500/30',    bg: 'bg-emerald-50 dark:bg-green-400/5',    dot: 'bg-emerald-500 dark:bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-500/30',    bg: 'bg-violet-50 dark:bg-violet-400/5',    dot: 'bg-violet-500 dark:bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-500/30',        bg: 'bg-blue-50 dark:bg-blue-400/5',        dot: 'bg-blue-500 dark:bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-700 dark:text-red-400',       border: 'border-red-200 dark:border-red-500/30',          bg: 'bg-red-50 dark:bg-red-400/5',          dot: 'bg-red-500 dark:bg-red-400'     },
};

const TIPO_CONFIG = {
    medicao_processada: { icon: 'solar:ruler-pen-linear',    cor: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-400/10', border: 'border-violet-200 dark:border-violet-400/20' },
    medicao_agendada:   { icon: 'solar:calendar-linear',     cor: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-400/10', border: 'border-yellow-200 dark:border-yellow-400/20' },
    projeto_aprovado:   { icon: 'solar:check-circle-linear', cor: 'text-emerald-600 dark:text-green-400', bg: 'bg-emerald-50 dark:bg-green-400/10', border: 'border-emerald-200 dark:border-green-400/20'  },
    status_atualizado:  { icon: 'solar:layers-linear',       cor: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-400/10',     border: 'border-blue-200 dark:border-blue-400/20'   },
    novo_fechamento:    { icon: 'solar:wallet-money-linear', cor: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-400/10', border: 'border-yellow-200 dark:border-yellow-400/20' },
    projeto_perdido:    { icon: 'solar:close-circle-linear', cor: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-400/10',       border: 'border-red-200 dark:border-red-400/20'    },
};

// ── Error Boundary ───────────────────────────────────────────────────────────
class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[Dashboard] Erro de renderização capturado:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] flex flex-col items-center justify-center gap-3 p-8">
          <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 uppercase tracking-[0.15em] mb-2">
            // dashboard — erro de renderização
          </div>
          <div className="w-8 h-0.5 bg-red-500" />
          <p className="text-zinc-600 dark:text-[#a1a1aa] font-mono text-[11px] text-center max-w-xs leading-relaxed">
            O painel não pôde ser carregado. Tente recarregar a página.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-orange-600 dark:text-yellow-400 bg-transparent border border-orange-400 dark:border-yellow-400/30 px-4 py-2 cursor-pointer hover:border-orange-500 dark:hover:border-yellow-400"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Skeleton de Loading ──────────────────────────────────────────────────────
function SkeletonDashboard() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] p-8 flex flex-col gap-4">
      <div className="sk h-5 w-40 rounded-sm" />
      <div className="grid grid-cols-3 bg-white/90 dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 rounded-[2rem] dark:rounded-none overflow-hidden divide-x divide-zinc-100 dark:divide-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-transparent p-6 flex flex-col gap-2.5">
            <div className="sk h-2.5 w-20 rounded-sm" style={{ animationDelay: `${i * 80}ms` }} />
            <div className="sk h-8 w-14 rounded-sm" style={{ animationDelay: `${i * 80 + 40}ms` }} />
            <div className="sk h-2 w-28 rounded-sm" style={{ animationDelay: `${i * 80 + 80}ms` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-4 mt-1">
        <div className="sk h-64 rounded-sm" />
        <div className="sk h-64 rounded-sm" />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ── Dashboard Principal ───────────────────────────────────────────────────
function DashboardContent() {
    const { session, profile, loading, profileLoading } = useAuth();
    const navigate = useNavigate();

    const [projetos,           setProjetos]           = useState([]);
    const [notifs,             setNotifs]             = useState([]);
    const [medicoesPendentes,  setMedicoesPendentes]  = useState([]);
    const [dataLoading,        setDataLoading]        = useState(true);
    const refreshingDash = useRef(false);

    const isReady = !loading && !profileLoading && !!session && !!profile;


    useEffect(() => {
        if (!isReady) return;
        const observer = new IntersectionObserver(
            entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [isReady]);

    useEffect(() => {
        if (!profile?.empresa_id) return;
        try {
            const cached = localStorage.getItem(`dash_cache_${profile.empresa_id}`);
            if (cached) {
                const { projetos: p, notifs: n, medicoes: m } = JSON.parse(cached);
                if (p?.length) { setProjetos(p); setDataLoading(false); }
                if (n?.length) setNotifs(n);
                if (m?.length) setMedicoesPendentes(m);
            }
        } catch { /* ignora cache corrompido */ }
    }, [profile?.empresa_id]);

    useEffect(() => {
        if (!session?.user?.id || !profile?.empresa_id) {
            setDataLoading(false);
            return;
        }
        let isMounted = true;

        async function fetchData() {
            if (!refreshingDash.current) setDataLoading(true);
            refreshingDash.current = true;
            try {
                const [projRes, notifRes, medRes] = await Promise.allSettled([
                    supabase
                        .from('projetos')
                        .select('id, nome, status, created_at, clientes(nome)')
                        .eq('empresa_id', profile.empresa_id)
                        .order('created_at', { ascending: false })
                        .limit(10),
                    supabase
                        .from('notificacoes')
                        .select('*')
                        .eq('empresa_id', profile.empresa_id)
                        .eq('usuario_id', session.user.id)
                        .order('created_at', { ascending: false })
                        .limit(5),
                    supabase
                        .from('medicoes')
                        .select('id, status, data_medicao, projetos(id, nome)')
                        .eq('empresa_id', profile.empresa_id)
                        .in('status', ['enviada', 'processada'])
                        .order('data_medicao', { ascending: false })
                        .limit(5),
                ]);
                if (!isMounted) return;

                const projData  = projRes.status  === 'fulfilled' ? projRes.value.data   : null;
                const notifData = notifRes.status === 'fulfilled' ? notifRes.value.data  : null;
                const medData   = medRes.status   === 'fulfilled' ? medRes.value.data    : null;

                if (projData)  setProjetos(projData);
                if (notifData) setNotifs(notifData);
                if (medData)   setMedicoesPendentes(medData);

                try {
                    localStorage.setItem(`dash_cache_${profile.empresa_id}`, JSON.stringify({
                        projetos: projData  ?? [],
                        notifs:   notifData ?? [],
                        medicoes: medData   ?? [],
                    }));
                } catch { /* quota — ignora */ }
            } catch (err) {
                console.error('[Dashboard] Erro ao buscar dados:', err);
            } finally {
                if (isMounted) { setDataLoading(false); refreshingDash.current = false; }
            }
        }

        fetchData();
        return () => { isMounted = false; };
    }, [session?.user?.id, profile?.empresa_id]);

    async function handleClickNotif(n) {
        if (!n.lida) {
            await supabase.from('notificacoes').update({ lida: true }).eq('id', n.id);
            setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x));
        }
        if (n.projeto_id) navigate(`/projetos/${n.projeto_id}`);
        else navigate('/notificacoes');
    }

    if (!isReady) return <SkeletonDashboard />;

    const perfil = profile?.role || profile?.perfil;
    if (perfil === 'superadmin') return <Navigate to="/superadmin" replace />;
    if (perfil === 'medidor')    return <Navigate to="/medidor/agenda" replace />;

    return (
        <div className="page-enter bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-[#a1a1aa] selection:bg-orange-500 selection:text-white dark:selection:bg-gray-50 dark:selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">
            {/* Backgrounds — light */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-[length:40px_40px] bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:hidden"></div>
            <div className="fixed inset-0 pointer-events-none z-0 mix-blend-overlay bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%),linear-gradient(90deg,rgba(0,0,0,0.01),rgba(0,0,0,0.01),rgba(0,0,0,0.01))] bg-[length:100%_2px,3px_100%] dark:hidden"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.15] bg-[radial-gradient(circle_at_50%_0%,rgba(0,0,0,0.1),transparent_70%)] dark:hidden"></div>
            {/* Backgrounds — dark */}
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">
                {/* 01 // Métricas do mês */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-3 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">01 // Métricas do mês</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-0 bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden divide-y md:divide-y-0 md:divide-x divide-zinc-100 dark:divide-zinc-800">
                        <div className="bg-transparent p-6 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-all relative group cursor-pointer">
                            <iconify-icon icon="solar:document-text-linear" width="20" className="text-zinc-300 dark:text-zinc-700 group-hover:text-orange-400 dark:group-hover:text-zinc-700 absolute top-6 right-6 transition-colors"></iconify-icon>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-3">Orçamentos</div>
                            <div className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tighter mb-1.5 group-hover:text-orange-600 dark:group-hover:text-white transition-colors">—</div>
                            <div className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-transparent p-6 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-all relative group cursor-pointer">
                            <iconify-icon icon="solar:check-square-linear" width="20" className="text-zinc-300 dark:text-zinc-700 group-hover:text-orange-400 dark:group-hover:text-zinc-700 absolute top-6 right-6 transition-colors"></iconify-icon>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-3">Fechados</div>
                            <div className="text-4xl font-bold text-zinc-900 dark:text-white tracking-tighter mb-1.5 group-hover:text-orange-600 dark:group-hover:text-white transition-colors">—</div>
                            <div className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-transparent p-6 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-all relative group cursor-pointer">
                            <iconify-icon icon="solar:chart-linear" width="20" className="text-zinc-300 dark:text-zinc-700 group-hover:text-orange-400 dark:group-hover:text-zinc-700 absolute top-6 right-6 transition-colors"></iconify-icon>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-3">Taxa de Fechamento</div>
                            <div className="text-4xl font-bold tracking-tighter mb-1.5 flex items-baseline">
                                <span className="text-zinc-400 dark:text-zinc-600">—</span>
                            </div>
                            <div className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">Em breve</div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">

                    {/* 02 // Projetos recentes */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-3 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">02 // Projetos recentes</div>
                        <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden h-full flex flex-col">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-transparent">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Status</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                                    {[0,1,2,3,4].map(i => (
                                        <div key={i} className="flex items-center justify-between px-6 py-4 gap-4">
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <div className="sk h-3.5 w-36 rounded-sm" style={{ animationDelay: `${i * 80}ms` }}></div>
                                                <div className="sk h-2.5 w-24 rounded-sm" style={{ animationDelay: `${i * 80 + 40}ms` }}></div>
                                            </div>
                                            <div className="sk h-5 w-16 rounded-sm" style={{ animationDelay: `${i * 80}ms` }}></div>
                                        </div>
                                    ))}
                                </div>
                            ) : projetos.length === 0 ? (
                                <div className="px-6 py-10 text-center">
                                    <iconify-icon icon="solar:layers-linear" width="32" className="text-zinc-300 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum projeto ainda</p>
                                </div>
                            ) : projetos.map((p, i) => {
                                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.orcado;
                                const isLast = i === projetos.length - 1;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => navigate(`/projetos/${p.id}`)}
                                        className={`card-interactive flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-100 dark:border-zinc-900' : ''}`}
                                    >
                                        <div>
                                            <div className="font-medium text-sm text-zinc-900 dark:text-white mb-0.5 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors">{p.nome}</div>
                                            <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600">{p.clientes?.nome ?? '—'}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`px-2.5 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 rounded-full dark:rounded-none`}>
                                                <span className={`w-1.5 h-1.5 ${cfg.dot} rounded-full`}></span>
                                                {cfg.label}
                                            </span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-400 dark:text-zinc-700 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-transparent mt-auto">
                                <Link to="/projetos" className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
                                    Ver todos os projetos
                                    <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* 03 // Notificações recentes */}
                    <section className="md:col-span-2 sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-3 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">03 // Notificações recentes</div>
                        <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden h-full flex flex-col justify-between">
                            <div>
                                {dataLoading ? (
                                    <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                                        {[0,1,2].map(i => (
                                            <div key={i} className="flex items-start gap-4 px-6 py-5">
                                                <div className="sk w-7 h-7 shrink-0 rounded-sm" style={{ animationDelay: `${i * 100}ms` }}></div>
                                                <div className="flex flex-col gap-1.5 flex-1">
                                                    <div className="sk h-3 w-32 rounded-sm" style={{ animationDelay: `${i * 100 + 50}ms` }}></div>
                                                    <div className="sk h-2.5 w-44 rounded-sm" style={{ animationDelay: `${i * 100 + 80}ms` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : notifs.length === 0 ? (
                                    <div className="px-6 py-10 text-center">
                                        <iconify-icon icon="solar:bell-linear" width="32" className="text-zinc-300 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Sem notificações</p>
                                    </div>
                                ) : notifs.map((n, i) => {
                                    const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
                                    const isLast = i === notifs.length - 1;
                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => handleClickNotif(n)}
                                            className={`card-interactive flex items-start gap-4 px-6 py-5 hover:bg-zinc-50 dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-100 dark:border-zinc-900' : ''}`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl dark:rounded-none flex justify-center items-center flex-shrink-0 shadow-sm dark:shadow-none ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                                                <iconify-icon icon={cfg.icon} width="20"></iconify-icon>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-medium mb-0.5 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-900 dark:text-white'}`}>{n.titulo}</div>
                                                <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 truncate">{n.corpo}</div>
                                            </div>
                                            {!n.lida && (
                                                <span className="w-1.5 h-1.5 bg-orange-500 dark:bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(249,115,22,0.5)] dark:shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-transparent mt-auto">
                                <Link to="/notificacoes" className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
                                    Ver todas as notificações
                                    <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 04 // Medições para orçar */}
                {(dataLoading || medicoesPendentes.length > 0) && (
                    <section className="mt-6 sys-reveal sys-delay-300">
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-3 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">
                            04 // Medições para orçar
                        </div>
                        <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-transparent">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Status / Data</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                                    {[0,1].map(i => (
                                        <div key={i} className="flex items-center justify-between px-6 py-4 gap-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="sk w-3.5 h-3.5 rounded-sm"></div>
                                                <div className="sk h-3.5 w-32 rounded-sm" style={{ animationDelay: `${i * 100}ms` }}></div>
                                            </div>
                                            <div className="sk h-5 w-20 rounded-sm" style={{ animationDelay: `${i * 100}ms` }}></div>
                                        </div>
                                    ))}
                                </div>
                            ) : medicoesPendentes.map((m, i) => {
                                const isEnviada   = m.status === 'enviada';
                                const isLast      = i === medicoesPendentes.length - 1;
                                const dataStr     = m.data_medicao
                                    ? new Date(m.data_medicao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—';
                                return (
                                    <div
                                        key={m.id}
                                        onClick={() => navigate(`/projetos/${m.projetos?.id}`)}
                                        className={`card-interactive flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-100 dark:border-zinc-900' : ''}`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <iconify-icon
                                                icon="solar:ruler-pen-linear"
                                                width="14"
                                                className={`shrink-0 ${isEnviada ? 'text-yellow-600 dark:text-yellow-400' : 'text-violet-600 dark:text-violet-400'}`}
                                            ></iconify-icon>
                                            <span className="text-sm font-medium text-zinc-900 dark:text-white truncate group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors">
                                                {m.projetos?.nome ?? '—'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className={`px-2.5 py-0.5 border text-[9px] font-mono uppercase flex items-center gap-1.5 rounded-full dark:rounded-none ${
                                                isEnviada
                                                    ? 'border-yellow-200 dark:border-yellow-400/30 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/5'
                                                    : 'border-violet-200 dark:border-violet-400/30 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/5'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isEnviada ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-violet-500 dark:bg-violet-400'}`}></span>
                                                {isEnviada ? 'Enviada' : 'Processada'}
                                            </span>
                                            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600">{dataStr}</span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-400 dark:text-zinc-700 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

// ── Exportação padrão com Error Boundary ─────────────────────────────────────
export default function DashboardVendedor() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}
