import React from 'react';

export default function ModalPerda({ modalPerda, closeAll, projetoNome, motivoPerda, setMotivoPerda, onConfirmar }) {
    if (!modalPerda) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
            <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-red-500/30 w-full max-w-[440px] z-10">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-red-600 dark:text-red-400/70 mb-0.5">[ MARCAR_COMO_PERDIDO ]</div>
                        <div className="text-gray-900 dark:text-white font-semibold">Confirmar perda do projeto</div>
                    </div>
                    <button onClick={closeAll} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-5">
                    <p className="font-mono text-xs text-gray-500 dark:text-zinc-500">
                        Ao confirmar, o projeto <span className="text-gray-900 dark:text-white">{projetoNome ?? 'Este projeto'}</span> será marcado como perdido. Esta ação notificará o admin.
                    </p>

                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Motivo (opcional)</label>
                        <textarea
                            value={motivoPerda}
                            onChange={e => setMotivoPerda(e.target.value)}
                            placeholder="Ex: cliente escolheu outro fornecedor..."
                            rows={3}
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-zinc-700 resize-none font-mono text-xs"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={closeAll} className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Cancelar
                        </button>
                        <button onClick={onConfirmar} className="flex-1 border border-red-500/50 bg-red-400/5 text-red-400 text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:bg-red-400/10 transition-all">
                            <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                            Confirmar perda
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
