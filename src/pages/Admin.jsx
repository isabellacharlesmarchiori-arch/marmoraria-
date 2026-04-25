import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = v =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function mesAno(date) {
    return `${MESES_CURTOS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

// ── Gráfico SVG inline ────────────────────────────────────────────────────────
const VB_W = 500, VB_H = 220;
const PAD  = { l: 56, r: 20, t: 20, b: 40 };
const PLOT_W = VB_W - PAD.l - PAD.r;
const PLOT_H = VB_H - PAD.t - PAD.b;

function toX(i, total) { return PAD.l + (total <= 1 ? PLOT_W / 2 : (i / (total - 1)) * PLOT_W); }
function toY(v, minV, maxV) {
    const range = maxV - minV;
    if (range === 0) return PAD.t + PLOT_H / 2;
    return PAD.t + ((maxV - v) / range) * PLOT_H;
}

function smooth(points) {
    const t = 0.35;
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) * t;
        const cp1y = p1.y + (p2.y - p0.y) * t;
        const cp2x = p2.x - (p3.x - p1.x) * t;
        const cp2y = p2.y - (p3.y - p1.y) * t;
        d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
}

function FaturamentoChart({ meses, valores }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const svgRef = useRef(null);

    const gridStroke  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    const axisColor   = isDark ? '#52525b' : '#9ca3af';
    const tooltipBg   = isDark ? '#0a0a0a' : '#ffffff';
    const tooltipBord = isDark ? '#3f3f46' : '#e5e7eb';
    const tooltipText = isDark ? '#a1a1aa' : '#6b7280';
    const dotStroke   = isDark ? '#0a0a0a' : '#ffffff';

    const hasData = valores.some(v => v > 0);
    const minV = hasData ? Math.min(...valores) : 0;
    const maxV = hasData ? Math.max(...valores) : 1;

    const pts = valores.map((v, i) => ({
        x: toX(i, valores.length),
        y: toY(v, minV, maxV),
        v,
    }));

    const linePath = pts.length > 1 ? smooth(pts) : `M ${pts[0]?.x ?? 0},${pts[0]?.y ?? PAD.t + PLOT_H / 2}`;
    const areaPath = pts.length > 1
        ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} L ${pts[0].x.toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} Z`
        : '';

    const range = maxV - minV;
    const yGridLines = [0, 1, 2, 3].map(i => {
        const v = minV + (range / 3) * (3 - i);
        return { y: PAD.t + (i / 3) * PLOT_H, label: v > 0 ? `R$${(v / 1000).toFixed(0)}k` : '0' };
    });

    if (!hasData) return (
        <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
                <iconify-icon icon="solar:chart-linear" width="28" className="text-gray-200 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                <p className="font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700">Sem dados no período</p>
            </div>
        </div>
    );

    return (
        <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-full" style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#facc15" stopOpacity="0.12"/>
                    <stop offset="100%" stopColor="#facc15" stopOpacity="0"/>
                </linearGradient>
            </defs>
            {yGridLines.map((gl, i) => (
                <g key={i}>
                    <line x1={PAD.l} y1={gl.y} x2={PAD.l + PLOT_W} y2={gl.y} stroke={gridStroke} strokeWidth="1"/>
                    <text x={PAD.l - 6} y={gl.y + 3.5} textAnchor="end" fill={axisColor} fontSize="9" fontFamily="monospace">{gl.label}</text>
                </g>
            ))}
            {pts.map((pt, i) => (
                <text key={i} x={pt.x} y={PAD.t + PLOT_H + 18} textAnchor="middle" fill={axisColor} fontSize="9" fontFamily="monospace">{meses[i]}</text>
            ))}
            {areaPath && <path d={areaPath} fill="url(#areaGrad)"/>}
            <path d={linePath} fill="none" stroke="#facc15" strokeWidth="1.5" strokeLinecap="round"/>
            {pts.map((pt, i) => (
                <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'default' }}>
                    <rect x={pt.x - 30} y={PAD.t} width="60" height={PLOT_H} fill="transparent"/>
                    <circle cx={pt.x} cy={pt.y} r={hoveredIdx === i ? 0 : 3} fill="#facc15" stroke={dotStroke} strokeWidth="1.5"/>
                </g>
            ))}
            {hoveredIdx !== null && pts[hoveredIdx] && (() => {
                const pt = pts[hoveredIdx];
                const bx = Math.min(pt.x - 40, VB_W - 120);
                return (
                    <g>
                        <line x1={pt.x} y1={PAD.t} x2={pt.x} y2={PAD.t + PLOT_H} stroke={gridStroke} strokeWidth="1" strokeDasharray="3,3"/>
                        <rect x={bx} y={pt.y - 36} width="100" height="30" fill={tooltipBg} stroke={tooltipBord} strokeWidth="1"/>
                        <text x={bx + 50} y={pt.y - 22} textAnchor="middle" fill={tooltipText} fontSize="9" fontFamily="monospace">{meses[hoveredIdx]}</text>
                        <text x={bx + 50} y={pt.y - 11} textAnchor="middle" fill="#facc15" fontSize="10" fontWeight="700" fontFamily="monospace">
                            R${(pt.v / 1000).toFixed(1)}k
                        </text>
                        <circle cx={pt.x} cy={pt.y} r="4" fill="#facc15" stroke={dotStroke} strokeWidth="2"/>
                    </g>
                );
            })()}
        </svg>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DashboardAdmin() {
    const { session, profile } = useAuth();
    const empresaId = profile?.empresa_id;

    const [loading,   setLoading]   = useState(true);
    const [projetos,  setProjetos]  = useState([]);
    const [orcamentos, setOrcamentos] = useState([]);
    const [vendedores, setVendedores] = useState([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!empresaId) return;
        let mounted = true;
        async function fetchData() {
            setLoading(true);
            try {
                const [resP, resO, resV] = await Promise.all([
                    supabase
                        .from('projetos')
                        .select('id, nome, status, created_at, vendedor_id, clientes(nome)')
                        .eq('empresa_id', empresaId)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('orcamentos')
                        .select('id, valor_total, created_at, vendedor_id, ambiente_id, status')
                        .eq('empresa_id', empresaId)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('usuarios')
                        .select('id, nome')
                        .eq('empresa_id', empresaId)
                        .in('perfil', ['vendedor', 'admin']),
                ]);
                if (!mounted) return;
                if (resP.data) setProjetos(resP.data);
                if (resO.data) setOrcamentos(resO.data);
                if (resV.data) setVendedores(resV.data);
            } catch (err) {
                console.error('[Admin] Erro ao carregar dados:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchData();
        return () => { mounted = false; };
    }, [empresaId]);

    // ── Métricas computadas ────────────────────────────────────────────────────
    const metricas = useMemo(() => {
        const agora = new Date();
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
        const fimMes    = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const orcMes = orcamentos.filter(o => o.created_at >= inicioMes && o.created_at <= fimMes);
        const faturamentoMes = orcMes.reduce((s, o) => s + (o.valor_total ?? 0), 0);
        const emProducao = projetos.filter(p => p.status === 'produzindo').length;
        const fechados   = projetos.filter(p => ['aprovado', 'produzindo', 'entregue'].includes(p.status)).length;
        const taxa       = projetos.length > 0 ? ((fechados / projetos.length) * 100).toFixed(1) : '0,0';

        return [
            { label: 'Faturamento do mês',     valor: fmtBRL(faturamentoMes), detalhe: `${orcMes.length} orçamento(s) emitido(s)`,            icon: 'solar:wallet-money-linear',  destaque: faturamentoMes > 0 },
            { label: 'Orçamentos gerados',      valor: String(orcMes.length),  detalhe: `${orcamentos.length} no total`,                       icon: 'solar:document-text-linear', destaque: false },
            { label: 'Taxa de fechamento',      valor: taxa, unidade: '%',     detalhe: `${fechados} projeto(s) fechado(s) / aprovado(s)`,      icon: 'solar:chart-linear',         destaque: parseFloat(taxa.replace(',', '.')) > 0 },
            { label: 'Projetos em produção',    valor: String(emProducao),     detalhe: `${projetos.length} projeto(s) total`,                  icon: 'solar:layers-linear',        destaque: false },
        ];
    }, [projetos, orcamentos]);

    // ── Ranking de vendedores ──────────────────────────────────────────────────
    const ranking = useMemo(() => {
        const mapa = {};
        for (const o of orcamentos) {
            if (!o.vendedor_id) continue;
            if (!mapa[o.vendedor_id]) mapa[o.vendedor_id] = { total: 0, orcamentos: 0 };
            mapa[o.vendedor_id].total      += o.valor_total ?? 0;
            mapa[o.vendedor_id].orcamentos += 1;
        }
        const fechadosPorVend = {};
        for (const p of projetos) {
            if (!p.vendedor_id || !['aprovado','produzindo','entregue'].includes(p.status)) continue;
            fechadosPorVend[p.vendedor_id] = (fechadosPorVend[p.vendedor_id] ?? 0) + 1;
        }
        return Object.entries(mapa)
            .map(([id, d]) => {
                const vend = vendedores.find(v => v.id === id);
                const nome = vend?.nome ?? 'Vendedor';
                const iniciais = nome.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const fech = fechadosPorVend[id] ?? 0;
                const taxa = d.orcamentos > 0 ? ((fech / d.orcamentos) * 100).toFixed(1) + '%' : '—';
                return { id, nome, iniciais, total: d.total, orcamentos: d.orcamentos, fechados: fech, taxa };
            })
            .sort((a, b) => b.total - a.total);
    }, [orcamentos, projetos, vendedores]);

    // ── Gráfico: últimos 6 meses ───────────────────────────────────────────────
    const { chartMeses, chartValores } = useMemo(() => {
        const agora = new Date();
        const meses = [];
        const valores = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
            const inicioM = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
            const fimM    = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
            const soma = orcamentos
                .filter(o => o.created_at >= inicioM && o.created_at <= fimM)
                .reduce((s, o) => s + (o.valor_total ?? 0), 0);
            meses.push(mesAno(d));
            valores.push(soma);
        }
        return { chartMeses: meses, chartValores: valores };
    }, [orcamentos]);

    const totalPeriodo = chartValores.reduce((s, v) => s + v, 0);
    const melhorMesIdx = chartValores.indexOf(Math.max(...chartValores));
    const piorMesIdx   = chartValores.indexOf(Math.min(...chartValores.filter(v => v > 0)));

    // ── Últimos fechamentos ────────────────────────────────────────────────────
    const ultimosFechamentos = useMemo(() => {
        return projetos
            .filter(p => ['aprovado', 'produzindo', 'entregue'].includes(p.status))
            .slice(0, 5)
            .map(p => {
                const vend = vendedores.find(v => v.id === p.vendedor_id);
                return {
                    cliente:   p.clientes?.nome ?? '—',
                    projeto:   p.nome,
                    vendedora: vend?.nome ?? '—',
                    data:      p.created_at
                        ? new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—',
                };
            });
    }, [projetos, vendedores]);

    if (!session || !profile) return (
        <div className="p-8 min-h-screen bg-gray-100 dark:bg-[#050505] text-gray-500 dark:text-[#a1a1aa] font-mono text-[10px] uppercase tracking-widest flex items-center justify-center">
            Carregando...
        </div>
    );

    return (
        <div className="bg-gray-100 dark:bg-[#050505] text-gray-700 dark:text-[#a1a1aa] selection:bg-gray-900 selection:text-white dark:selection:bg-white dark:selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">

            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

                {/* ── 01 // Métricas ──────────────────────────────────── */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-200 dark:border-zinc-800 w-max px-2 py-1">
                        01 // Métricas do mês
                    </div>
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-800">
                            {[0,1,2,3].map(i => (
                                <div key={i} className="bg-gray-50 dark:bg-[#0a0a0a] p-5 h-[100px] animate-pulse">
                                    <div className="h-2 w-24 bg-gray-200 dark:bg-zinc-800 mb-3"></div>
                                    <div className="h-6 w-16 bg-gray-200 dark:bg-zinc-800"></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-800">
                            {metricas.map((m, i) => (
                                <div key={i} className="bg-gray-50 dark:bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
                                    <iconify-icon icon={m.icon} width="16" className="text-gray-200 dark:text-zinc-700 absolute top-5 right-5"></iconify-icon>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-2">{m.label}</div>
                                    <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline gap-1">
                                        <span className={m.destaque ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}>{m.valor}</span>
                                        {m.unidade && <span className="text-gray-400 dark:text-zinc-500 text-lg font-normal">{m.unidade}</span>}
                                    </div>
                                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{m.detalhe}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Grid médio: Ranking + Gráfico ───────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">

                    {/* 02 // Ranking */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-200 dark:border-zinc-800 w-max px-2 py-1">
                            02 // Ranking — vendedores
                        </div>
                        <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-200 dark:border-zinc-800">
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-200 dark:border-zinc-800">
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nome</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Total orçado</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Orç.</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Fech.</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Taxa</span>
                            </div>

                            {loading ? (
                                <div className="p-6 space-y-3">
                                    {[0,1,2].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-zinc-900 animate-pulse"></div>)}
                                </div>
                            ) : ranking.length === 0 ? (
                                <div className="py-12 text-center">
                                    <iconify-icon icon="solar:users-group-two-rounded-linear" width="28" className="text-gray-200 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-300 dark:text-zinc-700">Nenhum dado disponível</p>
                                </div>
                            ) : (
                                <>
                                    {ranking.map((r, i) => (
                                        <div key={r.id} className={`grid grid-cols-12 items-center px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.015] transition-colors ${i < ranking.length - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}>
                                            <div className="col-span-4 flex items-center gap-2.5">
                                                <span className={`font-mono text-[9px] w-4 text-right shrink-0 ${i === 0 ? 'text-yellow-600 dark:text-yellow-400 font-bold' : 'text-gray-300 dark:text-zinc-700'}`}>{i + 1}</span>
                                                <div className="w-6 h-6 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center font-mono text-[8px] text-gray-500 dark:text-zinc-400 shrink-0">{r.iniciais}</div>
                                                <span className="text-sm text-gray-900 dark:text-white font-medium truncate">{r.nome}</span>
                                            </div>
                                            <div className="col-span-3 text-right">
                                                <span className={`font-mono text-[11px] font-bold ${i === 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>{fmtBRL(r.total)}</span>
                                            </div>
                                            <div className="col-span-2 text-right"><span className="font-mono text-[11px] text-gray-500 dark:text-zinc-400">{r.orcamentos}</span></div>
                                            <div className="col-span-1 text-right"><span className="font-mono text-[11px] text-gray-500 dark:text-zinc-400">{r.fechados}</span></div>
                                            <div className="col-span-2 text-right"><span className="font-mono text-[11px] text-gray-400 dark:text-zinc-500">{r.taxa}</span></div>
                                        </div>
                                    ))}
                                    <div className="px-4 py-4 border-t border-gray-200 dark:border-zinc-800 flex flex-col gap-2.5">
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 mb-1">Distribuição de vendas</div>
                                        {ranking.map((r, i) => {
                                            const max = ranking[0]?.total || 1;
                                            const pct = (r.total / max) * 100;
                                            return (
                                                <div key={r.id} className="flex items-center gap-3">
                                                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 w-16 shrink-0 truncate">{r.nome.split(' ')[0]}</span>
                                                    <div className="flex-1 h-[3px] bg-gray-100 dark:bg-zinc-900">
                                                        <div className={`h-full transition-all duration-700 ${i === 0 ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-gray-300 dark:bg-zinc-600'}`} style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 w-6 text-right shrink-0">{Math.round(pct)}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {/* 03 // Gráfico de faturamento */}
                    <section className="md:col-span-2 sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-2 uppercase tracking-widest border border-gray-200 dark:border-zinc-800 w-max px-2 py-1">
                            03 // Faturamento — 6 meses
                        </div>
                        <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-200 dark:border-zinc-800 h-full flex flex-col">
                            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                                <div>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Período</div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">
                                        {chartMeses[0]} — {chartMeses[chartMeses.length - 1]}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Total período</div>
                                    <div className="font-mono text-sm font-bold text-yellow-600 dark:text-yellow-400">{fmtBRL(totalPeriodo)}</div>
                                </div>
                            </div>
                            <div className="flex-1 px-2 pb-3 pt-1 min-h-[180px]">
                                <FaturamentoChart meses={chartMeses} valores={chartValores} />
                            </div>
                            <div className="grid grid-cols-2 border-t border-gray-200 dark:border-zinc-800">
                                <div className="px-4 py-3 border-r border-gray-200 dark:border-zinc-800">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">Melhor mês</div>
                                    {chartValores[melhorMesIdx] > 0 ? (
                                        <>
                                            <div className="text-gray-900 dark:text-white font-semibold text-sm">{chartMeses[melhorMesIdx]}</div>
                                            <div className="font-mono text-[10px] text-yellow-600 dark:text-yellow-400">{fmtBRL(chartValores[melhorMesIdx])}</div>
                                        </>
                                    ) : <div className="text-gray-400 dark:text-zinc-700 font-mono text-[10px]">—</div>}
                                </div>
                                <div className="px-4 py-3">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">Menor mês</div>
                                    {piorMesIdx >= 0 && chartValores[piorMesIdx] > 0 ? (
                                        <>
                                            <div className="text-gray-900 dark:text-white font-semibold text-sm">{chartMeses[piorMesIdx]}</div>
                                            <div className="font-mono text-[10px] text-gray-400 dark:text-zinc-500">{fmtBRL(chartValores[piorMesIdx])}</div>
                                        </>
                                    ) : <div className="text-gray-400 dark:text-zinc-700 font-mono text-[10px]">—</div>}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ── 04 // Últimos projetos aprovados ────────────────── */}
                <section className="sys-reveal sys-delay-300">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-200 dark:border-zinc-800 w-max px-2 py-1">
                            04 // Últimos fechamentos
                        </div>
                        <a href="/admin/financeiro" className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors flex items-center gap-2">
                            Ver extrato completo
                            <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                        </a>
                    </div>

                    <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-200 dark:border-zinc-800">
                        <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-200 dark:border-zinc-800">
                            <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Cliente</span>
                            <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Projeto</span>
                            <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Vendedor</span>
                            <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Data</span>
                        </div>

                        {loading ? (
                            <div className="p-6 space-y-3">
                                {[0,1,2].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-zinc-900 animate-pulse"></div>)}
                            </div>
                        ) : ultimosFechamentos.length === 0 ? (
                            <div className="py-12 text-center">
                                <iconify-icon icon="solar:check-circle-linear" width="28" className="text-gray-200 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-300 dark:text-zinc-700">Nenhum fechamento registrado</p>
                            </div>
                        ) : (
                            ultimosFechamentos.map((f, i) => (
                                <div key={i} className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.015] transition-colors ${i < ultimosFechamentos.length - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}>
                                    <div className="col-span-3 text-sm text-gray-900 dark:text-white font-medium truncate pr-2">{f.cliente}</div>
                                    <div className="col-span-4 font-mono text-[10px] text-gray-400 dark:text-zinc-500 truncate pr-2">{f.projeto}</div>
                                    <div className="col-span-3 flex items-center gap-1.5">
                                        <div className="w-5 h-5 bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 flex items-center justify-center font-mono text-[7px] text-gray-500 dark:text-zinc-400 shrink-0">
                                            {f.vendedora.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                                        </div>
                                        <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-500 truncate">{f.vendedora.split(' ')[0]}</span>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{f.data}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

            </main>
        </div>
    );
}
