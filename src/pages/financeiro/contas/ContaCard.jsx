import { formatBRL } from '../../../utils/format';

const ICONE_TIPO = {
  corrente:  'lucide:landmark',
  poupanca:  'lucide:landmark',
  aplicacao: 'lucide:landmark',
  fisico:    'lucide:wallet',
  cartao:    'lucide:credit-card',
};

const TIPO_LABEL = {
  corrente:  'Corrente',
  poupanca:  'Poupança',
  aplicacao: 'Aplicação',
  fisico:    'Caixa físico',
  cartao:    'Cartão de crédito',
};

export default function ContaCard({ conta, onEditar, onDesativar, onRecalcular }) {
  const icone    = ICONE_TIPO[conta.tipo] ?? 'lucide:landmark';
  const saldoNum = Number(conta.saldo_atual);

  const corSaldo =
    saldoNum < 0  ? 'text-red-400'   :
    saldoNum === 0 ? 'text-zinc-500' :
    'text-white';

  const labelTopo = conta.ativo
    ? (conta.banco || TIPO_LABEL[conta.tipo])
    : 'Inativa';

  return (
    <div className={`bg-[#0a0a0a] p-5 flex flex-col gap-3${conta.ativo ? '' : ' opacity-50'}`}>
      <div className="flex items-center gap-1.5">
        <iconify-icon icon={icone} width="12" className="text-zinc-600" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          {labelTopo}
        </span>
      </div>

      <p className="text-white text-base leading-tight">{conta.nome}</p>

      <p className={`text-3xl font-bold tracking-tighter tabular-nums ${corSaldo}`}>
        {formatBRL(saldoNum)}
      </p>

      {(conta.agencia || conta.conta) && (
        <p className="font-mono text-[9px] text-zinc-600">
          {conta.agencia && `Ag ${conta.agencia}`}
          {conta.agencia && conta.conta && ' · '}
          {conta.conta && `Cc ${conta.conta}`}
        </p>
      )}

      <div className="border-t border-zinc-800" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRecalcular}
          className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors"
        >
          Recalcular
        </button>
        <span className="text-zinc-700 select-none">·</span>
        <button
          type="button"
          onClick={onEditar}
          className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors"
        >
          Editar
        </button>
        <span className="text-zinc-700 select-none">·</span>
        <button
          type="button"
          onClick={onDesativar}
          className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors"
        >
          {conta.ativo ? 'Desativar' : 'Reativar'}
        </button>
      </div>
    </div>
  );
}
