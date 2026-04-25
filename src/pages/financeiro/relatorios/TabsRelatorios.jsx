const TABS = [
  { id: 'dre',        label: 'DRE'               },
  { id: 'fluxo',      label: 'Fluxo de Caixa'    },
  { id: 'trimestral', label: 'Análise Trimestral' },
  { id: 'rt',         label: 'Extrato RT'         },
];

export default function TabsRelatorios({ abaAtiva, setAbaAtiva }) {
  return (
    <div className="flex border-b border-gray-300 dark:border-zinc-800 overflow-x-auto">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setAbaAtiva(id)}
          className={`font-mono text-[10px] uppercase tracking-widest px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
            abaAtiva === id
              ? 'text-yellow-400 border-yellow-400'
              : 'text-gray-500 dark:text-zinc-500 border-transparent hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
