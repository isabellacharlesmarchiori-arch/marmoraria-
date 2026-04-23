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

// Gera array com os próximos 3 meses (incluindo o corrente)
function gerarMeses(hojeISO) {
  const [ano, mes] = hojeISO.split('-').map(Number);
  return Array.from({ length: 3 }, (_, i) => {
    const m = mes + i > 12 ? mes + i - 12 : mes + i;
    const a = mes + i > 12 ? ano + 1 : ano;
    return {
      nome:     fmtMes(a, m),
      inicio:   primeiroDiaMes(a, m),
      fim:      ultimoDiaMes(a, m),
      entradas: 0,
      saidas:   0,
      saldo_projetado: 0,
    };
  });
}

// ─── tooltip customizado ─────────────────────────────────────────────────────

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 p-3 text-left">
      <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="font-mono text-[10px]" style={{ color: p.color }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export default function FluxoDeCaixa() {
  const { profile } = useAuth();

  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);

  const carregar = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoading(true);
    setErro(null);

    try {
      const hojeISO = new Date().toISOString().slice(0, 10);
      const limiteISO = addDias(hojeISO, 90);

      const [{ data: contas, error: errC }, { data: lancs, error: errL }] = await Promise.all([
        supabase
          .from('financeiro_contas')
          .select('saldo_atual')
          .eq('empresa_id', profile.empresa_id)
          .eq('ativo', true),
        supabase
          .from('financeiro_lancamentos')
          .select('tipo, valor_previsto, valor_pago, data_vencimento, status')
          .eq('empresa_id', profile.empresa_id)
          .neq('status', 'cancelado')
          .gte('data_vencimento', hojeISO)
          .lte('data_vencimento', limiteISO),
      ]);

      if (errC) throw errC;
      if (errL) throw errL;

      const saldoAtual = (contas ?? []).reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0);

      // Filtra apenas lançamentos com saldo pendente
      const pendentes = (lancs ?? []).filter(l => {
        const pago   = Number(l.valor_pago     ?? 0);
        const prev   = Number(l.valor_previsto ?? 0);
        return prev - pago > 0.005;
      });

      // ── Por mês ──────────────────────────────────────────────────────────
      const meses = gerarMeses(hojeISO);
      for (const l of pendentes) {
        const saldo = Number(l.valor_previsto) - Number(l.valor_pago ?? 0);
        const mes   = meses.find(m => l.data_vencimento >= m.inicio && l.data_vencimento <= m.fim);
        if (!mes) continue;
        if (l.tipo === 'entrada') mes.entradas += saldo;
        else                      mes.saidas   += saldo;
      }

      // Saldo projetado acumulado entre meses
      let acumulado = saldoAtual;
      for (const m of meses) {
        acumulado += m.entradas - m.saidas;
        m.saldo_projetado = acumulado;
      }

      // ── Por dia (30 dias) ─────────────────────────────────────────────────
      const diario = Array.from({ length: 30 }, (_, i) => ({
        data:             addDias(hojeISO, i),
        entradas:         0,
        saidas:           0,
        saldo_projetado:  0,
      }));

      for (const l of pendentes) {
        const idx = diario.findIndex(d => d.data === l.data_vencimento);
        if (idx < 0) continue;
        const saldo = Number(l.valor_previsto) - Number(l.valor_pago ?? 0);
        if (l.tipo === 'entrada') diario[idx].entradas += saldo;
        else                      diario[idx].saidas   += saldo;
      }

      let saldoDia = saldoAtual;
      for (const d of diario) {
        saldoDia += d.entradas - d.saidas;
        d.saldo_projetado = saldoDia;
        d.data = fmtDiaMes(d.data); // converte para display após usar como chave
      }

      // Aviso de saldo negativo
      const primeiroDiaNegativo = diario.find(d => d.saldo_projetado < 0);

      setDados({ saldoAtual, meses, diario, pendentes, primeiroDiaNegativo });
    } catch (err) {
      setErro(err.message ?? 'Erro ao carregar fluxo de caixa');
      toast.error('Erro ao carregar fluxo de caixa');
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
          {[0,1,2].map(i => (
            <div key={i} className="bg-[#0a0a0a] p-5 flex flex-col gap-3">
              <div className="h-3 w-20 bg-zinc-800 animate-pulse rounded" />
              <div className="h-6 w-28 bg-zinc-800 animate-pulse rounded" />
              <div className="h-6 w-28 bg-zinc-800 animate-pulse rounded" />
              <div className="h-8 w-32 bg-zinc-800 animate-pulse rounded mt-1" />
            </div>
          ))}
        </div>
        <div className="border border-zinc-800 bg-[#0a0a0a] h-[300px] animate-pulse" />
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

  const { saldoAtual, meses, diario, pendentes, primeiroDiaNegativo } = dados;

  return (
    <div className="flex flex-col gap-5">

      {/* Saldo atual */}
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Saldo atual</span>
        <span className={`text-2xl font-bold tabular-nums tracking-tighter ${saldoAtual >= 0 ? 'text-white' : 'text-red-400'}`}>
          {formatBRL(saldoAtual)}
        </span>
      </div>

      {/* Aviso saldo negativo */}
      {primeiroDiaNegativo && (
        <div className="border border-amber-900 bg-amber-950/30 px-4 py-2.5 flex items-center gap-2">
          <iconify-icon icon="lucide:alert-triangle" width="14" className="text-amber-400 shrink-0"></iconify-icon>
          <p className="font-mono text-[10px] text-amber-400">
            Atenção: saldo projetado fica negativo em {primeiroDiaNegativo.data}
          </p>
        </div>
      )}

      {/* Cards dos 3 meses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
        {meses.map((m, i) => {
          const corSaldo = m.saldo_projetado >= 0 ? 'text-emerald-400' : 'text-red-400';
          return (
            <div key={i} className="bg-[#0a0a0a] p-5 flex flex-col gap-3">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                {m.nome}
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-sm tabular-nums text-emerald-400">
                  +{formatBRL(m.entradas)}
                </span>
                <span className="font-mono text-sm tabular-nums text-red-400">
                  −{formatBRL(m.saidas)}
                </span>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1">
                  Proj. acumulado
                </span>
                <span className={`text-xl font-bold tabular-nums tracking-tighter ${corSaldo}`}>
                  {formatBRL(m.saldo_projetado)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico diário */}
      <div className="border border-zinc-800 bg-[#0a0a0a]">
        <div className="px-4 py-3 border-b border-zinc-800">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white">
            Projeção Diária — 30 dias
          </span>
        </div>

        {pendentes.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <iconify-icon icon="lucide:calendar-x" width="28" className="text-zinc-700"></iconify-icon>
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">
              Nenhum lançamento pendente nos próximos 90 dias.
            </p>
          </div>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={diario} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="data"
                  stroke="#52525b"
                  tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#52525b"
                  tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#52525b"
                  tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#fbbf24' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  width={40}
                />
                <Tooltip content={<TooltipCustom />} />
                <Bar
                  yAxisId="left"
                  dataKey="entradas"
                  name="Entradas"
                  fill="#10b981"
                  fillOpacity={0.7}
                  maxBarSize={12}
                />
                <Bar
                  yAxisId="left"
                  dataKey="saidas"
                  name="Saídas"
                  fill="#ef4444"
                  fillOpacity={0.7}
                  maxBarSize={12}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="saldo_projetado"
                  name="Saldo proj."
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#fbbf24' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
