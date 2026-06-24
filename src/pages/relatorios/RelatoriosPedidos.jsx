import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { fmtBRL } from '../../utils/projetoUtils';

// Normaliza qualquer variação de capitalização/acentuação já salva no banco
const FORMAS = {
  pix:           'PIX',
  PIX:           'PIX',
  transferencia: 'Transferência',
  Transferência: 'Transferência',
  transferência: 'Transferência',
  dinheiro:      'Dinheiro',
  Dinheiro:      'Dinheiro',
  cartao:        'Cartão',
  Cartão:        'Cartão',
  cartão:        'Cartão',
  cheque:        'Cheque',
  Cheque:        'Cheque',
  a_vista:       'À vista',
  'a vista':     'À vista',
};

const STATUS_CFG = {
  FECHADO:   { label: 'Fechado',   cls: 'border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20' },
  REVERTIDO: { label: 'Revertido', cls: 'border-zinc-200/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-500 bg-white dark:bg-zinc-900/40' },
};

const GRID = 'grid grid-cols-[40px_1fr_1fr_1fr_100px_130px_120px_90px]';

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

const COLS = [
  { key: 'seq',            label: '#',          sort: false },
  { key: 'projeto',        label: 'Projeto',    sort: true  },
  { key: 'cliente',        label: 'Cliente',    sort: true  },
  { key: 'vendedor',       label: 'Vendedor',   sort: true  },
  { key: 'created_at',     label: 'Fechamento', sort: true  },
  { key: 'valor',          label: 'Valor',      sort: true  },
  { key: 'forma_pagamento',label: 'Pagamento',  sort: false },
  { key: 'status',         label: 'Status',     sort: false },
];

