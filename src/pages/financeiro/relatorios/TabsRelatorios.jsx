const TABS = [
  { id: 'dre',   label: 'DRE'           },
  { id: 'fluxo', label: 'Fluxo de Caixa' },
  { id: 'rt',    label: 'Extrato RT'     },
];

export default function TabsRelatorios({ abaAtiva, setAbaAtiva }) {
  return (
    <div className="flex border-b border-zinc-800">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setAbaAtiva(id)}
          className={`font-mono text-[10px] uppercase tracking-widest px-4 py-2.5 border-b-2 transition-colors ${
            abaAtiva === id
              ? 'text-yellow-400 border-yellow-400'
              : 'text-zinc-500 border-transparent hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
