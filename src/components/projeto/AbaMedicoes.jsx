import React from 'react';
import { MedicaoPill } from '../../utils/projetoUtils';

export default function AbaMedicoes({
    medicoes,
    isMedidorCombinado,
    vendedorId,
    sessionUserId,
    isViewOnlyAdmin,
    onAbrirNovoAgendamento,
    onAbrirEditar,
    onVerDados,
    onFazerMedicao,
    onExcluirMedicao,
}) {
    return (
        <div className="sys-reveal sys-delay-200">
            <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                    01 // Medições
                </div>
                <div className="flex items-center gap-2">
                    {isMedidorCombinado && vendedorId === sessionUserId && (
                        <button
                            onClick={onFazerMedicao}
                            className="flex items-center gap-2 bg-gray-900 dark:bg-zinc-800 text-yellow-400 text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 border border-yellow-400/40 hover:border-yellow-400 hover:shadow-[0_0_12px_rgba(250,204,21,0.2)] transition-all"
                        >
                            <iconify-icon icon="solar:ruler-pen-bold" width="14"></iconify-icon>
                            Fazer Medição
                        </button>
                    )}
                    <button
                        onClick={onAbrirNovoAgendamento}
                        className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                    >
                        <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                        Agendar medição
                    </button>
                </div>
            </div>

            <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                    <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Data</span>
                    <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Medidor</span>
                    <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Status</span>
                    <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Ação</span>
                </div>

                {(medicoes ?? []).map((m, i) => {
                    const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
                    return (
                        <div
                            key={m?.id}
                            className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                                isAprovada
                                    ? 'bg-green-400/[0.03] border-l-2 border-l-green-500/50 hover:bg-green-400/[0.05]'
                                    : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                            } ${i < (medicoes?.length ?? 0) - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
                        >
                            <div className="col-span-4 flex items-start gap-2">
                                <iconify-icon
                                    icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                                    width="13"
                                    className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-gray-500 dark:text-zinc-600'}`}
                                ></iconify-icon>
                                <div className="flex flex-col">
                                    <span className="text-sm text-gray-900 dark:text-white font-medium">{m?.data ?? '—'}</span>
                                    {isAprovada && (
                                        <span className="font-mono text-[9px] text-green-500/70 uppercase tracking-widest">Aguardando orçamento</span>
                                    )}
                                    {!isAprovada && m?.endereco && (
                                        <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 truncate max-w-[140px]">{m.endereco}</span>
                                    )}
                                </div>
                            </div>
                            <div className="col-span-3 font-mono text-[11px] text-gray-500 dark:text-zinc-500">{m?.medidor ?? '—'}</div>
                            <div className="col-span-2">
                                <MedicaoPill status={m?.status ?? 'agendada'} />
                            </div>
                            <div className="col-span-3 flex items-center justify-end gap-1.5">
                                {m?.status !== 'agendada' && m?.status !== 'pendente' && (
                                    <button
                                        onClick={() => onVerDados(m)}
                                        className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 transition-colors border ${
                                            isAprovada
                                                ? 'border-green-500/40 text-green-400 hover:border-green-400 hover:bg-green-400/10'
                                                : 'border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                    >
                                        <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                                        Ver Dados
                                    </button>
                                )}
                                {!isViewOnlyAdmin && (
                                    <>
                                        <button
                                            onClick={() => onAbrirEditar(m)}
                                            title="Editar medição"
                                            className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-500 dark:hover:border-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                        >
                                            <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                                        </button>
                                        <button
                                            onClick={() => onExcluirMedicao(m)}
                                            title="Excluir medição"
                                            className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-red-500/50 dark:hover:border-red-400/50 hover:text-red-400 transition-colors"
                                        >
                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}

                {(medicoes?.length ?? 0) === 0 && (
                    <div className="px-4 py-12 text-center">
                        <iconify-icon icon="solar:ruler-pen-linear" width="32" className="text-gray-300 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhuma medição ainda</p>
                    </div>
                )}
            </div>
        </div>
    );
}
