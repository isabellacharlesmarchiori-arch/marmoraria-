import React, { useState, useEffect } from 'react';
import AgendaMedidor from '../AgendaMedidor';

function toDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ModalAgendarProducao({
    pedido,
    pedidoNumero,
    medidores = [],
    profile,
    modo = 'agendar',        // 'agendar' | 'editar'
    medicaoInicial = null,   // objeto medição para pré-preencher no modo editar
    onConfirmar,
    onClose,
}) {
    const [medidorId,   setMedidorId]   = useState('');
    const [data,        setData]        = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [salvando,    setSalvando]    = useState(false);
    const [erro,        setErro]        = useState('');

    // Pré-preenche ao abrir (editar) ou reseta (novo agendamento)
    useEffect(() => {
        if (medicaoInicial) {
            setMedidorId(medicaoInicial.medidor_id ?? '');
            setData(toDatetimeLocal(medicaoInicial.data_medicao));
            setObservacoes(medicaoInicial.observacoes_acesso ?? '');
        } else {
            setMedidorId(medidores.length === 1 ? medidores[0].id : '');
            setData('');
            setObservacoes('');
        }
        setErro('');
    }, [medicaoInicial, medidores]);

    if (!pedido) return null;

    const isEditar = modo === 'editar';

    async function handleSubmit() {
        if (!medidorId) { setErro('Selecione um medidor.'); return; }
        if (!data)      { setErro('Selecione a data e hora.'); return; }
        setSalvando(true);
        setErro('');
        try {
            await onConfirmar({ medidorId, dataStr: data, observacoes: observacoes.trim() || null });
        } catch (e) {
            setErro(e.message ?? 'Erro ao salvar. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-[480px] z-10 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">
                            {isEditar ? '[ EDITAR_PRODUÇÃO ]' : '[ AGENDAR_PRODUÇÃO ]'}
                        </div>
                        <div className="text-gray-900 dark:text-white font-semibold">
                            {isEditar ? 'Editar' : 'Medição de Produção'} — Pedido {pedidoNumero}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                {/* Form */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-5">
                    {erro && (
                        <div className="border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-400/5 px-3 py-2 flex items-center gap-2">
                            <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-700 dark:text-red-400 shrink-0"></iconify-icon>
                            <span className="font-mono text-[10px] text-red-700 dark:text-red-400">{erro}</span>
                        </div>
                    )}

                    {/* Medidor */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Medidor</label>
                        <div className="relative">
                            <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <select
                                value={medidorId}
                                onChange={e => setMedidorId(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                            >
                                <option value="">Selecionar medidor</option>
                                {medidores.map(m => (
                                    <option key={m.id} value={m.id}>{m.nome}</option>
                                ))}
                            </select>
                            <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                        </div>
                        {medidores.length === 0 && (
                            <p className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
                        )}
                    </div>

                    {/* Agenda do medidor */}
                    {medidorId && (
                        <AgendaMedidor
                            medidorId={medidorId}
                            horarioEscolhido={data || null}
                            empresaId={profile?.empresa_id}
                            onDataChange={val => setData(val)}
                        />
                    )}

                    {/* Data e hora */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Data e hora</label>
                        <div className="relative">
                            <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <input
                                type="datetime-local"
                                value={data}
                                onChange={e => setData(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                            />
                        </div>
                    </div>

                    {/* Informações adicionais */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                            Informações adicionais
                            <span className="text-gray-400 dark:text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                        </label>
                        <textarea
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
                            rows={3}
                            placeholder="Ex: Interfone estragado, usar portão lateral. Avisar 30min antes."
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={salvando}
                        className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={salvando || !medidorId || !data}
                        className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                    >
                        {salvando
                            ? <><iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>{isEditar ? 'Salvando...' : 'Agendando...'}</>
                            : <><iconify-icon icon={isEditar ? 'solar:pen-linear' : 'solar:check-circle-linear'} width="14"></iconify-icon>{isEditar ? 'Salvar alterações' : 'Confirmar'}</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
