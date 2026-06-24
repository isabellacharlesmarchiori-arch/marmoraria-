import React from 'react';

export default function DrawerEdicaoPeca({ pecaEmEdicao, setPecaEmEdicao, onRemoverRecorte, onSalvar }) {
    if (!pecaEmEdicao) return null;
    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setPecaEmEdicao(null)}></div>
            <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border-l border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none z-50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-0.5">Editar Peça</div>
                        <div className="text-zinc-900 dark:text-white font-semibold text-sm">{pecaEmEdicao?.pecaData?.nome ?? 'Peça'}</div>
                    </div>
                    <button onClick={() => setPecaEmEdicao(null)} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Nome da peça</label>
                            <input
                                type="text"
                                value={pecaEmEdicao?.pecaData?.nome ?? ''}
                                onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, nome: e.target.value } }))}
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Valor (R$)</label>
                            <input
                                type="number"
                                value={pecaEmEdicao?.pecaData?.valor ?? 0}
                                onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, valor: Number(e.target.value) } }))}
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Espessura</label>
                            <select
                                value={pecaEmEdicao?.pecaData?.espessura ?? ''}
                                onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, espessura: e.target.value } }))}
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                            >
                                <option value="1cm">1cm</option>
                                <option value="2cm">2cm</option>
                                <option value="3cm">3cm</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Material</label>
                            <select
                                value={pecaEmEdicao?.pecaData?.material ?? ''}
                                onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, material: e.target.value } }))}
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                            >
                                <option value="Granito São Gabriel">Granito São Gabriel</option>
                                <option value="Silestone Tigris Sand">Silestone Tigris Sand</option>
                                <option value="Quartzo Branco">Quartzo Branco</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-3 border-b border-zinc-200/80 dark:border-zinc-800 pb-2">Recortes ({(pecaEmEdicao?.pecaData?.recortes ?? []).length})</div>
                        <div className="flex flex-col gap-2">
                            {(pecaEmEdicao?.pecaData?.recortes ?? []).map(rec => (
                                <div key={rec?.id} className="flex flex-col border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100 dark:bg-black p-3 group hover:border-zinc-200/80 dark:hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <iconify-icon icon="solar:scissors-linear" width="14" className="text-zinc-500 dark:text-zinc-600"></iconify-icon>
                                            <div>
                                                <div className="text-xs text-zinc-900 dark:text-white pb-0.5">{rec?.nome ?? 'Recorte'}</div>
                                                <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">{rec?.dimensao ?? '—'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onRemoverRecorte(rec?.id)}
                                                className="p-1.5 text-zinc-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded dark:rounded-none"
                                                title="Remover recorte"
                                            >
                                                <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(pecaEmEdicao?.pecaData?.recortes ?? []).length === 0 && (
                                <div className="p-3 border border-dashed border-zinc-200/80 dark:border-zinc-800 text-center">
                                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-600">Nenhum recorte</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 flex gap-3">
                    <button onClick={() => setPecaEmEdicao(null)} className="flex-1 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-md dark:rounded-none">
                        Cancelar
                    </button>
                    <button onClick={onSalvar} className="flex-1 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2 rounded-md dark:rounded-none">
                        <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                        Salvar Peça
                    </button>
                </div>
            </div>
        </>
    );
}
