import React, { useEffect, useState, Component, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',      bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
    aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-400/5',  dot: 'bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-400/5',    dot: 'bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-400/5',     dot: 'bg-red-400'    },
};

const TIPO_CONFIG = {
    medicao_processada: { icon: 'solar:ruler-pen-linear',    cor: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
    medicao_agendada:   { icon: 'solar:calendar-linear',     cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
    projeto_aprovado:   { icon: 'solar:check-circle-linear', cor: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20'  },
    status_atualizado:  { icon: 'solar:layers-linear',       cor: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'   },
    novo_fechamento:    { icon: 'solar:wallet-money-linear', cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
    projeto_perdido:    { icon: 'solar:close-circle-linear', cor: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20'    },
};

// ── Error Boundary — captura falhas de renderização e exibe mensagem amigável ───────────────
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
        <div style={{
          minHeight: '100vh', background: '#050505', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '12px', padding: '32px'
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#52525b',
            textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
            // dashboard — erro de renderização
          </div>
          <div style={{ width: '32px', height: '2px', background: '#ef4444' }} />
          <p style={{ color: '#a1a1aa', fontFamily: 'monospace', fontSize: '11px',
            textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
            O painel não pôde ser carregado. Tente recarregar a página.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.12em', color: '#facc15', background: 'transparent',
              border: '1px solid rgba(250,204,21,0.3)', padding: '8px 16px', cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Skeleton de Loading ──────────────────────────────────────────────────
function SkeletonDashboard() {
  return (
    <div style={{
      minHeight: '100vh', background: '#050505', padding: '32px',
      display: 'flex', flexDirection: 'column', gap: '16px'
    }}>
      {/* Label */}
      <div style={{ width: '160px', height: '22px', background: '#18181b', animation: 'pulse 1.5s ease-in-out infinite' }} />
      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#27272a' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ background: '#0a0a0a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ width: '80px', height: '10px', background: '#27272a', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: '60px', height: '32px', background: '#27272a', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: '120px', height: '9px', background: '#18181b', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        ))}
      </div>
      {/* Grid inferior */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', marginTop: '4px' }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #27272a', height: '280px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ background: '#0a0a0a', border: '1px solid #27272a', height: '280px', animation: 'pulse 1.5s ease-in-out infinite' }} />
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

    // Guard: aguarda hidratação completa da session e do perfil
    const isReady = !loading && !profileLoading && !!session && !!profile;

    // Diagnóstico — remove após confirmar que não há travamento
    console.log('[Dashboard] loading:', loading, '| profileLoading:', profileLoading,
                '| session:', !!session, '| profile:', !!profile, '| isReady:', isReady);

    // Intersection Observer — só reconecta quando a autenticação muda (não por dados)
    useEffect(() => {
        if (!isReady) return;
        const observer = new IntersectionObserver(
            entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [isReady]);

    // ── Hidratação do cache ─────────────────────────────────────────────────
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

    // Busca projetos recentes e notificações do usuário
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
                // allSettled: uma query lenta não bloqueia as outras
                const [projRes, notifRes, medRes] = await Promise.allSettled([
                    supabase
                        .from('projetos')
                        .select('id, nome, status, created_at, clientes(nome)')
                        .eq('empresa_id', profile.empresa_id)
                        .order('created_at', { ascending: false })
                        .limit(5),
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

                // ── Persiste cache ──────────────────────────────────────────
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
        // Marca como lida se ainda não estiver
        if (!n.lida) {
            await supabase.from('notificacoes').update({ lida: true }).eq('id', n.id);
            setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x));
        }
        if (n.projeto_id) navigate(`/projetos/${n.projeto_id}`);
        else navigate('/notificacoes');
    }

    // ── Loading Guard ──
    if (!isReady) return <SkeletonDashboard />;

    // Medidores não pertencem ao dashboard — redireciona para o painel deles
    const perfil = profile?.role || profile?.perfil;
    if (perfil === 'medidor') return <Navigate to="/medidor/agenda" replace />;

    return (
        <div className="page-enter bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">
            {/* Backgrounds globais */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">
                {/* 01 // Métricas do mês */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">01 // Métricas do mês</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:document-text-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Orçamentos</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">—</div>
                            <div className="font-mono text-[9px] text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:check-square-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Fechados</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">—</div>
                            <div className="font-mono text-[9px] text-zinc-600">Em breve</div>
                        </div>
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:chart-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Taxa de Fechamento</div>
                            <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline">
                                <span className="text-zinc-600">—</span>
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">Em breve</div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

                    {/* 02 // Projetos recentes */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">02 // Projetos recentes</div>
                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-zinc-900">
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
                                    <iconify-icon icon="solar:layers-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto ainda</p>
                                </div>
                            ) : projetos.map((p, i) => {
                                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.orcado;
                                const isLast = i === projetos.length - 1;
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => navigate(`/projetos/${p.id}`)}
                                        className={`card-interactive flex items-center justify-between px-4 py-3 hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-900' : ''}`}
                                    >
                                        <div>
                                            <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">{p.nome}</div>
                                            <div className="font-mono text-[10px] text-zinc-600">{p.clientes?.nome ?? '—'}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5`}>
                                                <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
                                                {cfg.label}
                                            </span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="px-4 py-3 border-t border-zinc-800">
                                <Link to="/projetos" className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
                                    Ver todos os projetos
                                    <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* 03 // Notificações recentes */}
                    <section className="md:col-span-2 sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">03 // Notificações recentes</div>
                        <div className="bg-[#0a0a0a] border border-zinc-800 h-full flex flex-col justify-between">
                            <div>
                                {dataLoading ? (
                                    <div className="flex flex-col divide-y divide-zinc-900">
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
                                        <iconify-icon icon="solar:bell-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Sem notificações</p>
                                    </div>
                                ) : notifs.map((n, i) => {
                                    const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
                                    const isLast = i === notifs.length - 1;
                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => handleClickNotif(n)}
                                            className={`card-interactive flex items-start gap-3 px-4 py-3 hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-900' : ''}`}
                                        >
                                            <div className={`w-[28px] h-[28px] flex justify-center items-center flex-shrink-0 ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                                                <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-medium mb-0.5 group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-zinc-300' : 'text-white'}`}>{n.titulo}</div>
                                                <div className="font-mono text-[10px] text-zinc-600 truncate">{n.descricao}</div>
                                            </div>
                                            {!n.lida && (
                                                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="px-4 py-3 border-t border-zinc-800">
                                <Link to="/notificacoes" className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 hover:text-yellow-400 transition-colors flex items-center gap-2 w-max">
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
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                            04 // Medições para orçar
                        </div>
                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status / Data</span>
                            </div>

                            {dataLoading ? (
                                <div className="flex flex-col divide-y divide-zinc-900">
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
                                        className={`card-interactive flex items-center justify-between px-4 py-3 hover:bg-white/[0.01] cursor-pointer group ${!isLast ? 'border-b border-zinc-900' : ''}`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <iconify-icon
                                                icon="solar:ruler-pen-linear"
                                                width="14"
                                                className={`shrink-0 ${isEnviada ? 'text-yellow-400' : 'text-violet-400'}`}
                                            ></iconify-icon>
                                            <span className="text-sm font-medium text-white truncate group-hover:text-yellow-400 transition-colors">
                                                {m.projetos?.nome ?? '—'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className={`px-2 py-0.5 border text-[9px] font-mono uppercase flex items-center gap-1.5 ${
                                                isEnviada
                                                    ? 'border-yellow-400/30 text-yellow-400 bg-yellow-400/5'
                                                    : 'border-violet-400/30 text-violet-400 bg-violet-400/5'
                                            }`}>
                                                <span className={`w-1 h-1 rounded-full animate-pulse ${isEnviada ? 'bg-yellow-400' : 'bg-violet-400'}`}></span>
                                                {isEnviada ? 'Enviada' : 'Processada'}
                                            </span>
                                            <span className="font-mono text-[10px] text-zinc-600">{dataStr}</span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
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

// ── Exportação padrão com Error Boundary ──────────────────────────────────────
export default function DashboardVendedor() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}
