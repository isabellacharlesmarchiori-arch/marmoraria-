import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import FiltrosLancamentos from './lancamentos/FiltrosLancamentos';
import TabelaLancamentos from './lancamentos/TabelaLancamentos';

// ─── helpers ────────────────────────────────────────────────────────────────

function toLookup(arr) {
  return Object.fromEntries((arr ?? []).map(r => [r.id, r.nome]));
}

function toParceiroMap(arr) {
  return Object.fromEntries(
    (arr ?? []).map(p => [p.id, { nome: p.nome, tipos: p.tipos }])
  );
}

function uniqIds(lancamentos, campo) {
  return [...new Set(lancamentos.map(l => l[campo]).filter(Boolean))];
}

function filtroPeriodoDefault() {
  const hoje  = new Date();
  const y     = hoje.getFullYear();
  const m     = hoje.getMonth();
  return {
    primeiro: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    ultimo:   new Date(y, m + 1, 0).toISOString().split('T')[0],
  };
}

const { primeiro, ultimo } = filtroPeriodoDefault();

const FILTROS_DEFAULT = {
  tipo:           'todos',
  status:         'todos',
  campoData:      'data_vencimento',
  periodoInicio:  primeiro,
  periodoFim:     ultimo,
  categoriaId:    null,
  parceiroId:     null,
  origemParceiro: null,
  contaId:        null,
  projetoId:      null,
  busca:          '',
};

const LOOKUPS_VAZIO = {
  categorias: {}, parceiros: {}, arquitetos: {},
  clientes:   {}, contas:    {}, projetos:   {},
};

const OPCOES_VAZIO = {
  categorias: [], parceirosPublicos: [], arquitetos: [],
  clientes:   [], contas:            [], projetos:   [],
};

// ─── componente ─────────────────────────────────────────────────────────────

