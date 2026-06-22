import React, { useState } from 'react';

// Modal simples para adicionar um "Serviço Extra": nome livre + preço.
// Diferente de ModalProdutoAvulso, não há catálogo nem quantidade —
// é um item único de texto livre com valor.
export default function ModalServicoExtra({ onConfirmar, onFechar }) {
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');

  const precoNum = parseFloat(String(preco).replace(',', '.')) || 0;
  const podeConfirmar = nome.trim() !== '' && precoNum > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (!podeConfirmar) return;
    onConfirmar({ nome: nome.trim(), preco: precoNum });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar}></div>
      <div className="relative bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ SERVICO_EXTRA ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Adicionar serviço extra</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Nome */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Descrição do serviço</label>
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Instalação, frete extra, polimento..."
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:placeholder:text-zinc-700 transition-colors"
            />
          </div>

          {/* Preço */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Valor (R$)</label>
            <input
              value={preco}
              onChange={e => setPreco(e.target.value)}
              placeholder="0,00"
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:placeholder:text-zinc-700 transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeConfirmar}
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
