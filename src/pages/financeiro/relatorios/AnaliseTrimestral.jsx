import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

// ─── helpers ─────────────────────────────────────────────────────────────────

function limitesTrimestre(trim, ano) {
  const ini = { T1: 1, T2: 4, T3: 7, T4: 10 }[trim];
  const fim = { T1: 3, T2: 6, T3: 9, T4: 12 }[trim];
  return {
    inicio: `${ano}-${String(ini).padStart(2, '0')}-01`,
    fim:    new Date(ano, fim, 0).toISOString().slice(0, 10),
  };
}

function buildTree(categorias, valorMap) {
  const nos = new Map(categorias.map(c => [c.id, { ...c, valor: valorMap[c.id] ?? 0, filhos: [] }]));
  const raizes = [];
  for (const no of nos.values()) {
    if (no.pai_id && nos.has(no.pai_id)) nos.get(no.pai_id).filhos.push(no);
    else raizes.push(no);
  }
  function propagar(no) {
    if (!no.filhos.length) return no.valor;
    let s = no.valor;
    for (const f of no.filhos) s += propagar(f);
    no.valor = s;
    return s;
  }
  for (const r of raizes) propagar(r);
  return raizes;
}

function somarArvore(arv) { return arv.reduce((s, n) => s + n.valor, 0); }

function calcTrimestre(plano, lancs) {
  const map = {};
  for (const l of lancs) {
    if (!l.categoria_id) continue;
    map[l.categoria_id] = (map[l.categoria_id] ?? 0) + Number(l.valor_previsto ?? 0);
  }
  const filtrar = (tipo, extra) =>
    buildTree(plano.filter(c => c.tipo === tipo && (!extra || extra(c))), map);

  const arvReceita   = filtrar('receita');
  const arvTributo   = filtrar('tributo');
  const arvCustoVar  = filtrar('custo_variavel');
  const arvCustoFixo = filtrar('custo_fixo');
  const arvDespFin   = filtrar('financeiro', c => c.impacto_dre === 'negativo' && c.subtipo !== 'nao_dre');

  const rb  = somarArvore(arvReceita);
  const ded = somarArvore(arvTributo);
  const rl  = rb  - ded;
  const cv  = somarArvore(arvCustoVar);
  const mc  = rl  - cv;
  const cf  = somarArvore(arvCustoFixo);
  const ebi = mc  - cf;
  const df  = somarArvore(arvDespFin);
  const ll  = ebi - df;

  return { rb, ded, rl, cv, mc, cf, ebi, df, ll };
}

function varPct(atual, ant) {
  if (ant === 0 && atual === 0) return null;
  if (ant === 0) return null;
  return ((atual - ant) / Math.abs(ant)) * 100;
}

const LINHAS = [
  { key: 'rb',  label: 'Receita Bruta',                  tipo: 'receita'    },
  { key: 'ded', label: '(−) Deduções de Vendas',          tipo: 'tributo'    },
  { key: 'rl',  label: '(=) Receita Líquida',            tipo: 'subtotal'   },
  { key: 'cv',  label: '(−) Custos Variáveis Diretos',   tipo: 'custo_var'  },
  { key: 'mc',  label: '(=) Margem de Contribuição',     tipo: 'subtotal'   },
  { key: 'cf',  label: '(−) Custos Fixos',               tipo: 'custo_fixo' },
  { key: 'ebi', label: '(=) EBITDA',                     tipo: 'subtotal'   },
  { key: 'df',  label: '(−) Despesas Financeiras',       tipo: 'financeiro' },
  { key: 'll',  label: '(=) Lucro Líquido',              tipo: 'final'      },
];

const TRIMS = ['T1', 'T2', 'T3', 'T4'];

function corVariacao(pct) {
  if (pct === null) return 'text-zinc-600';
  if (Math.abs(pct) > 10) return pct >= 0 ? 'text-emerald-400' : 'text-red-400';
  return pct >= 0 ? 'text-emerald-600' : 'text-red-600';
}

