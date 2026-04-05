import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',   bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
    aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30', bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-400/5', dot: 'bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',  bg: 'bg-blue-400/5',   dot: 'bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',   bg: 'bg-red-400/5',    dot: 'bg-red-400'    },
};

const MEDICAO_STATUS = {
    agendada:   { label: 'Agendada',   color: 'text-zinc-400',   border: 'border-zinc-700',    bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
    enviada:    { label: 'Enviada',    color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/5', dot: 'bg-yellow-400' },
    processada: { label: 'Processada', color: 'text-green-400',  border: 'border-green-500/30', bg: 'bg-green-400/5',  dot: 'bg-green-400'  },
};

function StatusPill({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

function MedicaoPill({ status }) {
    const cfg = MEDICAO_STATUS[status] || MEDICAO_STATUS.agendada;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

// ── Dados mock ────────────────────────────────────────────────────────────────

const projeto = {
    nome: 'Bancada Cozinha Silestone',
    status: 'aprovado',
    cliente: { nome: 'Arch & Co. Arquitetura', id: 'c1' },
    vendedor: 'Ana Souza',
    criado_em: '14 mar 2026',
};

const medicoes = [
    {
        id: 'm1',
        data: '18 mar 2026 · 09:00',
        medidor: 'Carlos Medidor',
        status: 'processada',
        resumo: [
            { peca: 'Bancada principal', area: '1,08 m²', acabamentos: 'Meia-esquadria 1,80 m · Reto simples 0,60 m', recortes: 2 },
            { peca: 'Bancada diagonal',  area: '0,90 m²', acabamentos: 'Meia-esquadria 1,00 m · Reto simples 0,72 m', recortes: 1 },
            { peca: 'Rodapé',            area: '0,34 m²', acabamentos: 'Reto simples 3,40 m',                           recortes: 0 },
        ],
    },
    {
        id: 'm2',
        data: '22 mar 2026 · 14:00',
        medidor: 'Carlos Medidor',
        status: 'agendada',
        resumo: [],
    },
];

// ambientes carregados do Supabase no componente

// ── Mock Data Inicial ────────────────────────────────────────────────────────
const MOCK_AMBIENTES = {
    id: 'ambiente-mock',
    nome: 'Cozinha',
    status: 'em_andamento',
    versoes: [
        {
            id: 'mock-granito',
            nome: 'Versão Granito',
            data: '04 abr 2026',
            valor: 12500,
            pecas: [
                { id: 'peca-1', nome: 'Bancada Principal', material: 'Granito São Gabriel', espessura: '2cm', area: '1,80 m²', acabamento: 'Meia Esquadria', valor: 8000, recortes: [{id:'r1', nome:'Furo de Torneira', dimensao:'35 mm'}, {id:'r2', nome:'Corte para Cooktop', dimensao:'60x45 cm'}] },
                { id: 'peca-2', nome: 'Rodapé', material: 'Granito São Gabriel', espessura: '2cm', area: '0,90 m²', acabamento: 'Reto Simples', valor: 4500, recortes: [] }
            ]
        },
        {
            id: 'mock-silestone',
            nome: 'Versão Silestone',
            data: '04 abr 2026',
            valor: 28000,
            pecas: [
                { id: 'peca-3', nome: 'Bancada Principal', material: 'Silestone Tigris Sand', espessura: '2cm', area: '1,80 m²', acabamento: 'Meia Esquadria', valor: 18000, recortes: [{id:'r3', nome:'Furo de Torneira', dimensao:'35 mm'}, {id:'r4', nome:'Corte para Cuba', dimensao:'40x50 cm'}] },
                { id: 'peca-4', nome: 'Rodapé', material: 'Silestone Tigris Sand', espessura: '2cm', area: '0,90 m²', acabamento: 'Reto Simples', valor: 10000, recortes: [] }
            ]
        }
    ]
};

// ── Componente principal ──────────────────────────────────────────────────────


export default function TelaProjetoVendedor() {
    console.log('Renderizando aba de orçamentos com dados mockados');
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();

    const [activeTab, setActiveTab] = useState('medicoes');
    const [ambientes, setAmbientes] = useState([]);

    // Carrega ambientes reais do Supabase para garantir UUIDs válidos ao criar orçamento
    useEffect(() => {
        if (!id || !profile?.empresa_id) return;
        supabase
            .from('ambientes')
            .select(`
                id, nome,
                orcamentos(id, nome_versao, valor_total, status, created_at,
                    orcamento_pecas(id, valor_total,
                        pecas(nome_livre),
                        materiais(nome)
                    )
                )
            `)
            .eq('projeto_id', id)
            .order('created_at')
            .then(({ data, error }) => {
                if (error) {
                    console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
                    return;
                }
                if (data) {
                    setAmbientes(data.map(amb => {
                        const orcamentosDoAmb = amb.orcamentos ?? [];
                        const versoes = orcamentosDoAmb.map(orc => ({
                            id:     orc.id,
                            nome:   orc.nome_versao,
                            valor:  orc.valor_total != null
                                ? orc.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : 'R$ 0,00',
                            data:   orc.created_at
                                ? new Date(orc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '',
                            pecas: (orc.orcamento_pecas ?? []).map(op => ({
                                id:       op.id,
                                nome:     Array.isArray(op.pecas) ? (op.pecas[0]?.nome_livre ?? '') : (op.pecas?.nome_livre ?? ''),
                                material: Array.isArray(op.materiais) ? (op.materiais[0]?.nome ?? '') : (op.materiais?.nome ?? ''),
                                valor:    op.valor_total != null
                                    ? op.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : '',
                            })),
                        }));
                        const orcamento_status = versoes.length === 0
                            ? 'sem_orcamento'
                            : orcamentosDoAmb.some(o => o.status === 'completo') ? 'completo' : 'em_andamento';
                        return { id: amb.id, nome: amb.nome, orcamento_status, versoes };
                    }));
                }
            });
    }, [id, profile?.empresa_id]);
    const [versoesExpandidas, setVersoesExpandidas] = useState({});

    const toggleVersao = (e, versaoId) => {
        e.stopPropagation();
        setVersoesExpandidas(prev => ({ ...prev, [versaoId]: !prev[versaoId] }));
    };

    // ── ESTADO DO MOCK INTERATIVO (Para teste visual da aba Orçamentos) ──────
    const [mockAmbiente, setMockAmbiente] = useState(MOCK_AMBIENTES);
    const [selectedIds, setSelectedIds] = useState(['mock-silestone']); // Padrão selecionado
    const [toastMessage, setToastMessage] = useState('');

    console.log('Versões selecionadas:', selectedIds);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3000);
    };

    const toggleSelection = (e, versaoId) => {
        e.stopPropagation();
        setSelectedIds(p => p.includes(versaoId) ? p.filter(x => x !== versaoId) : [...p, versaoId]);
    };

    const mockNovaVersaoBase = () => {
        if (!mockAmbiente.versoes.length) return;
        const base = mockAmbiente.versoes[0];
        const novaId = `mock-v-${Date.now()}`;
        const novaVersao = {
            ...base,
            id: novaId,
            nome: `${base.nome} (Cópia)`,
            pecas: base.pecas.map(p => ({ ...p, id: `mock-p-${Date.now()}-${Math.random().toString(36).substring(7)}` }))
        };
        setMockAmbiente(prev => ({ ...prev, versoes: [...prev.versoes, novaVersao] }));
        showToast('Nova versão adicionada!');
    };

    const mockDuplicarVersao = (e, versaoId) => {
        e.stopPropagation();
        const base = mockAmbiente.versoes.find(v => v.id === versaoId);
        if (!base) return;
        const novaId = `mock-v-${Date.now()}`;
        const novaVersao = {
            ...base,
            id: novaId,
            nome: `${base.nome} (Cópia)`,
            pecas: base.pecas.map(p => ({ ...p, id: `mock-p-${Date.now()}-${Math.random().toString(36).substring(7)}` }))
        };
        setMockAmbiente(prev => ({
            ...prev,
            versoes: prev.versoes.flatMap(v => v.id === versaoId ? [v, novaVersao] : [v])
        }));
        showToast('Versão duplicada!');
    };

    const mockRemoverVersao = (e, versaoId) => {
        e.stopPropagation();
        setMockAmbiente(prev => ({ ...prev, versoes: prev.versoes.filter(v => v.id !== versaoId) }));
        setSelectedIds(p => p.filter(id => id !== versaoId));
        showToast('Versão removida!');
    };

    const totalSelecionado = selectedIds.reduce((acc, vId) => {
        const v = mockAmbiente.versoes.find(x => x.id === vId);
        return acc + (v?.valor || 0);
    }, 0);
    
    const mockDuplicarPeca = (e, versaoId, pecaId) => {
        e.stopPropagation();
        setMockAmbiente(prev => ({
            ...prev,
            versoes: prev.versoes.map(v => {
                if (v.id !== versaoId) return v;
                const p = v.pecas.find(x => x.id === pecaId);
                if (!p) return v;
                const copiaPeca = { ...p, id: `mock-p-${Date.now()}`, nome: `${p.nome} (Cópia)` };
                const newPecaList = v.pecas.flatMap(x => x.id === pecaId ? [x, copiaPeca] : [x]);
                const newTotal = newPecaList.reduce((acc, curr) => acc + curr.valor, 0);
                return { ...v, pecas: newPecaList, valor: newTotal };
            })
        }));
        showToast('Peça duplicada!');
    };

    const mockRemoverPeca = (e, versaoId, pecaId) => {
        e.stopPropagation();
        setMockAmbiente(prev => ({
            ...prev,
            versoes: prev.versoes.map(v => {
                if (v.id !== versaoId) return v;
                const newPecaList = v.pecas.filter(x => x.id !== pecaId);
                const newTotal = newPecaList.reduce((acc, curr) => acc + curr.valor, 0);
                return { ...v, pecas: newPecaList, valor: newTotal };
            })
        }));
        showToast('Peça removida!');
    };

    const [pecaEmEdicao, setPecaEmEdicao] = useState(null);

    const mockEditarPeca = (e, versaoId, peca) => {
        e.stopPropagation();
        setPecaEmEdicao({ versaoId, pecaId: peca.id, pecaData: JSON.parse(JSON.stringify(peca)) });
    };

    const handleSalvarEdicaoPeca = () => {
        setMockAmbiente(prev => ({
            ...prev,
            versoes: prev.versoes.map(v => {
                if (v.id !== pecaEmEdicao.versaoId) return v;
                const newPecas = v.pecas.map(p => p.id === pecaEmEdicao.pecaId ? pecaEmEdicao.pecaData : p);
                const novoValorTotal = newPecas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                return { ...v, pecas: newPecas, valor: novoValorTotal };
            })
        }));
        setPecaEmEdicao(null);
        showToast('Peça atualizada com sucesso!');
    };

    const handleRemoverRecorteDrawer = (recorteId) => {
        setPecaEmEdicao(prev => ({
            ...prev,
            pecaData: {
                ...prev.pecaData,
                recortes: prev.pecaData.recortes.filter(r => r.id !== recorteId)
            }
        }));
    };

    const [modalAgendar, setModalAgendar] = useState(false);
    const [modalPerda, setModalPerda] = useState(false);
    const [modalStatus, setModalStatus] = useState(false);
    const [painelMedicao, setPainelMedicao] = useState(null);
    const [motivoPerda, setMotivoPerda] = useState('');
    const [novoStatus, setNovoStatus] = useState('produzindo');

    // Formulário agendar medição
    const [agMedidor, setAgMedidor]   = useState('');
    const [agData, setAgData]         = useState('');
    const [agEndereco, setAgEndereco] = useState('');
    const [agendando, setAgendando]   = useState(false);
    const [erroAgendar, setErroAgendar] = useState('');

    // Lista de medidores da empresa
    const [medidores, setMedidores] = useState([]);

    useEffect(() => {
        if (!profile?.empresa_id) return;
        supabase
            .from('usuarios')
            .select('id, nome')
            .eq('empresa_id', profile.empresa_id)
            .eq('perfil', 'medidor')
            .eq('ativo', true)
            .order('nome')
            .then(({ data }) => { if (data) setMedidores(data); });
    }, [profile?.empresa_id]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        const timeout = setTimeout(() => {
            document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        }, 10);
        return () => {
            clearTimeout(timeout);
            observer.disconnect();
        };
    }, [ambientes, activeTab]);

    const closeAll = () => {
        setModalAgendar(false);
        setModalPerda(false);
        setModalStatus(false);
        setPainelMedicao(null);
        setErroAgendar('');
    };

    async function handleAgendarMedicao() {
        setErroAgendar('');
        if (!agMedidor || !agData) {
            setErroAgendar('Selecione o medidor e a data.');
            return;
        }
        if (!profile?.empresa_id || !id) {
            setErroAgendar('Sessão inválida. Recarregue a página.');
            return;
        }

        // datetime-local retorna "YYYY-MM-DDTHH:mm" — converter para ISO 8601 completo
        const dataAgendadaISO = new Date(agData).toISOString();

        setAgendando(true);
        const { data: med, error: errMed } = await supabase
            .from('medicoes')
            .insert({
                projeto_id:     id,
                medidor_id:     agMedidor,
                empresa_id:     profile.empresa_id,
                data_agendada:  dataAgendadaISO,
                status:         'agendada',
                json_medicao:   null,
            })
            .select('id')
            .single();

        if (errMed) {
            console.error('Erro ao agendar medição:', errMed.message);
            setErroAgendar(`Erro: ${errMed.message}`);
            setAgendando(false);
            return;
        }

        // Notificar o medidor
        await supabase.from('notificacoes').insert({
            empresa_id:  profile.empresa_id,
            usuario_id:  agMedidor,
            tipo:        'medicao_agendada',
            titulo:      'Nova medição agendada',
            corpo:       `Medição agendada para ${new Date(dataAgendadaISO).toLocaleString('pt-BR')}${agEndereco ? ' — ' + agEndereco : ''}`,
            lida:        false,
        });

        setAgendando(false);
        setAgMedidor('');
        setAgData('');
        setAgEndereco('');
        closeAll();
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-yellow-400/30">
            {toastMessage && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-4 py-2 text-[11px] font-mono uppercase tracking-widest font-bold z-[100] shadow-[0_0_20px_rgba(250,204,21,0.3)] animate-[bounce_0.25s_infinite_alternate]">
                    {toastMessage}
                </div>
            )}

            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

                {/* ── Breadcrumb ─────────────────────────────────────────── */}
                <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
                    <span onClick={() => navigate('/projetos')} className="hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
                    <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
                    <span className="text-zinc-400">{projeto.nome}</span>
                </div>

                {/* ── Header do Projeto ──────────────────────────────────── */}
                <section className="sys-reveal mb-8">
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                            {/* Info */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-white tracking-tighter">{projeto.nome}</h1>
                                    <StatusPill status={projeto.status} />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                                    <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <a href={`/clientes/${projeto.cliente.id}`} className="hover:text-yellow-400 transition-colors">
                                        {projeto.cliente.nome}
                                    </a>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto.criado_em}</span>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:user-id-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto.vendedor}</span>
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setModalStatus(true)}
                                    className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors"
                                >
                                    <iconify-icon icon="solar:refresh-linear" width="13"></iconify-icon>
                                    Atualizar status
                                </button>
                                <button
                                    onClick={() => setModalPerda(true)}
                                    className="flex items-center gap-2 border border-red-500/30 bg-red-400/5 text-red-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-red-400 transition-colors"
                                >
                                    <iconify-icon icon="solar:close-circle-linear" width="13"></iconify-icon>
                                    Marcar como perdido
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Tabs ──────────────────────────────────────────────── */}
                <div className="sys-reveal sys-delay-100 flex border-b border-zinc-800 mb-6">
                    {[
                        { id: 'medicoes',   label: 'Medições',               icon: 'solar:ruler-pen-linear'   },
                        { id: 'ambientes',  label: 'Ambientes e Orçamentos', icon: 'solar:layers-linear'       },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-yellow-400 text-white'
                                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
                            }`}
                        >
                            <iconify-icon icon={tab.icon} width="13"></iconify-icon>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ══ ABA: MEDIÇÕES ══════════════════════════════════════ */}
                {activeTab === 'medicoes' && (
                    <div className="sys-reveal sys-delay-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                                01 // Medições
                            </div>
                            <button
                                onClick={() => setModalAgendar(true)}
                                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                                Agendar medição
                            </button>
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            {/* Cabeçalho tabela */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Medidor</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Ação</span>
                            </div>

                            {medicoes.map((m, i) => (
                                <div
                                    key={m.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.01] transition-colors ${i < medicoes.length - 1 ? 'border-b border-zinc-900' : ''}`}
                                >
                                    <div className="col-span-4 flex items-center gap-2">
                                        <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                                        <span className="text-sm text-white font-medium">{m.data}</span>
                                    </div>
                                    <div className="col-span-3 font-mono text-[11px] text-zinc-500">{m.medidor}</div>
                                    <div className="col-span-2">
                                        <MedicaoPill status={m.status} />
                                    </div>
                                    <div className="col-span-3 flex justify-end">
                                        {m.status === 'processada' && (
                                            <button
                                                onClick={() => setPainelMedicao(m)}
                                                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 hover:border-white hover:text-white transition-colors"
                                            >
                                                <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                                                Ver dados
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {medicoes.length === 0 && (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:ruler-pen-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhuma medição ainda</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══ ABA: AMBIENTES E ORÇAMENTOS ════════════════════════ */}
                {activeTab === 'ambientes' && (
                    <div className="sys-reveal sys-delay-200">
                        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                            02 // Ambientes e Orçamentos
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* MOCK HARDCODED - COZINHA */}
                            <div className="bg-[#0a0a0a] border border-zinc-800">
                                {/* Header do ambiente */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                                    <div className="flex items-center gap-3">
                                        <iconify-icon icon="solar:layers-minimalistic-linear" width="14" className="text-zinc-600"></iconify-icon>
                                        <span className="text-white font-semibold text-sm tracking-tight">{mockAmbiente.nome}</span>
                                        <span className="px-2 py-0.5 border border-yellow-400/30 text-[9px] font-mono uppercase text-yellow-400 bg-yellow-400/5">Em andamento</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={mockNovaVersaoBase}
                                            className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:border-white hover:text-white transition-colors"
                                        >
                                            <iconify-icon icon="solar:document-add-linear" width="12"></iconify-icon>
                                            Nova versão
                                        </button>
                                    </div>
                                </div>

                                {/* Versões de orçamento iterativas */}
                                <div>
                                    {mockAmbiente.versoes.length === 0 && (
                                        <div className="px-5 py-6 text-center">
                                            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum orçamento para este ambiente</p>
                                        </div>
                                    )}
                                    {mockAmbiente.versoes.map((v, i) => {
                                        const isChecked = selectedIds.includes(v.id);
                                        return (
                                            <div key={v.id} className={`flex flex-col group transition-colors ${i < mockAmbiente.versoes.length - 1 ? 'border-b border-zinc-900' : ''}`}>
                                                <div 
                                                    onClick={(e) => toggleVersao(e, v.id)}
                                                    className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.01] cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div 
                                                            onClick={(e) => toggleSelection(e, v.id)}
                                                            className={`w-4 h-4 flex items-center justify-center shrink-0 border cursor-pointer transition-colors ${
                                                                isChecked 
                                                                    ? 'border-yellow-400 bg-yellow-400/10' 
                                                                    : 'border-zinc-700 hover:border-yellow-400'
                                                            }`}
                                                        >
                                                            {isChecked && <iconify-icon icon="solar:check-read-linear" width="10" className="text-yellow-400"></iconify-icon>}
                                                        </div>
                                                        <iconify-icon icon="solar:document-text-linear" width="13" className={`transition-colors ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}></iconify-icon>
                                                        <div>
                                                            <div className={`text-sm font-medium transition-colors ${isChecked ? 'text-yellow-400' : 'text-white group-hover:text-yellow-400'}`}>{v.nome}</div>
                                                            <div className="font-mono text-[10px] text-zinc-600">{v.data}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex items-center gap-2 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button title="Duplicar versão" onClick={(e) => mockDuplicarVersao(e, v.id)} className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors flex items-center justify-center rounded">
                                                                <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                                                            </button>
                                                            <button title="Excluir versão" onClick={(e) => mockRemoverVersao(e, v.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center rounded">
                                                                <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                            </button>
                                                        </div>
                                                        <span className={`font-mono text-sm font-semibold ${isChecked ? 'text-yellow-400' : 'text-white'}`}>
                                                            {v.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                        <iconify-icon 
                                                            icon={versoesExpandidas[v.id] ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} 
                                                            width="13" 
                                                            className={`transition-colors ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}
                                                        ></iconify-icon>
                                                    </div>
                                                </div>

                                                {versoesExpandidas[v.id] && (
                                                    <div className="px-5 pb-4 flex flex-col gap-2 bg-[#0a0a0a]">
                                                        {v.pecas.map(p => (
                                                            <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 border border-zinc-800 bg-black gap-3 transition-colors hover:border-zinc-700">
                                                                <div className="flex items-start md:items-center gap-4">
                                                                    <div className="w-1.5 h-8 bg-zinc-800 rounded-full shrink-0"></div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="text-xs text-white font-medium tracking-wide">{p.nome}</div>
                                                                        <div className="flex flex-wrap items-center gap-y-1 gap-x-2 font-mono text-[10px] text-zinc-500">
                                                                            <span className="flex items-center gap-1"><iconify-icon icon="solar:box-linear" width="10"></iconify-icon>{p.material}</span>
                                                                            <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                            <span className="flex items-center gap-1"><iconify-icon icon="solar:ruler-linear" width="10"></iconify-icon>{p.espessura}</span>
                                                                            <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                            <span className="flex items-center gap-1"><iconify-icon icon="solar:ruler-cross-pen-linear" width="10"></iconify-icon>{p.area}</span>
                                                                            <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                            <span className="text-zinc-400">{p.acabamento}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0">
                                                                    <span className="font-mono text-xs text-zinc-300">{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                    <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-3">
                                                                        <button 
                                                                            onClick={(e) => mockEditarPeca(e, v.id, p)}
                                                                            title="Editar peça" 
                                                                            className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors flex items-center justify-center rounded"
                                                                        >
                                                                            <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => mockDuplicarPeca(e, v.id, p.id)}
                                                                            title="Duplicar peça" 
                                                                            className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors flex items-center justify-center rounded"
                                                                        >
                                                                            <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => mockRemoverPeca(e, v.id, p.id)}
                                                                            title="Remover peça" 
                                                                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center rounded"
                                                                        >
                                                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {v.pecas.length === 0 && (
                                                            <div className="text-center py-4 bg-black border border-zinc-800">
                                                                <p className="font-mono text-[10px] uppercase text-zinc-600">Sem peças.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Rodapé fixo */}
                        <div className="sticky bottom-0 left-0 right-0 mt-6 bg-[#050505] border-t border-zinc-800 p-4 flex items-center justify-between z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Total selecionado ({selectedIds.length})</span>
                                <span className="text-lg font-mono font-bold text-yellow-400">
                                    {totalSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                            </div>
                            <button
                                onClick={() => alert(`Funcionalidade simulada!\nItens no carrinho: ${selectedIds.length}\nValor Total: ${totalSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)}
                                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-5 py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all disabled:opacity-50 disabled:hover:shadow-none"
                                disabled={selectedIds.length === 0}
                            >
                                <iconify-icon icon="solar:document-linear" width="14"></iconify-icon>
                                Gerar PDF / WhatsApp
                                <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
                            </button>
                        </div>
                    </div>
                )}

            </main>

            {/* ══ PAINEL LATERAL — Dados da medição ══════════════════════ */}
            {painelMedicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setPainelMedicao(null)}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Dados da medição</div>
                                <div className="text-white font-semibold text-sm">{painelMedicao.data}</div>
                            </div>
                            <button
                                onClick={() => setPainelMedicao(null)}
                                className="text-zinc-600 hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-1">
                                Resumo por peça
                            </div>

                            {painelMedicao.resumo.map((r, i) => (
                                <div key={i} className="bg-black border border-zinc-900 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-white font-semibold text-sm">{r.peca}</span>
                                        <span className="font-mono text-sm text-yellow-400 font-bold">{r.area}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-start gap-2">
                                            <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-600 mt-0.5 flex-shrink-0"></iconify-icon>
                                            <span className="font-mono text-[10px] text-zinc-500">{r.acabamentos}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-600 flex-shrink-0"></iconify-icon>
                                            <span className="font-mono text-[10px] text-zinc-500">
                                                {r.recortes === 0 ? 'Sem recortes' : `${r.recortes} recorte${r.recortes > 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer painel */}
                        <div className="px-6 py-4 border-t border-zinc-800">
                            <button
                                onClick={() => {
                                    setPainelMedicao(null);
                                    navigate(`/projetos/${id}/orcamento/novo?medicao_id=${painelMedicao.id}`);
                                }}
                                className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
                                Criar orçamento com estes dados
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ══ MODAL — Agendar Medição ════════════════════════════════ */}
            {modalAgendar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[480px] z-10">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ AGENDAR_MEDIÇÃO ]</div>
                                <div className="text-white font-semibold">Nova medição</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Form */}
                        <div className="p-6 flex flex-col gap-5">
                            {erroAgendar && (
                                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-red-400">{erroAgendar}</span>
                                </div>
                            )}

                            {/* Medidor */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Medidor</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" width="16"></iconify-icon>
                                    <select
                                        value={agMedidor}
                                        onChange={e => setAgMedidor(e.target.value)}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                                    >
                                        <option value="">Selecionar medidor</option>
                                        {medidores.map(m => (
                                            <option key={m.id} value={m.id}>{m.nome}</option>
                                        ))}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                                </div>
                                {medidores.length === 0 && (
                                    <p className="font-mono text-[9px] text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
                                )}
                            </div>

                            {/* Data e hora */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Data e hora</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" width="16"></iconify-icon>
                                    <input
                                        type="datetime-local"
                                        value={agData}
                                        onChange={e => setAgData(e.target.value)}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            {/* Endereço */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">
                                    Endereço <span className="text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                                </label>
                                <div className="relative">
                                    <iconify-icon icon="solar:map-point-linear" className="absolute left-3 top-3.5 text-zinc-600" width="16"></iconify-icon>
                                    <input
                                        type="text"
                                        value={agEndereco}
                                        onChange={e => setAgEndereco(e.target.value)}
                                        placeholder="Rua, número, cidade..."
                                        className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                    />
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={closeAll}
                                    className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAgendarMedicao}
                                    disabled={agendando || !agMedidor || !agData}
                                    className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                                >
                                    {agendando
                                        ? <><iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>Agendando...</>
                                        : <><iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>Confirmar</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Atualizar Status ═══════════════════════════════ */}
            {modalStatus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[400px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ ATUALIZAR_STATUS ]</div>
                                <div className="text-white font-semibold">Novo status do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                {['produzindo', 'entregue'].map(s => {
                                    const cfg = STATUS_CONFIG[s];
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setNovoStatus(s)}
                                            className={`flex items-center gap-3 px-4 py-3.5 border transition-colors ${
                                                novoStatus === s
                                                    ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                                                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${novoStatus === s ? cfg.dot : 'bg-zinc-700'}`}></span>
                                            <span className="font-mono text-[11px] uppercase tracking-widest">{cfg.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={closeAll} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all">
                                    <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Marcar como Perdido ════════════════════════════ */}
            {modalPerda && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 w-full max-w-[440px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-red-400/70 mb-0.5">[ MARCAR_COMO_PERDIDO ]</div>
                                <div className="text-white font-semibold">Confirmar perda do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <p className="font-mono text-xs text-zinc-500">
                                Ao confirmar, o projeto <span className="text-white">{projeto.nome}</span> será marcado como perdido. Esta ação notificará o admin.
                            </p>

                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Motivo (opcional)</label>
                                <textarea
                                    value={motivoPerda}
                                    onChange={e => setMotivoPerda(e.target.value)}
                                    placeholder="Ex: cliente escolheu outro fornecedor..."
                                    rows={3}
                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-zinc-700 resize-none font-mono text-xs"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={closeAll} className="flex-1 border border-red-500/50 bg-red-400/5 text-red-400 text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:bg-red-400/10 transition-all">
                                    <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                                    Confirmar perda
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ══ PAINEL LATERAL — Edição de Peça Mock ══════════════════════ */}
            {pecaEmEdicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setPecaEmEdicao(null)}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Editar Peça</div>
                                <div className="text-white font-semibold text-sm">{pecaEmEdicao.pecaData.nome}</div>
                            </div>
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="text-zinc-600 hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo Formulario */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                            {/* Nome e Valor */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Nome da peça</label>
                                    <input
                                        type="text"
                                        value={pecaEmEdicao.pecaData.nome}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev.pecaData, nome: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Valor (R$)</label>
                                    <input
                                        type="number"
                                        value={pecaEmEdicao.pecaData.valor}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev.pecaData, valor: Number(e.target.value) } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Espessura */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Espessura</label>
                                    <select
                                        value={pecaEmEdicao.pecaData.espessura}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev.pecaData, espessura: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="1cm">1cm</option>
                                        <option value="2cm">2cm</option>
                                        <option value="3cm">3cm</option>
                                    </select>
                                </div>
                                {/* Material */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Material</label>
                                    <select
                                        value={pecaEmEdicao.pecaData.material}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev.pecaData, material: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="Granito São Gabriel">Granito São Gabriel</option>
                                        <option value="Silestone Tigris Sand">Silestone Tigris Sand</option>
                                        <option value="Quartzo Branco">Quartzo Branco</option>
                                    </select>
                                </div>
                            </div>

                            {/* Recortes */}
                            <div>
                                <div className="text-[10px] uppercase font-mono text-zinc-500 block mb-3 border-b border-zinc-800 pb-2">Recortes ({pecaEmEdicao.pecaData.recortes?.length || 0})</div>
                                <div className="flex flex-col gap-2">
                                    {(pecaEmEdicao.pecaData.recortes || []).map(rec => (
                                        <div key={rec.id} className="flex flex-col border border-zinc-800 bg-black p-3 group hover:border-zinc-700 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:scissors-linear" width="14" className="text-zinc-600"></iconify-icon>
                                                    <div>
                                                        <div className="text-xs text-white pb-0.5">{rec.nome}</div>
                                                        <div className="text-[10px] font-mono text-zinc-500">{rec.dimensao}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleRemoverRecorteDrawer(rec.id)}
                                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded"
                                                        title="Remover recorte"
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!pecaEmEdicao.pecaData.recortes || pecaEmEdicao.pecaData.recortes.length === 0) && (
                                        <div className="p-3 border border-dashed border-zinc-800 text-center">
                                            <span className="text-[10px] font-mono text-zinc-600">Nenhum recorte</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer painel */}
                        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSalvarEdicaoPeca}
                                className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2"
                            >
                                <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                                Salvar Peça
                            </button>
                        </div>
                    </div>
                </>
            )}

        </div>
    );
}
