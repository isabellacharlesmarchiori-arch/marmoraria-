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

// ── Dados mock de medições (ainda não integrado via Supabase) ─────────────────

// O projeto será carregado do banco agora

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

// ambientes carregados do Supabase no componente (sem mock)

// ─── Funções puras de duplicação — FORA do componente, sem closures, sem side effects ───
// duplicarAmbiente: recebe um ambiente, retorna um clone 100% novo com novos UUIDs em todos os níveis.
// Não toca em nenhum estado global. Não cria versões extras. Retorna exatamente o que recebe, clonado.
function duplicarAmbiente(amb) {
    return {
        id:     crypto.randomUUID(),
        nome:   `${amb.nome} (Cópia)`,
        status: amb.status || 'em_andamento',
        orcamentos: (amb.orcamentos || []).map(v => ({
            id:          crypto.randomUUID(),
            nome:        v.nome,
            data:        v.data || '',
            valor_total: v.valor_total || 0,
            avulsos: (v.avulsos || []).map(av => ({
                id:             crypto.randomUUID(),
                produto_id:     av.produto_id,
                nome:           av.nome,
                quantidade:     av.quantidade,
                valor_unitario: av.valor_unitario,
                valor_total:    av.valor_total,
            })),
            pecas: (v.pecas || []).map(p => ({
                id:          crypto.randomUUID(),
                nome:        p.nome,
                material_id: p.material_id || '',
                material:    p.material || '',
                espessura:   p.espessura || '',
                area:        p.area || '',
                acabamento:  p.acabamento || '',
                valor:       p.valor || 0,
                recortes: (p.recortes || []).map(r => ({
                    id:      crypto.randomUUID(),
                    nome:    r.nome,
                    dimensao: r.dimensao,
                })),
            })),
        })),
    };
}

// duplicarVersao: idem para uma versao individual.
function duplicarVersao(v) {
    return {
        id:          crypto.randomUUID(),
        nome:        `${v.nome} (Cópia)`,
        data:        v.data || '',
        valor_total: v.valor_total || 0,
        avulsos: (v.avulsos || []).map(av => ({
            id:             crypto.randomUUID(),
            produto_id:     av.produto_id,
            nome:           av.nome,
            quantidade:     av.quantidade,
            valor_unitario: av.valor_unitario,
            valor_total:    av.valor_total,
        })),
        pecas: (v.pecas || []).map(p => ({
            id:          crypto.randomUUID(),
            nome:        p.nome,
            material_id: p.material_id || '',
            material:    p.material || '',
            espessura:   p.espessura || '',
            area:        p.area || '',
            acabamento:  p.acabamento || '',
            valor:       p.valor || 0,
            recortes: (p.recortes || []).map(r => ({
                id:      crypto.randomUUID(),
                nome:    r.nome,
                dimensao: r.dimensao,
            })),
        })),
    };
}

// duplicarPeca: idem para uma peça individual.
function duplicarPeca(p) {
    return {
        id:          crypto.randomUUID(),
        nome:        `${p.nome} (Cópia)`,
        material_id: p.material_id || '',
        material:    p.material || '',
        espessura:   p.espessura || '',
        area:        p.area || '',
        acabamento:  p.acabamento || '',
        valor:       p.valor || 0,
        recortes: (p.recortes || []).map(r => ({
            id:      crypto.randomUUID(),
            nome:    r.nome,
            dimensao: r.dimensao,
        })),
    };
}

// clonarAvulso: para uso em adicionarAvulso
function clonarAvulso(av) {
    return {
        id:             crypto.randomUUID(),
        produto_id:     av.produto_id,
        nome:           String(av.nome           || ''),
        quantidade:     Number(av.quantidade     || 1),
        valor_unitario: Number(av.valor_unitario || 0),
        valor_total:    Number(av.valor_total    || 0),
    };
}

// Recalcula valor_total de uma versão (pecas + avulsos)
function calcTotal(versao) {
    const tp = (versao.pecas   || []).reduce((s, p)  => s + (Number(p.valor)       || 0), 0);
    const ta = (versao.avulsos || []).reduce((s, av) => s + (Number(av.valor_total) || 0), 0);
    return tp + ta;
}

// ── Helpers de normalização — transforma a estrutura do Supabase ──────────────

