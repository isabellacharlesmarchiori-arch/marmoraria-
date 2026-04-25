import { Outlet } from 'react-router-dom';
import FinanceiroNav from './financeiro/FinanceiroNav';

export default function Financeiro() {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-zinc-300">
      <FinanceiroNav />
      <div className="flex-1 overflow-y-auto p-7">
        <Outlet />
      </div>
    </div>
  );
}
