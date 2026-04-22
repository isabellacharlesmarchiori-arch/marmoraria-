import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/admin/financeiro',            label: 'Visão Geral',  icon: 'lucide:eye',               end: true  },
  { to: '/admin/financeiro/dashboard',  label: 'Dashboard',    icon: 'lucide:gauge',             end: false },
  { to: '/admin/financeiro/lancamentos',label: 'Lançamentos',  icon: 'lucide:arrow-right-left',  end: false },
  { to: '/admin/financeiro/contas',     label: 'Contas',       icon: 'lucide:landmark',          end: false },
  { to: '/admin/financeiro/cheques',    label: 'Cheques',      icon: 'lucide:file-check',        end: false },
  { to: '/admin/financeiro/relatorios', label: 'Relatórios',   icon: 'lucide:bar-chart-3',       end: false },
];

export default function FinanceiroNav() {
  return (
    <nav className="border-b border-zinc-800 bg-[#050505] sticky top-0 z-20">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        <div className="flex items-center overflow-x-auto scrollbar-hide gap-0 -mb-px">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3.5 border-b-2 font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'border-yellow-400 text-yellow-400'
                    : 'border-transparent text-zinc-600 hover:text-zinc-300'
                }`
              }
            >
              <iconify-icon icon={tab.icon} width="13"></iconify-icon>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
