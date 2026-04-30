import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { normalizarAmbiente } from '../utils/projetoUtils';

const AMBIENTES_SELECT = `
    id, nome,
    orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais, descartado_em,
        orcamento_pecas(*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)),
        orcamento_avulsos(id, produto_id, quantidade, valor_unitario, valor_total, produtos_avulsos(nome))
    )
`;

const AMBIENTES_SELECT_FALLBACK = `
    id, nome,
    orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais)
`;

// Retorna dados de um projeto e seus dados relacionados.
// `activeTab` é necessário para disparar refetch + carregar pedidoFechado ao abrir "carrinho".
// setProjeto/setAmbientes/setMedicoes são expostos temporariamente para os handlers de
// mutação que ainda ficam em TelaProjeto.jsx — serão removidos do return na FASE 2
// quando useProjectActions absorver todas as mutations.
export function useProjectData(projectId, activeTab) {
    const { session, profile } = useAuth();

    const [projeto,        setProjeto]        = useState(null);
    const [ambientes,      setAmbientes]      = useState([]);
    const [medicoes,       setMedicoes]       = useState([]);
    const [catMateriais,   setCatMateriais]   = useState([]);
    const [catProdAvulsos, setCatProdAvulsos] = useState([]);
    const [medidores,      setMedidores]      = useState([]);
    const [pedidoFechado,  setPedidoFechado]  = useState(null);
    const [loadingProjeto, setLoadingProjeto] = useState(true);
    const [loadingPecasOrc, setLoadingPecasOrc] = useState({});

    // ── Fetch de medições ────────────────────────────────────────────────────
    const recarregarMedicoes = useCallback(async () => {
        if (!projectId) return;
        const { data, error } = await supabase
            .from('medicoes')
            .select('id, data_medicao, responsavel, medidor_id, endereco, observacoes_acesso, fotos, status, json_medicao, svg_url, projetos(nome)')
            .eq('projeto_id', projectId)
            .order('data_medicao', { ascending: false });
        if (error) { console.error('[medicoes] Erro ao carregar:', error); return; }
        if (data) setMedicoes(data.map(m => ({
            ...m,
            data: m.data_medicao
                ? new Date(m.data_medicao).toLocaleString('pt-BR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : '—',
            medidor: m.responsavel ?? '—',
        })));
    }, [projectId]);

    // ── Fetch de ambientes + orçamentos ────────────────────────────────────
    const recarregarAmbientes = useCallback(async () => {
        if (!session || !projectId) return;
        const { data, error } = await supabase
            .from('ambientes')
            .select(AMBIENTES_SELECT)
            .eq('projeto_id', projectId)
            .order('created_at');
        if (error) {
            console.error('Erro ao recarregar ambientes:', error.message, error.details);
            const { data: fb, error: fbErr } = await supabase
                .from('ambientes')
                .select(AMBIENTES_SELECT_FALLBACK)
                .eq('projeto_id', projectId)
                .order('created_at');
            if (fbErr) { console.error('Erro no fallback:', fbErr.message); return; }
            if (fb) setAmbientes(fb.map(normalizarAmbiente));
            return;
        }
        if (data) setAmbientes(data.map(normalizarAmbiente));
    }, [session, projectId]);

    // ── Efeitos de carregamento ──────────────────────────────────────────────

    // Carregamento inicial: projeto + ambientes em paralelo
    useEffect(() => {
        if (!projectId) return;
        async function loadData() {
            setLoadingProjeto(true);
            try {
                const [resP, resA] = await Promise.all([
                    supabase.from('projetos')
                        .select('*, clientes(id, nome, telefone, email, endereco), arquitetos(id, nome), rt_padrao_percentual')
                        .eq('id', projectId).single(),
                    supabase.from('ambientes')
                        .select(AMBIENTES_SELECT)
                        .eq('projeto_id', projectId).order('created_at'),
                ]);
                if (resP.error) console.error('[TelaProjeto] Erro projeto:', resP.error.message);
                if (resP.data) setProjeto(resP.data);
                if (resA.error) {
                    console.error('[TelaProjeto] Erro ao carregar ambientes:', resA.error.message, resA.error.details);
                    const { data: fb, error: fbErr } = await supabase
                        .from('ambientes')
                        .select(AMBIENTES_SELECT_FALLBACK)
                        .eq('projeto_id', projectId).order('created_at');
                    if (fbErr) console.error('[TelaProjeto] Erro no fallback:', fbErr.message);
                    setAmbientes(Array.isArray(fb) ? fb.map(normalizarAmbiente) : []);
                } else {
                    setAmbientes(Array.isArray(resA.data) ? resA.data.map(normalizarAmbiente) : []);
                }
            } catch (err) {
                console.error('[TelaProjeto] Erro fatal no loadData:', err);
            } finally {
                setLoadingProjeto(false);
            }
        }
        loadData();
    }, [projectId]);

    // Fetch inicial de medições (separado para poder ser chamado independentemente)
    useEffect(() => {
        if (projectId) recarregarMedicoes();
    }, [projectId, recarregarMedicoes]);

    // Catálogos: materiais e produtos avulsos da empresa
    useEffect(() => {
        if (!profile?.empresa_id) return;
        Promise.all([
            supabase.from('materiais').select('id, nome')
                .eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
            supabase.from('produtos_avulsos').select('id, nome, preco_unitario')
                .eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
        ]).then(([{ data: mats }, { data: prods }]) => {
            if (mats)  setCatMateriais(mats);
            if (prods) setCatProdAvulsos(prods);
        }).catch(() => {});
    }, [profile?.empresa_id]);

    // Lista de medidores da empresa (perfil = medidor)
    useEffect(() => {
        let query = supabase.from('usuarios')
            .select('id, nome')
            .in('perfil', ['medidor', 'vendedor_medidor', 'admin_medidor'])
            .eq('ativo', true)
            .order('nome');
        if (profile?.empresa_id) query = query.eq('empresa_id', profile.empresa_id);
        query.then(({ data, error }) => {
            if (error) console.error('[medidores] Erro ao buscar:', error);
            if (data) setMedidores(data);
        });
    }, [profile?.empresa_id]);

    // Ao abrir aba Carrinho: recarrega ambientes + busca pedido fechado ativo
    useEffect(() => {
        if (activeTab !== 'carrinho' || !projectId || !profile?.empresa_id) return;
        recarregarAmbientes();
        supabase.from('pedidos_fechados')
            .select('*')
            .eq('projeto_id', projectId)
            .eq('empresa_id', profile.empresa_id)
            .eq('status', 'FECHADO')
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data }) => { if (data?.[0]) setPedidoFechado(data[0]); });
    }, [activeTab, projectId, profile?.empresa_id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Lazy load de peças ───────────────────────────────────────────────────
    // Chamado por toggleCarrinhoDetalhes quando o card expande e ainda não tem peças.
    async function fetchPecasParaOrcamento(orcId) {
        setLoadingPecasOrc(prev => ({ ...prev, [orcId]: true }));
        const { data, error } = await supabase
            .from('orcamento_pecas')
            .select('*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)')
            .eq('orcamento_id', orcId);
        if (!error && data) {
            setAmbientes(prev => prev.map(amb => ({
                ...amb,
                orcamentos: (amb.orcamentos ?? []).map(o => {
                    if (o.id !== orcId) return o;
                    return {
                        ...o,
                        pecas: data.map((op, idx) => ({
                            id:                op.id,
                            nome:              op.pecas?.nome_livre ?? `Peça ${idx + 1}`,
                            material:          'Material Padrão',
                            material_id:       op.material_id ?? '',
                            espessura:         op.pecas?.espessura_cm != null ? `${op.pecas.espessura_cm}` : '—',
                            area:              op.pecas?.area_liquida_m2 ?? null,
                            acabamento:        '—',
                            valor:             op.valor_total ?? 0,
                            valor_acabamentos: op.valor_acabamentos ?? 0,
                            recortes:          [],
                            ambiente_id:       op.pecas?.ambiente_id ?? null,
                            item_nome:         op.item_nome ?? op.pecas?.dimensoes?.item_nome ?? null,
                            acabamentos:       op.acabamentos ?? [],
                        })),
                    };
                }),
            })));
        } else if (error) {
            console.error('[lazy pecas]', error.message);
        }
        setLoadingPecasOrc(prev => ({ ...prev, [orcId]: false }));
    }

    return {
        // Estado — dados
        projeto,        setProjeto,
        ambientes,      setAmbientes,
        medicoes,       setMedicoes,
        catMateriais,
        catProdAvulsos,
        medidores,
        pedidoFechado,  setPedidoFechado,
        loadingProjeto,
        loadingPecasOrc,
        // Refetch
        recarregarAmbientes,
        recarregarMedicoes,
        // Lazy load
        fetchPecasParaOrcamento,
    };
}
