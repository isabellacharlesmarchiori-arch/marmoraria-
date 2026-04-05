import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

// ── Dados mock ──────────────────────────────────────────────────────────────

const metricas = [
    {
        label: 'Faturamento do mês',
        valor: 'R$ 61.200',
        detalhe: '↑ 6,6% em relação ao mês anterior',
        tendencia: 'up',
        icon: 'solar:wallet-money-linear',
    },
    {
        label: 'Orçamentos gerados',
        valor: '38',
        detalhe: '↑ 3 a mais que o mês anterior',
        tendencia: 'up',
        icon: 'solar:document-text-linear',
    },
    {
        label: 'Taxa de fechamento',
        valor: '34,2',
        unidade: '%',
        detalhe: '↓ 1,8% em relação ao mês anterior',
        tendencia: 'down',
        icon: 'solar:chart-linear',
    },
    {
        label: 'Projetos em produção',
        valor: '11',
        detalhe: '- Igual ao mês anterior',
        tendencia: 'flat',
        icon: 'solar:layers-linear',
    },
];

const ranking = [
    { nome: 'Ana Souza',     iniciais: 'AS', total: 'R$ 24.800', orcamentos: 15, fechados: 5, taxa: '33,3%' },
    { nome: 'Carla Mendes',  iniciais: 'CM', total: 'R$ 19.400', orcamentos: 12, fechados: 4, taxa: '33,3%' },
    { nome: 'Juliana Rocha', iniciais: 'JR', total: 'R$ 11.200', orcamentos:  8, fechados: 3, taxa: '37,5%' },
    { nome: 'Patrícia Lima', iniciais: 'PL', total: 'R$  5.800', orcamentos:  3, fechados: 1, taxa: '33,3%' },
];

const fechamentos = [
    { cliente: 'Arch & Co. Arquitetura',  projeto: 'Bancada Cozinha Silestone', vendedora: 'Ana Souza',     valor: 'R$ 4.280', pagamento: 'Pix',           data: '28 mar 2026' },
    { cliente: 'Roberto Santos Dias',     projeto: 'Lavabo Travertino Romano',  vendedora: 'Carla Mendes',  valor: 'R$ 3.960', pagamento: 'Cartão Crédito', data: '26 mar 2026' },
    { cliente: 'Studio Novaes',           projeto: 'Ilha Gourmet Dekton Entzo', vendedora: 'Ana Souza',     valor: 'R$ 7.100', pagamento: 'Pix',           data: '22 mar 2026' },
    { cliente: 'Condomínio Alpha',        projeto: 'Piso Sala Quartzo Branco',  vendedora: 'Juliana Rocha', valor: 'R$ 5.800', pagamento: 'Boleto',         data: '19 mar 2026' },
    { cliente: 'Construtora LR',          projeto: 'Escada Granito São Gabriel',vendedora: 'Carla Mendes',  valor: 'R$ 9.200', pagamento: 'Cartão Crédito', data: '15 mar 2026' },
];

// ── Gráfico SVG inline ──────────────────────────────────────────────────────
// Dados: últimos 6 meses de faturamento
const chartMeses  = ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'];
const chartValores = [42800, 51200, 68500, 38900, 57400, 61200];

const VB_W = 500, VB_H = 220;
const PAD  = { l: 56, r: 20, t: 20, b: 40 };
const PLOT_W = VB_W - PAD.l - PAD.r;  // 424
const PLOT_H = VB_H - PAD.t - PAD.b;  // 160

const MIN_V = Math.min(...chartValores);
const MAX_V = Math.max(...chartValores);
const RANGE  = MAX_V - MIN_V;

function toX(i)   { return PAD.l + (i / (chartValores.length - 1)) * PLOT_W; }
function toY(v)   { return PAD.t + ((MAX_V - v) / RANGE) * PLOT_H; }

const pts = chartValores.map((v, i) => ({ x: toX(i), y: toY(v), v }));

// Smooth bezier via catmull-rom tension 0.35
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

