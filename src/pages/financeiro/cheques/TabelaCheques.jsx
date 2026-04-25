import LinhaCheque from './LinhaCheque';

const TH = 'px-4 py-3.5 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-left';

const SKELETON_WIDTHS = ['64px', '120px', '140px', '80px', '56px', '72px', '24px'];

export default function TabelaCheques({ cheques, lookups, loading, erro, onRecarregar, onAcao }) {
  if (erro) {
    return (
      <div className="border border-gray-300 dark:border-zinc-800 p-10 flex flex-col items-center gap-3">
        <iconify-icon icon="lucide:alert-triangle" width="28" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-center">{erro}</p>
        <button
          type="button"
          onClick={onRecarregar}
          className="mt-1 font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors border border-gray-300 dark:border-zinc-800 px-3 py-1.5"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="border border-gray-300 dark:border-zinc-800 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-300 dark:border-zinc-800">
            <th className={TH}>Número</th>
            <th className={TH}>Banco</th>
            <th className={TH}>Titular</th>
            <th className={TH + ' text-right'}>Valor</th>
            <th className={TH}>Bom pra</th>
            <th className={TH}>Status</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-200 dark:border-zinc-900">
                {SKELETON_WIDTHS.map((w, j) => (
                  <td key={j} className="px-4 py-3.5">
                    <div className="h-4 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" style={{ width: w }} />
                  </td>
                ))}
              </tr>
            ))
          ) : cheques.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <iconify-icon icon="lucide:file-x" width="28" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
                    Nenhum cheque encontrado no período com os filtros atuais.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            cheques.map(c => (
              <LinhaCheque
                key={c.id}
                cheque={c}
                lookups={lookups}
                onAcao={onAcao}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
