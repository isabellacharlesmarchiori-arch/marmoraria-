import React from 'react';

export default function ModalRenomearAmbiente({ editingAmbNome, setEditingAmbNome, onSalvar }) {
    if (!editingAmbNome) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingAmbNome(null)}></div>
            <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md z-10">
                <div className="px-6 py-4 border-b border-gray-300 dark:border-zinc-800 flex justify-between items-center">
                    <span className="font-mono text-[10px] uppercase text-gray-900 dark:text-white font-bold tracking-widest">Renomear Ambiente</span>
                    <button onClick={() => setEditingAmbNome(null)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                    </button>
                </div>
                <div className="p-6">
                    <input
                        autoFocus
                        value={editingAmbNome.nome}
                        onChange={e => setEditingAmbNome({ ...editingAmbNome, nome: e.target.value })}
                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 p-3 text-sm text-gray-900 dark:text-white focus:border-yellow-400 outline-none font-mono"
                    />
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => setEditingAmbNome(null)} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                        <button onClick={onSalvar} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
