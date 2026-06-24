import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { fmtBRL } from '../../utils/projetoUtils';
import { ACABAMENTO_LABEL } from '../../utils/orcamentoUtils';

// ── Utilidades ────────────────────────────────────────────────────────────────

function gerarMeses() {
  const out = [{ value: 'todos', label: 'Todos os períodos' }];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    });
  }
  return out;
}

const MESES = gerarMeses();
const CHART_COLORS = ['#facc15', '#fb923c', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
const OUTROS_COLOR = '#3f3b1a';

const fmtM2 = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SELECT_CLS = 'bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] uppercase tracking-wide px-3 py-2 focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none';
const INPUT_CLS  = 'bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] px-3 py-2 focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 w-[220px]';

const TOOLTIP_STYLE = {
  background: '#111', border: '1px solid #27272a',
  fontFamily: 'monospace', fontSize: 10, color: '#e4e4e7', borderRadius: 2,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, yellow }) {
  return (
    <div className="bg-white dark:bg-[#0a0a0a] p-5 hover:-translate-y-0.5 transition-all relative group">
      <iconify-icon icon={icon} width="16" className="text-zinc-300 dark:text-zinc-700 absolute top-5 right-5"></iconify-icon>
      <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2">{label}</div>
      <div className={`text-3xl font-bold tracking-tighter mb-1 truncate ${yellow ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-900 dark:text-white'}`}>
        {value}
      </div>
      {sub && <div className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">{sub}</div>}
    </div>
  );
}

function Top3Card({ title, items, valueKey, valueLabel, maxRef, formatValue }) {
  return (
    <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{title}</span>
      </div>
      <div className="p-4 flex-1 space-y-3">
        {items.length === 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700 text-center py-8">Sem dados</p>
        ) : items.slice(0, 3).map((item, i) => (
          <div
            key={item.nome + i}
            className={`p-3 border ${i === 0
              ? 'border-orange-500/30 dark:border-yellow-400/20 bg-orange-50/50 dark:bg-yellow-400/5'
              : 'border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-mono text-[9px] font-bold shrink-0 ${i === 0 ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-400 dark:text-zinc-600'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`text-sm font-semibold truncate ${i === 0 ? 'text-orange-700 dark:text-yellow-300' : 'text-zinc-900 dark:text-white'}`}>
                  {item.nome}
                </span>
              </div>
              <span className={`font-mono text-[11px] tabular-nums font-bold shrink-0 ${i === 0 ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-900 dark:text-white'}`}>
                {formatValue(item[valueKey])} {valueLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-[3px] bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${i === 0 ? 'bg-orange-500 dark:bg-yellow-400' : 'bg-zinc-500'}`}
                  style={{ width: maxRef > 0 ? `${(item[valueKey] / maxRef) * 100}%` : '0%' }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600 shrink-0">
                {fmtBRL(item.valor)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function RelatoriosVendas() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  const [periodoFiltro,  setPeriodoFiltro]  = useState('todos');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');
  const [materialBusca,  setMaterialBusca]  = useState('');

  const [loading,      setLoading]      = useState(true);
  const [allPedidos,   setAllPedidos]   = useState([]);
  const [projetosMap,  setProjetosMap]  = useState({});
  const [vendedores,   setVendedores]   = useState([]);
  const [allPecas,     setAllPecas]     = useState([]);
  const [materiaisMap, setMateriaisMap] = useState({});

  // ── Fetch inicial ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!empresaId) return;
    let mounted = true;
    async function load() {
      setLoading(true);

      const { data: pedidosRaw } = await supabase
        .from('pedidos_fechados')
        .select('id, projeto_id, cenario_ids, created_at')
        .eq('status', 'FECHADO')
        .order('created_at', { ascending: false });
      if (!mounted) return;

      const pedidos    = pedidosRaw ?? [];
      const projIds    = [...new Set(pedidos.map(p => p.projeto_id).filter(Boolean))];
      const cenarioIds = [...new Set(pedidos.flatMap(p => p.cenario_ids ?? []))];

      const [resProjetos, resVend, resPecas, resMats] = await Promise.all([
        projIds.length
          ? supabase.from('projetos').select('id, vendedor_id').in('id', projIds)
          : Promise.resolve({ data: [] }),
        supabase.from('usuarios').select('id, nome')
          .eq('empresa_id', empresaId)
          .in('perfil', ['vendedor', 'admin', 'admin_medidor', 'vendedor_medidor'])
          .order('nome'),
        cenarioIds.length
          ? supabase.from('orcamento_pecas')
              .select('orcamento_id, material_id, valor_total, acabamentos, pecas(area_liquida_m2)')
              .in('orcamento_id', cenarioIds)
          : Promise.resolve({ data: [] }),
        supabase.from('materiais').select('id, nome').eq('empresa_id', empresaId).order('nome'),
      ]);
      if (!mounted) return;

      setAllPedidos(pedidos);
      setProjetosMap(Object.fromEntries((resProjetos.data ?? []).map(p => [p.id, p])));
      setVendedores(resVend.data ?? []);
      setAllPecas(resPecas.data ?? []);
      setMateriaisMap(Object.fromEntries((resMats.data ?? []).map(m => [m.id, m.nome])));
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [empresaId]);

  // ── Filtros client-side ───────────────────────────────────────────────────

  const filteredPedidos = useMemo(() => {
    let rows = allPedidos;
    if (periodoFiltro !== 'todos') {
      const [ano, mes] = periodoFiltro.split('-').map(Number);
      rows = rows.filter(p => {
        const d = new Date(p.created_at);
        return d.getFullYear() === ano && d.getMonth() + 1 === mes;
      });
    }
    if (vendedorFiltro !== 'todos') {
      rows = rows.filter(p => projetosMap[p.projeto_id]?.vendedor_id === vendedorFiltro);
    }
    return rows;
  }, [allPedidos, projetosMap, periodoFiltro, vendedorFiltro]);

  const cenarioIdSet = useMemo(
    () => new Set(filteredPedidos.flatMap(p => p.cenario_ids ?? [])),
    [filteredPedidos]
  );

  // Peças filtradas só por período+vendedor — alimenta seção superior
  const pecasPreMat = useMemo(
    () => allPecas.filter(p => cenarioIdSet.has(p.orcamento_id)),
    [allPecas, cenarioIdSet]
  );

  // Peças com busca por nome de material — alimenta tabelas da seção inferior
  const filteredPecas = useMemo(() => {
    const q = materialBusca.trim().toLowerCase();
    if (!q) return pecasPreMat;
    return pecasPreMat.filter(p => {
      const nome = materiaisMap[p.material_id ?? ''] ?? 'Sem material';
      return nome.toLowerCase().includes(q);
    });
  }, [pecasPreMat, materialBusca, materiaisMap]);

  // ── Agregações (seção superior — sem filtro de texto) ────────────────────

  const materiaisAggAll = useMemo(() => {
    const agg = new Map();
    for (const p of pecasPreMat) {
      const key  = p.material_id ?? '__sem__';
      const nome = materiaisMap[key] ?? 'Sem material';
      const area = p.pecas?.area_liquida_m2 ?? 0;
      const val  = p.valor_total ?? 0;
      if (!agg.has(key)) agg.set(key, { nome, area: 0, valor: 0 });
      const cur = agg.get(key);
      cur.area  += area;
      cur.valor += val;
    }
    return [...agg.values()].sort((a, b) => b.area - a.area);
  }, [pecasPreMat, materiaisMap]);

  const acabamentosAggAll = useMemo(() => {
    const agg = new Map();
    for (const p of pecasPreMat) {
      for (const ac of (p.acabamentos ?? [])) {
        const tipo = ac.tipo ?? 'outro';
        const nome = ACABAMENTO_LABEL[tipo] ?? tipo;
        if (!agg.has(tipo)) agg.set(tipo, { nome, ml: 0, valor: 0 });
        const cur = agg.get(tipo);
        cur.ml    += ac.ml    ?? 0;
        cur.valor += ac.valor ?? 0;
      }
    }
    return [...agg.values()].sort((a, b) => b.ml - a.ml);
  }, [pecasPreMat]);

  // ── Agregações (seção inferior — com filtro de texto) ────────────────────

  const materiaisAgg = useMemo(() => {
    const agg = new Map();
    for (const p of filteredPecas) {
      const key  = p.material_id ?? '__sem__';
      const nome = materiaisMap[key] ?? 'Sem material';
      const area = p.pecas?.area_liquida_m2 ?? 0;
      const val  = p.valor_total ?? 0;
      if (!agg.has(key)) agg.set(key, { nome, area: 0, valor: 0 });
      const cur = agg.get(key);
      cur.area  += area;
      cur.valor += val;
    }
    return [...agg.values()].sort((a, b) => b.area - a.area);
  }, [filteredPecas, materiaisMap]);

  const acabamentosAgg = useMemo(() => {
    const agg = new Map();
    for (const p of filteredPecas) {
      for (const ac of (p.acabamentos ?? [])) {
        const tipo = ac.tipo ?? 'outro';
        const nome = ACABAMENTO_LABEL[tipo] ?? tipo;
        if (!agg.has(tipo)) agg.set(tipo, { nome, ml: 0, valor: 0 });
        const cur = agg.get(tipo);
        cur.ml    += ac.ml    ?? 0;
        cur.valor += ac.valor ?? 0;
      }
    }
    return [...agg.values()].sort((a, b) => b.ml - a.ml);
  }, [filteredPecas]);

  // ── Métricas ──────────────────────────────────────────────────────────────

  const totalAreaMat  = materiaisAggAll.reduce((s, m) => s + m.area,  0);
  const totalValorMat = materiaisAggAll.reduce((s, m) => s + m.valor, 0);
  const topMaterial   = materiaisAggAll[0] ?? null;
  const maxAreaAll    = topMaterial?.area ?? 1;
  const maxMlAll      = acabamentosAggAll[0]?.ml ?? 1;
  const avgTicket     = filteredPedidos.length > 0 ? totalValorMat / filteredPedidos.length : 0;

  // Rodapés das tabelas
  const totalAreaTab   = materiaisAgg.reduce((s, m) => s + m.area,  0);
  const totalValorTab  = materiaisAgg.reduce((s, m) => s + m.valor, 0);
  const totalMlTab     = acabamentosAgg.reduce((s, a) => s + a.ml,    0);
  const totalValorAcab = acabamentosAgg.reduce((s, a) => s + a.valor,  0);

  // ── Série temporal ────────────────────────────────────────────────────────

  const showTimeSeries = periodoFiltro === 'todos';

  const { timeSeriesData, timeSeriesKeys } = useMemo(() => {
    if (!showTimeSeries || !pecasPreMat.length) return { timeSeriesData: [], timeSeriesKeys: [] };

    const cenarioToMonth = {};
    filteredPedidos.forEach(p => {
      const m = p.created_at?.slice(0, 7);
      (p.cenario_ids ?? []).forEach(cid => { cenarioToMonth[cid] = m; });
    });

    const top6Names = new Set(materiaisAggAll.slice(0, 6).map(m => m.nome));
    const hasOthers = materiaisAggAll.length > 6;

    const months = new Map();
    for (const peca of pecasPreMat) {
      const month = cenarioToMonth[peca.orcamento_id];
      if (!month) continue;
      const matNome = materiaisMap[peca.material_id ?? ''] ?? 'Sem material';
      const area    = peca.pecas?.area_liquida_m2 ?? 0;
      if (!months.has(month)) months.set(month, {});
      const entry = months.get(month);
      const key   = top6Names.has(matNome) ? matNome : 'Outros';
      entry[key]  = (entry[key] ?? 0) + area;
    }

    const data = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => {
        const [y, mo] = month.split('-');
        const label = new Date(+y, +mo - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        return { month: label, ...vals };
      });

    const keySet = new Set();
    data.forEach(d => Object.keys(d).filter(k => k !== 'month').forEach(k => keySet.add(k)));
    const keys = materiaisAggAll.slice(0, 6).map(m => m.nome).filter(n => keySet.has(n));
    if (hasOthers && keySet.has('Outros')) keys.push('Outros');

    return { timeSeriesData: data, timeSeriesKeys: keys };
  }, [showTimeSeries, filteredPedidos, pecasPreMat, materiaisAggAll, materiaisMap]);

  const semDados = !loading && pecasPreMat.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 min-h-full bg-zinc-50 dark:bg-[#050505]">

      {/* FILTROS — período + vendedor */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={periodoFiltro}  onChange={e => setPeriodoFiltro(e.target.value)}  className={SELECT_CLS}>
          {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)} className={SELECT_CLS}>
          <option value="todos">Todos os vendedores</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-[#0a0a0a] p-5 flex flex-col gap-2.5">
                <div className="sk h-2.5 w-20 rounded-sm" style={{ animationDelay: `${i * 80}ms` }} />
                <div className="sk h-8 w-14 rounded-sm" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                <div className="sk h-2 w-28 rounded-sm" style={{ animationDelay: `${i * 80 + 80}ms` }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="sk h-56 rounded-sm" />
            <div className="sk h-56 rounded-sm" />
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
      )}

      {/* Sem dados */}
      {semDados && (
        <div className="flex flex-col items-center py-24 gap-3">
          <iconify-icon icon="solar:chart-2-linear" width="36" className="text-zinc-300 dark:text-zinc-800"></iconify-icon>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">
            Nenhum pedido fechado no período
          </p>
        </div>
      )}

      {!loading && pecasPreMat.length > 0 && (
        <div className="space-y-4">

          {/* ── SEÇÃO SUPERIOR — Métricas e rankings ── */}

          {/* Linha 1: 4 cards de métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800">
            <MetricCard
              icon="solar:ruler-angular-linear"
              label="m² vendidos"
              value={fmtM2(totalAreaMat)}
              sub="área de pedra"
            />
            <MetricCard
              icon="solar:wallet-money-linear"
              label="Valor total"
              value={fmtBRL(totalValorMat)}
              yellow
            />
            <MetricCard
              icon="solar:star-linear"
              label="Material + vendido"
              value={topMaterial?.nome ?? '—'}
              sub={topMaterial ? `${fmtM2(topMaterial.area)} m²` : undefined}
            />
            <MetricCard
              icon="solar:chart-square-linear"
              label="Ticket médio"
              value={fmtBRL(avgTicket)}
              sub={`${filteredPedidos.length} pedido${filteredPedidos.length !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Linha 2: Top 3 Materiais + Top 3 Acabamentos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Top3Card
              title="Top Materiais"
              items={materiaisAggAll}
              valueKey="area"
              valueLabel="m²"
              maxRef={maxAreaAll}
              formatValue={fmtM2}
            />
            <Top3Card
              title="Top Acabamentos"
              items={acabamentosAggAll}
              valueKey="ml"
              valueLabel="ml"
              maxRef={maxMlAll}
              formatValue={fmtMl}
            />
          </div>

          {/* Evolução mensal (só quando Todos os períodos + >1 mês) */}
          {showTimeSeries && timeSeriesData.length > 1 && (
            <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-4">
                m² por material ao longo do tempo
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timeSeriesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={22}>
                  <XAxis dataKey="month" tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontFamily: 'monospace', fontSize: 9, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} width={44} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} formatter={(v, name) => [`${fmtM2(v)} m²`, name]} />
                  <Legend iconType="square" iconSize={7} wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, color: '#71717a', paddingTop: 8 }} />
                  {timeSeriesKeys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="s" fill={key === 'Outros' ? OUTROS_COLOR : CHART_COLORS[i % CHART_COLORS.length]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── SEÇÃO INFERIOR — Pesquisa detalhada ── */}
          <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-5 mt-2">

            {/* Cabeçalho da seção inferior */}
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] text-zinc-900 dark:text-white uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 px-2 py-1">
                Pesquisa detalhada
              </div>
              <input
                type="text"
                value={materialBusca}
                onChange={e => setMaterialBusca(e.target.value)}
                placeholder="Buscar material..."
                className={INPUT_CLS}
              />
            </div>

            <div className="space-y-4">

              {/* Tabela — Todos os Materiais */}
              <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_100px_44px] px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Material</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">m²</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">Valor</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">%</span>
                </div>
                {materiaisAgg.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum material encontrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-900 overflow-y-auto max-h-[400px]">
                    {materiaisAgg.map((m, i) => (
                      <div key={m.nome + i} className="grid grid-cols-[1fr_80px_100px_44px] items-center px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.01]">
                        <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{m.nome}</span>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-700 dark:text-zinc-300 text-right">{fmtM2(m.area)}</span>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-500 text-right">{fmtBRL(m.valor)}</span>
                        <span className="font-mono text-[9px] tabular-nums text-zinc-400 dark:text-zinc-600 text-right">
                          {totalAreaTab > 0 ? ((m.area / totalAreaTab) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_80px_100px_44px] items-center px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#050505]">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                    {materiaisAgg.length} material{materiaisAgg.length !== 1 ? 'is' : ''}
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">{fmtM2(totalAreaTab)}</span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">{fmtBRL(totalValorTab)}</span>
                  <span className="font-mono text-[9px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">100%</span>
                </div>
              </div>

              {/* Tabela — Todos os Acabamentos */}
              <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_100px_44px] px-4 py-3 border-b border-zinc-200/80 dark:border-zinc-800">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Acabamento</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">ml</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">Valor</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 text-right">%</span>
                </div>
                {acabamentosAgg.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum acabamento encontrado</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200/80 dark:divide-zinc-900">
                    {acabamentosAgg.map((a, i) => (
                      <div key={a.nome + i} className="grid grid-cols-[1fr_80px_100px_44px] items-center px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.01]">
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">{a.nome}</span>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-700 dark:text-zinc-300 text-right">{fmtMl(a.ml)}</span>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-500 text-right">{fmtBRL(a.valor)}</span>
                        <span className="font-mono text-[9px] tabular-nums text-zinc-400 dark:text-zinc-600 text-right">
                          {totalMlTab > 0 ? ((a.ml / totalMlTab) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_80px_100px_44px] items-center px-4 py-3 border-t border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#050505]">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                    {acabamentosAgg.length} tipo{acabamentosAgg.length !== 1 ? 's' : ''}
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">{fmtMl(totalMlTab)}</span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">{fmtBRL(totalValorAcab)}</span>
                  <span className="font-mono text-[9px] font-bold tabular-nums text-orange-600 dark:text-yellow-400 text-right">100%</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
