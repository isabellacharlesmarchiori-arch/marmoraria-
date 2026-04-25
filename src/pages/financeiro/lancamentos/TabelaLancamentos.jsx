import LinhaLancamento from './LinhaLancamento';

const LABEL_CAMPO_DATA = {
  data_vencimento: 'Vencimento',
  data_pagamento:  'Pagamento',
  competencia:     'Competência',
};

const TH = 'px-4 py-3.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-left';

const SKELETON_WIDTHS = ['24px', '48px', '160px', '96px', '80px', '80px', '56px', '24px'];

export default function TabelaLancamentos({
  lancamentos, lookups, loading, erro, onRecarregar, campoData, onLinhaClicada, acoes,
  selecionados, onToggleSelecionado, onToggleTodos,
}) {
  const labelData = LABEL_CAMPO_DATA[campoData] ?? 'Data';

  const elegiveis = (lancamentos ?? []).filter(l =>
    ['pendente', 'atrasado', 'parcial'].includes(l.status)
  );
  const todosSelecionados = elegiveis.length > 0 && elegiveis.every(l => selecionados?.has(l.id));

  if (erro) {
    return (
      <div className="border border-zinc-800 p-10 flex flex-col items-center gap-3">
        <iconify-icon icon="lucide:alert-triangle" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">
          {erro}
        </p>
        <button
          type="button"
          onClick={onRecarregar}
          className="mt-1 font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors border border-zinc-800 px-3 py-1.5"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="px-3 py-3.5 w-8">
              {onToggleTodos && (
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  onChange={onToggleTodos}
                  className="w-3.5 h-3.5 accent-yellow-400 cursor-pointer"
                  title="Selecionar todos os pendentes"
                />
              )}
            </th>
            <th className={TH}>{labelData}</th>
            <th className={TH}>Descrição</th>
            <th className={TH}>Categoria</th>
            <th className={TH}>Conta</th>
            <th className={TH + ' text-right'}>Valor</th>
            <th className={TH}>Status</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-zinc-900">
                {SKELETON_WIDTHS.map((w, j) => (
                  <td key={j} className="px-4 py-3.5">
                    <div
                      className="h-4 bg-zinc-800 animate-pulse rounded"
                      style={{ width: w }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : lancamentos.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <iconify-icon icon="lucide:receipt" width="28" className="text-zinc-700"></iconify-icon>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                    Nenhum lançamento encontrado no período com os filtros atuais.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            lancamentos.map(l => (
              <LinhaLancamento
                key={l.id}
                lancamento={l}
                lookups={lookups}
                campoData={campoData}
                onLinhaClicada={onLinhaClicada}
                selecionado={selecionados?.has(l.id) ?? false}
                onToggleSelecionado={onToggleSelecionado}
                {...(acoes ?? {})}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
