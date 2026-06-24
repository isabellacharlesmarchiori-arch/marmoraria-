import React from 'react';

export default function ModalEditarVersao({ editingVersao, setEditingVersao, catMateriais, onSalvar }) {
    if (!editingVersao) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingVersao(null)}></div>
            <div className="relative bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none w-full max-w-lg z-10 max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center shrink-0">
                    <span className="font-mono text-[10px] uppercase text-zinc-900 dark:text-white font-bold tracking-widest">Editar Versão</span>
                    <button onClick={() => setEditingVersao(null)} className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex flex-col gap-4">
                    <div>
                        <label className="font-mono text-[9px] uppercase text-zinc-500 dark:text-zinc-500 block mb-1">Nome do Ambiente</label>
                        <input
                            value={editingVersao.nomeAmb}
                            onChange={e => setEditingVersao(p => ({ ...p, nomeAmb: e.target.value }))}
                            className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2 rounded-md dark:rounded-none"
                        />
                    </div>
                    <div>
                        <label className="font-mono text-[9px] uppercase text-zinc-500 dark:text-zinc-500 block mb-1">Nome da Versão</label>
                        <input
                            value={editingVersao.nomeVersao}
                            onChange={e => setEditingVersao(p => ({ ...p, nomeVersao: e.target.value }))}
                            className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 outline-none text-zinc-900 dark:text-white text-sm font-mono px-3 py-2 rounded-md dark:rounded-none"
                        />
                    </div>
                    {editingVersao.pecas.length > 0 && (
                        <div>
                            <label className="font-mono text-[9px] uppercase text-zinc-500 dark:text-zinc-500 block mb-2">Nome e Material por Peça</label>
                            <div className="flex flex-col gap-2">
                                {editingVersao.pecas.map((ep, i) => (
                                    <div key={ep.id} className="flex flex-col gap-1.5 bg-zinc-100/60 dark:bg-black/40 border border-zinc-200/80 dark:border-zinc-800/50 px-3 py-2.5">
                                        <input
                                            value={ep.nome}
                                            onChange={e => setEditingVersao(p => ({
                                                ...p,
                                                pecas: p.pecas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)
                                            }))}
                                            className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 focus:border-zinc-600 outline-none text-zinc-800 dark:text-zinc-200 text-[11px] font-mono px-2 py-1 rounded-md dark:rounded-none"
                                            placeholder="Nome da peça"
                                        />
                                        <select
                                            value={ep.material_id || ''}
                                            onChange={e => setEditingVersao(p => ({
                                                ...p,
                                                pecas: p.pecas.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x)
                                            }))}
                                            className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-mono px-2 py-1 outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none"
                                        >
                                            <option value="">Sem material definido</option>
                                            {catMateriais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                        </select>
                                        {catMateriais.length === 0 && (
                                            <p className="font-mono text-[9px] text-zinc-400 dark:text-zinc-700">Conecte-se para ver catálogo de materiais.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 shrink-0">
                    <button onClick={() => setEditingVersao(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-200/80 dark:border-zinc-800 py-3 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-md dark:rounded-none">Cancelar</button>
                    <button onClick={onSalvar} className="flex-1 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-orange-600 dark:hover:bg-yellow-300 rounded-md dark:rounded-none">Salvar</button>
                </div>
            </div>
        </div>
    );
}
