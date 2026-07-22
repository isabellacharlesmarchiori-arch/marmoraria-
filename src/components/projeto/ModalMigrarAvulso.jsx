import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { NOME_PROJETO_AVULSO } from '../../utils/projetoAvulso';

// Modal de migração do projeto avulso coletivo para um projeto real.
// Move TODAS as medições, ambientes e orçamentos do avulso (inclusive de outros
// vendedores — o projeto é coletivo) e deleta o projeto-fantasma se possível.
export default function ModalMigrarAvulso({
    aberto,
    onClose,
    projetoAvulsoId,
    empresaId,
    userId,
    temItensDeOutros, // orçamentos de outros vendedores dentro do avulso
    onMigrado,        // (novoProjetoId) => void
}) {
    const [modo, setModo] = useState('existente'); // 'existente' | 'novo'
    const [projetos, setProjetos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [destinoId, setDestinoId] = useState('');
    const [novoNome, setNovoNome] = useState('');
    const [novoClienteId, setNovoClienteId] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [migrando, setMigrando] = useState(false);

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

    const podeConfirmar = modo === 'existente'
        ? !!destinoId
        : novoNome.trim().length > 0 && !!novoClienteId;

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

            // 2-4. Move medições, ambientes e orçamentos (orcamentos.projeto_id
            // existe e é preenchido em todo insert — sem este UPDATE ficariam
            // apontando para o projeto deletado)
            for (const tabela of ['medicoes', 'ambientes', 'orcamentos']) {
                const { error } = await supabase
                    .from(tabela)
                    .update({ projeto_id: destino })
                    .eq('projeto_id', projetoAvulsoId)
                    .eq('empresa_id', empresaId);
                if (error) throw new Error(`mover ${tabela}: ` + error.message);
            }

            // 5. Deleta o projeto-fantasma (agora vazio). Best-effort: se alguma
            // FK externa (ex: notificacoes) bloquear, o fantasma vazio fica órfão
            // sem prejudicar a migração — será reutilizado no próximo avulso.
            const { error: errDel } = await supabase
                .from('projetos')
                .delete()
                .eq('id', projetoAvulsoId)
                .eq('empresa_id', empresaId);
            if (errDel) console.warn('[MigrarAvulso] Projeto avulso não pôde ser deletado (segue vazio):', errDel.message);

            toast.success('Migrado com sucesso');
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
            <div className="relative bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 rounded-2xl dark:rounded-none shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Migrar para projeto</h2>
                    <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                        Medições e orçamentos deste avulso serão movidos para o projeto escolhido.
                    </p>
                    {temItensDeOutros && (
                        <p className="mt-2 px-3 py-2 border border-amber-300 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/5 font-mono text-[10px] text-amber-700 dark:text-amber-400 rounded-md dark:rounded-none leading-relaxed">
                            Este avulso contém orçamentos de outros vendedores — todos serão movidos juntos.
                        </p>
                    )}
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
                        {migrando ? 'Migrando...' : 'Confirmar migração'}
                    </button>
                </div>
            </div>
        </div>
    );
}