function CelVar({ pct }) {
  if (pct === null) return <span className="text-zinc-700 font-mono text-[9px]">—</span>;
  const cor = corVariacao(pct);
  const destaque = Math.abs(pct) > 10;
  return (
    <span className={`font-mono text-[9px] tabular-nums flex items-center gap-0.5 ${cor} ${destaque ? 'font-bold' : ''}`}>
      <iconify-icon icon={pct >= 0 ? 'lucide:trending-up' : 'lucide:trending-down'} width="9"></iconify-icon>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AnaliseTrimestral() {
  const { profile } = useAuth();

  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [plano, setPlano] = useState([]);
  const [lancsPorTrim, setLancsPorTrim] = useState({});

  const carregar = useCallback(async () => {
    const empId = profile?.empresa_id;
    if (!empId) { setLoading(false); return; }
    setLoading(true);
    setErro(null);

    try {
      const [rPlano, ...rLancs] = await Promise.all([
        supabase
          .from('financeiro_plano_contas')
          .select('id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, ativo, ordem')
          .eq('empresa_id', empId)
          .eq('ativo', true)
          .order('ordem'),

        ...TRIMS.map(t => {
          const { inicio, fim } = limitesTrimestre(t, ano);
          return supabase
            .from('financeiro_lancamentos')
            .select('categoria_id, tipo, valor_previsto, status')
            .eq('empresa_id', empId)
            .neq('status', 'cancelado')
            .gte('competencia', inicio)
            .lte('competencia', fim);
        }),
      ]);

      if (rPlano.error) throw rPlano.error;
      for (const r of rLancs) if (r.error) throw r.error;

      setPlano(rPlano.data ?? []);
      const obj = {};
      TRIMS.forEach((t, i) => { obj[t] = rLancs[i].data ?? []; });
      setLancsPorTrim(obj);
    } catch (err) {
      const msg = err.message ?? 'Erro ao carregar análise trimestral';
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id, ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const resultados = useMemo(() => {
    if (!plano.length) return null;
    const r = {};
    for (const t of TRIMS) r[t] = calcTrimestre(plano, lancsPorTrim[t] ?? []);
    return r;
  }, [plano, lancsPorTrim]);

  if (loading) {
    return (
      <div className="border border-zinc-800 bg-[#0a0a0a] p-8 flex flex-col gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-4 bg-zinc-900 animate-pulse rounded" style={{ width: `${60 + (i % 4) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <div className="border border-zinc-800 p-10 flex flex-col items-center gap-3">
        <iconify-icon icon="lucide:alert-triangle" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{erro}</p>
        <button type="button" onClick={carregar} className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 border border-zinc-800 px-3 py-1.5 hover:bg-zinc-900 transition-colors">
          Tentar novamente
        </button>
      </div>
    );
  }

  const seletorAno = (
    <div className="flex items-center gap-3">
      <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Ano</label>
      <input
        type="number"
        min="2020"
        max="2099"
        value={ano}
        onChange={e => setAno(Number(e.target.value))}
        className="bg-[#0a0a0a] border border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-white outline-none focus:border-yellow-400 transition-colors w-24"
      />
      <span className="font-mono text-[9px] text-zinc-600">
        Regime de competência. Variações &gt;10% em negrito.
      </span>
    </div>
  );

  if (!resultados) {
    return (
      <div className="flex flex-col gap-4">
        {seletorAno}
        <div className="border border-zinc-800 bg-[#0a0a0a] p-12 flex flex-col items-center gap-3">
          <iconify-icon icon="lucide:bar-chart-2" width="28" className="text-zinc-700"></iconify-icon>
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">
            Nenhum dado encontrado para {ano}.
          </p>
          <p className="font-mono text-[8px] text-zinc-700 text-center max-w-xs">
            Verifique se o plano de contas foi configurado e se há lançamentos com campo
            "competência" dentro do ano selecionado.
          </p>
          <button
            type="button"
            onClick={carregar}
            className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 border border-zinc-800 px-3 py-1.5 hover:bg-zinc-900 transition-colors mt-1"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Controles */}
      {seletorAno}

      {/* Tabela */}
      <div className="border border-zinc-800 bg-[#0a0a0a] overflow-x-auto">

        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white">
            Análise Trimestral — {ano}
          </span>
        </div>

        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-2 pl-4 font-mono text-[8px] uppercase tracking-widest text-zinc-600">Indicador</th>
              {TRIMS.map(t => (
                <th key={t} className="text-right py-2 pr-3 font-mono text-[8px] uppercase tracking-widest text-zinc-600">{t}</th>
              ))}
              <th className="text-right py-2 pr-3 font-mono text-[8px] uppercase tracking-widest text-zinc-600">T1→T2</th>
              <th className="text-right py-2 pr-3 font-mono text-[8px] uppercase tracking-widest text-zinc-600">T2→T3</th>
              <th className="text-right py-2 pr-3 font-mono text-[8px] uppercase tracking-widest text-zinc-600">T3→T4</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS.map(linha => {
              const isSubtotal = linha.tipo === 'subtotal' || linha.tipo === 'final';
              const isFinal    = linha.tipo === 'final';
              const vals = TRIMS.map(t => resultados[t][linha.key]);
              const v12 = varPct(vals[1], vals[0]);
              const v23 = varPct(vals[2], vals[1]);
              const v34 = varPct(vals[3], vals[2]);

              const rowCls = isFinal
                ? 'bg-zinc-950 border-t-2 border-zinc-600 border-b border-zinc-800'
                : isSubtotal
                ? 'bg-zinc-950/60 border-t border-zinc-800 border-b border-zinc-800'
                : 'border-b border-zinc-900/50 hover:bg-zinc-900/20';

              const labelCls = isFinal
                ? 'font-mono text-[10px] font-bold text-white uppercase tracking-widest pl-4 py-3'
                : isSubtotal
                ? 'font-mono text-[10px] font-semibold text-zinc-300 uppercase tracking-wide pl-4 py-2.5'
                : 'text-sm text-zinc-400 pl-4 py-2';

              return (
                <tr key={linha.key} className={rowCls}>
                  <td className={labelCls}>{linha.label}</td>
                  {vals.map((v, i) => {
                    const corV = v < 0 ? 'text-red-400' : isFinal ? 'text-emerald-400' : isSubtotal ? 'text-blue-300' : 'text-zinc-300';
                    return (
                      <td key={i} className={`text-right pr-3 tabular-nums font-mono whitespace-nowrap ${isFinal ? 'py-3 text-base font-bold' : isSubtotal ? 'py-2.5 text-sm font-semibold' : 'py-2 text-sm'} ${corV}`}>
                        {v !== 0 ? formatBRL(Math.abs(v)) : <span className="text-zinc-700">—</span>}
                      </td>
                    );
                  })}
                  <td className="text-right pr-3 py-2 whitespace-nowrap"><CelVar pct={v12} /></td>
                  <td className="text-right pr-3 py-2 whitespace-nowrap"><CelVar pct={v23} /></td>
                  <td className="text-right pr-3 py-2 whitespace-nowrap"><CelVar pct={v34} /></td>
                </tr>
              );
            })}

            {/* Linha de % margem */}
            {(() => {
              const pctsMC = TRIMS.map(t => {
                const rl = resultados[t].rl;
                return rl ? (resultados[t].mc / rl * 100) : 0;
              });
              return (
                <tr className="border-b border-zinc-900/30 bg-zinc-950/30">
                  <td className="text-sm text-zinc-600 italic pl-4 py-2">% Margem de Contribuição</td>
                  {pctsMC.map((p, i) => (
                    <td key={i} className="text-right pr-3 font-mono text-[10px] tabular-nums text-zinc-500 py-2">
                      {p > 0 ? `${p.toFixed(1)}%` : '—'}
                    </td>
                  ))}
                  <td colSpan={3} />
                </tr>
              );
            })()}

            {/* Linha de % EBITDA */}
            {(() => {
              const pctsEBI = TRIMS.map(t => {
                const rl = resultados[t].rl;
                return rl ? (resultados[t].ebi / rl * 100) : 0;
              });
              return (
                <tr className="border-b border-zinc-900/30 bg-zinc-950/30">
                  <td className="text-sm text-zinc-600 italic pl-4 py-2">% EBITDA</td>
                  {pctsEBI.map((p, i) => (
                    <td key={i} className="text-right pr-3 font-mono text-[10px] tabular-nums text-zinc-500 py-2">
                      {p !== 0 ? `${p.toFixed(1)}%` : '—'}
                    </td>
                  ))}
                  <td colSpan={3} />
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[9px] text-zinc-700">
        Regime de competência. Variações acima de 10% em negrito. Sinais negativos indicam queda.
      </p>
    </div>
  );
}
