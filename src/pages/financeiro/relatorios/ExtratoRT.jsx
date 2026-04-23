import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL, formatDate } from '../../../utils/format';

const STATUS_COR = {
  pendente: { text: 'text-amber-400',   border: 'border-amber-800',   label: 'Pendente'  },
  pago:     { text: 'text-emerald-400', border: 'border-emerald-800', label: 'Pago'      },
  atrasado: { text: 'text-red-400',     border: 'border-red-800',     label: 'Atrasado'  },
  parcial:  { text: 'text-blue-400',    border: 'border-blue-800',    label: 'Parcial'   },
  cancelado:{ text: 'text-zinc-500',    border: 'border-zinc-800',    label: 'Cancelado' },
};

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full';

// ─── Card de arquiteto ───────────────────────────────────────────────────────

function CardArquiteto({ item, expandido, onToggle }) {
  const { arquiteto, lancamentos, totalPago, totalPendente, lancsBloqueados } = item;
  const corPendente = totalPendente > 0 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]">

      {/* Cabeçalho clicável */}
      <div
        className="p-5 flex items-start gap-3 cursor-pointer hover:bg-white/[0.015] transition-colors"
        onClick={onToggle}
      >
        <iconify-icon
          icon={expandido ? 'lucide:chevron-down' : 'lucide:chevron-right'}
          width="14"
          className="text-zinc-500 mt-0.5 shrink-0"
        ></iconify-icon>

        <div className="flex-1 min-w-0">
          <p className="text-white text-base leading-tight">{arquiteto.nome}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mt-1">
            {lancamentos.length} lançamento{lancamentos.length !== 1 ? 's' : ''}
            {lancsBloqueados > 0 && ` • ${lancsBloqueados} bloqueado${lancsBloqueados > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Pago</p>
            <p className="font-mono text-sm tabular-nums text-emerald-400">{formatBRL(totalPago)}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Pendente</p>
            <p className={`font-mono text-sm tabular-nums ${corPendente}`}>{formatBRL(totalPendente)}</p>
          </div>
        </div>
      </div>

      {/* Lançamentos expandidos */}
      {expandido && (
        <div className="border-t border-zinc-800">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-5 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-left">Data</th>
                <th className="px-5 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-left">Descrição</th>
                <th className="px-5 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor</th>
                <th className="px-5 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map(l => {
                const cor     = STATUS_COR[l.status] ?? STATUS_COR.pendente;
                const bloq    = l.bloqueado_ate_pagamento_projeto && l.status !== 'pago';
                const dataRef = l.data_pagamento ?? l.data_vencimento;

                return (
                  <tr key={l.id} className="border-b border-zinc-900 hover:bg-white/[0.015]">
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-zinc-500">
                        {dataRef ? formatDate(dataRef) : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{l.descricao}</span>
                        {bloq && (
                          <iconify-icon
                            icon="lucide:lock"
                            width="11"
                            className="text-zinc-600 shrink-0"
                            title="Aguarda quitação do projeto"
                          ></iconify-icon>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <span className="font-mono text-sm tabular-nums text-white">
                        {formatBRL(l.valor_previsto)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase tracking-widest ${cor.text} ${cor.border}`}>
                        {cor.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export default function ExtratoRT() {
  const { profile } = useAuth();

  const [itens,      setItens]      = useState([]);
  const [busca,      setBusca]      = useState('');
  const [expandidos, setExpandidos] = useState(new Set());
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState(null);

  const carregar = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoading(true);
    setErro(null);

    try {
      const { data: lancs, error: errL } = await supabase
        .from('financeiro_lancamentos')
        .select('id, descricao, tipo, status, valor_previsto, valor_pago, data_vencimento, data_pagamento, arquiteto_id, projeto_id, bloqueado_ate_pagamento_projeto')
        .eq('empresa_id', profile.empresa_id)
        .eq('tipo', 'saida')
        .not('arquiteto_id', 'is', null)
        .neq('status', 'cancelado')
        .order('data_vencimento', { ascending: false });

      if (errL) throw errL;
      if (!lancs?.length) { setItens([]); return; }

      const idsUnicos = [...new Set(lancs.map(l => l.arquiteto_id))];

      const { data: arqs, error: errA } = await supabase
        .from('arquitetos')
        .select('id, nome, cpf')
        .in('id', idsUnicos);

      if (errA) throw errA;

      const resultado = (arqs ?? []).map(arq => {
        const ls = lancs.filter(l => l.arquiteto_id === arq.id);
        const totalPago = ls
          .filter(l => l.status === 'pago')
          .reduce((s, l) => s + Number(l.valor_pago ?? 0), 0);
        const totalPendente = ls
          .filter(l => ['pendente', 'parcial', 'atrasado'].includes(l.status))
          .reduce((s, l) => s + (Number(l.valor_previsto) - Number(l.valor_pago ?? 0)), 0);
        const lancsBloqueados = ls.filter(
          l => l.bloqueado_ate_pagamento_projeto && l.status !== 'pago'
        ).length;

        return { arquiteto: arq, lancamentos: ls, totalPago, totalPendente, lancsBloqueados };
      }).sort((a, b) =>
        (b.totalPendente + b.totalPago) - (a.totalPendente + a.totalPago)
      );

      setItens(resultado);
    } catch (err) {
      setErro(err.message ?? 'Erro ao carregar extrato de RT');
      toast.error('Erro ao carregar extrato de RT');
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  function toggleExpandido(id) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const itensFiltrados = itens.filter(item =>
    item.arquiteto.nome.toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-zinc-800 bg-[#0a0a0a] p-5 flex flex-col gap-2">
            <div className="h-4 w-40 bg-zinc-800 animate-pulse rounded" />
            <div className="h-3 w-24 bg-zinc-800 animate-pulse rounded" />
            <div className="h-6 w-32 bg-zinc-800 animate-pulse rounded mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <div className="border border-zinc-800 p-10 flex flex-col items-center gap-3">
        <iconify-icon icon="lucide:alert-triangle" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">{erro}</p>
        <button
          type="button"
          onClick={carregar}
          className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 border border-zinc-800 px-3 py-1.5 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="border border-zinc-800 p-10 flex flex-col items-center gap-3">
        <iconify-icon icon="lucide:users" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-700 text-center">
          Nenhum pagamento de RT registrado ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Busca */}
      <input
        type="text"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar arquiteto…"
        className={INPUT_BASE}
      />

      {/* Lista */}
      {itensFiltrados.length === 0 ? (
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center py-6">
          Nenhum arquiteto encontrado para "{busca}".
        </p>
      ) : (
        itensFiltrados.map(item => (
          <CardArquiteto
            key={item.arquiteto.id}
            item={item}
            expandido={expandidos.has(item.arquiteto.id)}
            onToggle={() => toggleExpandido(item.arquiteto.id)}
          />
        ))
      )}
    </div>
  );
}
