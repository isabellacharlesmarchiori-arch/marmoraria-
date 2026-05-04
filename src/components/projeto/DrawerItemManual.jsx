import React from 'react';
import { fmtBRL } from '../../utils/projetoUtils';

export default function DrawerItemManual({ itemManualEmEdicao, setItemManualEmEdicao, onSalvar }) {
    if (!itemManualEmEdicao) return null;
    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setItemManualEmEdicao(null)}></div>
            <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-gray-100 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 z-50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 border-t-2 border-t-yellow-400">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Editar Item Manual</div>
                        <div className="text-gray-900 dark:text-white font-semibold text-sm">{itemManualEmEdicao.itemData.nome_peca || 'Item sem nome'}</div>
                    </div>
                    <button onClick={() => setItemManualEmEdicao(null)} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Nome da Peça</label>
                        <input
                            type="text"
                            value={itemManualEmEdicao.itemData.nome_peca ?? ''}
                            onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, nome_peca: e.target.value } }))}
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors"
                        />
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Tipo</label>
                            <div className={`px-4 py-3 border font-mono text-xs ${itemManualEmEdicao.itemData.tipo === 'area' ? 'border-blue-500/30 text-blue-400 bg-blue-400/5' : 'border-purple-500/30 text-purple-400 bg-purple-400/5'}`}>
                                {itemManualEmEdicao.itemData.tipo === 'area' ? 'Área (m²)' : 'Linear (ML)'}
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                                {itemManualEmEdicao.itemData.tipo === 'area' ? 'Quantidade (m²)' : 'Metragem (ML)'}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={itemManualEmEdicao.itemData.quantidade ?? ''}
                                onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, quantidade: e.target.value } }))}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                            />
                        </div>
                    </div>
                    {itemManualEmEdicao.itemData.tipo === 'area' && (
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Acabamento</label>
                                <div className="px-4 py-3 border border-gray-300 dark:border-zinc-800 font-mono text-xs text-gray-600 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-900">
                                    {itemManualEmEdicao.itemData.acabamento || '—'}
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Espessura</label>
                                <div className="px-4 py-3 border border-gray-300 dark:border-zinc-800 font-mono text-xs text-gray-600 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-900">
                                    {itemManualEmEdicao.itemData.espessura || '—'}
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                                Preço unit. (R$/{itemManualEmEdicao.itemData.tipo === 'area' ? 'm²' : 'ML'})
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={itemManualEmEdicao.itemData.preco_unitario ?? 0}
                                onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, preco_unitario: parseFloat(e.target.value) || 0 } }))}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Total</label>
                            <div className="px-4 py-3 border border-yellow-400/20 bg-yellow-400/5 font-mono text-sm text-yellow-400 font-semibold">
                                {fmtBRL((parseFloat(itemManualEmEdicao.itemData.quantidade) || 0) * (itemManualEmEdicao.itemData.preco_unitario || 0))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-800 flex gap-3">
                    <button onClick={() => setItemManualEmEdicao(null)} className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button onClick={onSalvar} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2">
                        <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                        Salvar Item
                    </button>
                </div>
            </div>
        </>
    );
}
