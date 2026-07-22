import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { NOME_PROJETO_AVULSO } from '../../utils/projetoAvulso';

// Migração SELETIVA do projeto avulso coletivo: o usuário escolhe quais
// ambientes (com seus orçamentos e medições) mover para um projeto real.
// O [Avulsos] nunca é deletado — é coletivo e será reutilizado.
export default function ModalMigrarAvulso({
    aberto,
    onClose,
    projetoAvulsoId,
    empresaId,
    userId,
    ambientes = [], // normalizados (useProjectData) — versões trazem vendedor_id/nome/data
    onMigrado,      // (novoProjetoId) => void
}) {
    const [modo, setModo] = useState('existente'); // 'existente' | 'novo'
    const [selecionados, setSelecionados] = useState([]); // ids de ambientes
    const [projetos, setProjetos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [destinoId, setDestinoId] = useState('');
    const [novoNome, setNovoNome] = useState('');
    const [novoClienteId, setNovoClienteId] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [migrando, setMigrando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setSelecionados([]); // limpa seleção a cada abertura
    }, [aberto]);

    useEffect(() => {
        if (!aberto || !empresaId) return;
        let ativo = true;
        (async () => {
            setCarregando(true);
            // Projetos de qualquer vendedor da empresa — o avulso é coletivo
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

    const toggleAmbiente = (ambId) =>
        setSelecionados(prev => prev.includes(ambId) ? prev.filter(x => x !== ambId) : [...prev, ambId]);

    const destinoOk = modo === 'existente'
        ? !!destinoId
        : novoNome.trim().length > 0 && !!novoClienteId;
    const podeConfirmar = destinoOk && selecionados.length > 0;

    async function handleConfirmar() {
        if (!podeConfirmar || migrando) return;
        setMigrando(true);
        try {
            // 1. Resolve o projeto de destino (existente ou novo)
            let destino = destinoId;
            if (modo === 'novo') {
                const { data, error } = await supabase
                    .from('projetos')
                    .insert({
                        nome:        novoNome.trim(),
                        cliente_id:  novoClienteId,
                        empresa_id:  empresaId,
                        vendedor_id: userId,
                        status:      'orcado',
                    })
                    .select('id')
                    .single();
                if (error) throw new Error('criar projeto: ' + error.message);
                destino = data.id;
            }

            // 2. Medições vinculadas aos ambientes selecionados (ambientes.medicao_id
            // não vem no shape normalizado — busca direto no banco)
            const { data: ambRaw, error: errAmbSel } = await supabase
                .from('ambientes')
                .select('id, medicao_id')
                .in('id', selecionados)
                .eq('empresa_id', empresaId);
            if (errAmbSel) throw new Error('mapear medições: ' + errAmbSel.message);
            const medicaoIds = [...new Set((ambRaw ?? []).map(a => a.medicao_id).filter(Boolean))];

            // 3. Move ambientes selecionados
            const { error: errAmb } = await supabase
                .from('ambientes')
                .update({ projeto_id: destino })
                .in('id', selecionados)
                .eq('empresa_id', empresaId);
            if (errAmb) throw new Error('mover ambientes: ' + errAmb.message);

            // 4. Move os orçamentos desses ambientes (orcamentos.projeto_id existe
            // e é preenchido em todo insert — sem isto ficariam apontando pro avulso)
            const { error: errOrc } = await supabase
                .from('orcamentos')
                .update({ projeto_id: destino })
                .in('ambiente_id', selecionados)
                .eq('empresa_id', empresaId);
            if (errOrc) throw new Error('mover orçamentos: ' + errOrc.message);

            // 5. Move as medições desses ambientes
            if (medicaoIds.length > 0) {
                const { error: errMed } = await supabase
                    .from('medicoes')
                    .update({ projeto_id: destino })
                    .in('id', medicaoIds)
                    .eq('empresa_id', empresaId);
                if (errMed) throw new Error('mover medições: ' + errMed.message);
            }

            // O [Avulsos] permanece (coletivo, reutilizável) — vazio ou não.
            toast.success(`${selecionados.length} ambiente(s) migrado(s) com sucesso`);
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
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Migrar para projeto</h2>
                    <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                        Selecione os ambientes que serão movidos — orçamentos e medições vão juntos.
                    </p>
                </div>

                {/* Seleção de ambientes */}
                <div className="border border-zinc-200/80 dark:border-zinc-800 rounded-lg dark:rounded-none divide-y divide-zinc-100 dark:divide-zinc-900 max-h-56 overflow-y-auto">
                    {ambientes.length === 0 ? (
                        <p className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">
                            Nenhum ambiente neste avulso
                        </p>
                    ) : ambientes.map(amb => {
                        const marcado = selecionados.includes(amb.id);
                        return (
                            <label
                                key={amb.id}
                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                    marcado ? 'bg-orange-50 dark:bg-yellow-400/5' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={marcado}
                                    onChange={() => toggleAmbiente(amb.id)}
                                    className="mt-0.5 accent-orange-500 dark:accent-yellow-400 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{amb.nome}</div>
                                    {(amb.orcamentos ?? []).map(o => {
                                        const deOutro = o.vendedor_id && o.vendedor_id !== userId;
                                        return (
                                            <div key={o.id} className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-500 mt-1 min-w-0">
                                                <iconify-icon icon="solar:document-text-linear" width="10" className="shrink-0 text-zinc-400 dark:text-zinc-700"></iconify-icon>
                                                <span className="truncate">{o.nome}</span>
                                                {o.vendedor_nome && (
                                                    <span className="shrink-0 text-zinc-400 dark:text-zinc-600">· {o.vendedor_nome.split(' ')[0]}</span>
                                                )}
                                                {o.data && <span className="shrink-0 text-zinc-400 dark:text-zinc-600">· {o.data}</span>}
                                                {deOutro && (
                                                    <span className="shrink-0 px-1 py-0.5 border border-amber-300 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/5 text-[7px] uppercase tracking-widest text-amber-700 dark:text-amber-400">
                                                        De outro vendedor
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </label>
                        );
                    })}
                </div>

                {/* Modo: existente | novo */}
                <div className="flex gap-px w-max">
                    {[
                        { key: 'existente', label: 'Projeto existente' },
                        { key: 'novo',      label: 'Criar novo projeto' },
                    ].map(m => (
                        <button
                            key={m.key}
                            onClick={() => setModo(m.key)}
                            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                                modo === m.key
                                    ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/5'
                                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                {modo === 'existente' ? (
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
                        <select
                            value={novoClienteId}
                            onChange={e => setNovoClienteId(e.target.value)}
                            disabled={carregando}
                            className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-lg dark:rounded-none"
                        >
                            <option value="">{carregando ? 'Carregando clientes...' : 'Selecione o cliente'}</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
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
                        disabled={!podeConfirmar || migrando}
                        className="flex-1 bg-orange-500 dark:bg-yellow-400 text-white dark:text-black font-mono text-[10px] font-bold uppercase tracking-widest py-2.5 rounded-lg dark:rounded-none hover:bg-orange-600 dark:hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {migrando
                            ? 'Migrando...'
                            : `Migrar ${selecionados.length > 0 ? `(${selecionados.length})` : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
