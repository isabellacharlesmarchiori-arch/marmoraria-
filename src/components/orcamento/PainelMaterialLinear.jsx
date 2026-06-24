import React, { useState, useMemo } from 'react';
import { fmt } from '../../utils/orcamentoUtils';

export default function PainelMaterialLinear({ label, selecionado, onConfirmar, onFechar, matLineares }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(selecionado ?? null);

  const filtrados = useMemo(() => matLineares.filter(m =>
    busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase())
  ), [busca, matLineares]);

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>
      <div className="w-full max-w-xs bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border-l border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none flex flex-col h-full">
        <div className="px-5 pt-5 pb-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-1">[ MATERIAL_LINEAR ]</div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight">{label}</h3>
          </div>
          <button onClick={onFechar} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-zinc-200/80 dark:border-zinc-900">
          <div className="relative flex items-center">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar acabamento..."
              className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 placeholder:text-zinc-400 dark:text-zinc-700 transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Opção para remover seleção */}
          <div onClick={() => setSel(null)}
            className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-zinc-200/80 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${!sel ? 'bg-orange-50 dark:bg-yellow-400/[0.03]' : ''}`}>
            <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${!sel ? 'border-orange-500 dark:border-yellow-400' : 'border-zinc-200/80 dark:border-zinc-700'}`}>
              {!sel && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-yellow-400"></div>}
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-500 italic">Nenhum (sem precificação)</span>
          </div>
          {filtrados.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum acabamento</p>
            </div>
          )}
          {filtrados.map(m => {
            const ativo = sel === m.id;
            return (
              <div key={m.id} onClick={() => setSel(ativo ? null : m.id)}
                className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-zinc-200/80 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-orange-50 dark:bg-yellow-400/[0.03]' : ''}`}>
                <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-orange-500 dark:border-yellow-400' : 'border-zinc-200/80 dark:border-zinc-700'}`}>
                  {ativo && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-yellow-400"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-900 dark:text-white font-medium truncate">{m.nome}</div>
                  <div className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600">{m.tipo?.replace('_', ' ')}</div>
                </div>
                <div className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300 shrink-0">{fmt(m.preco_ml)}<span className="text-zinc-500 dark:text-zinc-600">/ml</span></div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 flex-1">{sel ? '1 selecionado' : 'Nenhum selecionado'}</span>
          <button onClick={onFechar} className="border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(sel)} className="bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-md dark:rounded-none hover:bg-orange-600 dark:hover:bg-yellow-300 transition-colors font-bold">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

