import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { NOME_PROJETO_AVULSO } from '../../utils/projetoAvulso';
import ModalNovoClienteInline from '../ModalNovoClienteInline';

// Migração do projeto avulso coletivo. A seleção acontece INLINE na aba ativa
// (modoMigrar do AbaCarrinho/AbaMedicoes) — este modal recebe os ids prontos
// via `selecionadosIds` e renderiza apenas a escolha de destino.
//
// modo 'medicoes':   ids são de medições. MOVE medições + ambientes/orçamentos
//                    vinculados.
// modo 'orcamentos': ids são de orçamentos. MOVE orçamentos + ambientes; a
//                    medição mãe é DUPLICADA no destino (original fica no avulso).
// O [Avulsos] nunca é deletado — é coletivo e reutilizável.
export default function ModalMigrarAvulso({
    aberto,
    onClose,
    projetoAvulsoId,
    empresaId,
    userId,
    ambientes = [],           // normalizados (useProjectData)
    modo = 'orcamentos',      // 'medicoes' | 'orcamentos'
    selecionadosIds = [],     // medicaoIds ou orcIds vindos da seleção inline
    onMigrado,                // (novoProjetoId) => void
}) {
    const [projetos, setProjetos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [modoDestino, setModoDestino] = useState('existente'); // 'existente' | 'novo'
    const [destinoId, setDestinoId] = useState('');
    const [novoNome, setNovoNome] = useState('');
    const [novoClienteId, setNovoClienteId] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [migrando, setMigrando] = useState(false);
    // Criar cliente inline (mesmo padrão do modal de novo projeto):
    // dados ficam em memória ('temp') e só são salvos ao confirmar a migração
    const [modalNovoCliente, setModalNovoCliente] = useState(false);
    const [clienteTemp, setClienteTemp] = useState(null);

    // Ids selecionados inline na aba (medições ou orçamentos, conforme o modo)
    const selIds = selecionadosIds;

    // Versões achatadas com referência ao ambiente pai (mapeamento do Caso B)
    const versoes = useMemo(() => ambientes.flatMap(a =>
        (a.orcamentos ?? []).map(o => ({ ...o, ambiente_id: a.id }))
    ), [ambientes]);

    // Ambientes com seleção parcial de versões — as irmãs vão junto (ambiente é movido)
    const temSelecaoParcial = useMemo(() => {
        if (modo !== 'orcamentos') return false;
        const porAmbiente = {};
        versoes.forEach(v => {
            porAmbiente[v.ambiente_id] ??= { total: 0, sel: 0 };
            porAmbiente[v.ambiente_id].total++;
            if (selIds.includes(v.id)) porAmbiente[v.ambiente_id].sel++;
        });
        return Object.values(porAmbiente).some(x => x.sel > 0 && x.sel < x.total);
    }, [modo, versoes, selIds]);

    useEffect(() => {
        if (!aberto) return;
        setClienteTemp(null);
    }, [aberto, modo]);

    useEffect(() => {
        if (!aberto || !empresaId) return;
        let ativo = true;
        (async () => {
            setCarregando(true);
            const [resProj, resCli] = await Promise.all([
                supabase
                    .from('projetos')
                    .select('id, nome, clientes(nome)')
                    .eq('empresa_id', empresaId)
                    .neq('nome', NOME_PROJETO_AVULSO)
                    .neq('status', 'perdido')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('clientes')
                    .select('id, nome')
                    .eq('empresa_id', empresaId)
                    .order('nome'),
            ]);
            if (!ativo) return;
            if (resProj.error) toast.error('Erro ao carregar projetos: ' + resProj.error.message);
            else setProjetos(resProj.data ?? []);
            if (resCli.error) toast.error('Erro ao carregar clientes: ' + resCli.error.message);
            else setClientes(resCli.data ?? []);
            setCarregando(false);
        })();
        return () => { ativo = false; };
    }, [aberto, empresaId]);

    if (!aberto) return null;

    const destinoOk = modoDestino === 'existente'
        ? !!destinoId
        : novoNome.trim().length > 0 && !!novoClienteId;

    async function resolverDestino() {
        if (modoDestino === 'existente') return destinoId;

        // Cliente temporário: persiste no banco agora, antes de criar o projeto
        // (mesmo fluxo do handleSaveProjeto em ProjetosAdminV2)
        let clienteIdReal = novoClienteId;
        if (clienteTemp && novoClienteId === 'temp') {
            const { id: _id, isTemporario: _t, ...dadosCliente } = clienteTemp;
            const { data: cliSalvo, error: errCli } = await supabase
                .from('clientes')
                .insert({ ...dadosCliente, empresa_id: empresaId })
                .select('id, nome')
                .single();
            if (errCli) throw new Error('criar cliente: ' + errCli.message);
            clienteIdReal = cliSalvo.id;
            setClientes(prev => [...prev, cliSalvo].sort((a, b) => a.nome.localeCompare(b.nome)));
            setClienteTemp(null);
        }

        const { data, error } = await supabase
            .from('projetos')
            .insert({
                nome:        novoNome.trim(),
                cliente_id:  clienteIdReal,
                empresa_id:  empresaId,
                vendedor_id: userId,
                status:      'orcado',
            })
            .select('id')
            .single();
        if (error) throw new Error('criar projeto: ' + error.message);
        return data.id;
    }

    // ── CASO A — move medições + ambientes/orçamentos vinculados ─────────
    async function migrarMedicoes(destino) {
        const { error: errMed } = await supabase
            .from('medicoes')
            .update({ projeto_id: destino })
            .in('id', selIds)
            .eq('empresa_id', empresaId);
        if (errMed) throw new Error('mover medições: ' + errMed.message);

        // Ambientes vinculados às medições movidas (subselect não existe no
        // client — busca os ids antes para mover os orçamentos)
        const { data: ambVinc, error: errBusca } = await supabase
            .from('ambientes')
            .select('id')
            .in('medicao_id', selIds)
            .eq('empresa_id', empresaId);
        if (errBusca) throw new Error('mapear ambientes: ' + errBusca.message);
        const ambIds = (ambVinc ?? []).map(a => a.id);

        const { error: errAmb } = await supabase
            .from('ambientes')
            .update({ projeto_id: destino })
            .in('medicao_id', selIds)
            .eq('empresa_id', empresaId);
        if (errAmb) throw new Error('mover ambientes: ' + errAmb.message);

        if (ambIds.length > 0) {
            const { error: errOrc } = await supabase
                .from('orcamentos')
                .update({ projeto_id: destino })
                .in('ambiente_id', ambIds)
                .eq('empresa_id', empresaId);
            if (errOrc) throw new Error('mover orçamentos: ' + errOrc.message);
        }
        toast.success(`${selIds.length} medição(ões) e orçamentos vinculados migrados`);
    }

    // ── CASO B — move orçamentos + ambientes; DUPLICA a medição mãe ──────
    async function migrarOrcamentos(destino) {
        const versoesSel = versoes.filter(v => selIds.includes(v.id));
        const ambienteIds = [...new Set(versoesSel.map(v => v.ambiente_id))];

        // medicao_id não vem no shape normalizado — busca no banco
        const { data: ambRaw, error: errAmbSel } = await supabase
            .from('ambientes')
            .select('id, medicao_id')
            .in('id', ambienteIds)
            .eq('empresa_id', empresaId);
        if (errAmbSel) throw new Error('mapear medições: ' + errAmbSel.message);

        // Duplica cada medição mãe (uma cópia por medição, mesmo com N ambientes)
        const medIds = [...new Set((ambRaw ?? []).map(a => a.medicao_id).filter(Boolean))];
        const mapaMedicao = {}; // id original → id da cópia
        if (medIds.length > 0) {
            const { data: medsOrig, error: errMeds } = await supabase
                .from('medicoes')
                .select('*')
                .in('id', medIds)
                .eq('empresa_id', empresaId);
            if (errMeds) throw new Error('ler medições: ' + errMeds.message);

            const copias = (medsOrig ?? []).map(m => {
                const { id, ...resto } = m;
                const novoId = crypto.randomUUID();
                mapaMedicao[m.id] = novoId;
                return {
                    ...resto,
                    id:         novoId,
                    projeto_id: destino,
                    // Defusa tg_processar_medicao no INSERT da cópia (senão o trigger
                    // criaria um SEGUNDO ambiente no destino):
                    // - medidas null mata a condição "formato antigo"
                    // - status 'processada' mata a "formato novo" (e é o estado real:
                    //   a medição já gerou ambiente/orçamento)
                    medidas: null,
                    status:  m.json_medicao ? 'processada' : m.status,
                };
            });
            const { error: errIns } = await supabase.from('medicoes').insert(copias);
            if (errIns) throw new Error('duplicar medições: ' + errIns.message);
        }

        // Move os ambientes apontando para a cópia da medição
        for (const amb of (ambRaw ?? [])) {
            const payload = { projeto_id: destino };
            if (amb.medicao_id && mapaMedicao[amb.medicao_id]) payload.medicao_id = mapaMedicao[amb.medicao_id];
            const { error: errAmb } = await supabase
                .from('ambientes')
                .update(payload)
                .eq('id', amb.id)
                .eq('empresa_id', empresaId);
            if (errAmb) throw new Error('mover ambientes: ' + errAmb.message);
        }

        // Move TODOS os orçamentos dos ambientes afetados (não só os selecionados):
        // versões irmãs não selecionadas iriam junto visualmente de qualquer forma
        // (são embed do ambiente movido) — atualizar o projeto_id delas mantém o
        // campo denormalizado consistente com a realidade
        const { error: errOrc } = await supabase
            .from('orcamentos')
            .update({ projeto_id: destino })
            .in('ambiente_id', ambienteIds)
            .eq('empresa_id', empresaId);
        if (errOrc) throw new Error('mover orçamentos: ' + errOrc.message);

        toast.success(`${versoesSel.length} orçamento(s) migrado(s), medição duplicada no projeto destino`);
    }

    async function handleConfirmar() {
        if (!destinoOk || selIds.length === 0 || migrando) return;
        setMigrando(true);
        try {
            const destino = await resolverDestino();
            if (modo === 'medicoes') await migrarMedicoes(destino);
            else await migrarOrcamentos(destino);
            onMigrado(destino);
        } catch (err) {
            toast.error('Erro ao migrar: ' + err.message);
        } finally {
            setMigrando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !migrando && onClose()} />
            <div className="relative bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl dark:rounded-none shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">

                {/* Cabeçalho */}
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Migrar para projeto</h2>
                    <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                        {modo === 'orcamentos'
                            ? `${selIds.length} orçamento(s) selecionado(s) — escolha o projeto de destino. A medição de origem é duplicada, a original fica no avulso.`
                            : `${selIds.length} medição(ões) selecionada(s) — escolha o projeto de destino. Ambientes e orçamentos vinculados vão juntos.`}
                    </p>
                </div>

                {/* ── DESTINO (único passo — seleção veio inline da aba) ── */}
                <>
                        {temSelecaoParcial && (
                            <p className="px-3 py-2 border border-amber-300 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/5 font-mono text-[10px] text-amber-700 dark:text-amber-400 rounded-md dark:rounded-none leading-relaxed">
                                Um ambiente tem versões não selecionadas — o ambiente inteiro é movido, então elas vão junto.
                            </p>
                        )}

                        <div className="flex gap-px w-max">
                            {[
                                { key: 'existente', label: 'Projeto existente' },
                                { key: 'novo',      label: 'Criar novo projeto' },
                            ].map(m => (
                                <button
                                    key={m.key}
                                    onClick={() => setModoDestino(m.key)}
                                    className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                                        modoDestino === m.key
                                            ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/5'
                                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {modoDestino === 'existente' ? (
                            <select
                                value={destinoId}
                                onChange={e => setDestinoId(e.target.value)}
                                disabled={carregando}
                                className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-lg dark:rounded-none"
                            >
                                <option value="">{carregando ? 'Carregando projetos...' : 'Selecione o projeto de destino'}</option>
                                {projetos.map(p => {
                                    const cli = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
                                    return <option key={p.id} value={p.id}>{p.nome}{cli?.nome ? ` — ${cli.nome}` : ''}</option>;
                                })}
                            </select>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <input
                                    value={novoNome}
                                    onChange={e => setNovoNome(e.target.value)}
                                    placeholder="Nome do projeto"
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-lg dark:rounded-none placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
                                />
                                <div>
                                    <div className="flex items-center justify-end mb-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setModalNovoCliente(true)}
                                            className="flex items-center gap-1 font-mono text-[9px] uppercase text-orange-600 dark:text-yellow-400 hover:text-orange-500 dark:hover:text-yellow-300 transition-colors"
                                        >
                                            <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                                            Novo Cliente
                                        </button>
                                    </div>
                                    <select
                                        value={novoClienteId}
                                        onChange={e => setNovoClienteId(e.target.value)}
                                        disabled={carregando}
                                        className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-lg dark:rounded-none"
                                    >
                                        <option value="">{carregando ? 'Carregando clientes...' : 'Selecione o cliente'}</option>
                                        {clienteTemp && (
                                            <option value="temp">{clienteTemp.nome} (novo — não salvo)</option>
                                        )}
                                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={onClose}
                                disabled={migrando}
                                className="flex-1 border border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-mono text-[10px] uppercase tracking-widest py-2.5 rounded-lg dark:rounded-none transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmar}
                                disabled={!destinoOk || selIds.length === 0 || migrando}
                                className="flex-1 bg-orange-500 dark:bg-yellow-400 text-white dark:text-black font-mono text-[10px] font-bold uppercase tracking-widest py-2.5 rounded-lg dark:rounded-none hover:bg-orange-600 dark:hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {migrando ? 'Migrando...' : `Confirmar migração (${selIds.length})`}
                            </button>
                        </div>
                </>
            </div>

            {/* Sub-modal: criar cliente inline (z-110 — fica acima deste modal) */}
            {modalNovoCliente && (
                <ModalNovoClienteInline
                    onClose={() => setModalNovoCliente(false)}
                    onCreated={dados => {
                        setClienteTemp(dados);   // guarda em memória, sem tocar no banco
                        setNovoClienteId('temp');
                        setModalNovoCliente(false);
                    }}
                />
            )}
        </div>
    );
}
