import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

const CHIP_BASE    = 'border px-3 py-1 font-mono text-[10px] uppercase tracking-widest cursor-pointer transition-colors';
const CHIP_INATIVO = 'border-zinc-800 text-zinc-500 hover:border-zinc-600';
const CHIP_ATIVO   = 'border-yellow-400 text-yellow-400';

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors [color-scheme:dark]';

const CAMPO_LABEL = {
  competencia:      'Competência',
  data_vencimento:  'Vencimento',
  data_pagamento:   'Pagamento',
};

// ─── helpers ────────────────────────────────────────────────────────────────

function mesAtualISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

function limitesMes(mesAno) {
  const [ano, mes] = mesAno.split('-').map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim    = new Date(ano, mes, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

function mesLabel(mesAno) {
  const [ano, mes] = mesAno.split('-').map(Number);
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${meses[mes - 1]} / ${ano}`;
}

// Constrói árvore hierárquica a partir de categorias + lançamentos
function construirArvore(categs, lancs, campoData) {
  // Map id → nó com valor zerado
  const nos = new Map();
  for (const c of categs) {
    nos.set(c.id, { ...c, valor: 0, filhos: [] });
  }

  // Soma lançamentos nas folhas
  for (const l of lancs) {
    if (!l.categoria_id || !nos.has(l.categoria_id)) continue;
    const v = campoData === 'data_pagamento'
      ? Number(l.valor_pago   ?? 0)
      : Number(l.valor_previsto ?? 0);
    nos.get(l.categoria_id).valor += v;
  }

  // Monta filhos
  const raizes = [];
  for (const no of nos.values()) {
    if (no.pai_id && nos.has(no.pai_id)) {
      nos.get(no.pai_id).filhos.push(no);
    } else {
      raizes.push(no);
    }
  }

  // Ordena filhos por código
  function ordenar(lista) {
    lista.sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? '', undefined, { numeric: true }));
    for (const no of lista) ordenar(no.filhos);
  }
  ordenar(raizes);

  // Propaga valores de folhas para pais (bottom-up)
  function somarFilhos(no) {
    if (no.filhos.length === 0) return no.valor;
    let soma = no.valor;
    for (const f of no.filhos) soma += somarFilhos(f);
    no.valor = soma;
    return soma;
  }
  for (const r of raizes) somarFilhos(r);

  return raizes;
}

// ─── sub-componentes ─────────────────────────────────────────────────────────

function LinhaCategoria({ no, nivel = 0 }) {
  const corValor = no.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400';
  const isRaiz   = nivel === 0;

  if (!isRaiz && no.valor === 0 && no.filhos.length === 0) return null;

  return (
    <>
      <tr className="border-b border-zinc-900/60">
        <td className="py-2" style={{ paddingLeft: `${16 + nivel * 20}px` }}>
          {isRaiz ? (
            <span className="font-mono text-xs uppercase tracking-widest text-white">
              {no.nome}
            </span>
          ) : (
            <span className={`text-sm ${nivel === 1 ? 'text-zinc-300' : 'text-zinc-500'}`}>
              {no.nome}
            </span>
          )}
        </td>
        <td className={`py-2 pr-4 text-right tabular-nums font-mono text-sm whitespace-nowrap ${
          isRaiz ? `font-bold ${corValor}` : corValor
        }`}>
          {no.valor !== 0 ? formatBRL(no.valor) : ''}
        </td>
      </tr>
      {no.filhos.map(f => (
        <LinhaCategoria key={f.id} no={f} nivel={nivel + 1} />
      ))}
    </>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export default function DRE() {
  const { profile } = useAuth();

  const [mesAno,    setMesAno]    = useState(mesAtualISO);
  const [campoData, setCampoData] = useState('competencia');
  const [arvore,    setArvore]    = useState([]);
  const [totalLancs, setTotalLancs] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState(null);

  const carregar = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoading(true);
    setErro(null);

    try {
      const { inicio, fim } = limitesMes(mesAno);

      const [{ data: lancs, error: errL }, { data: categs, error: errC }] = await Promise.all([
        supabase
          .from('financeiro_lancamentos')
          .select('valor_previsto, valor_pago, tipo, status, categoria_id')
          .eq('empresa_id', profile.empresa_id)
          .neq('status', 'cancelado')
          .gte(campoData, inicio)
          .lte(campoData, fim),
        supabase
          .from('financeiro_plano_contas')
          .select('id, codigo, nome, tipo, natureza, pai_id, aceita_lancamento, ativo')
          .eq('empresa_id', profile.empresa_id)
          .eq('ativo', true)
          .order('codigo'),
      ]);

      if (errL) throw errL;
      if (errC) throw errC;

      setArvore(construirArvore(categs ?? [], lancs ?? [], campoData));
      setTotalLancs(lancs?.length ?? 0);
    } catch (err) {
      setErro(err.message ?? 'Erro ao carregar DRE');
      toast.error('Erro ao carregar DRE');
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id, mesAno, campoData]);

  useEffect(() => { carregar(); }, [carregar]);

  // Totais para o resultado líquido
  const totalReceitas  = arvore.filter(n => n.tipo === 'receita').reduce((s, n) => s + n.valor, 0);
  const totalDespesas  = arvore.filter(n => n.tipo === 'despesa').reduce((s, n) => s + n.valor, 0);
  const resultado      = totalReceitas - totalDespesas;
  const corResultado   = resultado >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="flex flex-col gap-5">

      {/* Controles */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Agrupar por</span>
          {(['competencia', 'data_vencimento', 'data_pagamento'] ).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setCampoData(v)}
              className={`${CHIP_BASE} ${campoData === v ? CHIP_ATIVO : CHIP_INATIVO}`}
            >
              {CAMPO_LABEL[v]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Mês</span>
          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className={INPUT_BASE + ' w-auto'}
          />
        </div>
      </div>

      {/* Tabela DRE */}
      <div className="border border-zinc-800 bg-[#0a0a0a]">

        {/* Título interno */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white">
            DRE — {mesLabel(mesAno)}
          </span>
          {!loading && (
            <span className="font-mono text-[9px] text-zinc-600">
              {totalLancs} lançamento{totalLancs !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-zinc-800 animate-pulse rounded"
                style={{ width: `${60 + (i % 3) * 15}%`, marginLeft: `${(i % 2) * 20}px` }}
              />
            ))}
          </div>
        ) : erro ? (
          <div className="p-10 flex flex-col items-center gap-3">
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
        ) : arvore.length === 0 ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <iconify-icon icon="lucide:file-bar-chart" width="28" className="text-zinc-700"></iconify-icon>
            <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">
              Nenhum lançamento no período selecionado.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full border-collapse">
              <tbody>
                {arvore.map(no => (
                  <LinhaCategoria key={no.id} no={no} nivel={0} />
                ))}
              </tbody>
            </table>

            {/* Resultado líquido */}
            <div className="border-t-2 border-zinc-700 bg-[#0a0a0a] px-4 py-5 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-white">
                Resultado Líquido
              </span>
              <span className={`text-2xl font-bold tabular-nums tracking-tighter ${corResultado}`}>
                {formatBRL(Math.abs(resultado))}
                <span className="font-mono text-[9px] ml-1 opacity-60">
                  {resultado >= 0 ? 'lucro' : 'prejuízo'}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Nota de rodapé */}
      <p className="font-mono text-[9px] text-zinc-600">
        DRE em regime de {CAMPO_LABEL[campoData].toLowerCase()}.
        Valores baseados em {campoData === 'data_pagamento' ? 'valor_pago' : 'valor_previsto'}.
        Lançamentos cancelados excluídos.
      </p>
    </div>
  );
}
