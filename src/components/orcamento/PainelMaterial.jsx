import React, { useState, useMemo } from 'react';
import { fmt } from '../../utils/orcamentoUtils';

export default function PainelMaterial({ pecaId, pecaNome, selecionados, acabamentoInicial = null, onConfirmar, onFechar, todosM, single = false }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [sel, setSel] = useState(selecionados);

  // ── Painel de variação ────────────────────────────────────────────
  // painelAberto: true enquanto o usuário escolhe a variante do material clicado.
  // variantesAbertas: variantes do último material clicado (carregadas na abertura).
  // varianteSel: variante escolhida — persiste após o painel fechar; mostrada no footer.
  const [painelAberto, setPainelAberto]         = useState(false);
  const [variantesAbertas, setVariantesAbertas] = useState([]);
  const [varianteSel, setVarianteSel]           = useState(() => {
    if (!acabamentoInicial) return null;
    for (const id of selecionados) {
      const vars = todosM.find(m => m.id === id)?.variacoes_precos ?? [];
      const match = vars.find(v => v.acabamento === acabamentoInicial);
      if (match) return {
        acabamento: match.acabamento,
        label: [match.acabamento, match.espessura ? `${match.espessura}cm` : null].filter(Boolean).join(' · '),
      };
    }
    return null;
  });

  const categoriasDisponiveis = useMemo(
    () => [...new Set(todosM.map(m => m.categoria).filter(Boolean))].sort(),
    [todosM]
  );

  const filtrados = useMemo(() => todosM.filter(m => {
    const matchBusca = busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase()) || (m.cor ?? '').toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoria === 'todos' || m.categoria === categoria;
    return matchBusca && matchCat;
  }), [busca, categoria, todosM]);

  function abrirVariantes(id) {
    const vars = todosM.find(m => m.id === id)?.variacoes_precos ?? [];
    if (vars.length > 1) {
      setVariantesAbertas(vars.map(v => ({
        acabamento: v.acabamento,
        espessura: v.espessura,
        preco: v.preco_venda,
        label: [v.acabamento, v.espessura ? `${v.espessura}cm` : null].filter(Boolean).join(' · '),
      })));
      setPainelAberto(true);
    } else {
      setPainelAberto(false);
    }
  }

  function toggle(id) {
    const jaEstaNoSel = sel.includes(id);
    if (single) {
      if (jaEstaNoSel) {
        setSel([]);
        setVarianteSel(null);
        setPainelAberto(false);
      } else {
        setSel([id]);
        setVarianteSel(null);
        abrirVariantes(id);
      }
    } else {
      if (jaEstaNoSel) {
        setSel(prev => prev.filter(x => x !== id));
        setPainelAberto(false);
      } else {
        setSel(prev => [...prev, id]);
        setVarianteSel(null);
        abrirVariantes(id);
      }
    }
  }

  function limparSelecao() {
    setSel([]);
    setVarianteSel(null);
    setPainelAberto(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>

      {/* Painel lateral direito */}
      <div className="w-full max-w-sm bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border-l border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-1">[ SELECIONAR_MATERIAL ]</div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white leading-tight">{pecaNome}</h3>
          </div>
          <button onClick={onFechar} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 pt-4 pb-3 border-b border-zinc-200/80 dark:border-zinc-900">
          <div className="relative flex items-center mb-3">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar material..."
              className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 placeholder:text-zinc-400 dark:text-zinc-700 transition-colors"
            />
          </div>
          {/* Categorias + Limpar */}
          <div className="flex gap-1.5 flex-wrap items-center">
            {['todos', ...categoriasDisponiveis].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                  categoria === cat
                    ? 'border-orange-300 dark:border-yellow-400/40 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/5'
                    : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400'
                }`}
              >
                {cat === 'todos' ? 'Todos' : cat}
              </button>
            ))}
            {sel.length > 0 && (
              <button
                onClick={limparSelecao}
                className="ml-auto font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border border-red-400/30 text-red-400/60 hover:border-red-400 hover:text-red-400 transition-colors flex items-center gap-1 shrink-0"
                title="Limpar seleção"
              >
                <iconify-icon icon="solar:close-circle-linear" width="9"></iconify-icon>
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Lista de materiais */}
        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum material</p>
            </div>
          ) : (
            filtrados.map(m => {
              const ativo = sel.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-zinc-200/80 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-orange-50 dark:bg-yellow-400/[0.03]' : ''}`}
                >
                  {/* Checkbox / Radio */}
                  {single ? (
                    <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-orange-500 dark:border-yellow-400' : 'border-zinc-200/80 dark:border-zinc-700'}`}>
                      {ativo && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-yellow-400"></div>}
                    </div>
                  ) : (
                    <div className={`w-4 h-4 border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-orange-500 bg-orange-500 dark:border-yellow-400 dark:bg-yellow-400' : 'border-zinc-200/80 dark:border-zinc-700'}`}>
                      {ativo && <iconify-icon icon="solar:check-read-linear" width="8" className="text-white dark:text-black"></iconify-icon>}
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-900 dark:text-white font-medium truncate">{m.nome}</div>
                    <div className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600">{m.cor} · {m.categoria}</div>
                  </div>
                  {/* Preço */}
                  <div className="text-right shrink-0">
                    {(() => {
                      const parseEsp = s => parseInt(s) || 0;
                      const v2 = m.variacoes_precos?.find(v => parseEsp(v.espessura) === 2);
                      const v3 = m.variacoes_precos?.find(v => parseEsp(v.espessura) === 3);
                      return <>
                        {v2 && <div className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300">{fmt(v2.preco_venda)}<span className="text-zinc-500 dark:text-zinc-600">/m²·2cm</span></div>}
                        {v3 && <div className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600">{fmt(v3.preco_venda)}<span className="text-zinc-400 dark:text-zinc-700">/3cm</span></div>}
                        {!v2 && !v3 && m.variacoes_precos?.[0] && <div className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300">{fmt(m.variacoes_precos[0].preco_venda)}<span className="text-zinc-500 dark:text-zinc-600">/m²</span></div>}
                      </>;
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Painel de acabamento — abre ao clicar num material com variantes, fecha ao escolher */}
        {painelAberto && variantesAbertas.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-2">Acabamento</div>
            <div className="flex flex-col gap-1">
              {variantesAbertas.map(v => (
                <button
                  key={v.label}
                  onClick={() => {
                    setVarianteSel(v);
                    setPainelAberto(false);
                  }}
                  className={`flex items-center justify-between font-mono text-[10px] px-3 py-1.5 border transition-colors text-left ${
                    varianteSel?.label === v.label
                      ? 'border-orange-300 dark:border-yellow-400/40 text-orange-600 dark:text-yellow-400 bg-orange-50 dark:bg-yellow-400/5'
                      : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-400'
                  }`}
                >
                  <span>{v.label}</span>
                  {v.preco > 0 && <span className="text-[9px] opacity-70">{fmt(v.preco)}/m²</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 flex-1">
            {sel.length === 0
              ? 'Nenhum selecionado'
              : varianteSel
                ? varianteSel.label
                : `${sel.length} selecionado${sel.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={onFechar}
            className="border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(pecaId, sel, varianteSel?.acabamento ?? null)}
            className="bg-orange-500 text-white dark:bg-yellow-400 dark:text-black font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-md dark:rounded-none hover:bg-orange-600 dark:hover:bg-yellow-300 transition-colors font-bold"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
