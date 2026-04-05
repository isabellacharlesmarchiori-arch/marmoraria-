import React, { useState, useEffect, useMemo } from 'react';

// ── Dados mock ──────────────────────────────────────────────────────────────

const VENDEDORAS = ['Ana Souza', 'Carla Mendes', 'Juliana Rocha', 'Patrícia Lima'];

const PAGAMENTOS = ['Pix', 'Cartão Crédito', 'Cartão Débito', 'Boleto', 'Dinheiro'];

const PAG_ICONS = {
    'Pix':            'solar:qr-code-linear',
    'Cartão Crédito': 'solar:card-linear',
    'Cartão Débito':  'solar:card-recive-linear',
    'Boleto':         'solar:bill-linear',
    'Dinheiro':       'solar:banknote-linear',
};

const fechamentosDB = [
    {
        id: 'f01', data: '2026-03-28', cliente: 'Arch & Co. Arquitetura',
        projeto: 'Bancada Cozinha Silestone', vendedora: 'Ana Souza',
        valor: 4280, pagamento: 'Pix',
        detalhes: {
            versao: 'Versão A — Silestone Blanco Zeus',
            chave_pix: 'financeiro@marmoraria.com.br',
            nome_cliente: 'Rafael Andrade',
            banco_cliente: 'Itaú',
            data_recebimento: '28/03/2026',
        },
    },
    {
        id: 'f02', data: '2026-03-26', cliente: 'Roberto Santos Dias',
        projeto: 'Lavabo Travertino Romano', vendedora: 'Carla Mendes',
        valor: 3960, pagamento: 'Cartão Crédito',
        detalhes: {
            versao: 'Versão Única — Travertino Romano 3cm',
            bandeira: 'Mastercard',
            parcelas: 3,
            data_primeira_cobranca: '05/04/2026',
            maquininha: 'Stone S920',
        },
    },
    {
        id: 'f03', data: '2026-03-22', cliente: 'Studio Novaes',
        projeto: 'Ilha Gourmet Dekton Entzo', vendedora: 'Ana Souza',
        valor: 7100, pagamento: 'Pix',
        detalhes: {
            versao: 'Versão B — Dekton Entzo 2cm',
            chave_pix: 'financeiro@marmoraria.com.br',
            nome_cliente: 'Fernanda Novaes',
            banco_cliente: 'Nubank',
            data_recebimento: '22/03/2026',
        },
    },
    {
        id: 'f04', data: '2026-03-19', cliente: 'Condomínio Alpha',
        projeto: 'Piso Sala Quartzo Branco', vendedora: 'Juliana Rocha',
        valor: 5800, pagamento: 'Boleto',
        detalhes: {
            versao: 'Versão A — Quartzo Branco Extra 2cm',
            banco: 'Bradesco',
            vencimento: '22/03/2026',
            dados_bancarios_cliente: 'Ag. 1234 · CC. 56789-0',
        },
    },
    {
        id: 'f05', data: '2026-03-15', cliente: 'Construtora LR',
        projeto: 'Escada Granito São Gabriel', vendedora: 'Carla Mendes',
        valor: 9200, pagamento: 'Cartão Crédito',
        detalhes: {
            versao: 'Versão Única — Granito São Gabriel 3cm',
            bandeira: 'Visa',
            parcelas: 6,
            data_primeira_cobranca: '01/04/2026',
            maquininha: 'PagSeguro Mini',
        },
    },
    {
        id: 'f06', data: '2026-03-10', cliente: 'Loft Arquitetura',
        projeto: 'Banheiro Suite Mármore Carrara', vendedora: 'Patrícia Lima',
        valor: 5800, pagamento: 'Dinheiro',
        detalhes: {
            versao: 'Versão Única — Mármore Carrara 2cm',
            data_recebimento: '10/03/2026',
            troco: 'R$ 200,00',
        },
    },
    {
        id: 'f07', data: '2026-03-07', cliente: 'Eng. Mariana Costa',
        projeto: 'Varanda Porcelanato Natural', vendedora: 'Juliana Rocha',
        valor: 3420, pagamento: 'Cartão Débito',
        detalhes: {
            versao: 'Versão A — Porcelanato Natural 1cm',
            bandeira: 'Elo',
            data_cobranca: '07/03/2026',
            maquininha: 'Cielo Flash',
        },
    },
    {
        id: 'f08', data: '2026-02-28', cliente: 'Incorporadora Nova Eras',
        projeto: 'Lobby Granito Verde Ubatuba', vendedora: 'Ana Souza',
        valor: 11400, pagamento: 'Boleto',
        detalhes: {
            versao: 'Versão B — Verde Ubatuba 3cm',
            banco: 'Santander',
            vencimento: '05/03/2026',
            dados_bancarios_cliente: 'Ag. 0042 · CC. 12345-6',
        },
    },
    {
        id: 'f09', data: '2026-02-20', cliente: 'Família Gomes',
        projeto: 'Cozinha Completa Silestone Poblenou', vendedora: 'Carla Mendes',
        valor: 6240, pagamento: 'Pix',
        detalhes: {
            versao: 'Versão A — Silestone Poblenou 2cm',
            chave_pix: 'financeiro@marmoraria.com.br',
            nome_cliente: 'Marcos Gomes',
            banco_cliente: 'Caixa',
            data_recebimento: '20/02/2026',
        },
    },
];

