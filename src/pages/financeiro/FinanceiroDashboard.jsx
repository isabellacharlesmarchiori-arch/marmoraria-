import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import CardResumo from './dashboard/CardResumo';
import TimelineLancamento from './dashboard/TimelineLancamento';
import FabNovoFinanceiro from './dashboard/FabNovoFinanceiro';

const ESTADO_INICIAL = {
  saldo_total:       null,
  a_receber_vencido: null,
  a_pagar_vencido:   null,
  previsao_mes:      null,
  lancamentos:       [],
  lookups: { categorias: {}, contas: {}, parceiros: {}, arquitetos: {}, clientes: {} },
};

function toLookup(arr) {
  return Object.fromEntries((arr ?? []).map(r => [r.id, r.nome]));
}

export default function FinanceiroDashboard() {
  const { profile } = useAuth();

  const [dados,   setDados]   = useState(ESTADO_INICIAL);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  const carregarDados = useCallback(async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;

    setLoading(true);
    setErro(null);

    try {
      const agora  = new Date();
      const hoje   = agora.toISOString().slice(0, 10);

      // Previsão do mês corrente
      const inicioMes   = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;
      const proximoMes  = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
                            .toISOString().slice(0, 10);

      // Timeline: hoje ± 15 dias
      const d15anterior = new Date(agora); d15anterior.setDate(agora.getDate() - 15);
      const d15posterior = new Date(agora); d15posterior.setDate(agora.getDate() + 15);
      const de  = d15anterior.toISOString().slice(0, 10);
      const ate = d15posterior.toISOString().slice(0, 10);

      // ── 5 queries em paralelo ──────────────────────────────────────────────
      const [resContas, resReceber, resPagar, resPrevisao, resTimeline] = await Promise.all([

        // A — saldo total das contas ativas
        supabase
          .from('financeiro_contas')
          .select('saldo_atual')
          .eq('empresa_id', empresaId)
          .eq('ativo', true),

        // B — a receber vencido (entradas)
        supabase
          .from('financeiro_lancamentos')
          .select('valor_previsto, valor_pago')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'entrada')
          .in('status', ['pendente', 'parcial', 'atrasado'])
          .lt('data_vencimento', hoje),

        // C — a pagar vencido (saídas)
        supabase
          .from('financeiro_lancamentos')
          .select('valor_previsto, valor_pago')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'saida')
          .in('status', ['pendente', 'parcial', 'atrasado'])
          .lt('data_vencimento', hoje),

        // D — previsão do mês por data_vencimento
        supabase
          .from('financeiro_lancamentos')
          .select('tipo, valor_previsto')
          .eq('empresa_id', empresaId)
          .in('status', ['pendente', 'parcial', 'atrasado', 'pago'])
          .gte('data_vencimento', inicioMes)
          .lt('data_vencimento', proximoMes),

        // E — timeline hoje ± 15 dias
        supabase
          .from('financeiro_lancamentos')
          .select(`
            id, tipo, status, descricao, valor_previsto, valor_pago,
            data_vencimento, data_pagamento, forma_pagamento,
            parceiro_id, arquiteto_id, cliente_id,
            conta_id, categoria_id, bloqueado_ate_pagamento_projeto
          `)
          .eq('empresa_id', empresaId)
          .gte('data_vencimento', de)
          .lte('data_vencimento', ate)
          .neq('status', 'cancelado')
          .order('data_vencimento', { ascending: false })
          .limit(100),
      ]);

      // Verificar erros nas 5 queries
      const erros = [resContas, resReceber, resPagar, resPrevisao, resTimeline]
        .map(r => r.error)
        .filter(Boolean);
      if (erros.length > 0) throw new Error(erros[0].message);

      // Calcular indicadores
      const saldo_total = (resContas.data ?? [])
        .reduce((s, c) => s + (c.saldo_atual ?? 0), 0);

      const a_receber_vencido = (resReceber.data ?? [])
        .reduce((s, l) => s + ((l.valor_previsto ?? 0) - (l.valor_pago ?? 0)), 0);

      const a_pagar_vencido = (resPagar.data ?? [])
        .reduce((s, l) => s + ((l.valor_previsto ?? 0) - (l.valor_pago ?? 0)), 0);

      const previsao_mes = (resPrevisao.data ?? []).reduce((s, l) =>
        s + (l.tipo === 'entrada' ? (l.valor_previsto ?? 0) : -(l.valor_previsto ?? 0)), 0);

      // ── Lookups para a timeline ────────────────────────────────────────────
      const lancamentos = resTimeline.data ?? [];

      const ids = (campo) => [...new Set(lancamentos.map(l => l[campo]).filter(Boolean))];
      const categoriaIds = ids('categoria_id');
      const contaIds     = ids('conta_id');
      const parceiroIds  = ids('parceiro_id');
      const arquitetoIds = ids('arquiteto_id');
      const clienteIds   = ids('cliente_id');

      const [resCats, resConts, resParceiros, resArqs, resClis] = await Promise.all([
        categoriaIds.length > 0
          ? supabase.from('financeiro_plano_contas').select('id, nome').in('id', categoriaIds)
          : { data: [] },
        contaIds.length > 0
          ? supabase.from('financeiro_contas').select('id, nome').in('id', contaIds)
          : { data: [] },
        parceiroIds.length > 0
          ? supabase.from('parceiros_publicos').select('id, nome').in('id', parceiroIds)
          : { data: [] },
        arquitetoIds.length > 0
          ? supabase.from('arquitetos').select('id, nome').in('id', arquitetoIds)
          : { data: [] },
        clienteIds.length > 0
          ? supabase.from('clientes').select('id, nome').in('id', clienteIds)
          : { data: [] },
      ]);

      setDados({
        saldo_total,
        a_receber_vencido,
        a_pagar_vencido,
        previsao_mes,
        lancamentos,
        lookups: {
          categorias: toLookup(resCats.data),
          contas:     toLookup(resConts.data),
          parceiros:  toLookup(resParceiros.data),
          arquitetos: toLookup(resArqs.data),
          clientes:   toLookup(resClis.data),
        },
      });

    } catch (err) {
      setErro(err.message ?? 'Erro desconhecido');
      toast.error('Erro ao carregar dashboard: ' + (err.message ?? 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // ── Cards de indicadores ─────────────────────────────────────────────────

  const cards = [
    {
      titulo:    'Saldo Total',
      valor:     loading ? null : dados.saldo_total,
      icone:     'lucide:wallet',
      corAcento: 'neutro',
      subtitulo: 'em contas ativas',
    },
    {
      titulo:    'A Receber Vencido',
      valor:     loading ? null : dados.a_receber_vencido,
      icone:     'lucide:arrow-down-circle',
      corAcento: 'ambar',
      subtitulo: 'vencido e não recebido',
    },
    {
      titulo:    'A Pagar Vencido',
      valor:     loading ? null : dados.a_pagar_vencido,
      icone:     'lucide:arrow-up-circle',
      corAcento: 'vermelho',
      subtitulo: 'vencido e não pago',
    },
    {
      titulo:    'Previsão do Mês',
      valor:     loading ? null : dados.previsao_mes,
      icone:     'lucide:trending-up',
      corAcento: !loading && dados.previsao_mes < 0 ? 'vermelho' : 'verde',
      subtitulo: 'entradas − saídas previstas',
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
          Dashboard Financeiro
        </div>
        <button
          onClick={() => toast.info('Em breve')}
          className="flex items-center gap-2 bg-yellow-400 text-zinc-950 px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-yellow-300 transition-colors shrink-0"
        >
          <iconify-icon icon="lucide:plus" width="13"></iconify-icon>
          Novo lançamento
        </button>
      </div>

      {/* Cards de indicadores — gap-px bg-zinc-800 border: padrão exato do VisaoGeral */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800">
        {cards.map(c => <CardResumo key={c.titulo} {...c} />)}
      </div>

      {/* Timeline */}
      <div>
        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
          Movimentações — hoje ± 15 dias
        </div>

        {erro ? (
          <div className="bg-[#0a0a0a] border border-zinc-800 p-8 text-center">
            <iconify-icon icon="lucide:alert-circle" width="28" className="text-red-500 mb-3 block mx-auto"></iconify-icon>
            <p className="text-red-400 text-sm mb-4">{erro}</p>
            <button
              onClick={carregarDados}
              className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 border border-zinc-700 px-4 py-2 hover:bg-zinc-800 transition-colors"
            >
              Tentar novamente
            </button>
          </div>

        ) : loading ? (
          <div className="bg-[#0a0a0a] border border-zinc-800 divide-y divide-zinc-800">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="px-4 py-3.5 flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 animate-pulse shrink-0 mt-[5px]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-52 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-36 bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="h-3.5 w-24 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-14 bg-zinc-800 rounded animate-pulse ml-auto" />
                </div>
              </div>
            ))}
          </div>

        ) : dados.lancamentos.length === 0 ? (
          <div className="bg-[#0a0a0a] border border-zinc-800 p-12 text-center">
            <iconify-icon icon="lucide:inbox" width="32" className="text-zinc-700 mb-3 block mx-auto"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhuma movimentação nos próximos 15 dias.</p>
          </div>

        ) : (
          <div className="bg-[#0a0a0a] border border-zinc-800 divide-y divide-zinc-800">
            {dados.lancamentos.map(l => (
              <TimelineLancamento key={l.id} lancamento={l} lookups={dados.lookups} />
            ))}
          </div>
        )}
      </div>

      {/* FAB — fixed, fora do flow */}
      <FabNovoFinanceiro />
    </div>
  );
}
