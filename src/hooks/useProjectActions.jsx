import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { loadPdfOpts, savePdfOpts } from '../utils/pdfOptions';
import {
    duplicarAmbiente, duplicarVersao, duplicarPeca, clonarAvulso,
    calcTotal, fmtBRL, calcDataFinalDiasUteis,
} from '../utils/projetoUtils';

// Centraliza todas as mutations de TelaProjeto.
//
// Signature:  useProjectActions(projectId, dataSlice)
//   dataSlice vem do retorno de useProjectData — passa somente o que o hook precisa.
//
// Funções que precisam de estado de UI transitório (ex: editingAmbNome, fecharIds)
// recebem esses valores como argumentos em vez de ler de closure, mantendo o hook
// agnóstico ao estado de UI de TelaProjeto.
export function useProjectActions(projectId, {
    ambientes,
    setAmbientes,
    projeto,
    setProjeto,
    setMedicoes,
    medidores,
    pedidoFechado,
    setPedidoFechado,
    catMateriais,
    catProdAvulsos,
    recarregarAmbientes,
}) {
    const { session, profile, empresa: empresaCtx } = useAuth();

    // ── Fetch helper privado — peças frescas para PDF ─────────────────────────
    async function fetchPecasParaPdf(orcId) {
        const { data, error } = await supabase
            .from('orcamento_pecas')
            .select('*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)')
            .eq('orcamento_id', orcId);
        if (error) throw error;
        return (data ?? []).map((op, idx) => ({
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
        }));
    }

    // ── MEDIÇÕES ──────────────────────────────────────────────────────────────

    async function handleFazerMedicao() {
        const { data, error } = await supabase
            .from('medicoes')
            .insert({
                projeto_id:  projectId,
                empresa_id:  profile?.empresa_id,
                medidor_id:  session?.user?.id,
                responsavel: profile?.nome ?? '',
                data_medicao: new Date().toISOString(),
                status:      'agendada',
            })
            .select('id')
            .single();
        if (error) { alert(`Erro ao criar medição: ${error.message}`); return; }
        await supabase.from('medicoes').select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
            .eq('projeto_id', projectId)
            .order('data_medicao', { ascending: false })
            .then(({ data: meds }) => {
                if (!meds) return;
                const fmt = (m) => ({
                    ...m,
                    data: new Date(m.data_medicao).toLocaleString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    }),
                    medidor: m.responsavel ?? '—',
                });
                setMedicoes(meds.map(fmt));
            });
        window.location.href = `smartstone://medicao?id=${data.id}`;
    }

    async function handleExcluirMedicao(m) {
        if (!window.confirm(`Excluir a medição de ${m.data}? Esta ação não pode ser desfeita.`)) return;
        await supabase.from('ambientes').delete().eq('medicao_id', m.id);
        const { error } = await supabase.from('medicoes').delete().eq('id', m.id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        setMedicoes(prev => prev.filter(item => item.id !== m.id));
    }

    // formState: { agMedidor, agData, editingMedicaoId, enderecoCompleto, agObservacoes }
    // callbacks: { setErroAgendar, setAgendando, closeAll }
    async function handleAgendarMedicao(formState, { setErroAgendar, setAgendando, closeAll }) {
        const { agMedidor, agData, editingMedicaoId, enderecoCompleto, agObservacoes } = formState;
        setErroAgendar('');
        if (!agMedidor) { alert('Erro: Selecione um medidor na lista antes de salvar.'); return; }
        if (!agData)    { setErroAgendar('Selecione a data e hora da medição.'); return; }
        if (!projectId) { setErroAgendar('ID do projeto inválido. Recarregue a página.'); return; }

        const EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001';
        const empresaId        = profile?.empresa_id ?? EMPRESA_ID_FALLBACK;
        const dataAgendadaISO  = new Date(agData).toISOString();
        const medidorSel       = medidores.find(m => m.id === agMedidor);
        const nomeResponsavel  = medidorSel?.nome ?? '';

        const formatarParaLista = (m) => ({
            ...m,
            data: new Date(m.data_medicao).toLocaleString('pt-BR', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }),
            medidor: m.responsavel ?? '—',
        });

        setAgendando(true);
        try {
            if (editingMedicaoId) {
                const isMedidor = profile?.role === 'medidor';
                const { data: updated, error: errUpd } = await supabase
                    .from('medicoes')
                    .update({
                        medidor_id:          agMedidor,
                        responsavel:         nomeResponsavel,
                        data_medicao:        dataAgendadaISO,
                        endereco:            enderecoCompleto || null,
                        observacoes_acesso:  agObservacoes.trim() || null,
                        ...(isMedidor ? { status: 'concluida' } : {}),
                    })
                    .eq('id', editingMedicaoId)
                    .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
                    .single();
                if (errUpd) { setErroAgendar(`Erro: ${errUpd.message}`); return; }
                setMedicoes(prev => prev.map(m => m.id === editingMedicaoId ? formatarParaLista(updated) : m));
                if (isMedidor) {
                    // Medidor concluiu via web — notifica vendedor como medicao_processada
                    const vendedorId = projeto?.vendedor_id;
                    if (vendedorId && vendedorId !== session?.user?.id) {
                        await supabase.from('notificacoes').insert({
                            empresa_id: projeto?.empresa_id ?? EMPRESA_ID_FALLBACK,
                            usuario_id: vendedorId,
                            projeto_id: projectId,
                            tipo:       'medicao_processada',
                            titulo:     'Medição enviada para orçamento',
                            corpo:      `A medição do projeto "${projeto?.nome ?? ''}" foi finalizada e está disponível para orçamento.`,
                            lida:       false,
                        });
                    }
                }
            } else {
                const { data: med, error: errMed } = await supabase
                    .from('medicoes')
                    .insert({
                        projeto_id:         projectId,
                        empresa_id:         empresaId,
                        medidor_id:         agMedidor,
                        responsavel:        nomeResponsavel,
                        data_medicao:       dataAgendadaISO,
                        endereco:           enderecoCompleto || null,
                        observacoes_acesso: agObservacoes.trim() || null,
                        status:             'agendada',
                    })
                    .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
                    .single();
                if (errMed) { setErroAgendar(`Erro: ${errMed.message}`); return; }
                setMedicoes(prev => [formatarParaLista(med), ...prev]);
                // Notifica o medidor atribuído sobre a nova medição na agenda
                if (agMedidor && agMedidor !== session?.user?.id) {
                    await supabase.from('notificacoes').insert({
                        empresa_id: empresaId,
                        usuario_id: agMedidor,
                        projeto_id: projectId,
                        tipo:       'medicao_agendada',
                        titulo:     'Nova medição agendada',
                        corpo:      `Você tem uma medição agendada para o projeto "${projeto?.nome ?? ''}".`,
                        lida:       false,
                    });
                }
            }
            closeAll();
        } finally {
            setAgendando(false);
        }
    }

    // ── AMBIENTES ─────────────────────────────────────────────────────────────

    function mockDuplicarAmbiente(e, ambienteId) {
        e.stopPropagation();
        const idx = ambientes.findIndex(a => a.id === ambienteId);
        if (idx === -1) return;
        const clone = duplicarAmbiente(ambientes[idx]);
        setAmbientes([
            ...ambientes.slice(0, idx + 1),
            clone,
            ...ambientes.slice(idx + 1),
        ]);
    }

    // setSelectedIds: setter de UI do TelaProjeto — passado para reverter seleção
    async function mockExcluirAmbiente(e, ambienteId, setSelectedIds) {
        e.stopPropagation();
        if (!window.confirm('Excluir este ambiente e todas as suas versões?')) return;
        const idsVersoes = (ambientes.find(a => a.id === ambienteId)?.orcamentos || []).map(v => v.id);
        setSelectedIds(s => s.filter(sid => !idsVersoes.includes(sid)));
        setAmbientes(prev => prev.filter(a => a.id !== ambienteId));
        if (idsVersoes.length > 0) {
            const { error: errPecas } = await supabase.from('orcamento_pecas').delete().in('orcamento_id', idsVersoes);
            if (errPecas) console.error('Erro ao excluir peças do ambiente:', errPecas.message);
            const { error: errOrcs } = await supabase.from('orcamentos').delete().in('id', idsVersoes);
            if (errOrcs) console.error('Erro ao excluir orçamentos do ambiente:', errOrcs.message);
        }
        const { error: errAmb } = await supabase.from('ambientes').delete().eq('id', ambienteId);
        if (errAmb) { console.error('Erro ao excluir ambiente:', errAmb.message); recarregarAmbientes(); }
    }

    // editingAmbNome: { id, nome } — estado de UI passado pelo chamador
    // clearFn: () => setEditingAmbNome(null)
    async function salvarNomeAmbiente(editingAmbNome, clearFn) {
        if (!editingAmbNome) return;
        setAmbientes(prev => prev.map(a =>
            a.id === editingAmbNome.id ? { ...a, nome: editingAmbNome.nome } : a
        ));
        clearFn();
        const { error } = await supabase
            .from('ambientes').update({ nome: editingAmbNome.nome }).eq('id', editingAmbNome.id);
        if (error) { console.error('Erro ao renomear ambiente:', error.message); recarregarAmbientes(); }
    }

    // ── VERSÕES ───────────────────────────────────────────────────────────────

    function mockDuplicarVersao(e, ambienteId, versaoId) {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            const base = amb.orcamentos.find(v => v.id === versaoId);
            if (!base) return amb;
            const novaVersao = duplicarVersao(base);
            return { ...amb, orcamentos: amb.orcamentos.flatMap(v => v.id === versaoId ? [v, novaVersao] : [v]) };
        }));
    }

    // setSelectedIds: setter de UI do TelaProjeto
    async function mockRemoverVersao(e, ambienteId, versaoId, setSelectedIds) {
        e.stopPropagation();
        if (!window.confirm('Excluir esta versão do orçamento?')) return;
        setAmbientes(prev => prev.map(amb =>
            amb.id !== ambienteId ? amb :
            { ...amb, orcamentos: amb.orcamentos.filter(v => v.id !== versaoId) }
        ));
        setSelectedIds(p => p.filter(sid => sid !== versaoId));
        const { error: errPecas } = await supabase.from('orcamento_pecas').delete().eq('orcamento_id', versaoId);
        if (errPecas) console.error('Erro ao excluir peças da versão:', errPecas.message);
        const { error: errOrc } = await supabase.from('orcamentos').delete().eq('id', versaoId);
        if (errOrc) { console.error('Erro ao excluir versão:', errOrc.message); recarregarAmbientes(); }
    }

    // editingVersao: { ambId, versaoId, nomeAmb, nomeVersao, pecas }
    // clearFn: () => setEditingVersao(null)
    function salvarEdicaoVersao(editingVersao, clearFn) {
        if (!editingVersao) return;
        const { ambId, versaoId, nomeAmb, nomeVersao, pecas: pecasEdit } = editingVersao;
        const matMap = Object.fromEntries(catMateriais.map(m => [m.id, m.nome]));
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                id: amb.id, nome: nomeAmb, status: amb.status,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => {
                        const ed = pecasEdit.find(ep => ep.id === p.id);
                        if (!ed) return p;
                        return { ...p, nome: ed.nome, material_id: ed.material_id, material: matMap[ed.material_id] || p.material };
                    });
                    return { ...v, nome: nomeVersao, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        clearFn();
    }

    // ── PEÇAS ─────────────────────────────────────────────────────────────────

    function mockDuplicarPeca(e, ambienteId, versaoId, pecaId) {
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
    }

    async function mockRemoverPeca(e, ambienteId, versaoId, pecaId) {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const newPecaList = v.pecas.filter(x => x.id !== pecaId);
                    const newTotal = newPecaList.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecaList, valor_total: newTotal };
                }),
            };
        }));
        const { error } = await supabase.from('orcamento_pecas').delete().eq('id', pecaId);
        if (error) { console.error('Erro ao excluir peça:', error.message); recarregarAmbientes(); }
    }

    // pecaEmEdicao: { ambienteId, versaoId, pecaId, pecaData }
    // clearFn: () => setPecaEmEdicao(null)
    function handleSalvarEdicaoPeca(pecaEmEdicao, clearFn) {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== pecaEmEdicao.ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== pecaEmEdicao.versaoId) return v;
                    const newPecas = v.pecas.map(p =>
                        p.id === pecaEmEdicao.pecaId ? pecaEmEdicao.pecaData : p
                    );
                    const novoValorTotal = newPecas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecas, valor_total: novoValorTotal };
                }),
            };
        }));
        clearFn();
    }

    // ── ITENS MANUAIS ─────────────────────────────────────────────────────────

    async function removerItemManual(e, ambienteId, orcamentoId, itemIndex) {
        e.stopPropagation();
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const novosItens = versao.itens_manuais.filter((_, i) => i !== itemIndex);
        const novoTotal  = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb =>
            amb.id !== ambienteId ? amb :
            { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )}
        ));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal }).eq('id', orcamentoId);
        if (error) { console.error('Erro ao remover item manual:', error.message); recarregarAmbientes(); }
    }

    async function duplicarItemManual(e, ambienteId, orcamentoId, itemIndex) {
        e.stopPropagation();
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const orig = versao.itens_manuais[itemIndex];
        if (!orig) return;
        const copia = { ...orig, nome_peca: orig.nome_peca ? `${orig.nome_peca} (Cópia)` : null };
        const novosItens = [...versao.itens_manuais];
        novosItens.splice(itemIndex + 1, 0, copia);
        const novoTotal = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb =>
            amb.id !== ambienteId ? amb :
            { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )}
        ));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal }).eq('id', orcamentoId);
        if (error) { console.error('Erro ao duplicar item manual:', error.message); recarregarAmbientes(); }
    }

    // itemManualEmEdicao: { ambienteId, orcamentoId, itemIndex, itemData }
    // clearFn: () => setItemManualEmEdicao(null)
    async function handleSalvarItemManual(itemManualEmEdicao, clearFn) {
        if (!itemManualEmEdicao) return;
        const { ambienteId, orcamentoId, itemIndex, itemData } = itemManualEmEdicao;
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const itemAtualizado = {
            ...itemData,
            total: (parseFloat(itemData.quantidade) || 0) * (itemData.preco_unitario || 0),
        };
        const novosItens = versao.itens_manuais.map((it, i) => i === itemIndex ? itemAtualizado : it);
        const novoTotal  = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb =>
            amb.id !== ambienteId ? amb :
            { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )}
        ));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal }).eq('id', orcamentoId);
        if (error) { console.error('Erro ao salvar item manual:', error.message); recarregarAmbientes(); }
        clearFn();
    }

    // ── AVULSOS ───────────────────────────────────────────────────────────────

    // matId: string — valor atual de bulkMat[versaoId]
    // clearFn: () => setBulkMat(p => ({ ...p, [versaoId]: '' }))
    function aplicarMaterialEmMassa(ambId, versaoId, matId, clearFn) {
        const matNome = catMateriais.find(m => m.id === matId)?.nome || '';
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => ({
                        id: p.id, nome: p.nome, material_id: matId, material: matNome,
                        espessura: p.espessura, area: p.area, acabamento: p.acabamento,
                        valor: p.valor, recortes: p.recortes,
                    }));
                    return { ...v, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        clearFn();
    }

    // sel: { produto_id, quantidade } — valor atual de novoAvulso[versaoId]
    // clearFn: () => setNovoAvulso(p => ({ ...p, [versaoId]: { produto_id: '', quantidade: 1 } }))
    function adicionarAvulso(ambId, versaoId, sel, clearFn) {
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
        clearFn();
    }

    function editarAvulso(ambId, versaoId, avId, field, rawValue) {
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
    }

    function removerAvulso(ambId, versaoId, avId) {
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
    }

    // ── CARRINHO ──────────────────────────────────────────────────────────────

    function calcAjustes(orc) {
        const maj   = Number(orc.majoramento_percentual ?? 0);
        const rt    = Number(orc.rt_percentual ?? 0);
        const frete = Number(orc.valor_frete ?? 0);
        const fator = (1 + maj / 100) * (1 + rt / 100);
        const custoBase     = orc.valor_total ?? 0;
        const valorMajorado = custoBase * (1 + maj / 100);
        const valorRt       = valorMajorado * (rt / 100);
        const totalVenda    = custoBase * fator + frete;
        return { maj, rt, frete, fator, custoBase, valorMajorado, valorRt, totalVenda };
    }

    async function excluirOrcamentoCarrinho(orcId) {
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).filter(o => o.id !== orcId),
        })));
        const { error } = await supabase.from('orcamentos').delete().eq('id', orcId);
        if (error) { console.error('Erro ao excluir orçamento:', error.message); recarregarAmbientes(); }
    }

    async function duplicarOrcamentoCarrinho(orc, ambId) {
        const novoId   = crypto.randomUUID();
        const novoNome = `${orc.nome ?? orc.nome_versao ?? 'Orçamento'} (Cópia)`;
        const { error } = await supabase.from('orcamentos').insert({
            id:             novoId,
            ambiente_id:    ambId,
            empresa_id:     profile?.empresa_id ?? null,
            vendedor_id:    session?.user?.id ?? null,
            nome_versao:    novoNome,
            valor_total:    orc.valor_total ?? 0,
            desconto_total: orc.desconto_total ?? 0,
            status:         orc.status ?? 'rascunho',
            itens_manuais:  orc.itens_manuais ?? [],
        });
        if (error) { console.error('Erro ao duplicar orçamento:', error.message); return; }
        recarregarAmbientes();
    }

    // clearFn: () => setCarrinhoEditandoNome(null)
    async function salvarNomeOrcamentoCarrinho(orcId, nome, clearFn) {
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId ? { ...o, nome, nome_versao: nome } : o
            ),
        })));
        clearFn();
        await supabase.from('orcamentos').update({ nome_versao: nome }).eq('id', orcId);
    }

    // clearFn: () => setCarrinhoEditandoDesconto(null)
    async function salvarDescontoCarrinho(orcId, valorStr, tipo, clearFn) {
        const orc = ambientes.flatMap(a => a.orcamentos).find(o => o.id === orcId);
        if (!orc) return;
        const subtotal = (orc.valor_total ?? 0) + (orc.desconto_total ?? 0);
        const val      = parseFloat(String(valorStr).replace(',', '.')) || 0;
        const desconto = tipo === '%'
            ? Math.min(subtotal * val / 100, subtotal)
            : Math.min(val, subtotal);
        const novoTotal = Math.max(0, subtotal - desconto);
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId ? { ...o, desconto_total: desconto, valor_total: novoTotal } : o
            ),
        })));
        clearFn();
        const { error } = await supabase.from('orcamentos')
            .update({ desconto_total: desconto, valor_total: novoTotal }).eq('id', orcId);
        if (error) { console.error('Erro ao salvar desconto:', error.message); recarregarAmbientes(); }
    }

    // clearFn: () => setCarrinhoEditandoAjustes(null)
    async function salvarAjustesCarrinho(orcId, majStr, rtStr, rtNome, freteStr, clearFn) {
        const newMaj   = Math.max(0, parseFloat(String(majStr).replace(',', '.'))   || 0);
        const newRt    = Math.max(0, parseFloat(String(rtStr).replace(',', '.'))    || 0);
        const newFrete = Math.max(0, parseFloat(String(freteStr).replace(',', '.')) || 0);
        clearFn();
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId
                    ? { ...o, majoramento_percentual: newMaj, rt_percentual: newRt, rt_arquiteto_nome: rtNome || '', valor_frete: newFrete }
                    : o
            ),
        })));
        const { error } = await supabase.from('orcamentos').update({
            majoramento_percentual: newMaj,
            rt_percentual:          newRt,
            rt_arquiteto_nome:      rtNome || null,
            valor_frete:            newFrete,
        }).eq('id', orcId);
        if (error) { console.error('Erro ao salvar ajustes:', error.message); recarregarAmbientes(); }
    }

    // ── MESCLAR CENÁRIOS ──────────────────────────────────────────────────────

    // callbacks: { setLoadingMesclar, setOrcsMesclados, cancelarMesclar, setToastMesclar }
    async function mesclarCenarios(mesclarIds, modalMesclar, { setLoadingMesclar, setOrcsMesclados, cancelarMesclar, setToastMesclar }) {
        const nome = modalMesclar?.nome?.trim() || 'Mesclado';
        if (mesclarIds.length < 2) return;
        setLoadingMesclar(true);
        try {
            const orcsSel = ambientes.flatMap(amb =>
                (amb.orcamentos ?? [])
                    .filter(o => mesclarIds.includes(o.id))
                    .map(o => ({ ...o, ambiente_id: amb.id, ambiente_nome: amb.nome }))
            );
            if (orcsSel.length < 2) throw new Error('Selecione ao menos 2 cenários.');

            const { data: pecasDB, error: ePecas } = await supabase
                .from('orcamento_pecas')
                .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total, orcamento_id')
                .in('orcamento_id', mesclarIds);
            if (ePecas) throw new Error(ePecas.message);

            const { data: orcsData, error: eOrcs } = await supabase
                .from('orcamentos').select('id, itens_manuais').in('id', mesclarIds);
            if (eOrcs) throw new Error(eOrcs.message);

            const itensManPorOrc = {};
            (orcsData || []).forEach(o => {
                itensManPorOrc[o.id] = Array.isArray(o.itens_manuais) ? o.itens_manuais : [];
            });

            const todasPecas = (pecasDB || []).map(({ orcamento_id: _oid, ...p }) => p);
            const todosItens = (orcsData || []).flatMap(o => itensManPorOrc[o.id] || []);
            const valorTotal = todasPecas.reduce((s, p) => s + (p.valor_total || 0), 0)
                             + todosItens.reduce((s, p) => s + (p.total || p.preco_unitario || 0), 0);

            const primeiroAmbId = orcsSel[0].ambiente_id;
            if (!primeiroAmbId) throw new Error('ambiente_id não encontrado nos cenários selecionados.');

            const ambNames   = [...new Set(orcsSel.map(o => o.ambiente_nome))].join(' + ');
            const nomeVersao = `${nome} (${ambNames})`;

            const { data: novoOrc, error: eNew } = await supabase
                .from('orcamentos')
                .insert({
                    empresa_id:    profile?.empresa_id,
                    ambiente_id:   primeiroAmbId,
                    vendedor_id:   session?.user?.id,
                    nome_versao:   nomeVersao,
                    status:        'rascunho',
                    desconto_total: 0,
                    valor_total:   valorTotal,
                    itens_manuais: todosItens.length ? todosItens : [],
                })
                .select('id').single();
            if (eNew) throw new Error(eNew.message);

            if (todasPecas.length) {
                const { error: eIns } = await supabase.from('orcamento_pecas')
                    .insert(todasPecas.map(p => ({ ...p, orcamento_id: novoOrc.id })));
                if (eIns) throw new Error(eIns.message);
            }

            setOrcsMesclados(prev => new Set([...prev, novoOrc.id]));
            cancelarMesclar();
            await recarregarAmbientes();
            setToastMesclar(`Cenário "${nomeVersao}" criado com sucesso!`);
            setTimeout(() => setToastMesclar(''), 3500);
        } catch (err) {
            console.error('[Mesclar]', err);
            alert('Erro ao mesclar: ' + err.message);
        } finally {
            setLoadingMesclar(false);
        }
    }

    // ── FECHAR PEDIDO ─────────────────────────────────────────────────────────

    // fecharIds: orcamento IDs selecionados para fechar
    // modalFechar: { forma_pagamento, parcelamento_tipo, parcelas_lista, prazo_tipo, prazo_data, prazo_dias }
    // callbacks: { setLoadingFechar, cancelarFecharPedido, setToastFechar }
    async function confirmarFechamento(fecharIds, modalFechar, { setLoadingFechar, cancelarFecharPedido, setToastFechar }) {
        if (!modalFechar || fecharIds.length === 0) return;
        const { forma_pagamento, parcelamento_tipo, parcelas_lista, prazo_tipo, prazo_data, prazo_dias } = modalFechar;
        const prazo_data_final = prazo_tipo === 'DIAS_UTEIS' ? calcDataFinalDiasUteis(prazo_dias) : prazo_data;
        if (!forma_pagamento || !prazo_data_final) return;

        const temParcelas      = parcelamento_tipo === 'parcelado';
        const parcelas_detalhes = temParcelas && parcelas_lista?.length > 0 ? parcelas_lista : null;
        const totalSel = fecharIds.reduce((s, oid) => {
            const orc = ambientes.flatMap(a => a.orcamentos ?? []).find(o => o.id === oid);
            return s + (orc?.valor_total ?? 0);
        }, 0);

        setLoadingFechar(true);
        try {
            const { data: pedido, error: ePedido } = await supabase
                .from('pedidos_fechados')
                .insert({
                    projeto_id:               projectId,
                    cenario_ids:              fecharIds,
                    forma_pagamento,
                    parcelas:                 temParcelas ? (parcelas_lista?.length ?? null) : null,
                    parcelas_detalhes:        parcelas_detalhes ?? null,
                    prazo_entrega:            prazo_data_final,
                    prazo_entrega_tipo:       prazo_tipo,
                    prazo_entrega_valor:      prazo_tipo === 'DIAS_UTEIS' ? prazo_dias : null,
                    prazo_entrega_data_final: prazo_data_final,
                    status:                   'FECHADO',
                    vendedor_id:              session?.user?.id,
                })
                .select('id').single();
            if (ePedido) throw new Error(ePedido.message);

            const { error: eProjeto } = await supabase
                .from('projetos').update({ status_pedido: 'FECHADO' }).eq('id', projectId);
            if (eProjeto) throw new Error(eProjeto.message);

            const todosOrcIds  = ambientes.flatMap(amb => (amb.orcamentos ?? []).map(o => o.id));
            const descartarIds = todosOrcIds.filter(oid => !fecharIds.includes(oid));
            if (descartarIds.length > 0) {
                const { error: eDesc } = await supabase.from('orcamentos')
                    .update({ descartado_em: new Date().toISOString() }).in('id', descartarIds);
                if (eDesc) console.error('[FecharPedido] Soft delete:', eDesc.message);
            }

            setPedidoFechado({
                id: pedido.id,
                forma_pagamento,
                parcelas:              temParcelas ? parcelas_lista?.length : null,
                parcelas_detalhes,
                prazo_entrega:         prazo_data_final,
                prazo_entrega_tipo:    prazo_tipo,
                prazo_entrega_valor:   prazo_tipo === 'DIAS_UTEIS' ? prazo_dias : null,
                created_at:            new Date().toISOString(),
            });
            cancelarFecharPedido();
            await recarregarAmbientes();
            setToastFechar('Pedido fechado com sucesso!');
            setTimeout(() => setToastFechar(''), 4000);
        } catch (err) {
            console.error('[FecharPedido]', err);
            alert('Erro ao fechar pedido: ' + err.message);
        } finally {
            setLoadingFechar(false);
        }
    }

    async function reverterParaOrcamento() {
        if (!pedidoFechado?.id) return;
        if (!window.confirm('Reverter pedido para status de orçamento? Os cenários descartados ainda dentro do prazo de 7 dias serão restaurados.')) return;
        try {
            await supabase.from('pedidos_fechados').update({ status: 'REVERTIDO' }).eq('id', pedidoFechado.id).eq('empresa_id', profile.empresa_id);
            await supabase.from('projetos').update({ status_pedido: 'ORCAMENTO' }).eq('id', projectId);
            const ambIds = ambientes.map(a => a.id);
            if (ambIds.length) {
                const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                await supabase.from('orcamentos')
                    .update({ descartado_em: null })
                    .in('ambiente_id', ambIds)
                    .not('descartado_em', 'is', null)
                    .gt('descartado_em', limite);
            }
            setPedidoFechado(null);
            await recarregarAmbientes();
        } catch (err) {
            alert('Erro ao reverter: ' + err.message);
        }
    }

    // ── PDF ───────────────────────────────────────────────────────────────────

    // setPdfModal: setter de UI do TelaProjeto
    async function openPdfModal(tipo, orc = null, setPdfModal) {
        const { data: tpl } = await supabase
            .from('pdf_templates').select('*')
            .eq('empresa_id', profile?.empresa_id)
            .eq('tipo', tipo).maybeSingle();
        const defaults = loadPdfOpts(tipo, tpl ?? null);
        setPdfModal({ tipo, orc, defaults });
    }

    // callbacks: { setLoadingPdf }
    async function gerarPdfs(opts, modo, { setLoadingPdf }) {
        if (!pedidoFechado?.id) return;
        setLoadingPdf('pedido');
        try {
            const incluirContrato = modo === 'pedido_contrato';
            const cenarioIds = pedidoFechado.cenario_ids ?? [];
            const todasPecas = [];
            for (const orcId of cenarioIds) {
                todasPecas.push(...(await fetchPecasParaPdf(orcId)));
            }
            const orcsSel = ambientes.flatMap(a => a.orcamentos ?? []).filter(o => cenarioIds.includes(o.id));
            const orcUnificado = {
                id:                     pedidoFechado.id,
                nome:                   `Pedido #${pedidoFechado.id.slice(-8).toUpperCase()}`,
                pecas:                  todasPecas,
                itens_manuais:          orcsSel.flatMap(o => o.itens_manuais ?? []),
                valor_frete:            orcsSel.reduce((s, o) => s + (o.valor_frete ?? 0), 0),
                desconto_total:         orcsSel.reduce((s, o) => s + (o.desconto_total ?? 0), 0),
                majoramento_percentual: orcsSel[0]?.majoramento_percentual ?? 0,
                rt_percentual:          orcsSel[0]?.rt_percentual ?? 0,
                forma_pagamento:        pedidoFechado.forma_pagamento,
                parcelas:               pedidoFechado.parcelas,
                numero_serie:           `#${pedidoFechado.id.slice(-8).toUpperCase()}`,
                parcelas_detalhes:      pedidoFechado.parcelas_detalhes ?? null,
                valor_fechado:          pedidoFechado.valor_fechado ?? null,
                data_fechamento:        pedidoFechado.created_at ?? null,
            };
            const { gerarPdfPedidoFechado, gerarPdfContrato } = await import('../utils/gerarPdfOrcamento');
            await gerarPdfPedidoFechado({
                orc:          orcUnificado,
                projeto,
                ambientes,
                catMateriais,
                empresa:      empresaCtx ?? {},
                vendedorNome: profile?.nome ?? null,
                prazoEntrega: pedidoFechado.prazo_entrega ?? null,
                template:     opts,
            });
            if (incluirContrato) {
                const { data: tplContrato } = await supabase.from('pdf_templates').select('*')
                    .eq('empresa_id', profile?.empresa_id).eq('tipo', 'contrato').maybeSingle();
                await gerarPdfContrato({
                    pedido:   pedidoFechado,
                    projeto,
                    empresa:  empresaCtx ?? {},
                    template: tplContrato ?? null,
                });
            }
        } catch (err) {
            console.error('[PDF]', err);
            alert('Erro ao gerar PDF: ' + err.message);
        } finally {
            setLoadingPdf(null);
        }
    }

    // pdfModal: { tipo, orc, defaults }
    // callbacks: { setPdfModal, setLoadingPdf }
    async function handlePdfConfirm(opts, modo, pdfModal, { setPdfModal, setLoadingPdf }) {
        savePdfOpts(pdfModal.tipo, opts);
        const mTipo = pdfModal.tipo;
        const mOrc  = pdfModal.orc ?? null;
        setPdfModal(null);
        if (mTipo === 'orcamento') {
            setLoadingPdf('orcamento');
            try {
                const pecasFrescas = await fetchPecasParaPdf(mOrc.id);
                if (pecasFrescas.length === 0) {
                    alert('Este orçamento não possui peças cadastradas. Verifique se as peças foram salvas corretamente no banco de dados.');
                    return;
                }
                const params = {
                    orc:          { ...mOrc, pecas: pecasFrescas },
                    projeto,
                    ambientes,
                    catMateriais,
                    empresa:      empresaCtx ?? {},
                    vendedorNome: profile?.nome ?? null,
                    template:     opts,
                };
                if (modo === 'bw') {
                    const { gerarPdfOrcamentoImpressao } = await import('../utils/gerarPdfOrcamento');
                    await gerarPdfOrcamentoImpressao(params);
                } else {
                    const { gerarPdfOrcamento } = await import('../utils/gerarPdfOrcamento');
                    await gerarPdfOrcamento(params);
                }
            } catch (e) {
                console.error('[PDF]', e);
                alert('Erro ao gerar PDF: ' + e.message);
            } finally {
                setLoadingPdf(null);
            }
        } else {
            await gerarPdfs(opts, modo, { setLoadingPdf });
        }
    }

    // ── STATUS DO PROJETO ─────────────────────────────────────────────────────

    // novoStatus: string — valor atual do select de status
    // closeAll: fn — fecha modais e reseta formulários
    async function handleSalvarStatus(novoStatus, closeAll) {
        if (!projectId || !novoStatus) return;
        const { error } = await supabase.from('projetos').update({ status: novoStatus }).eq('id', projectId);
        if (error) { alert(`Erro ao atualizar status: ${error.message}`); return; }
        setProjeto(prev => prev ? { ...prev, status: novoStatus } : prev);
        closeAll();
    }

    // callbacks: { setMotivoPerda, closeAll }
    async function handleMarcarPerdido(motivoPerda, { setMotivoPerda, closeAll }) {
        if (!projectId) return;
        const { error } = await supabase.from('projetos')
            .update({ status: 'perdido', motivo_perda: motivoPerda || null }).eq('id', projectId);
        if (error) { alert(`Erro: ${error.message}`); return; }
        setProjeto(prev => prev ? { ...prev, status: 'perdido' } : prev);
        setMotivoPerda('');
        closeAll();
    }

    return {
        // Medições
        handleFazerMedicao,
        handleExcluirMedicao,
        handleAgendarMedicao,
        // Ambientes
        mockDuplicarAmbiente,
        mockExcluirAmbiente,
        salvarNomeAmbiente,
        // Versões
        mockDuplicarVersao,
        mockRemoverVersao,
        salvarEdicaoVersao,
        // Peças
        mockDuplicarPeca,
        mockRemoverPeca,
        handleSalvarEdicaoPeca,
        // Itens manuais
        removerItemManual,
        duplicarItemManual,
        handleSalvarItemManual,
        // Avulsos
        aplicarMaterialEmMassa,
        adicionarAvulso,
        editarAvulso,
        removerAvulso,
        // Carrinho
        calcAjustes,
        excluirOrcamentoCarrinho,
        duplicarOrcamentoCarrinho,
        salvarNomeOrcamentoCarrinho,
        salvarDescontoCarrinho,
        salvarAjustesCarrinho,
        // Mesclar cenários
        mesclarCenarios,
        // Fechar pedido
        confirmarFechamento,
        reverterParaOrcamento,
        // PDF
        openPdfModal,
        gerarPdfs,
        handlePdfConfirm,
        // Status
        handleSalvarStatus,
        handleMarcarPerdido,
    };
}