function normalizarAmbiente(amb) {
    const orcamentosDoAmb = amb.orcamentos ?? [];
    const versoes = orcamentosDoAmb.map(orc => ({
        id:          orc.id,
        nome:        orc.nome_versao ?? orc.nome ?? 'Versão',
        valor_total: orc.valor_total ?? 0,
        avulsos:     [],
        data:        orc.created_at
            ? new Date(orc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
            : '',
        pecas: (orc.orcamento_pecas ?? []).map((op, idx) => ({
            id:          op.id,
            nome:        `Peça ${idx + 1}`,
            material:    'Material Padrão',
            material_id: op.material_id ?? '',
            espessura:   '—',
            area:        '—',
            acabamento:  '—',
            valor:       op.valor_total ?? 0,
            recortes:    [],
        })),
    }));
    const orcamento_status = versoes.length === 0
        ? 'sem_orcamento'
        : orcamentosDoAmb.some(o => o.status === 'completo') ? 'completo' : 'em_andamento';
    return { id: amb.id, nome: amb.nome, orcamento_status, orcamentos: versoes };
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TelaProjetoVendedor() {
    const { id } = useParams();
    console.log('ID do Projeto recebido:', id);
    const navigate = useNavigate();
    const { session, profile, loading: authLoading, profileLoading } = useAuth();

    const [activeTab, setActiveTab] = useState('medicoes');

    // ── Estado único de ambientes — alimentado pelo Supabase ─────────────────
    const [ambientes, setAmbientes] = useState([]);
    const [projeto, setProjeto] = useState(null);
    const [loadingProjeto, setLoadingProjeto] = useState(true);

    // Helper para recarregar ambientes do banco após mutações
    const recarregarAmbientes = React.useCallback(async () => {
        if (!session || !id) return;
        const { data, error } = await supabase
            .from('ambientes')
            .select(`
                id, nome,
                orcamentos(id, nome_versao, valor_total, status, created_at,
                    orcamento_pecas(id, valor_total, material_id)
                )
            `)
            .eq('projeto_id', id)
            .order('created_at');
        if (error) { console.error('Erro ao recarregar ambientes:', error.message); return; }
        if (data) setAmbientes(data.map(normalizarAmbiente));
    }, [session, id]);

    // Carregamento inicial
    useEffect(() => {
        if (!id) return;

        async function loadData() {
            console.log('[TelaProjeto] Iniciando loadData para ID:', id);
            setLoadingProjeto(true);

            try {
                const { data: { session: sess } } = await supabase.auth.getSession();
                console.log('[TelaProjeto] Sessão ativa:', sess ? `user=${sess.user.id}` : 'NENHUMA (anônimo)');

                const [resP, resA] = await Promise.all([
                    supabase.from('projetos').select('*').eq('id', id).single(),
                    supabase.from('ambientes').select(`
                        id, nome,
                        orcamentos(id, nome_versao, valor_total, status, created_at,
                            orcamento_pecas(id, valor_total, material_id)
                        )
                    `).eq('projeto_id', id).order('created_at'),
                ]);

                if (resP.error) console.error('[TelaProjeto] Erro projeto:', resP.error.message);
                if (resA.error) console.error('[TelaProjeto] Erro ambientes:', resA.error.message);

                console.log('[TelaProjeto] Projeto retornado:', resP.data ? `"${resP.data.nome}"` : 'null');
                console.log('DADOS RECEBIDOS:', resA.data);

                if (resP.data) setProjeto(resP.data);

                // Dados reais se vieram do banco, mock completo se banco vazio/erro
                const temDadosReais = Array.isArray(resA.data) && resA.data.length > 0;
                const dadosNormalizados = temDadosReais
                    ? resA.data.map(normalizarAmbiente)
                    : [{
                        id: crypto.randomUUID(),
                        nome: 'Ambiente de Teste (Mock)',
                        orcamento_status: 'em_andamento',
                        orcamentos: [{
                            id: crypto.randomUUID(),
                            nome: 'Versão Inicial (Mock)',
                            valor_total: 4500.00,
                            data: '01 jan 2026',
                            avulsos: [],
                            pecas: [
                                { id: crypto.randomUUID(), nome: 'Bancada Cozinha', material: 'Granito Via Láctea', material_id: '', espessura: '3cm', area: '1,20 m²', acabamento: 'Meia-esquadria', valor: 2500.00, recortes: [] },
                                { id: crypto.randomUUID(), nome: 'Ilha Central',    material: 'Granito Via Láctea', material_id: '', espessura: '3cm', area: '0,90 m²', acabamento: 'Reto simples',    valor: 2000.00, recortes: [] },
                            ],
                        }],
                    }];

                console.log('[TelaProjeto] setAmbientes chamado com', dadosNormalizados.length, 'item(s), fonte:', temDadosReais ? 'BANCO' : 'MOCK');
                setAmbientes(dadosNormalizados.slice()); // .slice() força nova referência de array

            } catch (err) {
                console.error('[TelaProjeto] Erro fatal no loadData:', err);
            } finally {
                setLoadingProjeto(false);
            }
        }

        loadData();
    }, [id]);

    const [versoesExpandidas, setVersoesExpandidas] = useState({});

    const toggleVersao = (e, versaoId) => {
        e.stopPropagation();
        setVersoesExpandidas(prev => ({ ...prev, [versaoId]: !prev[versaoId] }));
    };

    // ── Seleção de versões para o carrinho ──────────────────────────────
    const [selectedIds, setSelectedIds] = useState([]);
    const [pecaEmEdicao, setPecaEmEdicao] = useState(null);

    // Catálogos do Supabase
    const [catMateriais,      setCatMateriais]      = useState([]);
    const [catProdAvulsos,    setCatProdAvulsos]    = useState([]);

    // Modais / edição de versão
    const [editingAmbNome,   setEditingAmbNome]   = useState(null);
    const [editingVersaoMat, setEditingVersaoMat] = useState(null);
    const [editingVersao,    setEditingVersao]    = useState(null);
    const [novoAvulso,       setNovoAvulso]       = useState({});
    const [bulkMat,          setBulkMat]          = useState({});

    const toggleSelection = (e, versaoId) => {
        e.stopPropagation();
        setSelectedIds(p => p.includes(versaoId) ? p.filter(x => x !== versaoId) : [...p, versaoId]);
    };

    // ── DUPLICAR AMBIENTE — local-only por enquanto (INSERT complex) ──────────
    const mockDuplicarAmbiente = (e, ambienteId) => {
        e.stopPropagation();
        const idx = ambientes.findIndex(a => a.id === ambienteId);
        if (idx === -1) return;
        const clone = duplicarAmbiente(ambientes[idx]);
        setAmbientes([
            ...ambientes.slice(0, idx + 1),
            clone,
            ...ambientes.slice(idx + 1),
        ]);
    };

    // ── EXCLUIR AMBIENTE — persiste no Supabase (cascade: orcamentos + pecas) ─
    const mockExcluirAmbiente = async (e, ambienteId) => {
        e.stopPropagation();
        if (!window.confirm('Excluir este ambiente e todas as suas versões?')) return;

        // Optimistic update imediato
        const idsVersoes = (ambientes.find(a => a.id === ambienteId)?.orcamentos || []).map(v => v.id);
        setSelectedIds(s => s.filter(sid => !idsVersoes.includes(sid)));
        setAmbientes(prev => prev.filter(a => a.id !== ambienteId));

        // 1. Exclui as peças dos orçamentos (orcamento_pecas) para todos os orçamentos deste ambiente
        if (idsVersoes.length > 0) {
            const { error: errPecas } = await supabase
                .from('orcamento_pecas')
                .delete()
                .in('orcamento_id', idsVersoes);
            if (errPecas) console.error('Erro ao excluir peças do ambiente:', errPecas.message);

            // 2. Exclui os orçamentos (versões) do ambiente
            const { error: errOrcs } = await supabase
                .from('orcamentos')
                .delete()
                .in('id', idsVersoes);
            if (errOrcs) console.error('Erro ao excluir orçamentos do ambiente:', errOrcs.message);
        }

        // 3. Exclui o ambiente em si
        const { error: errAmb } = await supabase
            .from('ambientes')
            .delete()
            .eq('id', ambienteId);
        if (errAmb) {
            console.error('Erro ao excluir ambiente:', errAmb.message);
            // Reverte o optimistic update recarregando do banco
            recarregarAmbientes();
        }
    };

    // ── RENOMEAR AMBIENTE — persiste no Supabase ──────────────────────────────
    const salvarNomeAmbiente = async () => {
        if (!editingAmbNome) return;
        // Optimistic update
        setAmbientes(prev => prev.map(a =>
            a.id === editingAmbNome.id ? { ...a, nome: editingAmbNome.nome } : a
        ));
        setEditingAmbNome(null);
        // Persiste
        const { error } = await supabase
            .from('ambientes')
            .update({ nome: editingAmbNome.nome })
            .eq('id', editingAmbNome.id);
        if (error) {
            console.error('Erro ao renomear ambiente:', error.message);
            recarregarAmbientes();
        }
    };

    // ── DUPLICAR VERSÃO — local-only por enquanto ─────────────────────────────
    const mockDuplicarVersao = (e, ambienteId, versaoId) => {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            const base = amb.orcamentos.find(v => v.id === versaoId);
            if (!base) return amb;
            const novaVersao = duplicarVersao(base);
            return {
                ...amb,
                orcamentos: amb.orcamentos.flatMap(v => v.id === versaoId ? [v, novaVersao] : [v]),
            };
        }));
    };

    // ── EXCLUIR VERSÃO — persiste no Supabase (cascade: orcamento_pecas) ──────
    const mockRemoverVersao = async (e, ambienteId, versaoId) => {
        e.stopPropagation();
        if (!window.confirm('Excluir esta versão do orçamento?')) return;

        // Optimistic update
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return { ...amb, orcamentos: amb.orcamentos.filter(v => v.id !== versaoId) };
        }));
        setSelectedIds(p => p.filter(sid => sid !== versaoId));

        // 1. Exclui as peças desta versão
        const { error: errPecas } = await supabase
            .from('orcamento_pecas')
            .delete()
            .eq('orcamento_id', versaoId);
        if (errPecas) console.error('Erro ao excluir peças da versão:', errPecas.message);

        // 2. Exclui o orçamento (versão)
        const { error: errOrc } = await supabase
            .from('orcamentos')
            .delete()
            .eq('id', versaoId);
        if (errOrc) {
            console.error('Erro ao excluir versão:', errOrc.message);
            recarregarAmbientes();
        }
    };

    // ── BULK MATERIAL — atualiza material_id de todas as peças da versão ────
    const aplicarMaterialEmMassa = (ambId, versaoId) => {
        const matId = bulkMat[versaoId];
        if (!matId) return;
        const matNome = catMateriais.find(m => m.id === matId)?.nome || '';
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => ({
                        id:          p.id,
                        nome:        p.nome,
                        material_id: matId,
                        material:    matNome,
                        espessura:   p.espessura,
                        area:        p.area,
                        acabamento:  p.acabamento,
                        valor:       p.valor,
                        recortes:    p.recortes,
                    }));
                    return { ...v, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        setBulkMat(p => ({ ...p, [versaoId]: '' }));
    };

    // ── Carregar catálogos do Supabase ────────────────────────────────────────
    useEffect(() => {
        if (!profile?.empresa_id) return;
        Promise.all([
            supabase.from('materiais').select('id, nome').eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
            supabase.from('produtos_avulsos').select('id, nome, preco_unitario').eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
        ]).then(([{ data: mats }, { data: prods }]) => {
            if (mats)  setCatMateriais(mats);
            if (prods) setCatProdAvulsos(prods);
        }).catch(() => {});
    }, [profile?.empresa_id]);

    // ── AVULSOS CRUD (local apenas — integração Supabase futura) ─────────────
    const adicionarAvulso = (ambId, versaoId) => {
        const sel  = novoAvulso[versaoId];
        if (!sel?.produto_id) return;
        const prod = catProdAvulsos.find(p => p.id === sel.produto_id);
        if (!prod) return;
        const qtd  = Number(sel.quantidade) || 1;
        const vu   = Number(prod.preco_unitario) || 0;
        const novo = clonarAvulso({ produto_id: prod.id, nome: prod.nome, quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu, id: 'tmp' });
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = [...(v.avulsos || []), novo];
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
        setNovoAvulso(p => ({ ...p, [versaoId]: { produto_id: '', quantidade: 1 } }));
    };

    const editarAvulso = (ambId, versaoId, avId, field, rawValue) => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = (v.avulsos || []).map(av => {
                        if (av.id !== avId) return av;
                        const qtd = field === 'quantidade'     ? Number(rawValue) : av.quantidade;
                        const vu  = field === 'valor_unitario' ? Number(rawValue) : av.valor_unitario;
                        return { id: av.id, produto_id: av.produto_id, nome: av.nome, quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu };
                    });
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
    };

    const removerAvulso = (ambId, versaoId, avId) => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = (v.avulsos || []).filter(av => av.id !== avId);
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
    };

    // • EDITAR VERSÃO — modal granular
    // Recebe ambId, ambNome e versao diretamente do JSX (nunca lê MOCK_AMBIENTES)
    const abrirEditarVersao = (e, ambId, ambNome, versao) => {
        e.stopPropagation();
        setEditingVersao({
            ambId,
            versaoId:   versao.id,
            nomeAmb:    ambNome,
            nomeVersao: versao.nome,
            pecas: (versao.pecas || []).map(p => ({ id: p.id, nome: p.nome, material_id: p.material_id || '' })),
        });
    };

    const salvarEdicaoVersao = () => {
        if (!editingVersao) return;
        const { ambId, versaoId, nomeAmb, nomeVersao, pecas: pecasEdit } = editingVersao;
        const matMap = Object.fromEntries(catMateriais.map(m => [m.id, m.nome]));
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                id:         amb.id,
                nome:       nomeAmb,
                status:     amb.status,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => {
                        const ed = pecasEdit.find(ep => ep.id === p.id);
                        if (!ed) return p;
                        const matNome = matMap[ed.material_id] || p.material;
                        return { id: p.id, nome: ed.nome, material_id: ed.material_id, material: matNome, espessura: p.espessura, area: p.area, acabamento: p.acabamento, valor: p.valor, recortes: p.recortes };
                    });
                    return { ...v, nome: nomeVersao, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        setEditingVersao(null);
    };

    const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const totalCarrinho = ambientes
        .flatMap(a => a.orcamentos)
        .filter(o => selectedIds.includes(o.id))
        .reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);

    // ── DUPLICAR PEÇA — local-only ────────────────────────────────────────────
    const mockDuplicarPeca = (e, ambienteId, versaoId, pecaId) => {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const orig = v.pecas.find(x => x.id === pecaId);
                    if (!orig) return v;
                    const copia = duplicarPeca(orig);
                    copia.nome = `${orig.nome} (Cópia)`;
                    const novasPecas = v.pecas.flatMap(x => x.id === pecaId ? [x, copia] : [x]);
                    return { ...v, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
    };

    // ── REMOVER PEÇA — persiste no Supabase ─────────────────────────────────
    const mockRemoverPeca = async (e, ambienteId, versaoId, pecaId) => {
        e.stopPropagation();

        // Optimistic update
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const newPecaList = v.pecas.filter(x => x.id !== pecaId);
                    const newTotal = newPecaList.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecaList, valor_total: newTotal };
                })
            };
        }));

        // Persiste no banco
        const { error } = await supabase
            .from('orcamento_pecas')
            .delete()
            .eq('id', pecaId);
        if (error) {
            console.error('Erro ao excluir peça:', error.message);
            recarregarAmbientes();
        }
    };

    const mockEditarPeca = (e, ambienteId, versaoId, peca) => {
        e.stopPropagation();
        setPecaEmEdicao({ ambienteId, versaoId, pecaId: peca.id, pecaData: JSON.parse(JSON.stringify(peca)) });
    };

    const handleSalvarEdicaoPeca = () => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== pecaEmEdicao.ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== pecaEmEdicao.versaoId) return v;
                    const newPecas = v.pecas.map(p => p.id === pecaEmEdicao.pecaId ? pecaEmEdicao.pecaData : p);
                    const novoValorTotal = newPecas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecas, valor_total: novoValorTotal };
                })
            };
        }));
        setPecaEmEdicao(null);
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

    // ════════════════════════════════════════════════════════════════════════
    // SAFETY GUARD — impede renderização com dados nulos
    // Se qualquer uma dessas condições for verdadeira, a tela preta é impossível
    // ════════════════════════════════════════════════════════════════════════
    // Loading: aguarda auth + perfil + busca do projeto
    if (authLoading || profileLoading || loadingProjeto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-zinc-500">
                    <iconify-icon icon="solar:spinner-linear" width="40" className="animate-spin text-yellow-400"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest">Carregando dados do projeto...</p>
                </div>
            </div>
        );
    }

    // Loading terminou mas projeto não foi encontrado (ID inválido, acesso negado, etc.)
    if (!projeto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
                <div className="text-center gap-4 flex flex-col">
                    <p className="font-mono text-xs text-zinc-500">Projeto não encontrado ou acesso negado.</p>
                    <button onClick={() => navigate('/projetos')} className="text-[10px] uppercase font-mono text-yellow-400 border border-yellow-400/20 px-4 py-2 hover:bg-yellow-400/10 transition-colors">Voltar para Projetos</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-yellow-400/30">


            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-64">
                {/* ── Breadcrumb ─────────────────────────────────────────── */}
                <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
                    <span onClick={() => navigate('/projetos')} className="hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
                    <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
                    <span className="text-zinc-400">{projeto?.nome ?? '—'}</span>
                </div>

                {/* ── Header do Projeto ──────────────────────────────────── */}
                <section className="sys-reveal mb-8">
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                            {/* Info */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-white tracking-tighter">{projeto?.nome ?? '—'}</h1>
                                    <StatusPill status={projeto?.status ?? 'aprovado'} />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                                    <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <a href={`/clientes/${projeto?.cliente?.id}`} className="hover:text-yellow-400 transition-colors">
                                        {projeto?.cliente?.nome ?? '—'}
                                    </a>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto?.criado_em ?? '—'}</span>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:user-id-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto?.vendedor ?? '—'}</span>
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

                            {(medicoes ?? []).map((m, i) => (
                                <div
                                    key={m?.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.01] transition-colors ${i < (medicoes?.length ?? 0) - 1 ? 'border-b border-zinc-900' : ''}`}
                                >
                                    <div className="col-span-4 flex items-center gap-2">
                                        <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                                        <span className="text-sm text-white font-medium">{m?.data ?? '—'}</span>
                                    </div>
                                    <div className="col-span-3 font-mono text-[11px] text-zinc-500">{m?.medidor ?? '—'}</div>
                                    <div className="col-span-2">
                                        <MedicaoPill status={m?.status ?? 'agendada'} />
                                    </div>
                                    <div className="col-span-3 flex justify-end">
                                        {m?.status === 'processada' && (
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

                            {(medicoes?.length ?? 0) === 0 && (
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
                    <div>
                        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                            02 // Ambientes e Orçamentos
                        </div>
                        <div className="flex flex-col gap-4">
                            {ambientes.map(amb => (
                                <div key={amb?.id} className="bg-[#0a0a0a] border border-zinc-800">
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <iconify-icon icon="solar:layers-minimalistic-linear" width="14" className="text-zinc-600 shrink-0"></iconify-icon>
                                            <span className="text-white font-semibold text-sm tracking-tight truncate">{amb?.nome ?? 'Ambiente'}</span>
                                            {amb?.orcamento_status === 'completo'
                                                ? <span className="shrink-0 px-2 py-0.5 border border-green-500/30 text-[9px] font-mono uppercase text-green-400 bg-green-400/5">Completo</span>
                                                : amb?.orcamento_status === 'sem_orcamento'
                                                    ? <span className="shrink-0 px-2 py-0.5 border border-zinc-700 text-[9px] font-mono uppercase text-zinc-500 bg-zinc-900">Sem orçamento</span>
                                                    : <span className="shrink-0 px-2 py-0.5 border border-yellow-400/30 text-[9px] font-mono uppercase text-yellow-400 bg-yellow-400/5">Em andamento</span>
                                            }
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0 ml-3">
                                            <span className="font-mono text-sm font-bold text-white">
                                                {fmtBRL((amb?.orcamentos ?? []).reduce((s, v) => s + (v.valor_total ?? 0), 0))}
                                            </span>
                                            {/* ── Tríade de Ações do Ambiente ── */}
                                            <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditingAmbNome({ id: amb?.id, nome: amb?.nome }); }}
                                                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1.5 hover:border-white hover:text-white transition-colors"
                                                title="Renomear ambiente"
                                            >
                                                <iconify-icon icon="solar:pen-linear" width="12"></iconify-icon>
                                            </button>
                                            <button
                                                onClick={(e) => mockDuplicarAmbiente(e, amb?.id)}
                                                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1.5 hover:border-yellow-400 hover:text-yellow-400 transition-colors"
                                                title="Duplicar ambiente"
                                            >
                                                <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
                                            </button>
                                            <button
                                                onClick={(e) => mockExcluirAmbiente(e, amb?.id)}
                                                className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1.5 hover:border-red-400 hover:text-red-400 transition-colors"
                                                title="Excluir ambiente"
                                            >
                                                <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                                            </button>
                                        </div>{/* fim gap-1.5 */}
                                        </div>{/* fim gap-4 wrapper */}
                                    </div>{/* fim header row */}

                                    <div>
                                        {/* Placeholder visível quando não há orçamentos no banco */}
                                        {(amb?.orcamentos?.length ?? 0) === 0 && (
                                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-900 opacity-40">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-4 h-4 border border-zinc-700"></div>
                                                    <iconify-icon icon="solar:document-text-linear" width="13" className="text-zinc-600"></iconify-icon>
                                                    <div>
                                                        <div className="text-sm font-medium text-zinc-400">Versão Base</div>
                                                        <div className="font-mono text-[10px] text-zinc-600">Nenhum orçamento cadastrado</div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-sm font-semibold text-zinc-500">{fmtBRL(0)}</span>
                                                    <iconify-icon icon="solar:alt-arrow-down-linear" width="13" className="text-zinc-700"></iconify-icon>
                                                </div>
                                            </div>
                                        )}
                                        {(amb?.orcamentos ?? []).map((v, i) => {
                                            const isChecked = selectedIds.includes(v?.id);
                                            return (
                                                <div key={v?.id} className={`flex flex-col group transition-colors ${i < (amb?.orcamentos?.length ?? 0) - 1 ? 'border-b border-zinc-900' : ''}`}>
                                                    <div 
                                                        onClick={(e) => toggleVersao(e, v?.id)}
                                                        className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.01] cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                onClick={(e) => toggleSelection(e, v?.id)}
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
                                                                <div className={`text-sm font-medium transition-colors ${isChecked ? 'text-yellow-400' : 'text-white group-hover:text-yellow-400'}`}>{v?.nome ?? 'Versão'}</div>
                                                                <div className="font-mono text-[10px] text-zinc-600 flex items-center gap-1.5">
                                                                    <span>{v?.data ?? '—'}</span>
                                                                    {(v?.pecas?.length ?? 0) > 0 && (
                                                                        <>
                                                                            <span className="text-zinc-800">·</span>
                                                                            <span>{v.pecas.length} {v.pecas.length === 1 ? 'peça' : 'peças'}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2 mr-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                                                                <button title="Editar versão" onClick={(e) => abrirEditarVersao(e, amb?.id, amb?.nome, v)} className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors flex items-center justify-center rounded">
                                                                    <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                                                                </button>
                                                                <button title="Duplicar versão" onClick={(e) => mockDuplicarVersao(e, amb?.id, v?.id)} className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors flex items-center justify-center rounded">
                                                                    <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                                                                </button>
                                                                <button title="Excluir versão" onClick={(e) => mockRemoverVersao(e, amb?.id, v?.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center rounded">
                                                                    <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className={`font-mono text-sm font-semibold ${isChecked ? 'text-yellow-400' : 'text-white'}`}>
                                                                    {fmtBRL(v?.valor_total)}
                                                                </span>
                                                                <iconify-icon 
                                                                    icon={versoesExpandidas[v?.id] ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} 
                                                                    width="13" 
                                                                    className={`transition-colors ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}
                                                                ></iconify-icon>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {versoesExpandidas[v?.id] && (
                                                        <div className="px-5 pb-5 flex flex-col gap-3 bg-[#0a0a0a] border-t border-zinc-900">

                                                            {/* Peças */}
                                                            {(v?.pecas ?? []).map(p => (
                                                                <div key={p?.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 border border-zinc-800 bg-black gap-3 transition-colors hover:border-zinc-700">
                                                                    <div className="flex items-start md:items-center gap-4">
                                                                        <div className="w-1.5 h-8 bg-zinc-800 rounded-full shrink-0"></div>
                                                                        <div className="flex flex-col gap-1">
                                                                            <div className="text-xs text-white font-medium tracking-wide">{p?.nome ?? 'Peça'}</div>
                                                                            <div className="flex flex-wrap items-center gap-y-1 gap-x-2 font-mono text-[10px] text-zinc-500">
                                                                                <span className="flex items-center gap-1"><iconify-icon icon="solar:box-linear" width="10"></iconify-icon>{p?.material ?? '—'}</span>
                                                                                <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                                <span className="flex items-center gap-1"><iconify-icon icon="solar:ruler-linear" width="10"></iconify-icon>{p?.espessura ?? '—'}</span>
                                                                                <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                                <span className="flex items-center gap-1"><iconify-icon icon="solar:ruler-cross-pen-linear" width="10"></iconify-icon>{p?.area ?? '—'}</span>
                                                                                <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                                                                <span className="text-zinc-400">{p?.acabamento ?? '—'}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-2 md:mt-0">
                                                                        <span className="font-mono text-xs text-zinc-300">{fmtBRL(p?.valor)}</span>
                                                                        <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-3">
                                                                            <button onClick={(e) => mockEditarPeca(e, amb?.id, v?.id, p)} title="Editar peça" className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors flex items-center justify-center rounded">
                                                                                <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                                                                            </button>
                                                                            <button onClick={(e) => mockDuplicarPeca(e, amb?.id, v?.id, p?.id)} title="Duplicar peça" className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors flex items-center justify-center rounded">
                                                                                <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                                                                            </button>
                                                                            <button onClick={(e) => mockRemoverPeca(e, amb?.id, v?.id, p?.id)} title="Remover peça" className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center rounded">
                                                                                <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {(v?.pecas?.length ?? 0) === 0 && (
                                                                <div className="text-center py-4 bg-black border border-zinc-800">
                                                                    <p className="font-mono text-[10px] uppercase text-zinc-600">Sem peças.</p>
                                                                </div>
                                                            )}

                                                            {/* Bulk Material Select */}
                                                            <div className="flex items-center gap-2 mt-2 bg-black border border-zinc-900 p-2">
                                                                <iconify-icon icon="solar:box-linear" width="14" className="text-zinc-700 ml-1"></iconify-icon>
                                                                <select
                                                                    value={bulkMat[v?.id] || ''}
                                                                    onChange={e2 => setBulkMat(p => ({ ...p, [v?.id]: e2.target.value }))}
                                                                    className="flex-1 bg-black text-zinc-400 text-[11px] font-mono outline-none border-none focus:ring-0"
                                                                >
                                                                    <option value="">Aplicar material em todas as peças...</option>
                                                                    {catMateriais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                                                </select>
                                                                <button
                                                                    onClick={() => aplicarMaterialEmMassa(amb?.id, v?.id)}
                                                                    disabled={!bulkMat[v?.id]}
                                                                    className="border border-yellow-400/50 text-yellow-400 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 hover:bg-yellow-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                                                >
                                                                    Aplicar
                                                                </button>
                                                            </div>

                                                            {/* Itens Avulsos */}
                                                            <div className="border-t border-zinc-900 pt-3">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <iconify-icon icon="solar:add-circle-linear" width="12" className="text-zinc-600"></iconify-icon>
                                                                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Itens Avulsos</span>
                                                                </div>
                                                                {(v?.avulsos?.length ?? 0) > 0 && (
                                                                    <div className="flex flex-col gap-1 mb-2">
                                                                        {(v?.avulsos ?? []).map(av => (
                                                                            <div key={av?.id} className="flex items-center gap-2 bg-black/40 border border-zinc-800/60 px-3 py-2">
                                                                                <span className="flex-1 text-[11px] text-zinc-300 truncate">{av?.nome ?? 'Avulso'}</span>
                                                                                <input type="number" min="1" value={av?.quantidade ?? 1}
                                                                                    onChange={e2 => editarAvulso(amb?.id, v?.id, av?.id, 'quantidade', e2.target.value)}
                                                                                    className="w-12 bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono text-center px-1 py-1 outline-none focus:border-yellow-400"
                                                                                />
                                                                                <span className="font-mono text-[10px] text-zinc-500 w-16 text-right">{fmtBRL(av?.valor_unitario)}</span>
                                                                                <span className="font-mono text-[11px] text-white w-20 text-right">{fmtBRL(av?.valor_total)}</span>
                                                                                <button onClick={() => removerAvulso(amb?.id, v?.id, av?.id)} className="text-zinc-700 hover:text-red-400 transition-colors ml-1">
                                                                                    <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {catProdAvulsos.length > 0 ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <select
                                                                            value={novoAvulso[v?.id]?.produto_id || ''}
                                                                            onChange={e2 => setNovoAvulso(p => ({ ...p, [v?.id]: { ...p[v?.id], produto_id: e2.target.value, quantidade: p[v?.id]?.quantidade || 1 } }))}
                                                                            className="flex-1 bg-black border border-zinc-800 text-zinc-400 text-[11px] font-mono px-2 py-1.5 outline-none focus:border-zinc-600"
                                                                        >
                                                                            <option value="">Adicionar produto avulso...</option>
                                                                            {catProdAvulsos.map(pr => <option key={pr.id} value={pr.id}>{pr.nome} — {fmtBRL(pr.preco_unitario)}</option>)}
                                                                        </select>
                                                                        <input type="number" min="1" value={novoAvulso[v?.id]?.quantidade || 1}
                                                                            onChange={e2 => setNovoAvulso(p => ({ ...p, [v?.id]: { ...p[v?.id], quantidade: e2.target.value } }))}
                                                                            className="w-12 bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono text-center px-1 py-1.5 outline-none"
                                                                        />
                                                                        <button
                                                                            onClick={() => adicionarAvulso(amb?.id, v?.id)}
                                                                            disabled={!novoAvulso[v?.id]?.produto_id}
                                                                            className="border border-zinc-700 text-zinc-400 text-[10px] font-mono px-3 py-1.5 hover:border-white hover:text-white transition-colors disabled:opacity-30"
                                                                        >
                                                                            <iconify-icon icon="solar:add-linear" width="12"></iconify-icon>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
                                                                        {profile?.empresa_id ? 'Nenhum produto avulso cadastrado.' : 'Conecte-se para ver produtos avulsos.'}
                                                                    </p>
                                                                )}
                                                            </div>

                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Rodapé fixo */}
                        <div className="fixed bottom-0 left-0 right-0 bg-[#050505] border-t border-zinc-800 p-4 flex items-center justify-between z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Total selecionado ({selectedIds.length})</span>
                                <span className="text-lg font-mono font-bold text-yellow-400">
                                    {fmtBRL(totalCarrinho)}
                                </span>
                            </div>
                            <button
                                onClick={() => navigate(`/projetos/${id}/carrinho`)}
                                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-5 py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all"
                            >
                                <iconify-icon icon="solar:cart-linear" width="14"></iconify-icon>
                                Ir para o Carrinho
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
                                <div className="text-white font-semibold text-sm">{painelMedicao?.data ?? '—'}</div>
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

                            {(painelMedicao?.resumo ?? []).map((r, i) => (
                                <div key={i} className="bg-black border border-zinc-900 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-white font-semibold text-sm">{r?.peca ?? 'Peça'}</span>
                                        <span className="font-mono text-sm text-yellow-400 font-bold">{r?.area ?? '—'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-start gap-2">
                                            <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-600 mt-0.5 flex-shrink-0"></iconify-icon>
                                            <span className="font-mono text-[10px] text-zinc-500">{r?.acabamentos ?? '—'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-600 flex-shrink-0"></iconify-icon>
                                            <span className="font-mono text-[10px] text-zinc-500">
                                                {(r?.recortes ?? 0) === 0 ? 'Sem recortes' : `${r?.recortes} recorte${(r?.recortes ?? 0) > 1 ? 's' : ''}`}
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
                                    navigate(`/projetos/${id}/orcamento/novo?medicao_id=${painelMedicao?.id}`);
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
                                Ao confirmar, o projeto <span className="text-white">{projeto?.nome ?? 'Este projeto'}</span> será marcado como perdido. Esta ação notificará o admin.
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

            {/* ══ MODAL — Renomear Ambiente ════════════════════════════════ */}
            {editingAmbNome && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingAmbNome(null)}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-md z-10">
                        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
                            <span className="font-mono text-[10px] uppercase text-white font-bold tracking-widest">Renomear Ambiente</span>
                            <button onClick={() => setEditingAmbNome(null)} className="text-zinc-500 hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6">
                            <input
                                autoFocus
                                value={editingAmbNome.nome}
                                onChange={e => setEditingAmbNome({ ...editingAmbNome, nome: e.target.value })}
                                className="w-full bg-black border border-zinc-800 p-3 text-sm text-white focus:border-yellow-400 outline-none font-mono"
                            />
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setEditingAmbNome(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-800 py-3 hover:text-white transition-colors">Cancelar</button>
                                <button onClick={salvarNomeAmbiente} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Editar Versão (granular) ══════════════════════════ */}
            {editingVersao && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingVersao(null)}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-700 w-full max-w-lg z-10 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
                            <span className="font-mono text-[10px] uppercase text-white font-bold tracking-widest">Editar Versão</span>
                            <button onClick={() => setEditingVersao(null)} className="text-zinc-500 hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex flex-col gap-4">
                            <div>
                                <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-1">Nome do Ambiente</label>
                                <input
                                    value={editingVersao.nomeAmb}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeAmb: e.target.value }))}
                                    className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-1">Nome da Versão</label>
                                <input
                                    value={editingVersao.nomeVersao}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeVersao: e.target.value }))}
                                    className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            {editingVersao.pecas.length > 0 && (
                                <div>
                                    <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-2">Nome e Material por Peça</label>
                                    <div className="flex flex-col gap-2">
                                        {editingVersao.pecas.map((ep, i) => (
                                            <div key={ep.id} className="flex flex-col gap-1.5 bg-black/40 border border-zinc-800/50 px-3 py-2.5">
                                                <input
                                                    value={ep.nome}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-black border border-zinc-800 focus:border-zinc-600 outline-none text-zinc-200 text-[11px] font-mono px-2 py-1"
                                                    placeholder="Nome da peça"
                                                />
                                                <select
                                                    value={ep.material_id || ''}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400"
                                                >
                                                    <option value="">Sem material definido</option>
                                                    {catMateriais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                                </select>
                                                {catMateriais.length === 0 && (
                                                    <p className="font-mono text-[9px] text-zinc-700">Conecte-se para ver catálogo de materiais.</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 px-6 py-4 border-t border-zinc-800 shrink-0">
                            <button onClick={() => setEditingVersao(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-800 py-3 text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={salvarEdicaoVersao} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
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
                                <div className="text-white font-semibold text-sm">{pecaEmEdicao?.pecaData?.nome ?? 'Peça'}</div>
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
                                        value={pecaEmEdicao?.pecaData?.nome ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, nome: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Valor (R$)</label>
                                    <input
                                        type="number"
                                        value={pecaEmEdicao?.pecaData?.valor ?? 0}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, valor: Number(e.target.value) } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Espessura */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Espessura</label>
                                    <select
                                        value={pecaEmEdicao?.pecaData?.espessura ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, espessura: e.target.value } }))}
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
                                        value={pecaEmEdicao?.pecaData?.material ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, material: e.target.value } }))}
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
                                <div className="text-[10px] uppercase font-mono text-zinc-500 block mb-3 border-b border-zinc-800 pb-2">Recortes ({(pecaEmEdicao?.pecaData?.recortes ?? []).length})</div>
                                <div className="flex flex-col gap-2">
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).map(rec => (
                                        <div key={rec?.id} className="flex flex-col border border-zinc-800 bg-black p-3 group hover:border-zinc-700 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:scissors-linear" width="14" className="text-zinc-600"></iconify-icon>
                                                    <div>
                                                        <div className="text-xs text-white pb-0.5">{rec?.nome ?? 'Recorte'}</div>
                                                        <div className="text-[10px] font-mono text-zinc-500">{rec?.dimensao ?? '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleRemoverRecorteDrawer(rec?.id)}
                                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded"
                                                        title="Remover recorte"
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).length === 0 && (
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
