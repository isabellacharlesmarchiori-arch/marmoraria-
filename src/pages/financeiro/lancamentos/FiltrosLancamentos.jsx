import { useState, useEffect, useMemo } from 'react';

const TIPO_BRACKET = {
  fornecedor:  'Fornecedor',
  funcionario: 'Funcionário',
  terceiro:    'Terceiro',
};

const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function mesAtualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesOffsetISO(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMesLabel(mesISO) {
  if (!mesISO) return '';
  const [ano, mes] = mesISO.split('-');
  return `${MESES_PT[Number(mes) - 1]}/${ano}`;
}

function getFiltroDefault() {
  const hoje  = new Date();
  const y     = hoje.getFullYear();
  const m     = hoje.getMonth();
  return {
    tipo:           'todos',
    status:         'todos',
    campoData:      'data_vencimento',
    modoPeriodo:    'mes',
    mesFiltro:      mesAtualISO(),
    periodoInicio:  `${y}-${String(m + 1).padStart(2, '0')}-01`,
    periodoFim:     new Date(y, m + 1, 0).toISOString().split('T')[0],
    categoriaId:    null,
    parceiroId:     null,
    origemParceiro: null,
    contaId:        null,
    projetoId:      null,
    busca:          '',
  };
}

const CHIP_BASE    = 'border px-3 py-1 font-mono text-[10px] uppercase tracking-widest cursor-pointer transition-colors';
const CHIP_INATIVO = 'border-zinc-800 text-zinc-500 hover:border-zinc-600';
const CHIP_ATIVO   = 'border-yellow-400 text-yellow-400';

const SELECT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full cursor-pointer';

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full [color-scheme:dark]';

export default function FiltrosLancamentos({
  filtros,
  setFiltros,
  categorias,
  parceirosPublicos,
  arquitetos,
  clientes,
  contas,
  projetos,
}) {
  const [avancadoAberto, setAvancadoAberto] = useState(false);
  const [buscaLocal, setBuscaLocal]         = useState(filtros.busca);

  useEffect(() => { setBuscaLocal(filtros.busca); }, [filtros.busca]);

  const temFiltroAvancado = !!(
    filtros.categoriaId || filtros.parceiroId ||
    filtros.contaId     || filtros.projetoId  || filtros.busca
  );

  const parceiroOptions = useMemo(() => {
    const opts = [];
    for (const p of parceirosPublicos) {
      const tipo = TIPO_BRACKET[p.tipos?.[0]] ?? 'Parceiro';
      opts.push({ value: `parceiro:${p.id}`, label: `[${tipo}] ${p.nome}` });
    }
    for (const a of arquitetos) {
      opts.push({ value: `arquiteto:${a.id}`, label: `[Arquiteto] ${a.nome}` });
    }
    for (const c of clientes) {
      opts.push({ value: `cliente:${c.id}`, label: `[Cliente] ${c.nome}` });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [parceirosPublicos, arquitetos, clientes]);

  const parceiroValue = filtros.parceiroId
    ? `${filtros.origemParceiro}:${filtros.parceiroId}`
    : '';

  function handleParceiroChange(e) {
    const val = e.target.value;
    if (!val) {
      setFiltros({ ...filtros, parceiroId: null, origemParceiro: null });
      return;
    }
    const colonIdx = val.indexOf(':');
    setFiltros({
      ...filtros,
      parceiroId:     val.slice(colonIdx + 1),
      origemParceiro: val.slice(0, colonIdx),
    });
  }

  function handleBuscaCommit() {
    if (buscaLocal !== filtros.busca) {
      setFiltros({ ...filtros, busca: buscaLocal });
    }
  }

  function limpar() {
    setFiltros(getFiltroDefault());
    setAvancadoAberto(false);
  }

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]">
      {/* Faixa principal */}
      <div className="p-4 flex flex-col gap-3">

        {/* Chips de tipo */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mr-1">Tipo</span>
          {[
            { v: 'todos',   l: 'Todos'  },
            { v: 'entrada', l: 'Entrada' },
            { v: 'saida',   l: 'Saída'  },
          ].map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltros({ ...filtros, tipo: v })}
              className={`${CHIP_BASE} ${filtros.tipo === v ? CHIP_ATIVO : CHIP_INATIVO}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Chips de status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mr-1">Status</span>
          {[
            { v: 'todos',    l: 'Todos'     },
            { v: 'pendente', l: 'Pendentes' },
            { v: 'pago',     l: 'Pagos'     },
            { v: 'atrasado', l: 'Atrasados' },
          ].map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltros({ ...filtros, status: v })}
              className={`${CHIP_BASE} ${filtros.status === v ? CHIP_ATIVO : CHIP_INATIVO}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* ── Período ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">

          {/* Linha 1: rótulo + campo DB + toggle modo + ações */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Período por</span>

            <select
              value={filtros.campoData}
              onChange={e => setFiltros({ ...filtros, campoData: e.target.value })}
              className="bg-[#0a0a0a] border border-zinc-800 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-zinc-500 outline-none focus:border-yellow-400 cursor-pointer transition-colors"
            >
              <option value="data_vencimento">Vencimento</option>
              <option value="data_pagamento">Pagamento</option>
              <option value="competencia">Competência</option>
            </select>

            {/* Toggle Mês / Intervalo */}
            <div className="flex items-center border border-zinc-800 overflow-hidden">
              {[['mes','Mês único'],['intervalo','Intervalo']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFiltros({ ...filtros, modoPeriodo: v })}
                  className={`px-3 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                    filtros.modoPeriodo === v
                      ? 'bg-yellow-400 text-black'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAvancadoAberto(a => !a)}
                className={`flex items-center gap-1 ${CHIP_BASE} ${
                  avancadoAberto || temFiltroAvancado ? CHIP_ATIVO : CHIP_INATIVO
                }`}
              >
                {temFiltroAvancado && !avancadoAberto && (
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                )}
                {avancadoAberto ? '− Menos filtros' : '+ Mais filtros'}
                <iconify-icon
                  icon={avancadoAberto ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                  width="10"
                ></iconify-icon>
              </button>

              <button
                type="button"
                onClick={limpar}
                className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Linha 2a: Filtro por mês único */}
          <div className={`flex items-center gap-2 flex-wrap transition-opacity ${
            filtros.modoPeriodo !== 'mes' ? 'opacity-30 pointer-events-none select-none' : ''
          }`}>
            <input
              type="month"
              value={filtros.mesFiltro}
              onChange={e => setFiltros({ ...filtros, mesFiltro: e.target.value })}
              className={INPUT_BASE + ' w-auto'}
            />
            {filtros.mesFiltro && (
              <span className="font-mono text-[9px] text-zinc-500">
                {formatMesLabel(filtros.mesFiltro)}
              </span>
            )}
            {[
              { offset: -1, label: 'Mês ant.' },
              { offset:  0, label: 'Mês atual' },
              { offset: +1, label: 'Próx. mês' },
            ].map(({ offset, label }) => (
              <button
                key={offset}
                type="button"
                onClick={() => setFiltros({ ...filtros, modoPeriodo: 'mes', mesFiltro: mesOffsetISO(offset) })}
                className={`${CHIP_BASE} ${
                  filtros.modoPeriodo === 'mes' && filtros.mesFiltro === mesOffsetISO(offset)
                    ? CHIP_ATIVO
                    : CHIP_INATIVO
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Linha 2b: Filtro por intervalo de datas */}
          <div className={`flex items-center gap-2 flex-wrap transition-opacity ${
            filtros.modoPeriodo !== 'intervalo' ? 'opacity-30 pointer-events-none select-none' : ''
          }`}>
            <input
              type="date"
              value={filtros.periodoInicio}
              onChange={e => setFiltros({ ...filtros, periodoInicio: e.target.value })}
              className={INPUT_BASE + ' w-auto'}
            />
            <span className="font-mono text-[9px] text-zinc-600">até</span>
            <input
              type="date"
              value={filtros.periodoFim}
              onChange={e => setFiltros({ ...filtros, periodoFim: e.target.value })}
              className={INPUT_BASE + ' w-auto'}
            />
          </div>

        </div>
      </div>

      {/* Painel avançado */}
      {avancadoAberto && (
        <div className="border-t border-zinc-800 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Busca */}
          <div className="flex flex-col gap-1 lg:col-span-3">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Busca por descrição
            </span>
            <input
              type="text"
              value={buscaLocal}
              onChange={e => setBuscaLocal(e.target.value)}
              onBlur={handleBuscaCommit}
              onKeyDown={e => e.key === 'Enter' && handleBuscaCommit()}
              placeholder="Pressione Enter ou saia do campo para filtrar"
              className={INPUT_BASE}
            />
          </div>

          {/* Categoria */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Categoria
            </span>
            <select
              value={filtros.categoriaId ?? ''}
              onChange={e => setFiltros({ ...filtros, categoriaId: e.target.value || null })}
              className={SELECT_BASE}
            >
              <option value="">Todas as categorias</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          {/* Parceiro unificado */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Parceiro / Arquiteto / Cliente
            </span>
            <select
              value={parceiroValue}
              onChange={handleParceiroChange}
              className={SELECT_BASE}
            >
              <option value="">Todos</option>
              {parceiroOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Conta */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Conta
            </span>
            <select
              value={filtros.contaId ?? ''}
              onChange={e => setFiltros({ ...filtros, contaId: e.target.value || null })}
              className={SELECT_BASE}
            >
              <option value="">Todas as contas</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          {/* Projeto */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Projeto
            </span>
            <select
              value={filtros.projetoId ?? ''}
              onChange={e => setFiltros({ ...filtros, projetoId: e.target.value || null })}
              className={SELECT_BASE}
            >
              <option value="">Todos os projetos</option>
              {projetos.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

        </div>
      )}
    </div>
  );
}
