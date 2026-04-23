import { formatBRL } from '../../../utils/format';
import { corPorStatus, corPorTipo } from '../theme';
import MenuAcoesLancamento from './MenuAcoesLancamento';

const TIPO_PARCEIRO = {
  fornecedor:  'fornecedor',
  funcionario: 'funcionário',
  terceiro:    'terceiro',
};

function resolverParceiro(lancamento, lookups) {
  if (lancamento.parceiro_id) {
    const p = lookups.parceiros[lancamento.parceiro_id];
    if (!p) return null;
    const tipo = TIPO_PARCEIRO[p.tipos?.[0]] ?? 'parceiro';
    return { nome: p.nome, tipo };
  }
  if (lancamento.arquiteto_id) {
    const nome = lookups.arquitetos[lancamento.arquiteto_id];
    return nome ? { nome, tipo: 'arquiteto' } : null;
  }
  if (lancamento.cliente_id) {
    const nome = lookups.clientes[lancamento.cliente_id];
    return nome ? { nome, tipo: 'cliente' } : null;
  }
  return null;
}

export default function LinhaLancamento({
  lancamento,
  lookups,
  campoData = 'data_vencimento',
  onLinhaClicada,
  onEditar,
  onMarcarPago,
  onEstornar,
  onCancelar,
  onGerenciarGrupo,
}) {
  const hoje = new Date().toISOString().slice(0, 10);

  const vencido =
    lancamento.data_vencimento < hoje &&
    ['pendente', 'parcial'].includes(lancamento.status);

  const destacar = lancamento.status === 'atrasado' || vencido;

  const valorData    = lancamento[campoData] ?? lancamento.data_vencimento;
  const dataDisplay  = valorData
    ? (() => { const [, m, d] = valorData.split('-'); return `${d}/${m}`; })()
    : '—';

  const badgeStatus  = vencido && lancamento.status === 'pendente' ? 'atrasado' : lancamento.status;
  const badgeLabel   = vencido && lancamento.status === 'pendente' ? 'vencido'  : lancamento.status;
  const corStatus    = corPorStatus(badgeStatus);

  const parceiro     = resolverParceiro(lancamento, lookups);
  const categoriaNome = lookups.categorias[lancamento.categoria_id] ?? '';
  const contaNome    = lancamento.conta_id ? (lookups.contas[lancamento.conta_id] ?? '') : '';

  const sinal        = lancamento.tipo === 'entrada' ? '+' : '−';
  const corValor     = lancamento.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400';
  const valorStr     = sinal + formatBRL(Number(lancamento.valor_liquido));

  return (
    <tr
      className={`border-b border-zinc-900 cursor-pointer hover:bg-white/[0.015] transition-colors${destacar ? ' bg-red-950/20' : ''}`}
      onClick={() => onLinhaClicada?.(lancamento)}
    >
      {/* Data */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="font-mono text-[11px] text-zinc-500">{dataDisplay}</span>
      </td>

      {/* Descrição + parceiro */}
      <td className="px-4 py-3.5 max-w-xs">
        <p className="text-sm text-white truncate">{lancamento.descricao}</p>
        {parceiro && (
          <p className="font-mono text-[9px] text-zinc-600 mt-0.5 truncate">
            {parceiro.nome}{' '}
            <span className="text-zinc-700">({parceiro.tipo})</span>
          </p>
        )}
      </td>

      {/* Categoria */}
      <td className="px-4 py-3.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          {categoriaNome}
        </span>
      </td>

      {/* Conta */}
      <td className="px-4 py-3.5">
        <span className="font-mono text-[9px] text-zinc-500">{contaNome}</span>
      </td>

      {/* Valor */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          <span className={`font-mono text-sm tabular-nums ${corValor}`}>{valorStr}</span>
          {lancamento.bloqueado_ate_pagamento_projeto && (
            <iconify-icon
              icon="lucide:lock"
              width="11"
              className="text-zinc-600"
              title="Aguarda quitação do projeto"
            ></iconify-icon>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span
          className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase tracking-widest ${corStatus.text} ${corStatus.border}`}
        >
          {badgeLabel}
        </span>
      </td>

      {/* Ações */}
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <MenuAcoesLancamento
          lancamento={lancamento}
          onEditar={onEditar ?? (() => {})}
          onMarcarPago={onMarcarPago ?? (() => {})}
          onEstornar={onEstornar ?? (() => {})}
          onCancelar={onCancelar ?? (() => {})}
          onGerenciarGrupo={onGerenciarGrupo ?? (() => {})}
        />
      </td>
    </tr>
  );
}
