import React, { useState, useMemo } from 'react';
import { fmt } from '../../utils/orcamentoUtils';

export default function ModalProdutoAvulso({ onConfirmar, onFechar, produtosCatalogo = [] }) {
  const [busca, setBusca] = useState('');
  const [prodSel, setProdSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [precoCustom, setPrecoCustom] = useState('');

  const catalogo = produtosCatalogo;

  const filtrados = useMemo(() =>
    catalogo.filter(p =>
      busca === '' || (p.nome ?? '').toLowerCase().includes(busca.toLowerCase()) || (p.subcategoria ?? '').toLowerCase().includes(busca.toLowerCase())
    ), [busca, catalogo]);

  const preco = precoCustom !== '' ? parseFloat(precoCustom.replace(',', '.')) || 0 : (prodSel?.preco ?? 0);

  function handleSelecionar(p) {
    setProdSel(p);
    setPrecoCustom(p.preco.toFixed(2).replace('.', ','));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!prodSel) return;
    onConfirmar({ ...prodSel, qty, preco });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar}></div>
      <div className="relative bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ PRODUTO_AVULSO ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Adicionar produto</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Busca */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Produto</label>
            <div className="relative flex items-center mb-2">
              <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar produto ou categoria..."
                className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:text-zinc-700 transition-colors"
              />
            </div>
            <div className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 max-h-36 overflow-y-auto">
              {filtrados.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelecionar(p)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-white/[0.02] transition-colors ${prodSel?.id === p.id ? 'bg-yellow-400/[0.04]' : ''}`}
                >
                  <div>
                    <div className="text-xs text-gray-900 dark:text-white">{p.nome}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{p.subcategoria}</div>
                  </div>
                  <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400">{fmt(p.preco)}</span>
                </div>
              ))}
            </div>
          </div>

          {prodSel && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Qtd.</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Valor unit. (R$)</label>
                <input
                  value={precoCustom}
                  onChange={e => setPrecoCustom(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
            </div>
          )}

          {prodSel && (
            <div className="border border-gray-300 dark:border-zinc-800 bg-gray-200/50 dark:bg-zinc-950/50 px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Subtotal</span>
              <span className="font-mono text-sm text-gray-900 dark:text-white">{fmt(preco * qty)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!prodSel}
              className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-2.5 hover:bg-yellow-300 transition-colors font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

