import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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

export function useProjetoData(projetoId, { session, profile, activeTab }) {
    const [projeto, setProjeto]             = useState(null);
    const [ambientes, setAmbientes]         = useState([]);
    const [medicoes, setMedicoes]           = useState([]);
    const [catMateriais, setCatMateriais]   = useState([]);
    const [catProdAvulsos, setCatProdAvulsos] = useState([]);
    const [medidores, setMedidores]         = useState([]);
    const [pedidoFechado, setPedidoFechado] = useState(null);
    const [loadingProjeto, setLoadingProjeto] = useState(true);

    const recarregarMedicoes = useCallback(async () => {
        if (!projetoId) return;
        const { data, error } = await supabase
            .from('medicoes')
            .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
            .eq('projeto_id', projetoId)
            .order('data_medicao', { ascending: false });
        if (error) { console.error('[medicoes] Erro ao carregar:', error); return; }
        if (data) setMedicoes(data.map(m => ({
            ...m,
            data: m.data_medicao
                ? new Date(m.data_medicao).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—',
            medidor: m.responsavel ?? '—',
        })));
    }, [projetoId]);

    const recarregarAmbientes = useCallback(async () => {
        if (!session || !projetoId) return;
        const { data, error } = await supabase
            .from('ambientes')
            .select(AMBIENTES_SELECT)
            .eq('projeto_id', projetoId)
            .order('created_at');
        if (error) {
            console.error('Erro ao recarregar ambientes:', error.message, error.details);
            const { data: fb, error: fbErr } = await supabase
                .from('ambientes')
                .select(AMBIENTES_SELECT_FALLBACK)
                .eq('projeto_id', projetoId)
                .order('created_at');
            if (fbErr) { console.error('Erro no fallback:', fbErr.message); return; }
            if (fb) setAmbientes(fb.map(normalizarAmbiente));
            return;
        }
        if (data) setAmbientes(data.map(normalizarAmbiente));
    }, [session, projetoId]);

    // Carregamento inicial
    useEffect(() => {
        if (!projetoId) return;
        async function loadData() {
            setLoadingProjeto(true);
            try {
                const [resP, resA] = await Promise.all([
                    supabase.from('projetos')
                        .select('*, clientes(id, nome, telefone, email, endereco), arquitetos(id, nome), rt_padrao_percentual')
                        .eq('id', projetoId).single(),
                    supabase.from('ambientes')
                        .select(AMBIENTES_SELECT)
                        .eq('projeto_id', projetoId).order('created_at'),
                ]);
                if (resP.error) console.error('[TelaProjeto] Erro projeto:', resP.error.message);
                if (resP.data) setProjeto(resP.data);
                if (resA.error) {
                    console.error('[TelaProjeto] Erro ao carregar ambientes:', resA.error.message);
                    const { data: fb, error: fbErr } = await supabase
                        .from('ambientes')
                        .select(AMBIENTES_SELECT_FALLBACK)
                        .eq('projeto_id', projetoId).order('created_at');
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
    }, [projetoId]);

    // Fetch inicial de medições
    useEffect(() => {
        if (projetoId) recarregarMedicoes();
    }, [projetoId, recarregarMedicoes]);

    // Catálogos
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

    // Medidores
    useEffect(() => {
        let query = supabase.from('usuarios').select('id, nome').in('perfil', ['medidor', 'vendedor_medidor', 'admin_medidor']).eq('ativo', true).order('nome');
        if (profile?.empresa_id) query = query.eq('empresa_id', profile.empresa_id);
        query.then(({ data, error }) => {
            if (error) console.error('[medidores] Erro ao buscar:', error);
            if (data) setMedidores(data);
        });
    }, [profile?.empresa_id]);

    // Pedido fechado + recarregar ao abrir aba carrinho
    useEffect(() => {
        if (activeTab !== 'carrinho' || !projetoId) return;
        recarregarAmbientes();
        supabase.from('pedidos_fechados')
            .select('*')
            .eq('projeto_id', projetoId)
            .eq('status', 'FECHADO')
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data }) => { if (data?.[0]) setPedidoFechado(data[0]); });
    }, [activeTab, projetoId]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        projeto, setProjeto,
        ambientes, setAmbientes,
        medicoes, setMedicoes,
        catMateriais, catProdAvulsos,
        medidores,
        pedidoFechado, setPedidoFechado,
        loadingProjeto,
        recarregarAmbientes, recarregarMedicoes,
    };
}
