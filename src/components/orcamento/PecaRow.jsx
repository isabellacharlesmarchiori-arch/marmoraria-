import React, { useState } from 'react';

export default function PecaRow({ peca, onToggle, onAbrirMaterial, onDuplicar, onRenomear, todosM }) {
  const temMaterial = peca.materiais.length > 0;
  const [editando, setEditando] = useState(false);
  const [nomeEdit, setNomeEdit] = useState('');

  function iniciarEdicao() {
    setNomeEdit(peca.nome);
    setEditando(true);
  }
  function confirmar() {
    const novo = nomeEdit.trim();
    if (novo && novo !== peca.nome) onRenomear?.(peca.id, novo);
    setEditando(false);
  }

  return (
    <div className={`grid grid-cols-12 items-center px-4 py-3.5 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 group transition-colors ${peca.incluida ? '' : 'opacity-40'}`}>
      {/* Toggle */}
      <div className="col-span-1 flex items-center">
        <button
          onClick={() => onToggle(peca.id)}
          className={`w-4 h-4 border flex items-center justify-center transition-colors ${peca.incluida ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-700 hover:border-zinc-500'}`}
          title={peca.incluida ? 'Excluir peça' : 'Incluir peça'}
        >
          {peca.incluida && <iconify-icon icon="solar:check-read-linear" width="8"></iconify-icon>}
        </button>
      </div>

      {/* Nome */}
      <div className="col-span-3 min-w-0 pr-2">
        {editando ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={nomeEdit}
              onChange={e => setNomeEdit(e.target.value)}
              onBlur={confirmar}
              onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false); }}
              className="flex-1 min-w-0 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1.5 py-0.5 outline-none"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1 group/nome">
            <span className="text-sm text-gray-900 dark:text-white font-medium truncate">{peca.nome}</span>
            {onRenomear && (
              <button
                onClick={iniciarEdicao}
                className="opacity-0 group-hover/nome:opacity-100 p-0.5 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-all shrink-0"
                title="Renomear peça"
              >
                <iconify-icon icon="solar:pen-linear" width="10"></iconify-icon>
              </button>
            )}
          </div>
        )}
        {peca.descricao && (
          <span className="font-mono text-[9px] text-zinc-500 block">{peca.descricao}</span>
        )}
        {peca.meia_esquadria_ml > 0 && (
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 block">Meia-Esquadria · {peca.meia_esquadria_ml.toFixed(2)}ml</span>
        )}
        {peca.reto_simples_ml > 0 && (
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 block">Reto Simples · {peca.reto_simples_ml.toFixed(2)}ml</span>
        )}
      </div>

      {/* Área / espessura */}
      <div className="col-span-2 pr-2">
        <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{peca.area_liq.toFixed(2)} m²</span>
        <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{peca.espessura}cm · {peca.cortes} corte{peca.cortes !== 1 ? 's' : ''}</div>
      </div>

      {/* Material(is) selecionado(s) */}
      <div className="col-span-4 pr-2">
        {peca.materiais.length === 0 ? (
          <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-700 italic">Nenhum material</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {peca.materiais.map(mid => {
              const m = todosM.find(x => x.id === mid);
              return m ? (
                <span key={mid} className="font-mono text-[10px] text-gray-600 dark:text-zinc-300 truncate">{m.nome}</span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Botão selecionar material e duplicar */}
      <div className="col-span-2 flex justify-end gap-1.5 items-center">
        {peca.incluida && (
          <button
            onClick={() => onDuplicar(peca.id)}
            title="Duplicar peça na medição"
            className="font-mono text-[9px] uppercase tracking-widest px-2 py-1.5 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 transition-colors flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
          </button>
        )}
        {peca.incluida && (
          <button
            onClick={() => onAbrirMaterial(peca.id)}
            className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 ${
              temMaterial
                ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
            }`}
          >
            <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
            {temMaterial ? `${peca.materiais.length} mat.` : 'Material'}
          </button>
        )}
      </div>
    </div>
  );
}
