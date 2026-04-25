import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, ComposedChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

// ─── helpers de data ─────────────────────────────────────────────────────────

function addDias(baseISO, n) {
  const d = new Date(baseISO + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function ultimoDiaMes(ano, mes) {
  return new Date(ano, mes, 0).toISOString().slice(0, 10);
}

function primeiroDiaMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function fmtMes(ano, mes) {
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${meses[mes - 1]}/${ano}`;
}

function fmtDiaMes(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function gerarMeses(hojeISO) {
  const [ano, mes] = hojeISO.split('-').map(Number);
  return Array.from({ length: 3 }, (_, i) => {
    const m = mes + i > 12 ? mes + i - 12 : mes + i;
    const a = mes + i > 12 ? ano + 1 : ano;
    return { nome: fmtMes(a, m), inicio: primeiroDiaMes(a, m), fim: ultimoDiaMes(a, m), entradas: 0, saidas: 0, saldo_projetado: 0 };
  });
}

function limitesMes(mesAno) {
  const [a, m] = mesAno.split('-').map(Number);
  return { inicio: primeiroDiaMes(a, m), fim: ultimoDiaMes(a, m) };
}

// ─── tooltip customizado ─────────────────────────────────────────────────────

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-3 text-left">
      <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="font-mono text-[10px]" style={{ color: p.color }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── 3 blocos DFC ────────────────────────────────────────────────────────────

const BLOCOS = [
  {
    key:    'operacional',
    titulo: 'Atividades Operacionais',
    icon:   'lucide:activity',
    desc:   'Receitas e custos do negócio',
    cor:    'text-emerald-400',
    corBg:  'border-emerald-900/40',
  },
  {
    key:    'investimento',
    titulo: 'Atividades de Investimento',
    icon:   'lucide:trending-up',
    desc:   'Compra/venda de ativos',
    cor:    'text-blue-400',
    corBg:  'border-blue-900/40',
  },
  {
    key:    'financiamento',
    titulo: 'Atividades de Financiamento',
    icon:   'lucide:landmark',
    desc:   'Empréstimos e parcelas',
    cor:    'text-purple-400',
    corBg:  'border-purple-900/40',
  },
];

function BlocoDFC({ bloco, dados, mesAno }) {
  const saldo = dados.entradas - dados.saidas;
  const corSaldo = saldo >= 0 ? bloco.cor : 'text-red-400';
  return (
    <div className={`bg-gray-50 dark:bg-[#0a0a0a] border ${bloco.corBg} border p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <iconify-icon icon={bloco.icon} width="14" className={`${bloco.cor} mb-1 block`}></iconify-icon>
          <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-400">{bloco.titulo}</div>
          <div className="font-mono text-[8px] text-gray-400 dark:text-zinc-700 mt-0.5">{bloco.desc}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-gray-300 dark:border-zinc-800 pt-3">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">Entradas</span>
          <span className="font-mono text-sm tabular-nums text-emerald-400">+{formatBRL(dados.entradas)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">Saídas</span>
          <span className="font-mono text-sm tabular-nums text-red-400">−{formatBRL(dados.saidas)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-gray-300 dark:border-zinc-800 pt-2 mt-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">Saldo</span>
          <span className={`font-mono text-base font-bold tabular-nums tracking-tight ${corSaldo}`}>
            {formatBRL(saldo)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

const INPUT_CLS = 'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-gray-900 dark:text-white outline-none focus:border-yellow-400 transition-colors [color-scheme:dark]';

export default function FluxoDeCaixa() {
  const { profile } = useAuth();

  const hoje = new Date().toISOString().slice(0, 10);
  const [mesAno, setMesAno] = useState(hoje.slice(0, 7));
  const [campoData, setCampoData] = useState('data_vencimento');

  const [dados,   setDados]   = useState(null);
  const [dadosDFC,setDadosDFC]= useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDFC, setLoadingDFC] = useState(true);
  const [erro,    setErro]    = useState(null);

  // ── Carga projeção (3 meses + 30 dias) ──────────────────────────────────

  const carregarProjecao = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoading(true);
    setErro(null);

    try {
      const hojeISO = new Date().toISOString().slice(0, 10);
      const limiteISO = addDias(hojeISO, 90);

      const [{ data: contas, error: errC }, { data: lancs, error: errL }] = await Promise.all([
        supabase.from('financeiro_contas').select('saldo_atual').eq('empresa_id', profile.empresa_id).eq('ativo', true),
        supabase.from('financeiro_lancamentos')
          .select('tipo, valor_previsto, valor_pago, data_vencimento, status')
          .eq('empresa_id', profile.empresa_id)
          .neq('status', 'cancelado')
          .gte('data_vencimento', hojeISO)
          .lte('data_vencimento', limiteISO),
      ]);

      if (errC) throw errC;
      if (errL) throw errL;

      const saldoAtual = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0);
      const pendentes  = (lancs ?? []).filter(l => Number(l.valor_previsto ?? 0) - Number(l.valor_pago ?? 0) > 0.005);

      const meses = gerarMeses(hojeISO);
      for (const l of pendentes) {
        const saldo = Number(l.valor_previsto) - Number(l.valor_pago ?? 0);
        const mes = meses.find(m => l.data_vencimento >= m.inicio && l.data_vencimento <= m.fim);
        if (!mes) continue;
        if (l.tipo === 'entrada') mes.entradas += saldo; else mes.saidas += saldo;
      }
      let acum = saldoAtual;
      for (const m of meses) { acum += m.entradas - m.saidas; m.saldo_projetado = acum; }

      const diario = Array.from({ length: 30 }, (_, i) => ({
        data: addDias(hojeISO, i), entradas: 0, saidas: 0, saldo_projetado: 0,
      }));
      for (const l of pendentes) {
        const idx = diario.findIndex(d => d.data === l.data_vencimento);
        if (idx < 0) continue;
        const s = Number(l.valor_previsto) - Number(l.valor_pago ?? 0);
        if (l.tipo === 'entrada') diario[idx].entradas += s; else diario[idx].saidas += s;
      }
      let saldoDia = saldoAtual;
      for (const d of diario) {
        saldoDia += d.entradas - d.saidas;
        d.saldo_projetado = saldoDia;
        d.data = fmtDiaMes(d.data);
      }
      const primeiroDiaNegativo = diario.find(d => d.saldo_projetado < 0);

      setDados({ saldoAtual, meses, diario, pendentes, primeiroDiaNegativo });
    } catch (err) {
      setErro(err.message ?? 'Erro ao carregar fluxo de caixa');
      toast.error('Erro ao carregar fluxo de caixa');
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id]);

  // ── Carga DFC por blocos ─────────────────────────────────────────────────

  const carregarDFC = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoadingDFC(true);
    try {
      const { inicio, fim } = limitesMes(mesAno);

      const { data: lancs, error } = await supabase
        .from('financeiro_lancamentos')
        .select('tipo, valor_previsto, valor_pago, status, subtipo_dfc')
        .eq('empresa_id', profile.empresa_id)
        .neq('status', 'cancelado')
        .gte(campoData, inicio)
        .lte(campoData, fim);

      if (error) throw error;

      const blocos = { operacional: { entradas: 0, saidas: 0 }, investimento: { entradas: 0, saidas: 0 }, financiamento: { entradas: 0, saidas: 0 } };

      for (const l of lancs ?? []) {
        const bloco = l.subtipo_dfc ?? 'operacional';
        if (!blocos[bloco]) continue;
        const valor = Number(campoData === 'data_pagamento' ? (l.valor_pago ?? 0) : (l.valor_previsto ?? 0));
        if (l.tipo === 'entrada') blocos[bloco].entradas += valor;
        else blocos[bloco].saidas += valor;
      }

      setDadosDFC(blocos);
    } catch (err) {
      toast.error('Erro ao carregar DFC por blocos');
    } finally {
      setLoadingDFC(false);
    }
  }, [profile?.empresa_id, mesAno, campoData]);

  useEffect(() => { carregarProjecao(); }, [carregarProjecao]);
  useEffect(() => { carregarDFC(); }, [carregarDFC]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── DFC por Blocos ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="font-mono text-[10px] text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
            DFC — Demonstração do Fluxo de Caixa
          </div>
          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className={INPUT_CLS}
          />
          <div className="flex items-center gap-1">
            {[['data_vencimento','Vencimento'],['data_pagamento','Caixa']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setCampoData(v)}
                className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-widest cursor-pointer transition-colors ${campoData === v ? 'border-yellow-400 text-yellow-400' : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {loadingDFC ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
            {[0,1,2].map(i => (
              <div key={i} className="bg-gray-50 dark:bg-[#0a0a0a] p-4 flex flex-col gap-3">
                <div className="h-3 w-28 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" />
                <div className="h-5 w-20 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded mt-2" />
                <div className="h-5 w-20 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : dadosDFC ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
              {BLOCOS.map(bloco => (
                <BlocoDFC key={bloco.key} bloco={bloco} dados={dadosDFC[bloco.key]} mesAno={mesAno} />
              ))}
            </div>

            {/* Resultado total */}
            {(() => {
              const total = Object.values(dadosDFC).reduce((s, b) => s + b.entradas - b.saidas, 0);
              const corTotal = total >= 0 ? 'text-emerald-400' : 'text-red-400';
              return (
                <div className="flex items-center justify-between px-4 py-3 border border-t-0 border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">
                    Resultado Final de Caixa
                  </span>
                  <span className={`font-mono text-lg font-bold tabular-nums tracking-tight ${corTotal}`}>
                    {formatBRL(total)}
                  </span>
                </div>
              );
            })()}
          </>
        ) : null}

        <p className="font-mono text-[8px] text-gray-400 dark:text-zinc-700 mt-2">
          Lançamentos sem subtipo_dfc são classificados como Operacionais por padrão.
          Classifique empréstimos e investimentos ao cadastrar o lançamento.
        </p>
      </div>

      {/* ── Projeção de caixa ───────────────────────────────────────────── */}

      {loading ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
            {[0,1,2].map(i => (
              <div key={i} className="bg-gray-50 dark:bg-[#0a0a0a] p-5 flex flex-col gap-3">
                <div className="h-3 w-20 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" />
                <div className="h-6 w-28 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" />
                <div className="h-6 w-28 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded" />
                <div className="h-8 w-32 bg-gray-200 dark:bg-zinc-800 animate-pulse rounded mt-1" />
              </div>
            ))}
          </div>
          <div className="border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-[#0a0a0a] h-[300px] animate-pulse" />
        </div>
      ) : erro ? (
        <div className="border border-gray-300 dark:border-zinc-800 p-10 flex flex-col items-center gap-3">
          <iconify-icon icon="lucide:alert-triangle" width="28" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-center">{erro}</p>
          <button type="button" onClick={carregarProjecao} className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 border border-gray-300 dark:border-zinc-800 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
            Tentar novamente
          </button>
        </div>
      ) : dados ? (
        <div className="flex flex-col gap-5">
          <div className="font-mono text-[10px] text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
            Projeção — Próximos 90 dias
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Saldo atual em contas</span>
            <span className={`text-2xl font-bold tabular-nums tracking-tighter ${dados.saldoAtual >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-400'}`}>
              {formatBRL(dados.saldoAtual)}
            </span>
          </div>

          {dados.primeiroDiaNegativo && (
            <div className="border border-amber-900 bg-amber-950/30 px-4 py-2.5 flex items-center gap-2">
              <iconify-icon icon="lucide:alert-triangle" width="14" className="text-amber-400 shrink-0"></iconify-icon>
              <p className="font-mono text-[10px] text-amber-400">
                Atenção: saldo projetado fica negativo em {dados.primeiroDiaNegativo.data}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
            {dados.meses.map((m, i) => {
              const corSaldo = m.saldo_projetado >= 0 ? 'text-emerald-400' : 'text-red-400';
              return (
                <div key={i} className="bg-gray-50 dark:bg-[#0a0a0a] p-5 flex flex-col gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">{m.nome}</span>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-sm tabular-nums text-emerald-400">+{formatBRL(m.entradas)}</span>
                    <span className="font-mono text-sm tabular-nums text-red-400">−{formatBRL(m.saidas)}</span>
                  </div>
                  <div className="border-t border-gray-300 dark:border-zinc-800 pt-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 block mb-1">Proj. acumulado</span>
                    <span className={`text-xl font-bold tabular-nums tracking-tighter ${corSaldo}`}>
                      {formatBRL(m.saldo_projetado)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-[#0a0a0a]">
            <div className="px-4 py-3 border-b border-gray-300 dark:border-zinc-800">
              <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white">Projeção Diária — 30 dias</span>
            </div>
            {dados.pendentes.length === 0 ? (
              <div className="p-10 flex flex-col items-center gap-3">
                <iconify-icon icon="lucide:calendar-x" width="28" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-center">Nenhum lançamento pendente nos próximos 90 dias.</p>
              </div>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={dados.diario} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="data" stroke="#52525b" tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis yAxisId="left" stroke="#52525b" tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={40} />
                    <YAxis yAxisId="right" orientation="right" stroke="#52525b" tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#fbbf24' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={40} />
                    <Tooltip content={<TooltipCustom />} />
                    <Bar yAxisId="left" dataKey="entradas" name="Entradas" fill="#10b981" fillOpacity={0.7} maxBarSize={12} />
                    <Bar yAxisId="left" dataKey="saidas"   name="Saídas"   fill="#ef4444" fillOpacity={0.7} maxBarSize={12} />
                    <Line yAxisId="right" type="monotone" dataKey="saldo_projetado" name="Saldo proj." stroke="#fbbf24" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#fbbf24' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
