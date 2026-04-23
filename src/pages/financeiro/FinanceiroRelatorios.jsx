import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import TabsRelatorios from './relatorios/TabsRelatorios';
import DRE from './relatorios/DRE';
import FluxoDeCaixa from './relatorios/FluxoDeCaixa';
import ExtratoRT from './relatorios/ExtratoRT';

export default function FinanceiroRelatorios() {
  const { profile } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState('dre');

  if (profile?.perfil !== 'admin') {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <iconify-icon icon="lucide:lock" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          Acesso restrito a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-[10px] text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
          Relatórios
        </div>
      </div>

      <TabsRelatorios abaAtiva={abaAtiva} setAbaAtiva={setAbaAtiva} />

      {abaAtiva === 'dre'   && <DRE />}
      {abaAtiva === 'fluxo' && <FluxoDeCaixa />}
      {abaAtiva === 'rt'    && <ExtratoRT />}
    </div>
  );
}
