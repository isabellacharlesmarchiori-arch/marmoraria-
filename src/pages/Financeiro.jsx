import { Outlet } from 'react-router-dom';
import FinanceiroNav from './financeiro/FinanceiroNav';

export default function Financeiro() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300">
      <FinanceiroNav />
      <Outlet />
    </div>
  );
}
