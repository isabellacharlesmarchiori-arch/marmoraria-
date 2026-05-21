import { Outlet, NavLink } from 'react-router-dom';

const tabs = [
  { to: '/admin/relatorios/pedidos',    label: 'Pedidos'    },
  { to: '/admin/relatorios/desempenho', label: 'Desempenho' },
];

export function RelatoriosPedidos() {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-3 py-24 text-center">
      <iconify-icon icon="solar:document-text-linear" width="32" className="text-gray-300 dark:text-zinc-700 block mb-2"></iconify-icon>
      <div className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Em breve</div>
    </div>
  );
}

export default function AdminRelatorios() {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-zinc-300">
      <nav className="border-b border-gray-300 dark:border-zinc-800 bg-gray-100 dark:bg-[#050505] z-20">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8">
          <div className="flex items-center overflow-x-auto scrollbar-hide gap-0 -mb-px">
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3.5 border-b-2 font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'border-yellow-400 text-yellow-400'
                      : 'border-transparent text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