const linePath  = smooth(pts);
const areaPath  = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} L ${pts[0].x.toFixed(1)},${(PAD.t + PLOT_H).toFixed(1)} Z`;

// Y-axis gridlines (4 evenly spaced)
const yGridLines = [0, 1, 2, 3].map(i => {
    const v = MIN_V + (RANGE / 3) * (3 - i);
    return { y: PAD.t + (i / 3) * PLOT_H, label: `R$ ${(v / 1000).toFixed(0)}k` };
});

// ── Tooltip ─────────────────────────────────────────────────────────────────
function ChartTooltip({ pt, visible }) {
    if (!visible || !pt) return null;
    const bx = Math.min(pt.x - 40, VB_W - 120);
    return (
        <g>
            <line x1={pt.x} y1={PAD.t} x2={pt.x} y2={PAD.t + PLOT_H} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3,3"/>
            <rect x={bx} y={pt.y - 36} width="100" height="30" fill="#0a0a0a" stroke="#3f3f46" strokeWidth="1"/>
            <text x={bx + 50} y={pt.y - 22} textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {chartMeses[pts.indexOf(pt)]}
            </text>
            <text x={bx + 50} y={pt.y - 11} textAnchor="middle" fill="#facc15" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono, monospace" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                R$ {(pt.v / 1000).toFixed(1)}k
            </text>
            <circle cx={pt.x} cy={pt.y} r="4" fill="#facc15" stroke="#0a0a0a" strokeWidth="2"/>
        </g>
    );
}

function FaturamentoChart() {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const svgRef = useRef(null);

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="w-full h-full"
            style={{ overflow: 'visible' }}
        >
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#facc15" stopOpacity="0.12"/>
                    <stop offset="100%" stopColor="#facc15" stopOpacity="0"/>
                </linearGradient>
            </defs>

            {/* Y gridlines */}
            {yGridLines.map((gl, i) => (
                <g key={i}>
                    <line x1={PAD.l} y1={gl.y} x2={PAD.l + PLOT_W} y2={gl.y} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
                    <text x={PAD.l - 6} y={gl.y + 3.5} textAnchor="end" fill="#52525b" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {gl.label}
                    </text>
                </g>
            ))}

            {/* X axis labels */}
            {pts.map((pt, i) => (
                <text key={i} x={pt.x} y={PAD.t + PLOT_H + 18} textAnchor="middle" fill="#52525b" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {chartMeses[i]}
                </text>
            ))}

            {/* Area fill */}
            <path d={areaPath} fill="url(#areaGrad)"/>

            {/* Line */}
            <path d={linePath} fill="none" stroke="#facc15" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>

            {/* Hover zones + dots */}
            {pts.map((pt, i) => (
                <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'default' }}>
                    <rect x={pt.x - 30} y={PAD.t} width="60" height={PLOT_H} fill="transparent"/>
                    <circle cx={pt.x} cy={pt.y} r={hoveredIdx === i ? 0 : 3}
                        fill={hoveredIdx === i ? 'transparent' : '#facc15'}
                        stroke="#0a0a0a" strokeWidth="1.5"
                        style={{ transition: 'r 0.15s' }}
                    />
                </g>
            ))}

            {/* Tooltip */}
            {hoveredIdx !== null && <ChartTooltip pt={pts[hoveredIdx]} visible={true}/>}
        </svg>
    );
}

// ── Badges de pagamento ─────────────────────────────────────────────────────
const pagIcons = {
    'Pix':            'solar:qr-code-linear',
    'Cartão Crédito': 'solar:card-linear',
    'Cartão Débito':  'solar:card-linear',
    'Boleto':         'solar:bill-linear',
    'Dinheiro':       'solar:banknote-linear',
};

// ── Componente principal ────────────────────────────────────────────────────

export default function DashboardAdmin() {
    const { session, profile } = useAuth();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    // Trava de segurança flexível
    useEffect(() => {
        if (!session || !profile?.empresa_id) return;
        
        let isMounted = true;
        let fallbackTimeout;

        async function fetchData() {
            if (!isMounted) return;
            try {
                setLoading(true);
                // if (!profile?.id) return;
            } catch (error) {
                if (!isMounted) return;
                console.error(error);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fallbackTimeout = setTimeout(() => {
            fetchData();
        }, 300);

        return () => {
            isMounted = false;
            clearTimeout(fallbackTimeout);
        };
    }, [session, profile?.empresa_id]);

    if (!session || !profile) {
        return (
            <div className='p-8 min-h-screen bg-[#050505] text-[#a1a1aa] font-mono text-[10px] uppercase tracking-widest flex items-center justify-center'>
                Carregando dados do perfil...
            </div>
        );
    }

    return (
        <div className="bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">

            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

                {/* ── 01 // Métricas do mês ──────────────────────────── */}
                <section className="mb-6 sys-reveal">
                    <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                        01 // Métricas do mês
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800">
                        {metricas.map((m, i) => (
                            <div key={i} className="bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
                                <iconify-icon icon={m.icon} width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">{m.label}</div>
                                <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline gap-1">
                                    {i === 2 ? (
                                        <>
                                            <span className="text-yellow-400">{m.valor}</span>
                                            <span className="text-zinc-500 text-lg font-normal">{m.unidade}</span>
                                        </>
                                    ) : (
                                        <span className="text-white">{m.valor}</span>
                                    )}
                                </div>
                                <div className={`font-mono text-[9px] ${m.tendencia === 'up' ? 'text-green-400' : m.tendencia === 'down' ? 'text-red-400' : 'text-zinc-600'}`}>
                                    {m.detalhe}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Grid médio: Ranking + Gráfico ──────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">

                    {/* 02 // Ranking de vendedoras */}
                    <section className="md:col-span-3 sys-reveal sys-delay-100">
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                            02 // Ranking — vendedoras
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            {/* Cabeçalho */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Nome</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Total vendido</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Orç.</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Fech.</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Taxa</span>
                            </div>

                            {ranking.map((r, i) => (
                                <div key={i} className={`grid grid-cols-12 items-center px-4 py-3 hover:bg-white/[0.015] cursor-pointer group transition-colors ${i < ranking.length - 1 ? 'border-b border-zinc-900' : ''}`}>
                                    {/* Posição + nome */}
                                    <div className="col-span-4 flex items-center gap-2.5">
                                        <span className={`font-mono text-[9px] w-4 text-right shrink-0 ${i === 0 ? 'text-yellow-400 font-bold' : 'text-zinc-700'}`}>
                                            {i + 1}
                                        </span>
                                        <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[8px] text-zinc-400 shrink-0">
                                            {r.iniciais}
                                        </div>
                                        <span className="text-sm text-white font-medium truncate group-hover:text-yellow-400 transition-colors">{r.nome}</span>
                                    </div>
                                    {/* Total */}
                                    <div className="col-span-3 text-right">
                                        <span className={`font-mono text-[11px] font-bold ${i === 0 ? 'text-yellow-400' : 'text-white'}`}>{r.total}</span>
                                    </div>
                                    {/* Orçamentos */}
                                    <div className="col-span-2 text-right">
                                        <span className="font-mono text-[11px] text-zinc-400">{r.orcamentos}</span>
                                    </div>
                                    {/* Fechados */}
                                    <div className="col-span-1 text-right">
                                        <span className="font-mono text-[11px] text-zinc-400">{r.fechados}</span>
                                    </div>
                                    {/* Taxa */}
                                    <div className="col-span-2 text-right">
                                        <span className="font-mono text-[11px] text-zinc-500">{r.taxa}</span>
                                    </div>
                                </div>
                            ))}

                            {/* Barra de progresso visual por total vendido */}
                            <div className="px-4 py-4 border-t border-zinc-800 flex flex-col gap-2.5">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-700 mb-1">Distribuição de vendas</div>
                                {ranking.map((r, i) => {
                                    const max = 24800;
                                    const val = parseInt(r.total.replace(/\D/g, ''));
                                    const pct = (val / max) * 100;
                                    return (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="font-mono text-[9px] text-zinc-600 w-16 shrink-0 truncate">{r.nome.split(' ')[0]}</span>
                                            <div className="flex-1 h-[3px] bg-zinc-900">
                                                <div
                                                    className={`h-full transition-all duration-700 ${i === 0 ? 'bg-yellow-400' : 'bg-zinc-600'}`}
                                                    style={{ width: `${pct}%` }}
                                                ></div>
                                            </div>
                                            <span className="font-mono text-[9px] text-zinc-600 w-6 text-right shrink-0">{Math.round(pct)}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* 03 // Gráfico de faturamento */}
                    <section className="md:col-span-2 sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                            03 // Faturamento — 6 meses
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800 h-full flex flex-col">
                            {/* Resumo topo */}
                            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                                <div>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Período</div>
                                    <div className="text-sm font-semibold text-white tracking-tight">Out 2025 — Mar 2026</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Total período</div>
                                    <div className="font-mono text-sm font-bold text-yellow-400">R$ 320,0k</div>
                                </div>
                            </div>

                            {/* SVG chart */}
                            <div className="flex-1 px-2 pb-3 pt-1 min-h-[180px]">
                                <FaturamentoChart />
                            </div>

                            {/* Mês destaque: maior e menor */}
                            <div className="grid grid-cols-2 border-t border-zinc-800">
                                <div className="px-4 py-3 border-r border-zinc-800">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Melhor mês</div>
                                    <div className="text-white font-semibold text-sm">Dez</div>
                                    <div className="font-mono text-[10px] text-yellow-400">R$ 68,5k</div>
                                </div>
                                <div className="px-4 py-3">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Pior mês</div>
                                    <div className="text-white font-semibold text-sm">Jan</div>
                                    <div className="font-mono text-[10px] text-zinc-500">R$ 38,9k</div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ── 04 // Últimos fechamentos ─────────────────────── */}
                <section className="sys-reveal sys-delay-300">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                            04 // Últimos fechamentos
                        </div>
                        <a href="/admin/financeiro" className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 hover:text-yellow-400 transition-colors flex items-center gap-2">
                            Ver extrato completo
                            <iconify-icon icon="solar:arrow-right-linear" width="10"></iconify-icon>
                        </a>
                    </div>

                    <div className="bg-[#0a0a0a] border border-zinc-800">
                        {/* Cabeçalho tabela */}
                        <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                            <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Cliente</span>
                            <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                            <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedora</span>
                            <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Pagamento</span>
                            <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor</span>
                            <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Data</span>
                        </div>

                        {fechamentos.map((f, i) => (
                            <div
                                key={i}
                                className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.015] cursor-pointer group transition-colors ${i < fechamentos.length - 1 ? 'border-b border-zinc-900' : ''}`}
                            >
                                <div className="col-span-3 text-sm text-white font-medium truncate pr-2 group-hover:text-yellow-400 transition-colors">
                                    {f.cliente}
                                </div>
                                <div className="col-span-3 font-mono text-[10px] text-zinc-500 truncate pr-2">
                                    {f.projeto}
                                </div>
                                <div className="col-span-2 flex items-center gap-1.5">
                                    <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                                        {f.vendedora.split(' ').map(p => p[0]).join('').slice(0, 2)}
                                    </div>
                                    <span className="font-mono text-[10px] text-zinc-500 truncate">{f.vendedora.split(' ')[0]}</span>
                                </div>
                                <div className="col-span-2 flex items-center gap-1.5">
                                    <iconify-icon icon={pagIcons[f.pagamento] || 'solar:card-linear'} width="11" className="text-zinc-600 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-zinc-500 truncate">{f.pagamento}</span>
                                </div>
                                <div className="col-span-1 text-right">
                                    <span className="font-mono text-[11px] text-white font-bold">{f.valor}</span>
                                </div>
                                <div className="col-span-1 text-right">
                                    <span className="font-mono text-[9px] text-zinc-600">{f.data.split(' ').slice(0, 2).join(' ')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </main>
        </div>
    );
}