export default function FinanceiroLancamentos() {
  const { profile } = useAuth();

  const [filtros,        setFiltros]       = useState(FILTROS_DEFAULT);
  const [lancamentos,    setLancamentos]   = useState([]);
  const [lookups,        setLookups]       = useState(LOOKUPS_VAZIO);
  const [opcoesFiltro,   setOpcoesFiltro]  = useState(OPCOES_VAZIO);
  const [loading,        setLoading]       = useState(true);
  const [erro,           setErro]          = useState(null);
  const [limit,          setLimit]         = useState(50);
  const [totalCount,     setTotalCount]    = useState(null);
  const [temMais,        setTemMais]       = useState(false);

  // Ref pra leitura de lookups em efeitos sem incluí-lo nas dependências
  const lookupsRef = useRef(lookups);
  useEffect(() => { lookupsRef.current = lookups; });

  // ── wrapper que reseta o limit ao trocar filtros ──
  function atualizarFiltros(novosFiltros) {
    setFiltros(novosFiltros);
    setLimit(50);
  }

  // ── query principal ──────────────────────────────────────────────────────
  const carregarLancamentos = useCallback(async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;

    setLoading(true);
    setErro(null);

    const hoje = new Date().toISOString().slice(0, 10);

    let q = supabase
      .from('financeiro_lancamentos')
      .select(
        `id, tipo, status, descricao, valor_previsto, valor_pago, valor_liquido,
         data_emissao, data_vencimento, data_pagamento, competencia,
         categoria_id, parceiro_id, arquiteto_id, cliente_id,
         conta_id, projeto_id, forma_pagamento, bloqueado_ate_pagamento_projeto, origem`,
        { count: 'exact' }
      )
      .eq('empresa_id', empresaId)
      .neq('status', 'cancelado')
      .gte(filtros.campoData, filtros.periodoInicio)
      .lte(filtros.campoData, filtros.periodoFim);

    if (filtros.tipo !== 'todos')      q = q.eq('tipo', filtros.tipo);
    if (filtros.status === 'pendente') q = q.eq('status', 'pendente');
    if (filtros.status === 'pago')     q = q.eq('status', 'pago');
    if (filtros.status === 'atrasado') {
      q = q.or(`status.eq.atrasado,and(status.eq.pendente,data_vencimento.lt.${hoje})`);
    }
    if (filtros.categoriaId) q = q.eq('categoria_id', filtros.categoriaId);
    if (filtros.contaId)     q = q.eq('conta_id',     filtros.contaId);
    if (filtros.projetoId)   q = q.eq('projeto_id',   filtros.projetoId);
    if (filtros.busca)       q = q.ilike('descricao', `%${filtros.busca}%`);
    if (filtros.parceiroId) {
      const col =
        filtros.origemParceiro === 'parceiro'  ? 'parceiro_id'  :
        filtros.origemParceiro === 'arquiteto' ? 'arquiteto_id' : 'cliente_id';
      q = q.eq(col, filtros.parceiroId);
    }

    const { data, error, count } = await q
      .order(filtros.campoData, { ascending: false, nullsFirst: false })
      .limit(limit + 1);

    if (error) {
      setErro(error.message);
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const temMaisRegistros = (data?.length ?? 0) > limit;
    const slice            = temMaisRegistros ? data.slice(0, limit) : (data ?? []);

    setLancamentos(slice);
    setTemMais(temMaisRegistros);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [filtros, limit, profile?.empresa_id]);

  useEffect(() => { carregarLancamentos(); }, [carregarLancamentos]);

  // ── lookups iniciais (dropdowns) ─────────────────────────────────────────
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;

    async function loadOpcoes() {
      const [catR, parR, arqR, cliR, contaR, projR] = await Promise.all([
        supabase.from('financeiro_plano_contas')
          .select('id, nome').eq('empresa_id', empresaId)
          .eq('aceita_lancamento', true).eq('ativo', true).order('nome'),
        supabase.from('parceiros_publicos')
          .select('id, nome, tipos').eq('ativo', true).order('nome'),
        supabase.from('arquitetos')
          .select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('clientes')
          .select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('financeiro_contas')
          .select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
        supabase.from('projetos')
          .select('id, nome').eq('empresa_id', empresaId).order('nome'),
      ]);

      setOpcoesFiltro({
        categorias:        catR.data   ?? [],
        parceirosPublicos: parR.data   ?? [],
        arquitetos:        arqR.data   ?? [],
        clientes:          cliR.data   ?? [],
        contas:            contaR.data ?? [],
        projetos:          projR.data  ?? [],
      });

      setLookups(prev => ({
        categorias: { ...prev.categorias, ...toLookup(catR.data) },
        parceiros:  { ...prev.parceiros,  ...toParceiroMap(parR.data) },
        arquitetos: { ...prev.arquitetos, ...toLookup(arqR.data) },
        clientes:   { ...prev.clientes,   ...toLookup(cliR.data) },
        contas:     { ...prev.contas,     ...toLookup(contaR.data) },
        projetos:   { ...prev.projetos,   ...toLookup(projR.data) },
      }));
    }

    loadOpcoes();
  }, [profile?.empresa_id]);

  // ── lookups incrementais (ids ausentes nos resultados) ───────────────────
  useEffect(() => {
    if (!lancamentos.length || !profile?.empresa_id) return;
    const cur = lookupsRef.current;

    const missing = {
      categorias: uniqIds(lancamentos, 'categoria_id').filter(id => !cur.categorias[id]),
      parceiros:  uniqIds(lancamentos, 'parceiro_id').filter(id => !cur.parceiros[id]),
      arquitetos: uniqIds(lancamentos, 'arquiteto_id').filter(id => !cur.arquitetos[id]),
      clientes:   uniqIds(lancamentos, 'cliente_id').filter(id => !cur.clientes[id]),
      contas:     uniqIds(lancamentos, 'conta_id').filter(id => !cur.contas[id]),
      projetos:   uniqIds(lancamentos, 'projeto_id').filter(id => !cur.projetos[id]),
    };

    if (!Object.values(missing).some(a => a.length > 0)) return;

    async function fetchMissing() {
      const tasks = [];
      if (missing.categorias.length) tasks.push(['categorias', supabase.from('financeiro_plano_contas').select('id, nome').in('id', missing.categorias)]);
      if (missing.parceiros.length)  tasks.push(['parceiros',  supabase.from('parceiros_publicos').select('id, nome, tipos').in('id', missing.parceiros)]);
      if (missing.arquitetos.length) tasks.push(['arquitetos', supabase.from('arquitetos').select('id, nome').in('id', missing.arquitetos)]);
      if (missing.clientes.length)   tasks.push(['clientes',   supabase.from('clientes').select('id, nome').in('id', missing.clientes)]);
      if (missing.contas.length)     tasks.push(['contas',     supabase.from('financeiro_contas').select('id, nome').in('id', missing.contas)]);
      if (missing.projetos.length)   tasks.push(['projetos',   supabase.from('projetos').select('id, nome').in('id', missing.projetos)]);

      const results = await Promise.all(tasks.map(([, q]) => q));

      setLookups(prev => {
        const next = { ...prev };
        tasks.forEach(([key], i) => {
          const data = results[i].data ?? [];
          if (key === 'parceiros') {
            next.parceiros = { ...next.parceiros, ...toParceiroMap(data) };
          } else {
            next[key] = { ...next[key], ...toLookup(data) };
          }
        });
        return next;
      });
    }

    fetchMissing();
  }, [lancamentos, profile?.empresa_id]); // lookupsRef é lido via ref, não como dep

  // ── guard de perfil ──────────────────────────────────────────────────────
  if (profile?.perfil === 'medidor') {
    return (
      <div className="p-6">
        <p className="text-zinc-500 font-mono text-sm">Acesso restrito.</p>
      </div>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white border border-zinc-800 w-max px-2 py-1">
          Lançamentos
        </span>
        <button
          type="button"
          onClick={() => toast.info('Novo lançamento em breve')}
          className="bg-yellow-400 text-black px-4 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-yellow-300 transition-colors"
        >
          + Novo lançamento
        </button>
      </div>

      {/* Filtros */}
      <FiltrosLancamentos
        filtros={filtros}
        setFiltros={atualizarFiltros}
        categorias={opcoesFiltro.categorias}
        parceirosPublicos={opcoesFiltro.parceirosPublicos}
        arquitetos={opcoesFiltro.arquitetos}
        clientes={opcoesFiltro.clientes}
        contas={opcoesFiltro.contas}
        projetos={opcoesFiltro.projetos}
      />

      {/* Contador */}
      {!loading && totalCount !== null && (
        <p className="font-mono text-xs text-zinc-500">
          {totalCount} {totalCount === 1 ? 'lançamento' : 'lançamentos'} no período
        </p>
      )}

      {/* Tabela */}
      <TabelaLancamentos
        lancamentos={lancamentos}
        lookups={lookups}
        loading={loading}
        erro={erro}
        onRecarregar={carregarLancamentos}
        campoData={filtros.campoData}
      />

      {/* Carregar mais */}
      {temMais && !loading && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setLimit(l => l + 50)}
            className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors border border-zinc-800 px-4 py-2"
          >
            Carregar mais 50
            {totalCount !== null && (
              <span className="ml-2 text-zinc-600">
                (total: {lancamentos.length} de {totalCount})
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
