import React, { useState } from 'react';

export default function ModalVersoes({ pecas, onCriar, onFechar, todosM }) {
  const [modo, setModo] = useState('automatico');
  const [versoesManual, setVersoesManual] = useState([
    { nome: 'Versão A', mats: Object.fromEntries(pecas.filter(p => p.incluida).map(p => [p.id, p.materiais[0] ?? ''])) },
  ]);

  const pecasIncluidas = pecas.filter(p => p.incluida && p.materiais.length > 0);

  function addVersaoManual() {
    setVersoesManual(prev => [
      ...prev,
      { nome: `Versão ${String.fromCharCode(65 + prev.length)}`, mats: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.materiais[0] ?? ''])) },
    ]);
  }

  function duplicarVersaoManual(vIdx) {
    setVersoesManual(prev => {
      const novaLista = [...prev];
      novaLista.splice(vIdx + 1, 0, {
        nome: `${prev[vIdx].nome} (Cópia)`,
        mats: { ...prev[vIdx].mats }
      });
      return novaLista;
    });
  }

  function removerVersaoManual(vIdx) {
    setVersoesManual(prev => prev.filter((_, i) => i !== vIdx));
  }

  function setVersaoManualMat(vIdx, pecaId, matId) {
    setVersoesManual(prev => prev.map((v, i) => i === vIdx ? { ...v, mats: { ...v.mats, [pecaId]: matId } } : v));
  }

  function setVersaoManualNome(vIdx, nome) {
    setVersoesManual(prev => prev.map((v, i) => i === vIdx ? { ...v, nome } : v));
  }

  function handleCriar() {
    let versoes = [];

    if (modo === 'automatico') {
      // Group pieces by (ambiente_nome, sorted deduplicated material set)
      const dimsMap = new Map();
      pecasIncluidas.forEach(p => {
        const uniqMats = [...new Set(p.materiais)];
        const key = `${p.ambiente_nome ?? ''}__${[...uniqMats].sort().join(',')}`;
        if (!dimsMap.has(key)) {
          dimsMap.set(key, { ambNome: p.ambiente_nome ?? '', materiais: uniqMats, pieceIds: [] });
        }
        dimsMap.get(key).pieceIds.push(p.id);
      });

      // Fixed: single-material dims (don't vary) — always apply their one material
      const fixedDims = [...dimsMap.values()].filter(d => d.materiais.length === 1);
      // Variable: dims with 2+ materials → each becomes a cartesian dimension
      const varDims   = [...dimsMap.values()].filter(d => d.materiais.length > 1);

      function cartesian(arr) {
        if (arr.length === 0) return [[]];
        const [first, ...rest] = arr;
        return first.materiais.flatMap(matId =>
          cartesian(rest).map(s => [{ ...first, matId }, ...s])
        );
      }
      const combos = varDims.length > 0 ? cartesian(varDims) : [[]];

      versoes = combos.map((combo, i) => {
        const matsObj = {};
        // Fixed materials applied to every version
        fixedDims.forEach(({ pieceIds, materiais: [matId] }) => {
          pieceIds.forEach(pid => { matsObj[pid] = matId; });
        });
        // Variable materials from this cartesian combination
        combo.forEach(({ pieceIds, matId }) => {
          pieceIds.forEach(pid => { matsObj[pid] = matId; });
        });
        // Version name built only from variable dims
        const matByAmb = {};
        combo.forEach(({ ambNome, matId, pieceIds }) => {
          const nome = todosM.find(m => m.id === matId)?.nome;
          if (!nome) return;
          if (!matByAmb[ambNome]) matByAmb[ambNome] = {};
          matByAmb[ambNome][nome] = (matByAmb[ambNome][nome] ?? 0) + pieceIds.length;
        });
        const partes = Object.entries(matByAmb).map(([amb, mats]) => {
          const top = Object.entries(mats).sort((a, b) => b[1] - a[1])[0]?.[0];
          return top ? (amb ? `${amb}: ${top}` : top) : null;
        }).filter(Boolean);
        return {
          nome: partes.length > 0 ? partes.join(' + ') : `Versão ${i + 1}`,
          mats: matsObj,
        };
      });
    } else {
      versoes = versoesManual;
    }

    onCriar(versoes);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar}></div>
      <div className="relative bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-lg z-10 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ CRIAR_VERSOES ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Criar versões de orçamento</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Opções */}
          <div className="flex flex-col gap-2">
            {[
              { key: 'automatico', icon: 'solar:widget-5-linear', titulo: 'Todas as combinações', desc: 'Gera automaticamente o produto cartesiano de todos os materiais por peça' },
              { key: 'manual',     icon: 'solar:pen-linear',      titulo: 'Definição manual',     desc: 'Você define nome e material de cada peça para cada versão' },
            ].map(opt => (
              <div
                key={opt.key}
                onClick={() => setModo(opt.key)}
                className={`flex items-start gap-1.5 p-3 border cursor-pointer transition-colors ${modo === opt.key ? 'border-yellow-400/40 bg-yellow-400/[0.03]' : 'border-gray-300 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'}`}
              >
                <div className={`w-4 h-4 border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${modo === opt.key ? 'border-yellow-400 bg-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                  {modo === opt.key && <iconify-icon icon="solar:check-read-linear" width="8" className="text-black"></iconify-icon>}
                </div>
                <div className="flex items-start gap-2 flex-1">
                  <iconify-icon icon={opt.icon} width="14" className={`mt-0.5 shrink-0 ${modo === opt.key ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}></iconify-icon>
                  <div>
                    <div className={`text-xs font-medium transition-colors ${modo === opt.key ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-300'}`}>{opt.titulo}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-0.5 leading-relaxed">{opt.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Manual: configuração */}
          {modo === 'manual' && (
            <div className="flex flex-col gap-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500">Versões</div>
              {versoesManual.map((v, vIdx) => (
                <div key={vIdx} className="border border-gray-300 dark:border-zinc-800 p-3 flex flex-col gap-2 relative">
                  <div className="flex gap-2 items-center">
                    <input
                      value={v.nome}
                      onChange={e => setVersaoManualNome(vIdx, e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-400 transition-colors"
                      placeholder="Nome da versão"
                    />
                    <button
                      type="button"
                      onClick={() => duplicarVersaoManual(vIdx)}
                      className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:text-yellow-400 hover:border-yellow-400 px-3 py-2 transition-colors flex items-center justify-center"
                      title="Duplicar versão"
                    >
                      <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                    </button>
                    {versoesManual.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerVersaoManual(vIdx)}
                        className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:text-red-400 hover:border-red-400 px-3 py-2 transition-colors flex items-center justify-center"
                        title="Remover versão"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    )}
                  </div>
                  {pecasIncluidas.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 w-28 shrink-0 truncate">{p.nome}</span>
                      <select
                        value={v.mats[p.id] ?? ''}
                        onChange={e => setVersaoManualMat(vIdx, p.id, e.target.value)}
                        className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                      >
                        <option value="">— Sem material —</option>
                        {p.materiais.map(mid => {
                          const m = todosM.find(x => x.id === mid);
                          return m ? <option key={mid} value={mid}>{m.nome}</option> : null;
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={addVersaoManual}
                className="border border-dashed border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest py-2 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                Adicionar versão
              </button>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCriar}
              className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-yellow-300 transition-colors font-bold flex items-center justify-center gap-2"
            >
              <iconify-icon icon="solar:layers-minimalistic-linear" width="13"></iconify-icon>
              Criar versões
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

