import React from 'react';

export default function ModalRenomearAmbiente({ editingAmbNome, setEditingAmbNome, onSalvar }) {
    if (!editingAmbNome) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingAmbNome(null)}></div>
            <div className="relative bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none w-full max-w-md z-10">
                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center">
                    <span className="font-mono text-[10px] uppercase text-zinc-900 dark:text-white font-bold tracking-widest">Renomear Ambiente</span>
                    <button onClick={() => setEditingAmbNome(null)} className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                    </button>
                </div>
                <div className="p-6">
                    <input
                        autoFocus
                        value={editingAmbNome.nome}
                        onChange={e => setEditingAmbNome({ ...editingAmbNome, nome: e.target.value })}
                        className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 rounded-md dark:rounded-none p-3 text-sm text-zinc-900 dark:text-white focus:border-orange-500 dark:focus:border-yellow-400 outline-none font-mono"
                    />
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => setEditingAmbNome(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-200/80 dark:border-zinc-800 rounded-md dark:rounded-none py-3 hover:text-zinc-900 dark:hover:text-white transition-colors">Cancelar</button>
                        <button onClick={onSalvar} className="flex-1 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono font-bold text-[10px] uppercase rounded-md dark:rounded-none py-3 hover:bg-orange-600 dark:hover:bg-yellow-300">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
