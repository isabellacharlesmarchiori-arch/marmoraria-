import { formatBRL } from '../../../utils/format';

// Componente compartilhado — tabela de parcelas editável linha a linha.
// Usado em: ModalLancamentoForm (prévia antes de salvar) e CamposParcelamento.
//
// Props:
//   parcelas: Array<{ valor: number, data_vencimento: string, competencia: string }>
//   onChange:  (novasParcelas) => void
//   valorTotal?: número para validação do total (opcional)

const INPUT =
  'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full';

const TH = 'px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-left';

export default function TabelaParcelasEditavel({ parcelas, onChange, valorTotal }) {
  function editar(i, campo, raw) {
    const valor = campo === 'valor' ? (parseFloat(raw) || 0) : raw;
    onChange(
      parcelas.map((p, idx) =>
        idx === i
          ? { ...p, [campo]: valor, ...(campo === 'data_vencimento' ? { competencia: raw.slice(0, 7) } : {}) }
          : p
      )
    );
  }

  const somaTotal = parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const temTotal  = valorTotal !== undefined && valorTotal > 0;
  const bate      = temTotal && Math.abs(somaTotal - valorTotal) < 0.01;

  return (
    <div className="flex flex-col gap-2">
      <div className="border border-gray-300 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">
              <th className={TH + ' w-12'}>#</th>
              <th className={TH}>Vencimento</th>
              <th className={TH}>Competência</th>
              <th className={TH + ' text-right'}>Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p, i) => (
              <tr key={i} className="border-b border-gray-200 dark:border-zinc-900 hover:bg-gray-200/20 dark:hover:bg-zinc-900/20">
                <td className="px-3 py-1.5">
                  <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 tabular-nums">
                    {i + 1}/{parcelas.length}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    value={p.data_vencimento}
                    onChange={e => editar(i, 'data_vencimento', e.target.value)}
                    className={INPUT + ' [color-scheme:dark]'}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="month"
                    value={p.competencia}
                    onChange={e => editar(i, 'competencia', e.target.value)}
                    className={INPUT + ' [color-scheme:dark]'}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={p.valor}
                    onChange={e => editar(i, 'valor', e.target.value)}
                    className={INPUT + ' text-right tabular-nums'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          {parcelas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">
                <td colSpan={3} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
                      Total
                    </span>
                    {temTotal && !bate && (
                      <span className="font-mono text-[9px] text-amber-400">
                        — diverge do previsto ({formatBRL(valorTotal)})
                      </span>
                    )}
                    {temTotal && bate && (
                      <iconify-icon icon="lucide:check-circle" width="12" className="text-emerald-400"></iconify-icon>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`font-mono text-sm font-bold tabular-nums ${
                    temTotal && !bate ? 'text-amber-400' : 'text-gray-900 dark:text-white'
                  }`}>
                    {formatBRL(somaTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
