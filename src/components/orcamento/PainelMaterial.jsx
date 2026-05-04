import React, { useState, useMemo } from 'react';

export default function PainelMaterial({ pecaId, pecaNome, selecionados, onConfirmar, onFechar, todosM, single = false }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [sel, setSel] = useState(selecionados);
  const [acabamentoSel, setAcabamentoSel] = useState(null);

  const categoriasDisponiveis = useMemo(
    () => [...new Set(todosM.map(m => m.categoria).filter(Boolean))].sort(),
    [todosM]
  );

  const variacoesMat = useMemo(() => {
    if (!single || sel.length === 0) return [];
    return todosM.find(m => m.id === sel[0])?.variacoes_precos ?? [];
  }, [single, sel, todosM]);

  const acabamentosUnicos = useMemo(
    () => [...new Set(variacoesMat.map(v => v.acabamento))],
    [variacoesMat]
  );

  const filtrados = useMemo(() => todosM.filter(m => {
    const matchBusca = busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase()) || (m.cor ?? '').toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoria === 'todos' || m.categoria === categoria;
    return matchBusca && matchCat;
  }), [busca, categoria, todosM]);

  function toggle(id) {
    if (single) {
      setSel(prev => prev.includes(id) ? [] : [id]);
      setAcabamentoSel(null);
    } else {
      setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>

      {/* Painel lateral direito */}
      <div className="w-full max-w-sm bg-gray-50 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-300 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ SELECIONAR_MATERIAL ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">{pecaNome}</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-200 dark:border-zinc-900">
          <div className="relative flex items-center mb-3">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar material..."
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:text-zinc-700 transition-colors"
            />
          </div>
          {/* Categorias */}
          <div className="flex gap-1.5 flex-wrap">
            {['todos', ...categoriasDisponiveis].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                  categoria === cat
                    ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5'
                    : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400'
                }`}
              >
                {cat === 'todos' ? 'Todos' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum material</p>
            </div>
          ) : (
            filtrados.map(m => {
              const ativo = sel.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-gray-200 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-yellow-400/[0.03]' : ''}`}
                >
                  {/* Checkbox / Radio */}
                  {single ? (
                    <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                      {ativo && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
                    </div>
                  ) : (
                    <div className={`w-4 h-4 border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400 bg-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                      {ativo && <iconify-icon icon="solar:check-read-linear" width="8" className="text-black"></iconify-icon>}
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 dark:text-white font-medium truncate">{m.nome}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{m.cor} · {m.categoria}</div>
                  </div>
                  {/* Preço */}
                  <div className="text-right shrink-0">
                    {(() => {
                      const parseEsp = s => parseInt(s) || 0;
                      const v2 = m.variacoes_precos?.find(v => parseEsp(v.espessura) === 2);
                      const v3 = m.variacoes_precos?.find(v => parseEsp(v.espessura) === 3);
                      return <>
                        {v2 && <div className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(v2.preco_venda)}<span className="text-gray-500 dark:text-zinc-600">/m²·2cm</span></div>}
                        {v3 && <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{fmt(v3.preco_venda)}<span className="text-gray-400 dark:text-zinc-700">/3cm</span></div>}
                        {!v2 && !v3 && m.variacoes_precos?.[0] && <div className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(m.variacoes_precos[0].preco_venda)}<span className="text-gray-500 dark:text-zinc-600">/m²</span></div>}
                      </>;
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Seleção de acabamento — aparece quando material está selecionado (modo single) */}
        {single && sel.length > 0 && acabamentosUnicos.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-300 dark:border-zinc-800">
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-2">Acabamento</div>
            <div className="flex flex-wrap gap-1.5">
              {acabamentosUnicos.map(ac => (
                <button
                  key={ac}
                  onClick={() => setAcabamentoSel(prev => prev === ac ? null : ac)}
                  className={`font-mono text-[10px] px-3 py-1 border transition-colors ${
                    acabamentoSel === ac
                      ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5'
                      : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-gray-400 dark:hover:border-zinc-600'
                  }`}
                >
                  {ac}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-300 dark:border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 flex-1">
            {single
              ? (sel.length === 0 ? 'Nenhum selecionado' : (acabamentoSel ? acabamentoSel : '1 selecionado'))
              : `${sel.length} selecionado${sel.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={onFechar}
            className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(pecaId, sel, acabamentoSel)}
            className="bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-yellow-300 transition-colors font-bold"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
