import { toast } from 'sonner';
import { formatBRL } from '../../../utils/format';
import { corPorStatus, corPorTipo } from '../theme';

export default function TimelineLancamento({ lancamento, lookups }) {
  const { categorias, contas, parceiros, arquitetos, clientes } = lookups;

  const hoje = new Date().toISOString().slice(0, 10);
  const vencido =
    lancamento.data_vencimento < hoje &&
    ['pendente', 'parcial'].includes(lancamento.status);

  const corTipo   = corPorTipo(lancamento.tipo);
  const corStatus = corPorStatus(lancamento.status);

  // Só dia/mês pra não repetir o ano em cada linha
  const [, m, d] = lancamento.data_vencimento.split('-');
  const dataDisplay = `${d}/${m}`;

  // Lookup de nomes
  const categoriaNome = categorias[lancamento.categoria_id] ?? '';
  const contaNome     = lancamento.conta_id ? (contas[lancamento.conta_id] ?? '') : '';
  const parceiroNome  = lancamento.parceiro_id
    ? (parceiros[lancamento.parceiro_id]  ?? '')
    : lancamento.arquiteto_id
      ? (arquitetos[lancamento.arquiteto_id] ?? '')
      : lancamento.cliente_id
        ? (clientes[lancamento.cliente_id]   ?? '')
        : '';

  const linhaSecundaria = [categoriaNome, parceiroNome, contaNome]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.015] transition-colors ${
        vencido ? 'bg-red-950/20' : ''
      }`}
      onClick={() => toast.info('Detalhe do lançamento em breve')}
    >
      {/* Bolinha de tipo — rounded-full mantido intencionalmente: dot semântico de status */}
      <div className="shrink-0 mt-[5px]">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            lancamento.tipo === 'entrada' ? 'bg-emerald-400' : 'bg-red-400'
          } ${
            lancamento.status === 'atrasado' ? 'ring-2 ring-red-500/40 ring-offset-1 ring-offset-zinc-950' : ''
          }`}
        />
      </div>

      {/* Conteúdo central */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9px] text-zinc-600 shrink-0">{dataDisplay}</span>
          <span className="text-sm text-white truncate">{lancamento.descricao}</span>
        </div>
        {linhaSecundaria && (
          <p className="font-mono text-[9px] text-zinc-600 mt-0.5 truncate">{linhaSecundaria}</p>
        )}
      </div>

      {/* Valor + status */}
      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className={`text-sm font-semibold font-mono tabular-nums ${corTipo.text}`}>
            {formatBRL(lancamento.valor_previsto)}
          </span>
          {lancamento.bloqueado_ate_pagamento_projeto && (
            <iconify-icon
              icon="lucide:lock"
              width="11"
              className="text-zinc-600"
              title="Aguarda quitação do projeto"
            ></iconify-icon>
          )}
        </div>
        <span
          className={`inline-block px-1.5 py-0.5 border font-mono text-[8px] uppercase mt-0.5 ${corStatus.text} ${corStatus.border}`}
        >
          {lancamento.status}
        </span>
      </div>
    </div>
  );
}
