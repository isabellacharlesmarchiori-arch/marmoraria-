import React, { useEffect, useState, Component, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-zinc-600 dark:text-zinc-400',    border: 'border-zinc-300 dark:border-zinc-700',       bg: 'bg-gray-100 dark:bg-zinc-900',      dot: 'bg-zinc-400 dark:bg-zinc-500'    },
    aprovado:   { label: 'Aprovado',   color: 'text-green-700 dark:text-green-400',  border: 'border-green-400/40 dark:border-green-500/30', bg: 'bg-green-50 dark:bg-green-400/5',   dot: 'bg-green-500 dark:bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-700 dark:text-violet-400', border: 'border-violet-400/40 dark:border-violet-500/30', bg: 'bg-violet-50 dark:bg-violet-400/5', dot: 'bg-violet-500 dark:bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-700 dark:text-blue-400',    border: 'border-blue-400/40 dark:border-blue-500/30',   bg: 'bg-blue-50 dark:bg-blue-400/5',    dot: 'bg-blue-500 dark:bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-700 dark:text-red-400',      border: 'border-red-400/40 dark:border-red-500/30',     bg: 'bg-red-50 dark:bg-red-400/5',      dot: 'bg-red-500 dark:bg-red-400'     },
};

const TIPO_CONFIG = {
    medicao_processada: { icon: 'solar:ruler-pen-linear',    cor: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-400/10', border: 'border-violet-300 dark:border-violet-400/20' },
    medicao_agendada:   { icon: 'solar:calendar-linear',     cor: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-400/10', border: 'border-yellow-300 dark:border-yellow-400/20' },
    projeto_aprovado:   { icon: 'solar:check-circle-linear', cor: 'text-green-700 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-400/10',   border: 'border-green-300 dark:border-green-400/20'  },
    status_atualizado:  { icon: 'solar:layers-linear',       cor: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-400/10',     border: 'border-blue-300 dark:border-blue-400/20'   },
    novo_fechamento:    { icon: 'solar:wallet-money-linear', cor: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-400/10', border: 'border-yellow-300 dark:border-yellow-400/20' },
    projeto_perdido:    { icon: 'solar:close-circle-linear', cor: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-400/10',       border: 'border-red-300 dark:border-red-400/20'    },
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
        <div className="min-h-screen bg-gray-100 dark:bg-[#050505] flex flex-col items-center justify-center gap-3 p-8">
          <div className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-[0.15em] mb-2">
            // dashboard — erro de renderização
          </div>
          <div className="w-8 h-0.5 bg-red-500" />
          <p className="text-gray-600 dark:text-[#a1a1aa] font-mono text-[11px] text-center max-w-xs leading-relaxed">
            O painel não pôde ser carregado. Tente recarregar a página.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-yellow-600 dark:text-yellow-400 bg-transparent border border-yellow-500/30 dark:border-yellow-400/30 px-4 py-2 cursor-pointer hover:border-yellow-500 dark:hover:border-yellow-400"
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
    <div className="min-h-screen bg-gray-100 dark:bg-[#050505] p-8 flex flex-col gap-4">
      <div className="sk h-5 w-40 rounded-sm" />
      <div className="grid grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-100 dark:bg-[#0a0a0a] p-5 flex flex-col gap-2.5">
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

    console.log('[Dashboard] loading:', loading, '| profileLoading:', profileLoading,
                '| session:', !!session, '| profile:', !!profile, '| isReady:', isReady);

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

                console.log('[Dashboard] dados chegaram — projetos:', projData?.length ?? 0,
                            '| notifs:', notifData?.length ?? 0, '| medicoes:', medData?.length ?? 0);

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
    if (perfil === 'medidor') return <Navigate to="/medidor/agenda" replace />;

    return (
        <div className="page-enter bg-gray-100 dark:bg-[#050505] text-gray-700 dark:text-[#a1a1aa] selection:bg-gray-900 selection:text-white dark:selection:bg-gray-50 dark:selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">
            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">
                {/* 01 // Métricas do mês */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">01 // Métricas do mês</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:document-text-linear" width="16" className="text-gray-200 dark:text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">Orçamentos</div>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white tracking-tighter mb-1">—</div>
                            <div className="font-mono text-[9px] text-gray-400 dark:text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:check-square-linear" width="16" className="text-gray-200 dark:text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">Fechados</div>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white tracking-tighter mb-1">—</div>
                            <div className="font-mono text-[9px] text-gray-400 dark:text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:chart-linear" width="16" className="text-gray-200 dark:text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">Taxa de Fechamento</div>
                            <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline">
                                <span className="text-gray-400 dark:text-zinc-600">—</span>
                            </div>
                            <div className="font-mono text-[9px] text-gray-400 dark:text-zinc-600">Em breve</div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

                    {/* 02 // Projetos recentes */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">02 // Projetos recentes</div>
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-zinc-800">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Status</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-gray-100 dark:divide-zinc-900">
                                    {[0,1,2,3,4].map(i => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3 gap-4">
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <div className="sk h-3.5 w-36 rounded-sm" style={{ animationDelay: `${i * 80}ms` }}></div>
                                                <div className="sk h-2.5 w-24 rounded-sm" style={{ animationDelay: `${i * 80 + 40}ms` }}></div>
                                            </div>
                                            <div className="sk h-5 w-16 rounded-sm" style={{ animationDelay: `${i * 80}ms` }}></div>
                                        </div>
                                    ))}
                                </div>
                            ) : projetos.length === 0 ? (
                                <div className="px-4 py-10 text-center">
                                    <iconify-icon icon="solar:layers-linear" width="32" className="text-gray-200 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-300 dark:text-zinc-700">Nenhum projeto ainda</p>
                                </div>
                            ) : projetos.map((p, i) => {
                                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.orcado;
                                const isLast = i === projetos.length - 1;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => navigate(`/projetos/${p.id}`)}
                                        className={`card-interactive flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
                                    >
                                        <div>
                                            <div className="font-medium text-sm text-gray-900 dark:text-white mb-0.5 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{p.nome}</div>
                                            <div className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">{p.clientes?.nome ?? '—'}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5`}>
                                                <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
                                                {cfg.label}
                                            </span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-gray-300 dark:text-zinc-700 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="px-4 py-3 border-t border-gray-300 dark:border-zinc-800">
                                <Link to="/projetos" className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
                                    Ver todos os projetos
                                    <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* 03 // Notificações recentes */}
                    <section className="md:col-span-2 sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">03 // Notificações recentes</div>
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 h-full flex flex-col justify-between">
                            <div>
                                {dataLoading ? (
                                    <div className="flex flex-col divide-y divide-gray-100 dark:divide-zinc-900">
                                        {[0,1,2].map(i => (
                                            <div key={i} className="flex items-start gap-3 px-4 py-3">
                                                <div className="sk w-7 h-7 shrink-0 rounded-sm" style={{ animationDelay: `${i * 100}ms` }}></div>
                                                <div className="flex flex-col gap-1.5 flex-1">
                                                    <div className="sk h-3 w-32 rounded-sm" style={{ animationDelay: `${i * 100 + 50}ms` }}></div>
                                                    <div className="sk h-2.5 w-44 rounded-sm" style={{ animationDelay: `${i * 100 + 80}ms` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : notifs.length === 0 ? (
                                    <div className="px-4 py-10 text-center">
                                        <iconify-icon icon="solar:bell-linear" width="32" className="text-gray-200 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-300 dark:text-zinc-700">Sem notificações</p>
                                    </div>
                                ) : notifs.map((n, i) => {
                                    const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
                                    const isLast = i === notifs.length - 1;
                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => handleClickNotif(n)}
                                            className={`card-interactive flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
                                        >
                                            <div className={`w-[28px] h-[28px] flex justify-center items-center flex-shrink-0 ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                                                <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-medium mb-0.5 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-gray-600 dark:text-zinc-300' : 'text-gray-900 dark:text-white'}`}>{n.titulo}</div>
                                                <div className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 truncate">{n.corpo}</div>
                                            </div>
                                            {!n.lida && (
                                                <span className="w-1.5 h-1.5 bg-yellow-500 dark:bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="px-4 py-3 border-t border-gray-300 dark:border-zinc-800">
                                <Link to="/notificacoes" className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
                                    Ver todas as notificações
                                    <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 04 // Medições para orçar */}
                {(dataLoading || medicoesPendentes.length > 0) && (
                    <section className="mt-4 sys-reveal sys-delay-300">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                            04 // Medições para orçar
                        </div>
                        <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-zinc-800">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Status / Data</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-gray-100 dark:divide-zinc-900">
                                    {[0,1].map(i => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3 gap-4">
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
                                        className={`card-interactive flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <iconify-icon
                                                icon="solar:ruler-pen-linear"
                                                width="14"
                                                className={`shrink-0 ${isEnviada ? 'text-yellow-600 dark:text-yellow-400' : 'text-violet-600 dark:text-violet-400'}`}
                                            ></iconify-icon>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
                                                {m.projetos?.nome ?? '—'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className={`px-2 py-0.5 border text-[9px] font-mono uppercase flex items-center gap-1.5 ${
                                                isEnviada
                                                    ? 'border-yellow-400/40 dark:border-yellow-400/30 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/5'
                                                    : 'border-violet-400/40 dark:border-violet-400/30 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-400/5'
                                            }`}>
                                                <span className={`w-1 h-1 rounded-full animate-pulse ${isEnviada ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-violet-500 dark:bg-violet-400'}`}></span>
                                                {isEnviada ? 'Enviada' : 'Processada'}
                                            </span>
                                            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">{dataStr}</span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-gray-300 dark:text-zinc-700 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors"></iconify-icon>
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
