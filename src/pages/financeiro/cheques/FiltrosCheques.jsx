import { useState, useEffect } from 'react';

function primeiroDia() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function ultimoDia() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
}

export function filtroChequesDefault() {
  return {
    statuses:      [],
    periodoInicio: primeiroDia(),
    periodoFim:    ultimoDia(),
    busca:         '',
  };
}

const CHIP_BASE    = 'border px-3 py-1 font-mono text-[10px] uppercase tracking-widest cursor-pointer transition-colors';
const CHIP_INATIVO = 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600';
const CHIP_ATIVO   = 'border-yellow-400 text-yellow-400';

const INPUT_BASE =
  'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none ' +
  'focus:border-yellow-400 transition-colors [color-scheme:dark]';

const STATUS_OPTIONS = [
  { v: 'em_maos',    l: 'Em mãos'    },
  { v: 'depositado', l: 'Depositado' },
  { v: 'compensado', l: 'Compensado' },
  { v: 'repassado',  l: 'Repassado'  },
  { v: 'devolvido',  l: 'Devolvido'  },
  { v: 'cancelado',  l: 'Cancelado'  },
];

export default function FiltrosCheques({ filtros, setFiltros }) {
  const [buscaLocal, setBuscaLocal] = useState(filtros.busca);

  useEffect(() => { setBuscaLocal(filtros.busca); }, [filtros.busca]);

  function toggleStatus(v) {
    const atual = filtros.statuses;
    setFiltros({
      ...filtros,
      statuses: atual.includes(v) ? atual.filter(s => s !== v) : [...atual, v],
    });
  }

  function commitBusca() {
    if (buscaLocal !== filtros.busca) setFiltros({ ...filtros, busca: buscaLocal });
  }

  function limpar() {
    setBuscaLocal('');
    setFiltros(filtroChequesDefault());
  }

  return (
    <div className="border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-[#0a0a0a] p-4 flex flex-col gap-3">

      {/* Chips de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mr-1">Status</span>
        <button
          type="button"
          onClick={() => setFiltros({ ...filtros, statuses: [] })}
          className={`${CHIP_BASE} ${filtros.statuses.length === 0 ? CHIP_ATIVO : CHIP_INATIVO}`}
        >
          Todos
        </button>
        {STATUS_OPTIONS.map(({ v, l }) => (
          <button
            key={v}
            type="button"
            onClick={() => toggleStatus(v)}
            className={`${CHIP_BASE} ${filtros.statuses.includes(v) ? CHIP_ATIVO : CHIP_INATIVO}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Período + busca + limpar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Bom pra</span>
        <input
          type="date"
          value={filtros.periodoInicio}
          onChange={e => setFiltros({ ...filtros, periodoInicio: e.target.value })}
          className={INPUT_BASE + ' w-auto'}
        />
        <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">até</span>
        <input
          type="date"
          value={filtros.periodoFim}
          onChange={e => setFiltros({ ...filtros, periodoFim: e.target.value })}
          className={INPUT_BASE + ' w-auto'}
        />

        <input
          type="text"
          value={buscaLocal}
          onChange={e => setBuscaLocal(e.target.value)}
          onBlur={commitBusca}
          onKeyDown={e => e.key === 'Enter' && commitBusca()}
          placeholder="Nº cheque ou titular…"
          className={INPUT_BASE + ' flex-1 min-w-[180px]'}
        />

        <button
          type="button"
          onClick={limpar}
          className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors ml-auto whitespace-nowrap"
        >
          Limpar filtros
        </button>
      </div>
    </div>
  );
}
