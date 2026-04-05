import React, { useEffect, useState, Component } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

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
    const [dataLoading, setDataLoading] = useState(true);

    // Guard: aguarda hidratação completa da session e do perfil
    const isReady = !loading && !profileLoading && !!session && !!profile;

    // Intersection Observer — só executa quando os dados estiverem prontos
    useEffect(() => {
        if (!isReady) return;

        const observerOptions = {
            root: null,
            rootMargin: '0px 0px -10% 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('sys-active');
                }
            });
        }, observerOptions);

        const revealElements = document.querySelectorAll('.sys-reveal');
        revealElements.forEach(el => observer.observe(el));

        return () => observer.disconnect();
    }, [isReady]);

    // Busca de dados da empresa — só dispara quando user.id e empresa_id estão disponíveis
    useEffect(() => {
        if (!session?.user?.id || !profile?.empresa_id) return;

        let isMounted = true;

        async function fetchData() {
            if (!isMounted) return;
            try {
                setDataLoading(true);
                // Métricas futuras:
                // const { data } = await supabase.from('metricas')....
            } catch (error) {
                if (!isMounted) return;
                console.error('[Dashboard] Erro ao buscar dados:', error);
            } finally {
                if (isMounted) setDataLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, [session?.user?.id, profile?.empresa_id]);

    // ── Loading Guard: tela preta nunca acontece — exibe skeleton enquanto hidrata ──
    if (!isReady) {
        return <SkeletonDashboard />;
    }

    return (
        <div className="bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">
            {/* Backgrounds globais */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">
                {/* 01 // Métricas do mês */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">01 // Métricas do mês</div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
                        {/* Card 1 — Orçamentos este mês */}
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:document-text-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Orçamentos</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">24</div>
                            <div className="font-mono text-[9px] text-green-400">↑ 12% em relação ao mês anterior</div>
                        </div>

                        {/* Card 2 — Projetos fechados este mês */}
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:check-square-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Fechados</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">8</div>
                            <div className="font-mono text-[9px] text-zinc-600">- Igual ao mês anterior</div>
                        </div>

                        {/* Card 3 — Taxa de fechamento */}
                        <div className="bg-[#0a0a0a] p-5 hover:border-zinc-700 hover:-translate-y-0.5 transition-all relative group">
                            <iconify-icon icon="solar:chart-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Taxa de Fechamento</div>
                            <div className="text-3xl font-bold tracking-tighter mb-1 relative flex items-baseline">
                                <span className="text-yellow-400">33.3</span>
                                <span className="text-zinc-500 text-lg font-normal ml-1">%</span>
                            </div>
                            <div className="font-mono text-[9px] text-red-400">↓ 2% em relação ao mês anterior</div>
                        </div>
                    </div>
                </section>

                {/* Grid inferior */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    
                    {/* 02 // Projetos recentes */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">02 // Projetos recentes</div>
                        
                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                            </div>

                            {/* Lista de projetos */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer group transition-colors">
                                <div>
                                    <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">Bancada Cozinha Silestone</div>
                                    <div className="font-mono text-[10px] text-zinc-600">Arch & Co. Arquitetura</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-0.5 border border-zinc-700 text-[9px] font-mono uppercase text-zinc-400 bg-zinc-900 flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> Orçado
                                    </span>
                                    <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer group transition-colors">
                                <div>
                                    <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">Lavabo Travertino Romano</div>
                                    <div className="font-mono text-[10px] text-zinc-600">Roberto Santos Dias</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-0.5 border border-green-500/30 text-[9px] font-mono uppercase text-green-400 bg-green-400/5 flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-green-400 rounded-full"></span> Aprovado
                                    </span>
                                    <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer group transition-colors">
                                <div>
                                    <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">Ilha Gourmet Dekton Entzo</div>
                                    <div className="font-mono text-[10px] text-zinc-600">Studio Novaes</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-0.5 border border-violet-500/30 text-[9px] font-mono uppercase text-violet-400 bg-violet-400/5 flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-violet-400 rounded-full"></span> Produzindo
                                    </span>
                                    <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer group transition-colors">
                                <div>
                                    <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">Piso Sala Quartzo Branco</div>
                                    <div className="font-mono text-[10px] text-zinc-600">Condomínio Alpha</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-0.5 border border-blue-500/30 text-[9px] font-mono uppercase text-blue-400 bg-blue-400/5 flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-blue-400 rounded-full"></span> Entregue
                                    </span>
                                    <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.01] cursor-pointer group transition-colors">
                                <div>
                                    <div className="font-medium text-sm text-white mb-0.5 group-hover:text-yellow-400 transition-colors">Escada Granito São Gabriel</div>
                                    <div className="font-mono text-[10px] text-zinc-600">Construtora LR</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="px-2 py-0.5 border border-red-500/30 text-[9px] font-mono uppercase text-red-400 bg-red-400/5 flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-red-400 rounded-full"></span> Perdido
                                    </span>
                                    <iconify-icon icon="solar:arrow-right-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors"></iconify-icon>
                                </div>
                            </div>

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
                                {/* Notificação 1 */}
                                <div className="flex items-start gap-3 px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer transition-colors group">
                                    <div className="w-[28px] h-[28px] flex justify-center items-center flex-shrink-0 bg-violet-400/10 border border-violet-400/20 text-violet-400">
                                        <iconify-icon icon="solar:ruler-pen-linear" width="16"></iconify-icon>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-white font-medium mb-0.5 group-hover:text-yellow-400 transition-colors">Medição processada</div>
                                        <div className="font-mono text-[10px] text-zinc-600">Bancada Cozinha Silestone</div>
                                    </div>
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                </div>

                                {/* Notificação 2 */}
                                <div className="flex items-start gap-3 px-4 py-3 border-b border-zinc-900 hover:bg-white/[0.01] cursor-pointer transition-colors group">
                                    <div className="w-[28px] h-[28px] flex justify-center items-center flex-shrink-0 bg-green-400/8 border border-green-400/20 text-green-400">
                                        <iconify-icon icon="solar:check-circle-linear" width="16"></iconify-icon>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-white font-medium mb-0.5 group-hover:text-yellow-400 transition-colors">Projeto aprovado</div>
                                        <div className="font-mono text-[10px] text-zinc-600">Lavabo Travertino Romano</div>
                                    </div>
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                </div>

                                {/* Notificação 3 */}
                                <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.01] cursor-pointer transition-colors group">
                                    <div className="w-[28px] h-[28px] flex justify-center items-center flex-shrink-0 bg-yellow-400/8 border border-yellow-400/20 text-yellow-400">
                                        <iconify-icon icon="solar:calendar-linear" width="16"></iconify-icon>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-white font-medium mb-0.5 group-hover:text-yellow-400 transition-colors">Medição agendada</div>
                                        <div className="font-mono text-[10px] text-zinc-600">Ilha Gourmet Dekton Entzo</div>
                                    </div>
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full flex-shrink-0 mt-1 shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                                </div>
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

                {/* Section hidden reference as skeletons for Loading States as required in spec */}
                <div className="hidden mt-12 sys-reveal sys-delay-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#0a0a0a] border border-zinc-800 p-5">
                            <div className="h-4 w-24 bg-zinc-800 animate-pulse mb-3"></div>
                            <div className="h-8 w-16 bg-zinc-800 animate-pulse mb-2"></div>
                            <div className="h-3 w-20 bg-zinc-800 animate-pulse"></div>
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
                              <div>
                                <div className="h-3 w-40 bg-zinc-800 animate-pulse mb-2"></div>
                                <div className="h-2 w-24 bg-zinc-800 animate-pulse"></div>
                              </div>
                              <div className="h-5 w-16 bg-zinc-800 animate-pulse"></div>
                            </div>
                            <div className="px-4 py-10 text-center">
                                <iconify-icon icon="solar:layers-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto ainda</p>
                            </div>
                        </div>
                    </div>
                </div>

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
