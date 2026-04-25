import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBRL, formatDate } from '../../utils/format';
import CardResumo from './dashboard/CardResumo';
import TimelineLancamento from './dashboard/TimelineLancamento';
import FabNovoFinanceiro from './dashboard/FabNovoFinanceiro';
import ModalLancamentoForm from './lancamentos/ModalLancamentoForm';

// ── Constantes de projetos ────────────────────────────────────────────────────

const STATUS_LABEL = {
  aprovado:   'Aprovado',
  produzindo: 'Em Produção',
  entregue:   'Entregue',
  perdido:    'Perdido',
};

const STATUS_COR = {
  aprovado:   'text-yellow-400 border-yellow-400/40',
  produzindo: 'text-blue-400  border-blue-400/40',
  entregue:   'text-green-400 border-green-400/40',
  perdido:    'text-red-400   border-red-400/40',
};

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

  // ── Estado modal novo lançamento ─────────────────────────────────────────
  const [modalLanc, setModalLanc] = useState({ aberto: false, lancamento: null });

  // ── Estado financeiro (cards + timeline) ──────────────────────────────────
  const [dados,   setDados]   = useState(ESTADO_INICIAL);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  // ── Estado projetos (visão geral) ─────────────────────────────────────────
  const hoje        = new Date();
  const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const ultimoDia   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

  const [loadingProjetos, setLoadingProjetos] = useState(true);
  const [projetos,        setProjetos]        = useState([]);
  const [orcValores,      setOrcValores]      = useState({});
  const [vendedores,      setVendedores]      = useState([]);
  const [periodoInicio,   setPeriodoInicio]   = useState(primeiroDia);
  const [periodoFim,      setPeriodoFim]      = useState(ultimoDia);
  const [filtroVend,      setFiltroVend]      = useState('todos');
  const [filtroStatus,    setFiltroStatus]    = useState('fechados');
  const [painelItem,      setPainelItem]      = useState(null);

  // ── Carga: dados financeiros ──────────────────────────────────────────────
  const carregarDados = useCallback(async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;

    setLoading(true);
    setErro(null);

    try {
      const agora  = new Date();
      const hojeStr   = agora.toISOString().slice(0, 10);

      const inicioMes   = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;
      const proximoMes  = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).toISOString().slice(0, 10);

      const d15anterior  = new Date(agora); d15anterior.setDate(agora.getDate() - 15);
      const d15posterior = new Date(agora); d15posterior.setDate(agora.getDate() + 15);
      const de  = d15anterior.toISOString().slice(0, 10);
      const ate = d15posterior.toISOString().slice(0, 10);

      const [resContas, resReceber, resPagar, resPrevisao, resTimeline] = await Promise.all([
        supabase.from('financeiro_contas').select('saldo_atual').eq('empresa_id', empresaId).eq('ativo', true),
        supabase.from('financeiro_lancamentos').select('valor_previsto, valor_pago').eq('empresa_id', empresaId).eq('tipo', 'entrada').in('status', ['pendente', 'parcial', 'atrasado']).lt('data_vencimento', hojeStr),
        supabase.from('financeiro_lancamentos').select('valor_previsto, valor_pago').eq('empresa_id', empresaId).eq('tipo', 'saida').in('status', ['pendente', 'parcial', 'atrasado']).lt('data_vencimento', hojeStr),
        supabase.from('financeiro_lancamentos').select('tipo, valor_previsto').eq('empresa_id', empresaId).in('status', ['pendente', 'parcial', 'atrasado', 'pago']).gte('data_vencimento', inicioMes).lt('data_vencimento', proximoMes),
        supabase.from('financeiro_lancamentos').select('id, tipo, status, descricao, valor_previsto, valor_pago, data_vencimento, data_pagamento, forma_pagamento, parceiro_id, arquiteto_id, cliente_id, conta_id, categoria_id, bloqueado_ate_pagamento_projeto').eq('empresa_id', empresaId).gte('data_vencimento', de).lte('data_vencimento', ate).neq('status', 'cancelado').order('data_vencimento', { ascending: false }).limit(100),
      ]);

      const erros = [resContas, resReceber, resPagar, resPrevisao, resTimeline].map(r => r.error).filter(Boolean);
      if (erros.length > 0) throw new Error(erros[0].message);

      const saldo_total       = (resContas.data  ?? []).reduce((s, c) => s + (c.saldo_atual ?? 0), 0);
      const a_receber_vencido = (resReceber.data ?? []).reduce((s, l) => s + ((l.valor_previsto ?? 0) - (l.valor_pago ?? 0)), 0);
      const a_pagar_vencido   = (resPagar.data   ?? []).reduce((s, l) => s + ((l.valor_previsto ?? 0) - (l.valor_pago ?? 0)), 0);
      const previsao_mes      = (resPrevisao.data ?? []).reduce((s, l) => s + (l.tipo === 'entrada' ? (l.valor_previsto ?? 0) : -(l.valor_previsto ?? 0)), 0);

      const lancamentos = resTimeline.data ?? [];
      const ids = (campo) => [...new Set(lancamentos.map(l => l[campo]).filter(Boolean))];
      const categoriaIds = ids('categoria_id');
      const contaIds     = ids('conta_id');
      const parceiroIds  = ids('parceiro_id');
      const arquitetoIds = ids('arquiteto_id');
      const clienteIds   = ids('cliente_id');

      const [resCats, resConts, resParceiros, resArqs, resClis] = await Promise.all([
        categoriaIds.length > 0 ? supabase.from('financeiro_plano_contas').select('id, nome').in('id', categoriaIds) : { data: [] },
        contaIds.length     > 0 ? supabase.from('financeiro_contas').select('id, nome').in('id', contaIds)           : { data: [] },
        parceiroIds.length  > 0 ? supabase.from('parceiros_publicos').select('id, nome').in('id', parceiroIds)       : { data: [] },
        arquitetoIds.length > 0 ? supabase.from('arquitetos').select('id, nome').in('id', arquitetoIds)              : { data: [] },
        clienteIds.length   > 0 ? supabase.from('clientes').select('id, nome').in('id', clienteIds)                  : { data: [] },
      ]);

      setDados({
        saldo_total, a_receber_vencido, a_pagar_vencido, previsao_mes, lancamentos,
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

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // ── Carga: projetos ───────────────────────────────────────────────────────
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;

    async function loadData() {
      setLoadingProjetos(true);
      try {
        const [{ data: proj }, { data: orcs }, { data: perfs }] = await Promise.all([
          supabase.from('projetos').select('id, nome, status, created_at, vendedor_id, clientes(nome)').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
          supabase.from('orcamentos').select('id, valor_total, ambiente_id, ambientes(projeto_id)').eq('empresa_id', empresaId),
          supabase.from('usuarios').select('id, nome').eq('empresa_id', empresaId).in('perfil', ['vendedor', 'admin']),
        ]);

        setProjetos(proj ?? []);
        setVendedores(perfs ?? []);

        const mapa = {};
        for (const o of orcs ?? []) {
          const pid = o.ambientes?.projeto_id;
          if (!pid) continue;
          mapa[pid] = (mapa[pid] ?? 0) + (o.valor_total ?? 0);
        }
        setOrcValores(mapa);
      } finally {
        setLoadingProjetos(false);
      }
    }

    loadData();
  }, [profile?.empresa_id]);

  // IntersectionObserver para animações sys-reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    document.querySelectorAll('.sys-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loadingProjetos]);

  // ── Derivados: projetos ───────────────────────────────────────────────────
  const projetosEnriquecidos = useMemo(() => projetos.map(p => ({
    ...p,
    clienteNome:  p.clientes?.nome ?? '—',
    vendedorNome: vendedores.find(v => v.id === p.vendedor_id)?.nome ?? '—',
    valor:        orcValores[p.id] ?? 0,
  })), [projetos, vendedores, orcValores]);

  const vendedoresUnicos = useMemo(() => {
    const nomes = projetosEnriquecidos.map(p => p.vendedorNome).filter(n => n !== '—');
    return [...new Set(nomes)].sort();
  }, [projetosEnriquecidos]);

  const fechamentosDB = useMemo(() =>
    projetosEnriquecidos.filter(p => ['aprovado', 'produzindo', 'entregue'].includes(p.status)),
  [projetosEnriquecidos]);

  const perdidosDB = useMemo(() =>
    projetosEnriquecidos.filter(p => p.status === 'perdido'),
  [projetosEnriquecidos]);

  const fechamentosFiltrados = useMemo(() => {
    const dataRef = p => (p.created_at ?? '').split('T')[0];
    return fechamentosDB.filter(p => {
      if (dataRef(p) < periodoInicio || dataRef(p) > periodoFim) return false;
      if (filtroVend !== 'todos' && p.vendedorNome !== filtroVend) return false;
      return true;
    });
  }, [fechamentosDB, periodoInicio, periodoFim, filtroVend]);

  const perdidosFiltrados = useMemo(() => {
    const dataRef = p => (p.created_at ?? '').split('T')[0];
    return perdidosDB.filter(p => {
      if (dataRef(p) < periodoInicio || dataRef(p) > periodoFim) return false;
      if (filtroVend !== 'todos' && p.vendedorNome !== filtroVend) return false;
      return true;
    });
  }, [perdidosDB, periodoInicio, periodoFim, filtroVend]);

  const totalRecebido = fechamentosFiltrados.reduce((s, p) => s + p.valor, 0);
  const ticketMedio   = fechamentosFiltrados.length ? totalRecebido / fechamentosFiltrados.length : 0;
  const nFechamentos  = fechamentosFiltrados.length;
  const showFechados  = filtroStatus === 'fechados' || filtroStatus === 'todos';
  const showPerdidos  = filtroStatus === 'perdidos' || filtroStatus === 'todos';

  const inputCls  = 'bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono px-3 py-2 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700 w-full';
  const selectCls = inputCls + ' appearance-none cursor-pointer';

  // ── Cards indicadores ─────────────────────────────────────────────────────
  const cards = [
    { titulo: 'Saldo Total',        valor: loading ? null : dados.saldo_total,       icone: 'lucide:wallet',           corAcento: 'neutro',                                              subtitulo: 'em contas ativas'          },
    { titulo: 'A Receber Vencido',  valor: loading ? null : dados.a_receber_vencido, icone: 'lucide:arrow-down-circle', corAcento: 'ambar',                                              subtitulo: 'vencido e não recebido'    },
    { titulo: 'A Pagar Vencido',    valor: loading ? null : dados.a_pagar_vencido,   icone: 'lucide:arrow-up-circle',   corAcento: 'vermelho',                                           subtitulo: 'vencido e não pago'        },
    { titulo: 'Previsão do Mês',    valor: loading ? null : dados.previsao_mes,      icone: 'lucide:trending-up',       corAcento: !loading && dados.previsao_mes < 0 ? 'vermelho' : 'verde', subtitulo: 'entradas − saídas previstas' },
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
          onClick={() => setModalLanc({ aberto: true, lancamento: null })}
          className="flex items-center gap-2 bg-yellow-400 text-zinc-950 px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-yellow-300 transition-colors shrink-0"
        >
          <iconify-icon icon="lucide:plus" width="13"></iconify-icon>
          Novo lançamento
        </button>
      </div>

      {/* Cards de indicadores */}
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
            <button onClick={carregarDados} className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 border border-zinc-700 px-4 py-2 hover:bg-zinc-800 transition-colors">
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

      {/* ── 01 // Filtros projetos ─────────────────────────────────────────── */}
      <section className="sys-reveal">
        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
          01 // Filtros
        </div>
        <div className="bg-[#0a0a0a] border border-zinc-800 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Período — início</label>
              <div className="relative">
                <iconify-icon icon="solar:calendar-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls + ' pl-8'} />
              </div>
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Período — fim</label>
              <div className="relative">
                <iconify-icon icon="solar:calendar-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls + ' pl-8'} />
              </div>
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">Vendedor</label>
              <div className="relative">
                <iconify-icon icon="solar:user-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="13"></iconify-icon>
                <select value={filtroVend} onChange={e => setFiltroVend(e.target.value)} className={selectCls + ' pl-8 pr-7'}>
                  <option value="todos">Todos</option>
                  {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="12"></iconify-icon>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-px border border-zinc-800 w-max">
            {[
              { id: 'fechados', label: 'Fechados', icon: 'solar:check-circle-linear'        },
              { id: 'perdidos', label: 'Perdidos', icon: 'solar:close-circle-linear'        },
              { id: 'todos',    label: 'Todos',    icon: 'solar:layers-minimalistic-linear' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setFiltroStatus(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  filtroStatus === tab.id ? 'bg-yellow-400 text-black' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'
                }`}>
                <iconify-icon icon={tab.icon} width="12"></iconify-icon>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 // Totais ──────────────────────────────────────────────────── */}
      <section className="sys-reveal sys-delay-100">
        <div className="text-[10px] font-mono text-white mb-2 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
          02 // Totais do período
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
          <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
            <iconify-icon icon="solar:wallet-money-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Total em projetos</div>
            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
              {loadingProjetos ? <div className="h-9 w-36 bg-zinc-800 animate-pulse rounded"></div> : showFechados ? formatBRL(totalRecebido) : '—'}
            </div>
            <div className="font-mono text-[9px] text-zinc-600">
              {showFechados ? `${nFechamentos} projeto${nFechamentos !== 1 ? 's' : ''} no período` : 'Filtro: apenas perdidos'}
            </div>
          </div>
          <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
            <iconify-icon icon="solar:graph-up-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Ticket médio</div>
            <div className="text-3xl font-bold text-white tracking-tighter mb-1">
              {loadingProjetos ? <div className="h-9 w-28 bg-zinc-800 animate-pulse rounded"></div> : showFechados && nFechamentos > 0 ? formatBRL(ticketMedio) : '—'}
            </div>
            <div className="font-mono text-[9px] text-zinc-600">por projeto fechado</div>
          </div>
          <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
            <iconify-icon icon="solar:check-square-linear" width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Nº de fechamentos</div>
            <div className="text-3xl font-bold tracking-tighter mb-1 flex items-baseline gap-2">
              {loadingProjetos ? <div className="h-9 w-16 bg-zinc-800 animate-pulse rounded"></div> : (
                <>
                  <span className="text-yellow-400">{showFechados ? nFechamentos : 0}</span>
                  {showPerdidos && <span className="text-base font-normal text-red-400 font-mono">{perdidosFiltrados.length} perd.</span>}
                </>
              )}
            </div>
            <div className="font-mono text-[9px] text-zinc-600">no período selecionado</div>
          </div>
        </div>
      </section>

      {/* ── 03 // Projetos fechados ────────────────────────────────────────── */}
      {showFechados && (
        <section className="sys-reveal sys-delay-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
              03 // Projetos fechados
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
              {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-[#0a0a0a] border border-zinc-800">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
              <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedor</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
              <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor</span>
            </div>
            {loadingProjetos ? (
              <div className="px-4 py-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-zinc-900 animate-pulse rounded"></div>)}</div>
            ) : fechamentosFiltrados.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <iconify-icon icon="solar:wallet-money-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto fechado no período</p>
              </div>
            ) : fechamentosFiltrados.map((p, i) => (
              <div key={p.id}
                className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.015] cursor-pointer group transition-colors ${
                  painelItem?.id === p.id ? 'bg-yellow-400/5 border-l-2 border-yellow-400' : ''
                } ${i < fechamentosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
                onClick={() => setPainelItem(painelItem?.id === p.id ? null : p)}
              >
                <div className="col-span-1 font-mono text-[9px] text-zinc-600 leading-tight">{formatDate(p.created_at)}</div>
                <div className="col-span-3 pl-1">
                  <span className="text-sm text-white font-medium truncate block group-hover:text-yellow-400 transition-colors">{p.clienteNome}</span>
                </div>
                <div className="col-span-3">
                  <span className="font-mono text-[10px] text-zinc-500 truncate block">{p.nome}</span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                    {p.vendedorNome !== '—' ? p.vendedorNome.split(' ').map(x => x[0]).join('').slice(0, 2) : '??'}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 truncate">{p.vendedorNome.split(' ')[0]}</span>
                </div>
                <div className="col-span-2">
                  <span className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase ${STATUS_COR[p.status] ?? 'text-zinc-500 border-zinc-700'}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  {p.valor > 0
                    ? <span className="font-mono text-[11px] text-white font-bold">{formatBRL(p.valor)}</span>
                    : <span className="font-mono text-[11px] text-zinc-700">—</span>}
                </div>
              </div>
            ))}
            {!loadingProjetos && fechamentosFiltrados.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  {fechamentosFiltrados.length} registro{fechamentosFiltrados.length !== 1 ? 's' : ''} · subtotal
                </span>
                <span className="font-mono text-sm font-bold text-yellow-400">{formatBRL(totalRecebido)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 04 // Projetos perdidos ────────────────────────────────────────── */}
      {showPerdidos && (
        <section className="sys-reveal sys-delay-300">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
              04 // Projetos perdidos
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
              {perdidosFiltrados.length} registro{perdidosFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-[#0a0a0a] border border-zinc-800">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
              <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
              <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 pl-1">Cliente</span>
              <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Projeto</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Vendedor</span>
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor (orç.)</span>
            </div>
            {loadingProjetos ? (
              <div className="px-4 py-4 space-y-3">{[1,2].map(i => <div key={i} className="h-10 bg-zinc-900 animate-pulse rounded"></div>)}</div>
            ) : perdidosFiltrados.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <iconify-icon icon="solar:close-circle-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum projeto perdido no período</p>
              </div>
            ) : perdidosFiltrados.map((p, i) => (
              <div key={p.id}
                className={`grid grid-cols-12 items-start px-4 py-3.5 hover:bg-white/[0.015] transition-colors ${i < perdidosFiltrados.length - 1 ? 'border-b border-zinc-900' : ''}`}
              >
                <div className="col-span-1 font-mono text-[9px] text-zinc-600 pt-0.5">{formatDate(p.created_at)}</div>
                <div className="col-span-3 pl-1">
                  <span className="text-sm text-white font-medium truncate block">{p.clienteNome}</span>
                </div>
                <div className="col-span-4">
                  <span className="font-mono text-[10px] text-zinc-500 truncate block">{p.nome}</span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[7px] text-zinc-400 shrink-0">
                    {p.vendedorNome !== '—' ? p.vendedorNome.split(' ').map(x => x[0]).join('').slice(0, 2) : '??'}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500 truncate">{p.vendedorNome.split(' ')[0]}</span>
                </div>
                <div className="col-span-2 text-right">
                  {p.valor > 0
                    ? <span className="font-mono text-[11px] text-zinc-400">{formatBRL(p.valor)}</span>
                    : <span className="font-mono text-[11px] text-zinc-700">—</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ModalLancamentoForm
        aberto={modalLanc.aberto}
        lancamentoEditando={modalLanc.lancamento}
        onFechar={() => setModalLanc({ aberto: false, lancamento: null })}
        onSucesso={() => { setModalLanc({ aberto: false, lancamento: null }); carregarDados(); }}
      />

      {/* FAB */}
      <FabNovoFinanceiro />

      {/* ── Painel lateral ───────────────────────────────────────────────── */}
      {painelItem && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setPainelItem(null)}></div>
          <aside className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden"
            style={{ animation: 'slideInPanel 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Detalhes do projeto</div>
                <div className="text-white font-semibold text-sm truncate max-w-[280px]">{painelItem.clienteNome}</div>
              </div>
              <button onClick={() => setPainelItem(null)} className="text-zinc-600 hover:text-white transition-colors p-1 shrink-0">
                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Projeto</div>
                <div className="text-zinc-300 text-sm">{painelItem.nome}</div>
              </div>
              <div className="grid grid-cols-2 border-b border-zinc-800">
                <div className="px-5 py-4 border-r border-zinc-800">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Valor (orçamentos)</div>
                  <div className="font-mono text-2xl font-bold text-yellow-400 tracking-tighter">
                    {painelItem.valor > 0 ? formatBRL(painelItem.valor) : '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Data criação</div>
                  <div className="font-mono text-sm font-semibold text-white">{formatDate(painelItem.created_at)}</div>
                </div>
              </div>
              <div className="px-5 py-4 border-b border-zinc-800">
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Status</div>
                <span className={`px-2 py-1 border font-mono text-[9px] uppercase ${STATUS_COR[painelItem.status] ?? 'text-zinc-500 border-zinc-700'}`}>
                  {STATUS_LABEL[painelItem.status] ?? painelItem.status}
                </span>
              </div>
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[10px] text-zinc-400 shrink-0">
                  {painelItem.vendedorNome !== '—' ? painelItem.vendedorNome.split(' ').map(p => p[0]).join('').slice(0, 2) : '??'}
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5">Vendedor</div>
                  <div className="text-white text-sm font-medium">{painelItem.vendedorNome}</div>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
              <button onClick={() => setPainelItem(null)}
                className="w-full border border-zinc-700 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2">
                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                Fechar
              </button>
            </div>
          </aside>
        </>
      )}

      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
