import React from 'react';

export default function AbaProdutos({ produtos, setProdutos, openModal, handleToggle }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
          <iconify-icon icon="solar:box-linear" class="text-yellow-400"></iconify-icon> Produtos Avulsos / Insumos
        </h2>
        <button onClick={() => openModal('produto')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
          <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
        </button>
      </div>
      <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">
          <div>Produto</div><div>Preço Unit.</div><div>Exclusões / Acresc.</div><div>Status</div><div className="text-right">Ações</div>
        </div>
        {produtos.length === 0 && (
          <div className="p-8 text-center">
            <iconify-icon icon="solar:box-linear" width="28" className="text-gray-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum produto cadastrado</p>
          </div>
        )}
        {produtos.map(p => (
          <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
            <div>
              <div className="text-gray-900 dark:text-white uppercase font-medium">{p.nome}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono mt-1">{p.subcategoria}</div>
            </div>
            <div className="font-mono text-gray-600 dark:text-zinc-300">R$ {p.precoUnitario.toFixed(2)}</div>
            <div>
              {p.incluiMaterial
                ? <span className="text-[10px] text-yellow-400 border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 font-mono uppercase">Deduz Área</span>
                : <span className="text-gray-500 dark:text-zinc-600">—</span>}
            </div>
            <div>
              <button onClick={() => handleToggle(setProdutos, produtos, p.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${p.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}>
                <iconify-icon icon={p.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                {p.ativo ? 'Ativo' : 'Oculto'}
              </button>
            </div>
            <div className="text-right">
              <button onClick={() => openModal('produto', p)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                <iconify-icon icon="solar:pen-linear"></iconify-icon>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
