import { Outlet, NavLink, useMatch } from 'react-router-dom';

export default function MensagensHub() {
  const isAdmin = useMatch('/admin/*');
  const base = isAdmin ? '/admin/mensagens' : '/mensagens';

  const tabs = [
    { to: `${base}/notificacoes`, label: 'Notificações' },
    { to: `${base}/mensagens`,    label: 'Mensagens'    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-zinc-50 dark:bg-[#050505] text-zinc-600 dark:text-zinc-300 font-sans">
      <nav className="border-b border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-[#050505] backdrop-blur-md z-20">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8">
          <div className="flex items-center overflow-x-auto scrollbar-hide gap-0 -mb-px">
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3.5 border-b-2 font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'border-orange-500 dark:border-yellow-400 text-orange-600 dark:text-yellow-400'
                      : 'border-transparent text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300'
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