const perdidosDB = [
    { id: 'p01', data: '2026-03-25', cliente: 'Clínica Bem-Estar',      projeto: 'Recepção Quartzo Calacatta', vendedora: 'Juliana Rocha', motivo: 'Cliente optou por outro fornecedor com prazo menor.' },
    { id: 'p02', data: '2026-03-18', cliente: 'Escritório Prado & Cia', projeto: 'Bancada Escritório Cinza',    vendedora: 'Ana Souza',     motivo: 'Orçamento acima do budget do cliente.' },
    { id: 'p03', data: '2026-03-12', cliente: 'Hotel Metrópolis',        projeto: 'Banheiros Bloco A',          vendedora: 'Carla Mendes',  motivo: '' },
    { id: 'p04', data: '2026-02-14', cliente: 'Restaurante Madeiro',     projeto: 'Balcão Granito Preto',       vendedora: 'Patrícia Lima', motivo: 'Cliente suspendeu a obra por prazo indeterminado.' },
    { id: 'p05', data: '2026-02-06', cliente: 'Residência Ferreira',     projeto: 'Varanda Granito Arabesco',   vendedora: 'Ana Souza',     motivo: '' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(n) {
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
    const [y, m, d] = iso.split('-');
    const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${d} ${meses[parseInt(m, 10) - 1]} ${y}`;
}

// ── Componente: Detalhe do pagamento ────────────────────────────────────────

function DetalhesPagamento({ tipo, det }) {
    const row = (label, value, destaque = false) => (
        <div key={label} className="flex items-start justify-between gap-4 py-2.5 border-b border-zinc-900 last:border-0">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 shrink-0">{label}</span>
            <span className={`font-mono text-[11px] text-right break-all ${destaque ? 'text-yellow-400 font-bold' : 'text-zinc-300'}`}>{value}</span>
        </div>
    );
    if (tipo === 'Pix') return (
        <div>
            {row('Chave Pix', det.chave_pix)}
            {row('Nome do cliente', det.nome_cliente)}
            {row('Banco do cliente', det.banco_cliente)}
            {row('Data recebimento', det.data_recebimento, true)}
        </div>
    );
    if (tipo === 'Cartão Crédito') return (
        <div>
            {row('Bandeira', det.bandeira)}
            {row('Parcelas', `${det.parcelas}x`)}
            {row('1ª cobrança', det.data_primeira_cobranca, true)}
            {row('Maquininha', det.maquininha)}
        </div>
    );
    if (tipo === 'Cartão Débito') return (
        <div>
            {row('Bandeira', det.bandeira)}
            {row('Data cobrança', det.data_cobranca, true)}
            {row('Maquininha', det.maquininha)}
        </div>
    );
    if (tipo === 'Boleto') return (
        <div>
            {row('Banco', det.banco)}
            {row('Vencimento', det.vencimento, true)}
            {row('Dados bancários', det.dados_bancarios_cliente)}
        </div>
    );
    if (tipo === 'Dinheiro') return (
        <div>
            {row('Data recebimento', det.data_recebimento, true)}
            {det.troco && row('Troco', det.troco)}
        </div>
    );
    return null;
}

// ── Componente principal ────────────────────────────────────────────────────

export default function Financeiro() {

    // Filtros
    const [periodoInicio, setPeriodoInicio] = useState('2026-02-01');
    const [periodoFim,    setPeriodoFim]    = useState('2026-03-31');
    const [filtroVend,    setFiltroVend]    = useState('todos');
    const [filtroPag,     setFiltroPag]     = useState('todos');
    const [filtroStatus,  setFiltroStatus]  = useState('fechados'); // fechados | perdidos | todos

    // Painel lateral
    const [painelItem, setPainelItem] = useState(null);

    useEffect(() => {
        const obs = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        document.querySelectorAll('.sys-reveal').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, []);

    // Dados filtrados
    const fechamentosFiltrados = useMemo(() => {
        return fechamentosDB.filter(f => {
            if (f.data < periodoInicio || f.data > periodoFim) return false;
            if (filtroVend !== 'todos' && f.vendedora !== filtroVend) return false;
            if (filtroPag  !== 'todos' && f.pagamento !== filtroPag)  return false;
            return true;
        });
    }, [periodoInicio, periodoFim, filtroVend, filtroPag]);

    const perdidosFiltrados = useMemo(() => {
        return perdidosDB.filter(p => {
            if (p.data < periodoInicio || p.data > periodoFim) return false;
            if (filtroVend !== 'todos' && p.vendedora !== filtroVend) return false;
            return true;
        });
    }, [periodoInicio, periodoFim, filtroVend]);

    // Totais
    const totalRecebido  = fechamentosFiltrados.reduce((s, f) => s + f.valor, 0);
    const ticketMedio    = fechamentosFiltrados.length ? totalRecebido / fechamentosFiltrados.length : 0;
    const nFechamentos   = fechamentosFiltrados.length;

    const showFechados = filtroStatus === 'fechados' || filtroStatus === 'todos';
    const showPerdidos = filtroStatus === 'perdidos' || filtroStatus === 'todos';

    // Inputs estilizados (reutilizados)
    const inputCls = "bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono px-3 py-2 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700 w-full";
    const selectCls = inputCls + " appearance-none cursor-pointer";

    return (
        <div className="bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">

            {/* Backgrounds */}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">

                            {/* Período início */}
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

                            {/* Período fim */}
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

                            {/* Vendedora */}
                            <div>
                                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Vendedora</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                                    <select value={filtroVend} onChange={e => setFiltroVend(e.target.value)}
                                        className={selectCls + " pl-8 pr-7"}>
                                        <option value="todos">Todas</option>
                                        {VENDEDORAS.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12"></iconify-icon>
                                </div>
                            </div>

                            {/* Forma de pagamento */}
                            <div>
                                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Forma de pagamento</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:card-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                                    <select value={filtroPag} onChange={e => setFiltroPag(e.target.value)}
                                        className={selectCls + " pl-8 pr-7"}>
                                        <option value="todos">Todas</option>
                                        {PAGAMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12"></iconify-icon>
                                </div>
                            </div>
                        </div>

                        {/* Tabs de status */}
                        <div className="flex items-center gap-px border border-zinc-800 w-max">
                            {[
                                { id: 'fechados', label: 'Fechados',     icon: 'solar:check-circle-linear'   },
                                { id: 'perdidos', label: 'Perdidos',     icon: 'solar:close-circle-linear'   },
                                { id: 'todos',    label: 'Todos',        icon: 'solar:layers-minimalistic-linear' },
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
                        {/* Total recebido */}
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:wallet-money-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Total recebido</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
                                {showFechados ? fmtBRL(totalRecebido) : '—'}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">
                                {showFechados ? `${nFechamentos} fechamento${nFechamentos !== 1 ? 's' : ''} no período` : 'Filtro: apenas perdidos'}
                            </div>
                        </div>

                        {/* Ticket médio */}
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:graph-up-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Ticket médio</div>
                            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
                                {showFechados && nFechamentos > 0 ? fmtBRL(ticketMedio) : '—'}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">por fechamento</div>
                        </div>

                        {/* Nº de fechamentos */}
                        <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
                            <iconify-icon icon="solar:check-square-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Nº de fechamentos</div>
                            <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline gap-2">
                                <span className="text-yellow-400">{showFechados ? nFechamentos : 0}</span>
                                {showPerdidos && (
                                    <span className="text-base font-normal text-red-400 font-mono">{perdidosFiltrados.length} perd.</span>
                                )}
                            </div>
                            <div className="font-mono text-[9px] text-zinc-600">no período selecionado</div>
                        </div>
                    </div>
                </section>

                {/* ── 03 // Extrato de recebimentos ─────────────────── */}
                {showFechados && (
                    <section className="mb-6 sys-reveal sys-delay-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                                03 // Extrato de recebimentos
                            </div>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
                                {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            {/* Cabeçalho */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedora</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Pag.</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor</span>
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right"></span>
                            </div>

                            {fechamentosFiltrados.length === 0 ? (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:wallet-money-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum fechamento no período</p>
                                </div>
                            ) : fechamentosFiltrados.map((f, i) => (
                                <div key={f.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.015] cursor-pointer group transition-colors ${
                                        painelItem?.id === f.id ? 'bg-yellow-400/5 border-l-2 border-yellow-400' : ''
                                    } ${i < fechamentosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
                                    onClick={() => setPainelItem(painelItem?.id === f.id ? null : f)}
                                >
                                    <div className="col-span-1 font-mono text-[9px] text-zinc-600 leading-tight">
                                        {fmtDate(f.data).split(' ').slice(0,2).join('\n')}
                                    </div>
                                    <div className="col-span-3 pl-1">
                                        <span className="text-sm text-white font-medium truncate block group-hover:text-yellow-400 transition-colors">{f.cliente}</span>
                                    </div>
                                    <div className="col-span-3">
                                        <span className="font-mono text-[10px] text-zinc-500 truncate block">{f.projeto}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1.5">
                                        <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                                            {f.vendedora.split(' ').map(p => p[0]).join('').slice(0,2)}
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-500 truncate">{f.vendedora.split(' ')[0]}</span>
                                    </div>
                                    <div className="col-span-1">
                                        <iconify-icon icon={PAG_ICONS[f.pagamento] || 'solar:card-linear'} width="13" className="text-zinc-600 group-hover:text-zinc-400 transition-colors"></iconify-icon>
                                    </div>
                                    <div className="col-span-1 text-right">
                                        <span className="font-mono text-[11px] text-white font-bold">{fmtBRL(f.valor)}</span>
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                        <iconify-icon
                                            icon={painelItem?.id === f.id ? 'solar:sidebar-minimalistic-linear' : 'solar:eye-linear'}
                                            width="13"
                                            className={`transition-colors ${painelItem?.id === f.id ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-zinc-400'}`}
                                        ></iconify-icon>
                                    </div>
                                </div>
                            ))}

                            {/* Totalizador de rodapé */}
                            {fechamentosFiltrados.length > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950">
                                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                                        {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''} · subtotal
                                    </span>
                                    <span className="font-mono text-sm font-bold text-yellow-400">{fmtBRL(totalRecebido)}</span>
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
                            {/* Cabeçalho */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedora</span>
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Motivo</span>
                            </div>

                            {perdidosFiltrados.length === 0 ? (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:close-circle-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto perdido no período</p>
                                </div>
                            ) : perdidosFiltrados.map((p, i) => (
                                <div key={p.id}
                                    className={`grid grid-cols-12 items-start px-4 py-3.5 hover:bg-white/[0.015] transition-colors ${i < perdidosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
                                >
                                    <div className="col-span-1 font-mono text-[9px] text-zinc-600 pt-0.5">
                                        {fmtDate(p.data).split(' ').slice(0,2).join(' ')}
                                    </div>
                                    <div className="col-span-2 pl-1">
                                        <span className="text-sm text-white font-medium truncate block">{p.cliente}</span>
                                    </div>
                                    <div className="col-span-3">
                                        <span className="font-mono text-[10px] text-zinc-500 truncate block">{p.projeto}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1.5">
                                        <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                                            {p.vendedora.split(' ').map(x => x[0]).join('').slice(0,2)}
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-500 truncate">{p.vendedora.split(' ')[0]}</span>
                                    </div>
                                    <div className="col-span-4">
                                        {p.motivo ? (
                                            <span className="font-mono text-[10px] text-zinc-500 leading-relaxed">{p.motivo}</span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 border border-zinc-800 font-mono text-[8px] uppercase text-zinc-700">Sem motivo</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

            </main>

            {/* ══ PAINEL LATERAL — Detalhes do fechamento ════════════ */}
            {painelItem && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                        onClick={() => setPainelItem(null)}
                    ></div>

                    <aside className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden"
                        style={{ animation: 'slideIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                            <div>
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Detalhes do fechamento</div>
                                <div className="text-white font-semibold text-sm truncate max-w-[280px]">{painelItem.cliente}</div>
                            </div>
                            <button onClick={() => setPainelItem(null)} className="text-zinc-600 hover:text-white transition-colors p-1 shrink-0">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 overflow-y-auto">

                            {/* Bloco principal */}
                            <div className="px-5 py-4 border-b border-zinc-800">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-3">Projeto</div>
                                <div className="text-zinc-300 text-sm mb-1">{painelItem.projeto}</div>
                                <div className="font-mono text-[10px] text-zinc-600">{painelItem.detalhes.versao}</div>
                            </div>

                            {/* Valor + data */}
                            <div className="grid grid-cols-2 border-b border-zinc-800">
                                <div className="px-5 py-4 border-r border-zinc-800">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Valor fechado</div>
                                    <div className="font-mono text-2xl font-bold text-yellow-400 tracking-tighter">{fmtBRL(painelItem.valor)}</div>
                                </div>
                                <div className="px-5 py-4">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Data</div>
                                    <div className="font-mono text-sm font-semibold text-white">{fmtDate(painelItem.data)}</div>
                                </div>
                            </div>

                            {/* Vendedora */}
                            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
                                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[10px] text-zinc-400 shrink-0">
                                    {painelItem.vendedora.split(' ').map(p => p[0]).join('').slice(0,2)}
                                </div>
                                <div>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Vendedora</div>
                                    <div className="text-white text-sm font-medium">{painelItem.vendedora}</div>
                                </div>
                            </div>

                            {/* Forma de pagamento */}
                            <div className="px-5 py-4 border-b border-zinc-800">
                                <div className="flex items-center gap-2 mb-3">
                                    <iconify-icon icon={PAG_ICONS[painelItem.pagamento] || 'solar:card-linear'} width="14" className="text-zinc-500"></iconify-icon>
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Forma de pagamento</div>
                                    <span className="ml-auto px-2 py-0.5 border border-zinc-700 font-mono text-[9px] uppercase text-zinc-400 bg-zinc-900">
                                        {painelItem.pagamento}
                                    </span>
                                </div>
                                <DetalhesPagamento tipo={painelItem.pagamento} det={painelItem.detalhes} />
                            </div>

                            {/* Dados bancários — aviso admin only */}
                            {painelItem.pagamento === 'Boleto' && (
                                <div className="mx-5 my-4 border-l border-yellow-400/50 bg-yellow-400/5 px-3 py-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <iconify-icon icon="solar:lock-password-linear" width="12" className="text-yellow-400"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-400">Dados restritos — admin</span>
                                    </div>
                                    <p className="font-mono text-[9px] text-zinc-500">Dados bancários do cliente visíveis somente para administradores.</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
                            <button
                                onClick={() => setPainelItem(null)}
                                className="w-full border border-zinc-700 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                Fechar
                            </button>
                        </div>
                    </aside>
                </>
            )}

            <style>{`
                .bg-grid {
                    background-size: 40px 40px;
                    background-image: linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                                      linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
                }
                .scanline {
                    background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
                                linear-gradient(90deg, rgba(255,255,255,0.01), rgba(0,0,0,0.01), rgba(255,255,255,0.01));
                    background-size: 100% 2px, 3px 100%;
                }
                @media (prefers-reduced-motion: no-preference) {
                    .sys-reveal {
                        opacity: 0; transform: translateY(20px); filter: blur(4px);
                        transition: opacity 1.2s cubic-bezier(0.16,1,0.3,1), transform 1.2s cubic-bezier(0.16,1,0.3,1), filter 1.2s ease-out;
                    }
                    .sys-active.sys-reveal { opacity: 1; transform: translate(0) scale(1); filter: blur(0); }
                    .sys-delay-100 { transition-delay: 100ms; }
                    .sys-delay-200 { transition-delay: 200ms; }
                    .sys-delay-300 { transition-delay: 300ms; }
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to   { transform: translateX(0); }
                }
                select { -webkit-appearance: none; appearance: none; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: #050505; }
                ::-webkit-scrollbar-thumb { background: #27272a; }
                ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
            `}</style>
        </div>
    );
}
