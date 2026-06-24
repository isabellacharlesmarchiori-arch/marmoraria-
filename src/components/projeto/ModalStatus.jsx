import React from 'react';
import { STATUS_CONFIG } from '../../utils/projetoUtils';

export default function ModalStatus({ modalStatus, novoStatus, setNovoStatus, closeAll, onSalvar }) {
    if (!modalStatus) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
            <div className="relative bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none w-full max-w-[400px] z-10">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-0.5">[ ATUALIZAR_STATUS ]</div>
                        <div className="text-zinc-900 dark:text-white font-semibold">Novo status do projeto</div>
                    </div>
                    <button onClick={closeAll} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        {['aprovado', 'produzindo', 'entregue'].map(s => {
                            const cfg = STATUS_CONFIG[s];
                            return (
                                <button
                                    key={s}
                                    onClick={() => setNovoStatus(s)}
                                    className={`flex items-center gap-3 px-4 py-3.5 border transition-colors ${
                                        novoStatus === s
                                            ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                                            : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500 hover:border-zinc-200/80 dark:hover:border-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${novoStatus === s ? cfg.dot : 'bg-zinc-300 dark:bg-zinc-700'}`}></span>
                                    <span className="font-mono text-[11px] uppercase tracking-widest">{cfg.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={closeAll} className="flex-1 rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                            Cancelar
                        </button>
                        <button onClick={() => onSalvar(novoStatus)} className="flex-1 rounded-md dark:rounded-none bg-orange-500 text-white dark:bg-yellow-400 dark:text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all">
                            <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
