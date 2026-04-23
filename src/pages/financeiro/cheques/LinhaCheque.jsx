import { formatBRL } from '../../../utils/format';
import MenuAcoesCheque from './MenuAcoesCheque';

const STATUS_COR = {
  em_maos:    { text: 'text-amber-400',   border: 'border-amber-800',   label: 'Em mãos'    },
  depositado: { text: 'text-blue-400',    border: 'border-blue-800',    label: 'Depositado'  },
  compensado: { text: 'text-emerald-400', border: 'border-emerald-800', label: 'Compensado'  },
  repassado:  { text: 'text-violet-400',  border: 'border-violet-800',  label: 'Repassado'   },
  devolvido:  { text: 'text-red-400',     border: 'border-red-800',     label: 'Devolvido'   },
  cancelado:  { text: 'text-zinc-500',    border: 'border-zinc-800',    label: 'Cancelado'   },
};

function fmtData(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y.slice(2)}`;
}

export default function LinhaCheque({ cheque, onAcao }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidoSemDeposito = cheque.status === 'em_maos' && cheque.data_bom_para < hoje;

  const cor = STATUS_COR[cheque.status] ?? STATUS_COR.em_maos;

  return (
    <tr
      className={`border-b border-zinc-900 cursor-pointer hover:bg-white/[0.015] transition-colors${vencidoSemDeposito ? ' bg-red-950/20' : ''}`}
      onClick={() => onAcao('detalhe', cheque)}
    >
      {/* Número */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="font-mono text-sm text-white">{cheque.numero_cheque}</span>
      </td>

      {/* Banco + Agência */}
      <td className="px-4 py-3.5">
        <p className="text-sm text-white">{cheque.banco_emissor}</p>
        {cheque.agencia_emissora && (
          <p className="font-mono text-[9px] text-zinc-600 mt-0.5">
            Ag {cheque.agencia_emissora}
          </p>
        )}
      </td>

      {/* Titular + Documento */}
      <td className="px-4 py-3.5 max-w-[200px]">
        <p className="text-sm text-white truncate">{cheque.titular}</p>
        {cheque.documento_titular && (
          <p className="font-mono text-[9px] text-zinc-600 mt-0.5">{cheque.documento_titular}</p>
        )}
      </td>

      {/* Valor */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        <span className="font-mono text-sm tabular-nums text-white">{formatBRL(cheque.valor)}</span>
      </td>

      {/* Data bom pra */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`font-mono text-[11px] ${vencidoSemDeposito ? 'text-red-400' : 'text-zinc-500'}`}>
          {fmtData(cheque.data_bom_para)}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase tracking-widest ${cor.text} ${cor.border}`}>
          {cor.label}
        </span>
      </td>

      {/* Ações */}
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <MenuAcoesCheque
          cheque={cheque}
          onDepositar={() => onAcao('depositar', cheque)}
          onCompensar={() => onAcao('compensar', cheque)}
          onRepassar={() => onAcao('repassar', cheque)}
          onDevolver={() => onAcao('devolver', cheque)}
          onCancelar={() => onAcao('cancelar', cheque)}
        />
      </td>
    </tr>
  );
}