export default function RelatoriosPedidos() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;

  const [pedidos,    setPedidos]    = useState([]);
  const [orcsMap,    setOrcsMap]    = useState({});
  const [vendedores, setVendedores] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const [periodoFiltro,  setPeriodoFiltro]  = useState('todos');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');
  const [statusFiltro,   setStatusFiltro]   = useState('todos');
  const [sort, setSort] = useState({ col: 'created_at', dir: 'desc' });

  useEffect(() => {
    if (!empresaId) return;
    let mounted = true;
    async function load() {
      setLoading(true);

      // Etapa 1: pedidos sem joins
      const { data: pedidosRaw } = await supabase
        .from('pedidos_fechados')
        .select('id, projeto_id, cenario_ids, forma_pagamento, parcelas, status, created_at')
        .order('created_at', { ascending: false });
      if (!mounted) return;

      const pedidosData = pedidosRaw ?? [];
      const projetoIds  = [...new Set(pedidosData.map(p => p.projeto_id).filter(Boolean))];

      // Etapa 2: projetos + clientes (sem usuarios — FK não registrada)
      // Etapa 3: vendedores da empresa para o dropdown e lookup por id
      const [resProjetos, resVend] = await Promise.all([
        projetoIds.length > 0
          ? supabase.from('projetos').select('id, nome, vendedor_id, clientes(nome)').in('id', projetoIds)
          : Promise.resolve({ data: [] }),
        supabase.from('usuarios').select('id, nome').eq('empresa_id', empresaId)
          .in('perfil', ['vendedor', 'admin', 'admin_medidor', 'vendedor_medidor']).order('nome'),
      ]);
      if (!mounted) return;

      const projetosMap  = Object.fromEntries((resProjetos.data ?? []).map(p => [p.id, p]));
      const vendedoresArr = resVend.data ?? [];
      const vendMap      = Object.fromEntries(vendedoresArr.map(v => [v.id, v]));
      setVendedores(vendedoresArr);

      // Merge: enriquecer cada pedido com dados do projeto/cliente/vendedor
      const pedidosEnriquecidos = pedidosData.map(p => {
        const proj = projetosMap[p.projeto_id] ?? null;
        return {
          ...p,
          _projeto_nome:  proj?.nome ?? null,
          _cliente_nome:  proj?.clientes?.nome ?? null,
          _vendedor_id:   proj?.vendedor_id ?? null,
          _vendedor_nome: proj?.vendedor_id ? (vendMap[proj.vendedor_id]?.nome ?? null) : null,
        };
      });

      // Etapa 4: valores dos orçamentos (cenario_ids)
      const allCenarioIds = [...new Set(pedidosData.flatMap(p => p.cenario_ids ?? []))];
      let orcsMapLocal = {};
      if (allCenarioIds.length > 0) {
        const { data: orcs } = await supabase
          .from('orcamentos').select('id, valor_total').in('id', allCenarioIds);
        if (orcs) {
          orcsMapLocal = Object.fromEntries(orcs.map(o => [o.id, o.valor_total ?? 0]));
          const encontrados = new Set(orcs.map(o => o.id));
          const faltando = allCenarioIds.filter(id => !encontrados.has(id));
          if (faltando.length > 0) console.warn('[PEDIDOS] cenario_ids sem orçamento encontrado:', faltando);
        }
      }
      if (!mounted) return;

      setOrcsMap(orcsMapLocal);
      setPedidos(pedidosEnriquecidos);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [empresaId]);

  // Número sequencial global: 1 = mais antigo
  const seqMap = useMemo(() => {
    const sorted = [...pedidos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return Object.fromEntries(sorted.map((p, i) => [p.id, i + 1]));
  }, [pedidos]);

  function toggleSort(col) {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'desc' }
    );
  }

  const filtered = useMemo(() => {
    let rows = pedidos.map(p => ({
      ...p,
      _valor: (p.cenario_ids ?? []).reduce((s, cid) => s + (orcsMap[cid] ?? 0), 0),
    }));

    if (periodoFiltro !== 'todos') {
      const [ano, mes] = periodoFiltro.split('-').map(Number);
      rows = rows.filter(p => {
        const d = new Date(p.created_at);
        return d.getFullYear() === ano && d.getMonth() + 1 === mes;
      });
    }
    if (vendedorFiltro !== 'todos') {
      rows = rows.filter(p => p._vendedor_id === vendedorFiltro);
    }
    if (statusFiltro !== 'todos') {
      rows = rows.filter(p => p.status === statusFiltro);
    }

    rows.sort((a, b) => {
      let va, vb;
      if (sort.col === 'created_at') { va = new Date(a.created_at).getTime(); vb = new Date(b.created_at).getTime(); }
      else if (sort.col === 'projeto')  { va = a._projeto_nome ?? ''; vb = b._projeto_nome ?? ''; }
      else if (sort.col === 'cliente')  { va = a._cliente_nome ?? ''; vb = b._cliente_nome ?? ''; }
      else if (sort.col === 'vendedor') { va = a._vendedor_nome ?? ''; vb = b._vendedor_nome ?? ''; }
      else if (sort.col === 'valor')    { va = a._valor; vb = b._valor; }
      else return 0;
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [pedidos, orcsMap, periodoFiltro, vendedorFiltro, statusFiltro, sort]);

  const totalValor = filtered.reduce((s, p) => s + p._valor, 0);

  const fmtData = iso => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const fmtPagto = (v, parc) => {
    // Normaliza capitalização antes de lookup para cobrir variações salvas antes do FORMAS ser completo
    const chave = v?.trim() ?? '';
    const nome = FORMAS[chave] ?? FORMAS[chave.toLowerCase()] ?? (chave || '—');
    return parc ? `${nome} · ${parc}x` : nome;
  };

  const SortIcon = ({ col }) => sort.col === col
    ? <iconify-icon icon={sort.dir === 'asc' ? 'solar:sort-from-bottom-to-top-linear' : 'solar:sort-from-top-to-bottom-linear'} width="10" className="text-orange-600 dark:text-yellow-400 shrink-0"></iconify-icon>
    : <iconify-icon icon="solar:sort-linear" width="10" className="text-zinc-300 dark:text-zinc-700 shrink-0"></iconify-icon>;

  const selectCls = 'bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] uppercase tracking-wide px-3 py-2 focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none';

  return (
    <div className="p-6 space-y-4 min-h-full bg-zinc-50 dark:bg-[#050505]">

      {/* Título */}
      <div className="font-mono text-[10px] text-zinc-900 dark:text-white uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 w-max px-2 py-1">
        Pedidos Fechados
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select value={periodoFiltro}  onChange={e => setPeriodoFiltro(e.target.value)}  className={selectCls}>
          {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)} className={selectCls}>
          <option value="todos">Todos os vendedores</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
        <select value={statusFiltro}   onChange={e => setStatusFiltro(e.target.value)}   className={selectCls}>
          <option value="todos">Todos os status</option>
          <option value="FECHADO">Fechado</option>
          <option value="REVERTIDO">Revertido</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-x-auto">

        {/* Cabeçalho */}
        <div className={`${GRID} min-w-[820px] border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-[#0a0a0a]`}>
          {COLS.map(col => (
            <div
              key={col.key}
              onClick={col.sort ? () => toggleSort(col.key) : undefined}
              className={`px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 flex items-center gap-1 ${col.sort ? 'cursor-pointer hover:text-zinc-900 dark:hover:text-white select-none' : ''}`}
            >
              {col.label}
              {col.sort && <SortIcon col={col.key} />}
            </div>
          ))}
        </div>

        {/* Corpo — loading */}
        {loading && (
          <div className="min-w-[820px]">
            {[0,1,2,3,4].map(i => (
              <div key={i} className={`${GRID} border-b border-zinc-200/80 dark:border-zinc-900 px-4 py-3 items-center`}>
                {[24,120,100,80,70,80,70,60].map((w, j) => (
                  <div key={j} className="sk h-3 rounded-sm" style={{ width: w, animationDelay: `${j*40}ms` }}></div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Corpo — vazio */}
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center min-w-[820px]">
            <iconify-icon icon="solar:document-text-linear" width="32" className="text-zinc-300 dark:text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhum pedido encontrado</p>
          </div>
        )}

        {/* Corpo — dados */}
        {!loading && filtered.length > 0 && (
          <div className="min-w-[820px]">
            {filtered.map((p, idx) => {
              const st = STATUS_CFG[p.status] ?? STATUS_CFG.FECHADO;
              return (
                <div
                  key={p.id}
                  className={`${GRID} items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.015] transition-colors ${idx < filtered.length - 1 ? 'border-b border-zinc-200/80 dark:border-zinc-900' : ''}`}
                >
                  <div className="px-4 py-3 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{seqMap[p.id]}</div>
                  <div className="px-4 py-3 truncate pr-2" title={p._projeto_nome ?? 'Projeto removido'}>
                    {p._projeto_nome
                      ? <span className="text-sm font-medium text-zinc-900 dark:text-white">{p._projeto_nome}</span>
                      : <span className="font-mono text-[10px] italic text-zinc-400 dark:text-zinc-600">Projeto removido</span>}
                  </div>
                  <div className="px-4 py-3 font-mono text-[10px] truncate pr-2">
                    {p._cliente_nome
                      ? <span className="text-zinc-500 dark:text-zinc-400">{p._cliente_nome}</span>
                      : <span className="italic text-zinc-400 dark:text-zinc-600">—</span>}
                  </div>
                  <div className="px-4 py-3 font-mono text-[10px] truncate pr-2">
                    {p._vendedor_nome
                      ? <span className="text-zinc-500 dark:text-zinc-400">{p._vendedor_nome.split(' ')[0]}</span>
                      : <span className="italic text-zinc-400 dark:text-zinc-600">—</span>}
                  </div>
                  <div className="px-4 py-3 font-mono text-[10px] text-zinc-500 dark:text-zinc-500 tabular-nums">{fmtData(p.created_at)}</div>
                  <div className="px-4 py-3 font-mono text-[11px] font-semibold text-zinc-900 dark:text-white tabular-nums">{p._valor > 0 ? fmtBRL(p._valor) : '—'}</div>
                  <div className="px-4 py-3 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{fmtPagto(p.forma_pagamento, p.parcelas)}</div>
                  <div className="px-4 py-3">
                    <span className={`inline-block border font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé — totais */}
        {!loading && filtered.length > 0 && (
          <div className={`${GRID} min-w-[820px] border-t border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#0a0a0a]`}>
            <div className="col-span-5 px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
              {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
            </div>
            <div className="px-4 py-3 font-mono text-[11px] font-bold text-orange-600 dark:text-yellow-400 tabular-nums">
              {fmtBRL(totalValor)}
            </div>
            <div className="col-span-2" />
          </div>
        )}
      </div>
    </div>
  );
}
