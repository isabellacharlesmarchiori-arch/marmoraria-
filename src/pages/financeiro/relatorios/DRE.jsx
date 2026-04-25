import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

// ─── Constantes de estilo ─────────────────────────────────────────────────────

const INPUT_CLS =
  'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-gray-900 dark:text-white outline-none ' +
  'focus:border-yellow-400 transition-colors [color-scheme:dark]';

const CHIP = (ativo) =>
  `border px-3 py-1 font-mono text-[10px] uppercase tracking-widest cursor-pointer transition-colors ${
    ativo ? 'border-yellow-400 text-yellow-400' : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600'
  }`;

const BENCHMARKS = {
  pctCV:  { benchMin: 0.60, benchMax: 0.65, lowGood: true  },
  pctMC:  { benchMin: 0.35, benchMax: 0.40, lowGood: false },
  pctCF:  { benchMin: 0.20, benchMax: 0.25, lowGood: true  },
  pctEBI: { benchMin: 0.10, benchMax: 0.15, lowGood: false },
  pctLL:  { benchMin: 0.08, benchMax: 0.12, lowGood: false },
};

// ─── Helpers de data / período ─────────────────────────────────────────────────

function mesAtualISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

function anoAtual() { return new Date().getFullYear(); }

function limitesMes(mesAno) {
  const [a, m] = mesAno.split('-').map(Number);
  return {
    inicio: `${a}-${String(m).padStart(2, '0')}-01`,
    fim:    new Date(a, m, 0).toISOString().slice(0, 10),
  };
}

function limitesTrimestre(trim, ano) {
  const ini = { T1: 1, T2: 4, T3: 7, T4: 10 }[trim];
  const fim = { T1: 3, T2: 6, T3: 9, T4: 12 }[trim];
  return {
    inicio: `${ano}-${String(ini).padStart(2, '0')}-01`,
    fim:    new Date(ano, fim, 0).toISOString().slice(0, 10),
  };
}

function getLimites(modo, mesAno, trim, ano) {
  if (modo === 'mensal')     return limitesMes(mesAno);
  if (modo === 'trimestral') return limitesTrimestre(trim, ano);
  return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
}

function getPrevLimites(modo, mesAno, trim, ano) {
  if (modo === 'mensal') {
    const [a, m] = mesAno.split('-').map(Number);
    const d = new Date(a, m - 2, 1);
    return limitesMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  if (modo === 'trimestral') {
    const prev = { T1: 'T4', T2: 'T1', T3: 'T2', T4: 'T3' };
    return limitesTrimestre(prev[trim], trim === 'T1' ? ano - 1 : ano);
  }
  return { inicio: `${ano - 1}-01-01`, fim: `${ano - 1}-12-31` };
}

function periodoLabel(modo, mesAno, trim, ano) {
  if (modo === 'mensal') {
    const [a, m] = mesAno.split('-').map(Number);
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[m - 1]}/${a}`;
  }
  if (modo === 'trimestral') return `${trim}/${ano}`;
  return `${ano}`;
}

// ─── Construção da árvore DRE ─────────────────────────────────────────────────

function buildTree(categorias, valorMap) {
  const nos = new Map(categorias.map(c => [c.id, { ...c, valor: valorMap[c.id] ?? 0, filhos: [] }]));
  const raizes = [];
  for (const no of nos.values()) {
    if (no.pai_id && nos.has(no.pai_id)) nos.get(no.pai_id).filhos.push(no);
    else raizes.push(no);
  }
  function ordenar(list) {
    list.sort((a, b) => {
      if ((a.ordem ?? 0) !== (b.ordem ?? 0)) return (a.ordem ?? 0) - (b.ordem ?? 0);
      return (a.codigo ?? '').localeCompare(b.codigo ?? '', undefined, { numeric: true });
    });
    for (const n of list) ordenar(n.filhos);
  }
  ordenar(raizes);
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

function somarArvore(arvore) {
  return arvore.reduce((s, n) => s + n.valor, 0);
}

function valorById(arvore, acc = {}) {
  for (const n of arvore) {
    acc[n.id] = n.valor;
    if (n.filhos.length) valorById(n.filhos, acc);
  }
  return acc;
}

function calcularDRE(plano, lancs, campoData) {
  const map = {};
  for (const l of lancs) {
    if (!l.categoria_id) continue;
    const v = campoData === 'data_pagamento' ? Number(l.valor_pago ?? 0) : Number(l.valor_previsto ?? 0);
    map[l.categoria_id] = (map[l.categoria_id] ?? 0) + v;
  }
  const filtrar = (tipo, filtroExtra) =>
    buildTree(plano.filter(c => c.tipo === tipo && (!filtroExtra || filtroExtra(c))), map);

  const arvReceita   = filtrar('receita');
  const arvTributo   = filtrar('tributo');
  const arvCustoVar  = filtrar('custo_variavel');
  const arvCustoFixo = filtrar('custo_fixo');
  const arvDespFin   = filtrar('financeiro', c => c.impacto_dre === 'negativo' && c.subtipo !== 'nao_dre');

  const receitaBruta       = somarArvore(arvReceita);
  const totalDeducoes      = somarArvore(arvTributo);
  const receitaLiquida     = receitaBruta - totalDeducoes;
  const totalCustoVar      = somarArvore(arvCustoVar);
  const margemContribuicao = receitaLiquida - totalCustoVar;
  const totalCustoFixo     = somarArvore(arvCustoFixo);
  const ebitda             = margemContribuicao - totalCustoFixo;
  const totalDespFin       = somarArvore(arvDespFin);
  const lucroLiquido       = ebitda - totalDespFin;

  return {
    arvReceita, arvTributo, arvCustoVar, arvCustoFixo, arvDespFin,
    receitaBruta, totalDeducoes, receitaLiquida,
    totalCustoVar, margemContribuicao,
    totalCustoFixo, ebitda,
    totalDespFin, lucroLiquido,
    valorMap: map,
  };
}

// ─── Formatação de percentual ─────────────────────────────────────────────────

function fmtPct(v, base) {
  if (!base || isNaN(v / base)) return '—';
  const p = (v / base) * 100;
  return `${p.toFixed(1)}%`;
}

function fmtVar(atual, ant) {
  if (ant === 0 && atual === 0) return null;
  if (ant === 0) return { pct: null, abs: atual - ant };
  return { pct: ((atual - ant) / Math.abs(ant)) * 100, abs: atual - ant };
}

// ─── Sub-componentes de renderização ─────────────────────────────────────────

function SetaVar({ valor, pct }) {
  if (valor === null) return null;
  const positivo = valor >= 0;
  const cor = positivo ? 'text-emerald-400' : 'text-red-400';
  return (
    <span className={`font-mono text-[9px] tabular-nums ${cor} flex items-center gap-0.5 justify-end`}>
      <iconify-icon icon={positivo ? 'lucide:trending-up' : 'lucide:trending-down'} width="9"></iconify-icon>
      {pct !== null ? `${Math.abs(pct).toFixed(1)}%` : (positivo ? '+' : '') + formatBRL(Math.abs(valor))}
    </span>
  );
}

function LinhaDRE({ no, nivel, rl, antMap, expandidos, onToggle, mostrarZeradas, comparar, editProps }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: no.id,
    data: { paiId: no.pai_id },
    disabled: !editProps,
  });

  const dragStyle = editProps
    ? { transform: CSS.Transform.toString(transform), transition }
    : undefined;

  const temFilhos = no.filhos.length > 0;
  const isExpanded = expandidos.has(no.id);
  const valorAnt = antMap[no.id] ?? 0;
  const varObj = fmtVar(no.valor, valorAnt);

  if (!mostrarZeradas && no.valor === 0) {
    if (!temFilhos) return null;
    const todoZero = (function soma(ns) { return ns.every(n => n.valor === 0 && soma(n.filhos)); })(no.filhos);
    if (todoZero) return null;
  }

  const indentPx = 12 + nivel * 20;
  const isGrupo    = nivel === 0;
  const isSubGrupo = nivel === 1;
  const isFolha    = nivel >= 2;

  const labelCls = isGrupo
    ? 'font-mono text-[10px] font-semibold text-gray-700 dark:text-zinc-200 uppercase tracking-wide'
    : isSubGrupo
    ? 'text-[13px] font-semibold text-gray-600 dark:text-zinc-300'
    : 'text-[12px] text-gray-500 dark:text-zinc-500';

  const valorCls = no.valor === 0
    ? 'text-gray-400 dark:text-zinc-700'
    : isGrupo
    ? 'text-gray-800 dark:text-zinc-100 font-semibold text-sm'
    : isSubGrupo
    ? 'text-gray-700 dark:text-zinc-200 text-sm'
    : 'text-gray-500 dark:text-zinc-400 text-sm';

  const rowBg = isGrupo ? 'hover:bg-gray-200/40 dark:hover:bg-zinc-900/40' : 'hover:bg-gray-200/20 dark:hover:bg-zinc-900/20';

  const filhosOrdenados = editProps
    ? [...no.filhos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    : no.filhos;

  return (
    <>
      <tr
        ref={setNodeRef}
        style={dragStyle}
        {...(editProps ? attributes : {})}
        className={`border-b border-gray-200/40 dark:border-zinc-900/40 transition-colors ${rowBg} ${
          temFilhos && !editProps ? 'cursor-pointer' : ''
        } ${no.valor === 0 && !temFilhos ? 'opacity-35' : ''} ${isDragging ? 'opacity-40 bg-gray-200/60 dark:bg-zinc-900/60 shadow-lg' : ''}`}
        onClick={temFilhos && !editProps ? () => onToggle(no.id) : undefined}
      >
        <td className={`${isGrupo ? 'py-2.5' : isFolha ? 'py-1.5' : 'py-2'}`} style={{ paddingLeft: `${indentPx}px` }}>
          <div className="flex items-center gap-1.5">
            {editProps ? (
              <span
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
                onMouseDown={e => e.stopPropagation()}
              >
                <iconify-icon icon="lucide:grip-vertical" width="12" className="text-gray-500 dark:text-zinc-600"></iconify-icon>
              </span>
            ) : temFilhos ? (
              <iconify-icon
                icon={isExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
                width={isGrupo ? '11' : '10'}
                className={isGrupo ? 'text-gray-500 dark:text-zinc-400 shrink-0' : 'text-gray-500 dark:text-zinc-600 shrink-0'}
              ></iconify-icon>
            ) : (
              <span className="w-[11px] shrink-0" />
            )}
            <span
              className={`${labelCls} ${editProps ? 'cursor-pointer hover:text-yellow-300 hover:underline underline-offset-2' : ''}`}
              onClick={editProps ? (e) => editProps.onClickNome(no, e) : undefined}
            >
              {no.nome}
            </span>
            {no.subtipo === 'mdo' && (
              <span className="font-mono text-[7px] text-amber-600 border border-amber-900/60 px-1 leading-none py-px">MDO</span>
            )}
          </div>
        </td>
        <td className={`${isGrupo ? 'py-2.5' : isFolha ? 'py-1.5' : 'py-2'} pr-4 text-right tabular-nums font-mono whitespace-nowrap`}>
          <span className={valorCls}>
            {no.valor !== 0 ? formatBRL(no.valor) : ''}
          </span>
        </td>
        <td className="py-2 pr-4 text-right tabular-nums font-mono text-[10px] text-gray-500 dark:text-zinc-600 whitespace-nowrap">
          {no.valor !== 0 ? fmtPct(no.valor, rl) : ''}
        </td>
        {comparar && (
          <>
            <td className="py-2 pr-4 text-right tabular-nums font-mono text-sm text-gray-500 dark:text-zinc-600 whitespace-nowrap">
              {valorAnt !== 0 ? formatBRL(valorAnt) : ''}
            </td>
            <td className="py-2 pr-4 whitespace-nowrap">
              {varObj && <SetaVar valor={varObj.abs} pct={varObj.pct} />}
            </td>
          </>
        )}
      </tr>
      {temFilhos && isExpanded && (
        editProps ? (
          <SortableContext items={filhosOrdenados.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {filhosOrdenados.map(f => (
              <LinhaDRE
                key={f.id}
                no={f}
                nivel={nivel + 1}
                rl={rl}
                antMap={antMap}
                expandidos={expandidos}
                onToggle={onToggle}
                mostrarZeradas={mostrarZeradas}
                comparar={comparar}
                editProps={editProps}
              />
            ))}
          </SortableContext>
        ) : (
          no.filhos.map(f => (
            <LinhaDRE
              key={f.id}
              no={f}
              nivel={nivel + 1}
              rl={rl}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={onToggle}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={editProps}
            />
          ))
        )
      )}
    </>
  );
}

function SecaoDRE({ titulo, arvore, tipoKey, rl, antMap, expandidos, onToggle, mostrarZeradas, comparar, editProps }) {
  const isExpanded = expandidos.has(tipoKey);
  const total = somarArvore(arvore);
  const totalAnt = arvore.reduce((s, n) => s + (antMap[n.id] ?? 0), 0);
  const varObj = fmtVar(total, totalAnt);

  return (
    <>
      <tr
        className="cursor-pointer bg-gray-50 dark:bg-zinc-950 border-t border-gray-300 dark:border-zinc-700 border-b border-gray-300 dark:border-zinc-800 hover:bg-gray-200/50 dark:hover:bg-zinc-900/50 transition-colors"
        onClick={() => onToggle(tipoKey)}
      >
        <td className="py-3 pl-3">
          <div className="flex items-center gap-2">
            <iconify-icon
              icon={isExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
              width="11"
              className="text-gray-500 dark:text-zinc-400 shrink-0"
            ></iconify-icon>
            <span className="font-mono text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">
              {titulo}
            </span>
          </div>
        </td>
        <td className="py-3 pr-4 text-right tabular-nums font-mono text-sm font-bold text-gray-800 dark:text-zinc-100 whitespace-nowrap">
          {total !== 0 ? formatBRL(total) : '—'}
        </td>
        <td className="py-3 pr-4 text-right tabular-nums font-mono text-[10px] text-gray-500 dark:text-zinc-500 whitespace-nowrap">
          {total !== 0 ? fmtPct(total, rl) : ''}
        </td>
        {comparar && (
          <>
            <td className="py-2.5 pr-4 text-right tabular-nums font-mono text-sm text-gray-500 dark:text-zinc-600 whitespace-nowrap">
              {totalAnt !== 0 ? formatBRL(totalAnt) : ''}
            </td>
            <td className="py-2.5 pr-4 whitespace-nowrap">
              {varObj && <SetaVar valor={varObj.abs} pct={varObj.pct} />}
            </td>
          </>
        )}
      </tr>
      {isExpanded && (() => {
        const sorted = editProps
          ? [...arvore].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          : arvore;
        const rows = sorted.map(no => (
          <LinhaDRE
            key={no.id}
            no={no}
            nivel={0}
            rl={rl}
            antMap={antMap}
            expandidos={expandidos}
            onToggle={onToggle}
            mostrarZeradas={mostrarZeradas}
            comparar={comparar}
            editProps={editProps}
          />
        ));
        return editProps
          ? <SortableContext items={sorted.map(n => n.id)} strategy={verticalListSortingStrategy}>{rows}</SortableContext>
          : rows;
      })()}
    </>
  );
}

function LinhaSubtotal({ label, valor, valorAnt, rl, comparar, isFinal }) {
  const varObj   = fmtVar(valor, valorAnt ?? 0);
  const corValor = valor >= 0
    ? (isFinal ? 'text-emerald-400' : 'text-[#1D9E75]')
    : 'text-red-400';
  const bgRow = isFinal
    ? 'bg-gray-50 dark:bg-zinc-950 border-t-2 border-gray-400 dark:border-zinc-500'
    : 'bg-gray-100 dark:bg-[#0d0d0d] border-t-2 border-gray-300 dark:border-zinc-800';

  return (
    <tr className={`${bgRow} border-b border-gray-300 dark:border-zinc-800`}>
      <td className={`py-3 pl-4 pr-2 ${isFinal ? 'font-mono text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest' : 'font-mono text-[10px] font-bold text-gray-700 dark:text-zinc-200 uppercase tracking-widest'}`}>
        {label}
      </td>
      <td className={`py-3 pr-4 text-right tabular-nums font-mono whitespace-nowrap font-bold ${isFinal ? 'text-base ' + corValor : 'text-sm ' + corValor}`}>
        {formatBRL(valor)}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[10px] whitespace-nowrap">
        {rl ? <span className={`font-bold ${corValor}`}>{fmtPct(valor, rl)}</span> : ''}
      </td>
      {comparar && (
        <>
          <td className="py-3 pr-4 text-right tabular-nums font-mono text-sm text-gray-500 dark:text-zinc-600 whitespace-nowrap">
            {(valorAnt ?? 0) !== 0 ? formatBRL(valorAnt) : ''}
          </td>
          <td className="py-3 pr-4 whitespace-nowrap">
            {varObj && <SetaVar valor={varObj.abs} pct={varObj.pct} />}
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Painel de KPIs ───────────────────────────────────────────────────────────

function ItemKPI({ nome, descricao, valor, benchMin, benchMax, lowGood, isCurrency, ideal, nota }) {
  let cor = 'text-gray-500 dark:text-zinc-500';
  let bg  = 'border-gray-300 dark:border-zinc-800';
  let dot = 'bg-gray-300 dark:bg-zinc-700';

  const temBench = benchMin !== undefined && benchMax !== undefined;

  if (valor !== null && valor !== undefined && !isNaN(valor) && temBench) {
    const dentro  = valor >= benchMin && valor <= benchMax;
    const proximo = lowGood
      ? valor > benchMax && valor <= benchMax * 1.08
      : valor < benchMin && valor >= benchMin * 0.92;
    if (dentro)       { cor = 'text-emerald-400'; bg = 'border-emerald-900/60'; dot = 'bg-emerald-400'; }
    else if (proximo) { cor = 'text-amber-400';   bg = 'border-amber-900/60';   dot = 'bg-amber-400';   }
    else              { cor = 'text-red-400';      bg = 'border-red-900/40';     dot = 'bg-red-400';     }
  }

  const display = (valor === null || valor === undefined)
    ? 'N/A'
    : isCurrency
    ? formatBRL(valor)
    : `${(valor * 100).toFixed(1)}%`;

  const idealStr = ideal
    ?? (temBench && !isCurrency
      ? `Ideal: ${(benchMin * 100).toFixed(0)}–${(benchMax * 100).toFixed(0)}%`
      : '');

  return (
    <div className={`group relative bg-gray-50 dark:bg-[#0a0a0a] border ${bg} px-2.5 py-2 flex flex-col gap-1 overflow-visible`}>

      {/* Nome + semáforo */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-400 leading-none truncate">{nome}</span>
        <div className="flex items-center gap-1 shrink-0">
          {descricao && (
            <span className="font-mono text-[8px] text-gray-400 dark:text-zinc-700 cursor-help select-none">?</span>
          )}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`}></span>
        </div>
      </div>

      {/* Valor */}
      <span className={`font-mono text-sm font-bold tabular-nums tracking-tight leading-none ${cor}`}>
        {display}
      </span>

      {/* Benchmark + nota na mesma linha para economizar espaço */}
      <div className="flex flex-wrap gap-x-2">
        {idealStr && <span className="font-mono text-[7px] text-gray-400 dark:text-zinc-700">{idealStr}</span>}
        {nota      && <span className="font-mono text-[7px] text-gray-400 dark:text-zinc-700">{nota}</span>}
      </div>

      {/* Tooltip */}
      {descricao && (
        <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-52 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 px-3 py-2 text-[10px] text-gray-600 dark:text-zinc-300 leading-relaxed z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-xl">
          <span className="font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1">{nome}</span>
          {descricao}
        </div>
      )}
    </div>
  );
}

function PainelKPIs({ dre, emprestimos }) {
  const rl = dre.receitaLiquida;
  const safe = (num, den) => (den && !isNaN(num / den) ? num / den : null);

  const pctCV  = safe(dre.totalCustoVar,      rl);
  const pctMC  = safe(dre.margemContribuicao, rl);
  const pctCF  = safe(dre.totalCustoFixo,     rl);
  const pctEBI = safe(dre.ebitda,             rl);
  const pctLL  = safe(dre.lucroLiquido,       rl);

  const parcelasAtivas = emprestimos.reduce((s, e) => s + Number(e.parcela_mensal ?? 0), 0);
  const iccd = parcelasAtivas > 0 ? dre.ebitda / parcelasAtivas : null;
  const pe   = pctMC && pctMC > 0 ? dre.totalCustoFixo / pctMC : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-800">
      <ItemKPI
        nome="% Custo Variável"
        descricao="Quanto da receita vai para custos que variam com as vendas — matéria-prima, MDO, comissões, fretes. Quanto menor, melhor."
        valor={pctCV}
        {...BENCHMARKS.pctCV}
      />
      <ItemKPI
        nome="% Margem de Contribuição"
        descricao="O que sobra da receita depois de pagar os custos variáveis. É esse valor que cobre as despesas fixas e gera lucro."
        valor={pctMC}
        {...BENCHMARKS.pctMC}
      />
      <ItemKPI
        nome="% Custo Fixo"
        descricao="Quanto da receita vai para despesas fixas — aluguel, salários, contabilidade. Deve ficar abaixo de 25%."
        valor={pctCF}
        {...BENCHMARKS.pctCF}
      />
      <ItemKPI
        nome="% EBITDA"
        descricao="Lucro operacional antes de juros e impostos. Mede a eficiência da operação sem distorções financeiras."
        valor={pctEBI}
        {...BENCHMARKS.pctEBI}
      />
      <ItemKPI
        nome="% Lucro Líquido"
        descricao="O que sobra no final depois de tudo — custos variáveis, fixos e despesas financeiras."
        valor={pctLL}
        {...BENCHMARKS.pctLL}
      />
      <ItemKPI
        nome="Cobertura da Dívida"
        descricao="Mostra se o EBITDA cobre as parcelas mensais de empréstimos. Abaixo de 1 significa que a operação não gera caixa suficiente para pagar as dívidas."
        valor={iccd}
        benchMin={1.0}
        benchMax={99}
        lowGood={false}
        ideal="Ideal: acima de 1"
        nota={parcelasAtivas > 0 ? `parcelas: ${formatBRL(parcelasAtivas)}/mês` : 'sem empréstimos ativos'}
      />
      <ItemKPI
        nome="Ponto de Equilíbrio"
        descricao="Faturamento mínimo para a empresa não ter prejuízo. Abaixo desse valor, a operação opera no vermelho."
        valor={pe}
        isCurrency
        nota={pe !== null && dre.receitaBruta > 0 ? `${fmtPct(pe, dre.receitaBruta)} da receita bruta` : ''}
      />
    </div>
  );
}

// ─── Export PDF ───────────────────────────────────────────────────────────────

async function exportarPDF(dreRef, titulo) {
  if (!dreRef.current) return;
  try {
    toast.loading('Gerando PDF…', { id: 'dre-pdf' });
    const canvas = await html2canvas(dreRef.current, {
      scale: 2,
      backgroundColor: '#0a0a0a',
      useCORS: true,
    });
    const img  = canvas.toDataURL('image/png');
    const pdf  = new jsPDF('p', 'mm', 'a4');
    const pw   = pdf.internal.pageSize.getWidth();
    const ph   = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    const iw   = pw - 20;
    const ih   = iw / ratio;

    if (ih <= ph - 20) {
      pdf.addImage(img, 'PNG', 10, 10, iw, ih);
    } else {
      let y = 0;
      while (y < canvas.height) {
        const sliceH = Math.min(canvas.height - y, canvas.width / (pw - 20) * (ph - 20));
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width  = canvas.width;
        sliceCanvas.height = sliceH;
        sliceCanvas.getContext('2d').drawImage(canvas, 0, -y);
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, 10, iw, (sliceH / canvas.width) * iw);
        y += sliceH;
        if (y < canvas.height) pdf.addPage();
      }
    }
    pdf.save(`${titulo}.pdf`);
    toast.success('PDF gerado.', { id: 'dre-pdf' });
  } catch {
    toast.error('Erro ao gerar PDF.', { id: 'dre-pdf' });
  }
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportarCSV(dre, dreAnt, titulo, comparar) {
  const rows = [
    comparar
      ? ['Descrição', 'Valor', '% RL', 'Período Anterior', 'Variação R$', 'Variação %']
      : ['Descrição', 'Valor', '% RL'],
  ];

  const rl = dre.receitaLiquida || 1;
  const antMap = valorById([...dreAnt.arvReceita, ...dreAnt.arvTributo, ...dreAnt.arvCustoVar, ...dreAnt.arvCustoFixo, ...dreAnt.arvDespFin]);

  function addRow(label, valor, indent = '') {
    const ant = null;
    const pct = (valor / rl * 100).toFixed(1) + '%';
    if (comparar) {
      const antV = ant ?? 0;
      const varAbs = valor - antV;
      const varPct = antV !== 0 ? ((varAbs / Math.abs(antV)) * 100).toFixed(1) + '%' : '';
      rows.push([indent + label, valor.toFixed(2), pct, antV.toFixed(2), varAbs.toFixed(2), varPct]);
    } else {
      rows.push([indent + label, valor.toFixed(2), pct]);
    }
  }

  function addTree(arvore, indent) {
    for (const no of arvore) {
      addRow(no.nome, no.valor, indent);
      if (no.filhos.length) addTree(no.filhos, indent + '  ');
    }
  }

  addRow('RECEITA BRUTA',                 dre.receitaBruta);
  addTree(dre.arvReceita, '  ');
  addRow('DEDUÇÕES DE VENDAS',           -dre.totalDeducoes);
  addTree(dre.arvTributo, '  ');
  addRow('(=) RECEITA LÍQUIDA',           dre.receitaLiquida);
  addRow('CUSTOS VARIÁVEIS DIRETOS',     -dre.totalCustoVar);
  addTree(dre.arvCustoVar, '  ');
  addRow('(=) MARGEM DE CONTRIBUIÇÃO',    dre.margemContribuicao);
  addRow('CUSTOS FIXOS',                 -dre.totalCustoFixo);
  addTree(dre.arvCustoFixo, '  ');
  addRow('(=) RESULTADO OPERACIONAL / EBITDA', dre.ebitda);
  addRow('DESPESAS FINANCEIRAS',         -dre.totalDespFin);
  addTree(dre.arvDespFin, '  ');
  addRow('(=) LUCRO LÍQUIDO',             dre.lucroLiquido);

  const csv = rows.map(r => r.map(v => `"${v}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tooltip inline (por botão) ───────────────────────────────────────────────

function TooltipInline({ text, alignRight }) {
  return (
    <div className="group relative cursor-help shrink-0">
      <div className="w-4 h-4 border border-gray-300 dark:border-zinc-800 flex items-center justify-center font-mono text-[9px] text-gray-500 dark:text-zinc-600 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors select-none">?</div>
      <div className={`pointer-events-none absolute bottom-full mb-2 w-60 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 px-3 py-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl ${alignRight ? 'right-0' : 'left-0'}`}>
        <p className="text-[10px] text-gray-600 dark:text-zinc-300 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// ─── Constantes de edição do plano de contas ──────────────────────────────────

const TIPO_LABELS_EDIT = {
  receita:        'Receita Bruta',
  tributo:        'Dedução de Vendas',
  custo_variavel: 'Custo Variável',
  custo_fixo:     'Custo Fixo',
  financeiro:     'Despesa Financeira',
};

const REGIMES = [
  {
    value: 'competencia',
    label: 'Por Competência',
    sub: 'padrão contábil',
    tooltip: 'Registra receitas e despesas no mês em que o fato ocorreu, independente do pagamento. Ex: fechou uma venda de R$ 50 mil em março — entra na DRE de março, mesmo que o cliente pague em parcelas até dezembro. É o regime exigido pela contabilidade.',
  },
  {
    value: 'data_pagamento',
    label: 'Por Caixa',
    sub: 'efetivamente pago',
    tooltip: 'Considera apenas lançamentos com pagamento confirmado. Ex: fechou R$ 50 mil em março, mas a 1ª parcela entrou em abril — entra na DRE de abril. Mostra o fluxo real de dinheiro que passou pelas contas bancárias.',
  },
];

const ESTRUTURAS = [
  {
    value: 'gerencial',
    label: 'Gerencial',
    tooltip: 'Destaca a Margem de Contribuição — o quanto sobra das vendas após os custos variáveis para cobrir os custos fixos e gerar lucro. Ideal para decisões de precificação, mix de produtos e ponto de equilíbrio.',
  },
  {
    value: 'contabil',
    label: 'Contábil',
    tooltip: 'Segue o padrão CPC 26 (Lei das S.A.). Agrupa todos os custos de produto no CMV e mostra o Lucro Bruto. Despesas de estrutura (pessoal, aluguel, etc.) ficam em "Despesas Operacionais". É o formato usado na contabilidade oficial.',
  },
];

// ─── Helper query lançamentos (varia conforme regime) ─────────────────────────

function qLancamentos(empId, campoData, inicio, fim, supabaseClient) {
  let q = supabaseClient
    .from('financeiro_lancamentos')
    .select('categoria_id, tipo, valor_previsto, valor_pago, status')
    .eq('empresa_id', empId)
    .neq('status', 'cancelado')
    .gte(campoData, inicio)
    .lte(campoData, fim);
  if (campoData === 'data_pagamento') q = q.eq('status', 'pago');
  return q;
}

// ─── Componente principal ─────────────────────────────────────────────────────

const TRIMS = ['T1', 'T2', 'T3', 'T4'];
const DEFAULT_EXPANDIDOS = new Set(['receita', 'tributo', 'custo_variavel', 'custo_fixo', 'financeiro']);

export default function DRE() {
  const { profile } = useAuth();

  const [modo,      setModo]      = useState('mensal');
  const [mesAno,    setMesAno]    = useState(mesAtualISO);
  const [trim,      setTrim]      = useState('T1');
  const [ano,       setAno]       = useState(anoAtual);
  const [campoData, setCampoData] = useState('competencia');
  const [comparar,  setComparar]  = useState(false);
  const [mostrarZeradas, setMostrarZeradas] = useState(false);
  const [expandidos, setExpandidos] = useState(DEFAULT_EXPANDIDOS);

  const [plano,       setPlano]       = useState([]);
  const [lancsAtual,  setLancsAtual]  = useState([]);
  const [lancsAnt,    setLancsAnt]    = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState(null);

  const dreRef = useRef(null);

  // ── Inicializa trim com o trimestre atual ──
  useEffect(() => {
    const m = new Date().getMonth() + 1;
    setTrim(m <= 3 ? 'T1' : m <= 6 ? 'T2' : m <= 9 ? 'T3' : 'T4');
  }, []);

  // ── Carga de dados ─────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    const empId = profile?.empresa_id;
    if (!empId) return;
    setLoading(true);
    setErro(null);

    try {
      const { inicio, fim } = getLimites(modo, mesAno, trim, ano);
      const prev            = getPrevLimites(modo, mesAno, trim, ano);

      const [rPlano, rLancs, rLancsAnt, rEmp] = await Promise.all([
        supabase
          .from('financeiro_plano_contas')
          .select('id, codigo, nome, tipo, subtipo, natureza, impacto_dre, pai_id, aceita_lancamento, ativo, ordem')
          .eq('empresa_id', empId)
          .eq('ativo', true)
          .order('ordem')
          .order('codigo'),

        qLancamentos(empId, campoData, inicio, fim, supabase),

        comparar
          ? qLancamentos(empId, campoData, prev.inicio, prev.fim, supabase)
          : Promise.resolve({ data: [], error: null }),

        supabase
          .from('financeiro_emprestimos')
          .select('parcela_mensal, status')
          .eq('empresa_id', empId)
          .eq('status', 'ativo'),
      ]);

      for (const r of [rPlano, rLancs, rLancsAnt, rEmp]) {
        if (r.error) throw r.error;
      }

      setPlano(rPlano.data ?? []);
      setLancsAtual(rLancs.data ?? []);
      setLancsAnt(rLancsAnt.data ?? []);
      setEmprestimos(rEmp.data ?? []);
    } catch (err) {
      const msg = err.message ?? 'Erro ao carregar DRE';
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id, modo, mesAno, trim, ano, campoData, comparar]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const dreAtual = useMemo(() => calcularDRE(plano, lancsAtual, campoData), [plano, lancsAtual, campoData]);
  const dreAnt   = useMemo(() => calcularDRE(plano, lancsAnt,   campoData), [plano, lancsAnt,   campoData]);

  const antMap = useMemo(() => valorById([
    ...dreAnt.arvReceita, ...dreAnt.arvTributo,
    ...dreAnt.arvCustoVar, ...dreAnt.arvCustoFixo, ...dreAnt.arvDespFin,
  ]), [dreAnt]);

  const temDados = plano.some(c => ['custo_variavel', 'custo_fixo', 'tributo'].includes(c.tipo));
  const titulo = `DRE-${periodoLabel(modo, mesAno, trim, ano)}`;
  const isAdmin = profile?.perfil === 'admin';

  function toggleNode(key) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Estrutura DRE (gerencial / contábil) ──────────────────────────────────

  const [estrutura, setEstrutura] = useState(() =>
    localStorage.getItem('dre_estrutura') ?? 'gerencial'
  );
  function mudarEstrutura(v) {
    setEstrutura(v);
    localStorage.setItem('dre_estrutura', v);
  }
  const isContabil = estrutura === 'contabil';

  // ── Modo edição (ordem das contas — @dnd-kit) ──────────────────────────────

  const [modoEdicao,       setModoEdicao]       = useState(false);
  const [salvandoOrdem,    setSalvandoOrdem]    = useState(false);
  const [modalEditarConta, setModalEditarConta] = useState(null);
  const [editContaForm,    setEditContaForm]    = useState({ nome: '', tipo: '' });
  const [modalMoverGrupo,  setModalMoverGrupo]  = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEndDnD({ active, over }) {
    if (!over || active.id === over.id) return;
    const activePai = active.data.current?.paiId ?? null;
    const overPai   = over.data.current?.paiId   ?? null;
    if (activePai !== overPai) return;
    salvarOrdemDnD(String(active.id), String(over.id));
  }

  async function salvarOrdemDnD(dragNodeId, dropNodeId) {
    const dragged    = plano.find(c => c.id === dragNodeId);
    const dropTarget = plano.find(c => c.id === dropNodeId);
    if (!dragged || !dropTarget || dragged.pai_id !== dropTarget.pai_id) return;
    const irmaos = plano
      .filter(c => c.pai_id === dragged.pai_id)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const dIdx = irmaos.findIndex(c => c.id === dragNodeId);
    const tIdx = irmaos.findIndex(c => c.id === dropNodeId);
    if (dIdx === -1 || tIdx === -1 || dIdx === tIdx) return;
    const reordered = [...irmaos];
    const [item] = reordered.splice(dIdx, 1);
    reordered.splice(tIdx, 0, item);
    const ordens = irmaos.map(c => c.ordem ?? 0).sort((a, b) => a - b);
    setSalvandoOrdem(true);
    await Promise.all(
      reordered.map((c, i) =>
        supabase.from('financeiro_plano_contas')
          .update({ ordem: ordens[i] })
          .eq('id', c.id)
          .eq('empresa_id', profile.empresa_id)
      )
    );
    await carregar();
    setSalvandoOrdem(false);
  }

  function abrirEditarConta(no, e) {
    e.stopPropagation();
    setEditContaForm({ nome: no.nome, tipo: no.tipo });
    setModalEditarConta(no);
  }

  async function salvarEditarConta() {
    const no = modalEditarConta;
    if (!no || !editContaForm.nome.trim()) return;
    if (editContaForm.tipo !== no.tipo) {
      setModalMoverGrupo({ conta: no, novoTipo: editContaForm.tipo });
      return;
    }
    setSalvandoOrdem(true);
    const { error } = await supabase
      .from('financeiro_plano_contas')
      .update({ nome: editContaForm.nome.trim() })
      .eq('id', no.id)
      .eq('empresa_id', profile.empresa_id);
    setSalvandoOrdem(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Conta atualizada');
    setModalEditarConta(null);
    await carregar();
  }

  async function confirmarMoverGrupo() {
    const { conta, novoTipo } = modalMoverGrupo;
    setSalvandoOrdem(true);
    const { error } = await supabase
      .from('financeiro_plano_contas')
      .update({ nome: editContaForm.nome.trim(), tipo: novoTipo })
      .eq('id', conta.id)
      .eq('empresa_id', profile.empresa_id);
    setSalvandoOrdem(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Conta movida para outro grupo');
    setModalMoverGrupo(null);
    setModalEditarConta(null);
    await carregar();
  }

  const dreEditProps = modoEdicao ? { onClickNome: abrirEditarConta } : null;

  const colSpan = comparar ? 5 : 3;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Controles ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Modo */}
        <div className="flex items-center gap-1">
          {[['mensal','Mensal'],['trimestral','Trimestral'],['anual','Anual']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setModo(v)} className={CHIP(modo === v)}>{l}</button>
          ))}
        </div>

        {/* Seletor de período */}
        {modo === 'mensal' && (
          <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} className={INPUT_CLS} />
        )}
        {modo === 'trimestral' && (
          <div className="flex items-center gap-1">
            {TRIMS.map(t => (
              <button key={t} type="button" onClick={() => setTrim(t)} className={CHIP(trim === t)}>{t}</button>
            ))}
            <input
              type="number" min="2020" max="2099" value={ano}
              onChange={e => setAno(Number(e.target.value))}
              className={INPUT_CLS + ' w-20'}
            />
          </div>
        )}
        {modo === 'anual' && (
          <input
            type="number" min="2020" max="2099" value={ano}
            onChange={e => setAno(Number(e.target.value))}
            className={INPUT_CLS + ' w-24'}
          />
        )}

        {/* Regime — dois botões grandes e destacados */}
        <div className="flex items-center gap-2 ml-auto">
          {REGIMES.map(({ value, label, sub, tooltip }, i) => (
            <div key={value} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCampoData(value)}
                className={`px-4 py-2 border transition-colors text-left ${
                  campoData === value
                    ? 'border-yellow-400 bg-gray-100 dark:bg-zinc-900 text-yellow-400'
                    : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest block leading-none">{label}</span>
                <span className="font-mono text-[8px] text-gray-500 dark:text-zinc-600 block mt-0.5">{sub}</span>
              </button>
              <TooltipInline text={tooltip} alignRight={i === 1} />
            </div>
          ))}
        </div>

        {/* Estrutura DRE — Gerencial / Contábil */}
        <div className="flex items-center gap-1">
          {ESTRUTURAS.map(({ value, label, tooltip }, i) => (
            <div key={value} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => mudarEstrutura(value)}
                className={CHIP(estrutura === value)}
              >
                {label}
              </button>
              <TooltipInline text={tooltip} alignRight={i === 1} />
            </div>
          ))}
        </div>

        {/* Toggles + Modo edição */}
        <button type="button" onClick={() => setComparar(p => !p)} className={CHIP(comparar)}>
          <iconify-icon icon="lucide:git-compare" width="11" className="mr-1"></iconify-icon>
          Comparar
        </button>
        <button type="button" onClick={() => setMostrarZeradas(p => !p)} className={CHIP(mostrarZeradas)}>
          Mostrar zeradas
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setModoEdicao(p => !p)}
            disabled={salvandoOrdem}
            className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1 ${
              modoEdicao
                ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10'
                : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <iconify-icon icon={modoEdicao ? 'lucide:check' : 'lucide:pencil'} width="11"></iconify-icon>
            {modoEdicao ? 'Concluir edição' : 'Editar ordem'}
          </button>
        )}

        {/* Exportar */}
        {!loading && !erro && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => exportarPDF(dreRef, titulo)}
              className="border border-gray-300 dark:border-zinc-800 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <iconify-icon icon="lucide:file-down" width="11"></iconify-icon>PDF
            </button>
            <button
              type="button"
              onClick={() => exportarCSV(dreAtual, dreAnt, titulo, comparar)}
              className="border border-gray-300 dark:border-zinc-800 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <iconify-icon icon="lucide:table" width="11"></iconify-icon>CSV
            </button>
          </div>
        )}
      </div>

      {/* ── KPIs fixos ────────────────────────────────────────────────────── */}
      {!loading && !erro && temDados && (
        <div className="sticky top-0 z-20 pb-2" style={{ background: 'linear-gradient(to bottom, #050505 85%, transparent)' }}>
          <PainelKPIs dre={dreAtual} emprestimos={emprestimos} />
        </div>
      )}

      {/* ── Aviso: migration não aplicada ─────────────────────────────────── */}
      {!loading && !erro && !temDados && (
        <div className="border border-amber-900 bg-amber-950/20 px-4 py-3 flex items-center gap-2">
          <iconify-icon icon="lucide:alert-triangle" width="14" className="text-amber-400 shrink-0"></iconify-icon>
          <p className="font-mono text-[10px] text-amber-400">
            Plano de contas desatualizado. Execute as migrations 20260424000001 e 20260424000002 no Supabase SQL Editor.
          </p>
        </div>
      )}

      {/* ── Estados de loading / erro / vazio ─────────────────────────────── */}
      {loading ? (
        <div className="border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-[#0a0a0a] p-8 flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 dark:bg-zinc-900 animate-pulse rounded" style={{ width: `${50 + (i % 4) * 12}%`, marginLeft: `${(i % 3) * 16}px` }} />
          ))}
        </div>
      ) : erro ? (
        <div className="border border-gray-300 dark:border-zinc-800 p-10 flex flex-col items-center gap-3">
          <iconify-icon icon="lucide:alert-triangle" width="28" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">{erro}</p>
          <button type="button" onClick={carregar} className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 border border-gray-300 dark:border-zinc-800 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
            Tentar novamente
          </button>
        </div>
      ) : (

      /* ── Tabela DRE ─────────────────────────────────────────────────────── */
      <div ref={dreRef} className="border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-[#0a0a0a] overflow-x-auto">

        {/* Cabeçalho interno */}
        <div className="px-4 py-3 border-b border-gray-300 dark:border-zinc-800 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white">
            DRE — {periodoLabel(modo, mesAno, trim, ano)}
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">
              {lancsAtual.length} lançamento{lancsAtual.length !== 1 ? 's' : ''}
            </span>
            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">
              regime de {campoData === 'data_pagamento' ? 'caixa' : 'competência'}
              {modoEdicao && <span className="text-yellow-400 ml-2">● modo edição</span>}
            </span>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndDnD}>
        <table className="w-full border-collapse min-w-[540px]">
          <thead>
            <tr className="border-b border-gray-300 dark:border-zinc-800">
              <th className="text-left py-2 pl-4 font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Descrição</th>
              <th className="text-right py-2 pr-4 font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 whitespace-nowrap">Valor</th>
              <th className="text-right py-2 pr-4 font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">% RL</th>
              {comparar && <>
                <th className="text-right py-2 pr-4 font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 whitespace-nowrap">Per. Ant.</th>
                <th className="text-right py-2 pr-4 font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Var.</th>
              </>}
            </tr>
          </thead>
          <tbody>

            {/* ── RECEITA BRUTA ────────────────────────────────────────────── */}
            <SecaoDRE
              titulo="Receita Bruta"
              arvore={dreAtual.arvReceita}
              tipoKey="receita"
              rl={dreAtual.receitaLiquida}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={toggleNode}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={dreEditProps}
            />

            {/* ── DEDUÇÕES DE VENDAS ───────────────────────────────────────── */}
            <SecaoDRE
              titulo="(−) Deduções de Vendas"
              arvore={dreAtual.arvTributo}
              tipoKey="tributo"
              rl={dreAtual.receitaLiquida}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={toggleNode}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={dreEditProps}
            />

            {/* ── (=) RECEITA LÍQUIDA ──────────────────────────────────────── */}
            <LinhaSubtotal
              label="(=) RECEITA LÍQUIDA"
              valor={dreAtual.receitaLiquida}
              valorAnt={dreAnt.receitaLiquida}
              rl={null}
              comparar={comparar}
            />

            {/* ── CUSTOS VARIÁVEIS DIRETOS ─────────────────────────────────── */}
            <SecaoDRE
              titulo={isContabil ? "(−) Custo das Mercadorias Vendidas (CMV)" : "(−) Custos Variáveis Diretos"}
              arvore={dreAtual.arvCustoVar}
              tipoKey="custo_variavel"
              rl={dreAtual.receitaLiquida}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={toggleNode}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={dreEditProps}
            />

            {/* ── (=) MARGEM DE CONTRIBUIÇÃO ───────────────────────────────── */}
            <LinhaSubtotal
              label={isContabil ? "(=) LUCRO BRUTO" : "(=) MARGEM DE CONTRIBUIÇÃO"}
              valor={dreAtual.margemContribuicao}
              valorAnt={dreAnt.margemContribuicao}
              rl={dreAtual.receitaLiquida}
              comparar={comparar}
            />

            {/* ── CUSTOS FIXOS ─────────────────────────────────────────────── */}
            <SecaoDRE
              titulo={isContabil ? "(−) Despesas Operacionais" : "(−) Custos Fixos"}
              arvore={dreAtual.arvCustoFixo}
              tipoKey="custo_fixo"
              rl={dreAtual.receitaLiquida}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={toggleNode}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={dreEditProps}
            />

            {/* ── (=) RESULTADO OPERACIONAL / EBITDA ──────────────────────── */}
            <LinhaSubtotal
              label={isContabil ? "(=) LUCRO OPERACIONAL (EBIT)" : "(=) RESULTADO OPERACIONAL / EBITDA"}
              valor={dreAtual.ebitda}
              valorAnt={dreAnt.ebitda}
              rl={dreAtual.receitaLiquida}
              comparar={comparar}
            />

            {/* ── DESPESAS FINANCEIRAS ─────────────────────────────────────── */}
            <SecaoDRE
              titulo="(−) Despesas Financeiras"
              arvore={dreAtual.arvDespFin}
              tipoKey="financeiro"
              rl={dreAtual.receitaLiquida}
              antMap={antMap}
              expandidos={expandidos}
              onToggle={toggleNode}
              mostrarZeradas={mostrarZeradas}
              comparar={comparar}
              editProps={dreEditProps}
            />

            {/* ── (=) LUCRO ANTES DO IR (contábil) ────────────────────────── */}
            {isContabil && (
              <LinhaSubtotal
                label="(=) LUCRO ANTES DO IR"
                valor={dreAtual.lucroLiquido}
                valorAnt={dreAnt.lucroLiquido}
                rl={dreAtual.receitaLiquida}
                comparar={comparar}
              />
            )}

            {/* ── (=) LUCRO LÍQUIDO ────────────────────────────────────────── */}
            <LinhaSubtotal
              label="(=) LUCRO LÍQUIDO"
              valor={dreAtual.lucroLiquido}
              valorAnt={dreAnt.lucroLiquido}
              rl={dreAtual.receitaLiquida}
              comparar={comparar}
              isFinal
            />
          </tbody>
        </table>
        </DndContext>
      </div>
      )}

      {/* Nota */}
      {!loading && !erro && (
        <p className="font-mono text-[9px] text-gray-400 dark:text-zinc-700">
          Regime de {campoData === 'data_pagamento' ? 'caixa (valor_pago, apenas status=pago)' : 'competência (data de competência do lançamento)'}.
          Lançamentos cancelados excluídos. Itens com tipo='financeiro' e subtipo='nao_dre' (empréstimos, investimentos) não aparecem na DRE.
        </p>
      )}

      {/* ── Modal: Editar nome/grupo de uma conta ──────────────────────────── */}
      {modalEditarConta && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setModalEditarConta(null)}
        >
          <div
            className="bg-[#0d0d0d] border border-gray-300 dark:border-zinc-700 w-full max-w-sm p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white">Editar Conta</span>
              <button type="button" onClick={() => setModalEditarConta(null)} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white">
                <iconify-icon icon="lucide:x" width="14"></iconify-icon>
              </button>
            </div>
            <p className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{modalEditarConta.codigo} — {modalEditarConta.nome}</p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1">Nome</label>
                <input
                  type="text"
                  value={editContaForm.nome}
                  onChange={e => setEditContaForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-gray-900 dark:text-white outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
              <div>
                <label className="font-mono text-[8px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1">
                  Grupo DRE
                  <span className="text-amber-700 ml-1 normal-case tracking-normal font-sans text-[8px]">— alterar move a conta entre seções</span>
                </label>
                <select
                  value={editContaForm.tipo}
                  onChange={e => setEditContaForm(f => ({ ...f, tipo: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-gray-900 dark:text-white outline-none focus:border-yellow-400 transition-colors [color-scheme:dark]"
                >
                  {Object.entries(TIPO_LABELS_EDIT).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setModalEditarConta(null)}
                className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-800 px-3 py-1.5 hover:border-gray-400 dark:hover:border-zinc-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarEditarConta}
                disabled={salvandoOrdem || !editContaForm.nome.trim()}
                className="font-mono text-[9px] uppercase tracking-widest text-black bg-yellow-400 px-3 py-1.5 hover:bg-yellow-300 disabled:opacity-50 transition-colors"
              >
                {salvandoOrdem ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Aviso ao mover entre grupos ───────────────────────────────── */}
      {modalMoverGrupo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-50 dark:bg-[#0d0d0d] border border-amber-800 w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <iconify-icon icon="lucide:alert-triangle" width="18" className="text-amber-400 shrink-0 mt-0.5"></iconify-icon>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400 mb-2">Atenção</p>
                <p className="text-[12px] text-gray-600 dark:text-zinc-300 leading-relaxed">
                  Mover esta conta entre grupos altera o cálculo da{' '}
                  <strong className="text-gray-900 dark:text-white">Margem de Contribuição</strong> e do{' '}
                  <strong className="text-gray-900 dark:text-white">EBITDA</strong> na DRE. Todos os lançamentos desta categoria passarão a ser contabilizados no novo grupo.
                </p>
                <div className="mt-2 border border-gray-300 dark:border-zinc-800 px-3 py-2 bg-gray-200/40 dark:bg-zinc-900/40 font-mono text-[10px]">
                  <span className="text-gray-500 dark:text-zinc-400">{TIPO_LABELS_EDIT[modalMoverGrupo.conta.tipo]}</span>
                  <span className="text-gray-500 dark:text-zinc-600 mx-2">→</span>
                  <span className="text-yellow-400">{TIPO_LABELS_EDIT[modalMoverGrupo.novoTipo]}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setModalMoverGrupo(null); setEditContaForm(f => ({ ...f, tipo: modalMoverGrupo.conta.tipo })); }}
                className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-800 px-3 py-1.5 hover:border-gray-400 dark:hover:border-zinc-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMoverGrupo}
                disabled={salvandoOrdem}
                className="font-mono text-[9px] uppercase tracking-widest text-black bg-amber-400 px-3 py-1.5 hover:bg-amber-300 disabled:opacity-50 transition-colors"
              >
                {salvandoOrdem ? 'Movendo…' : 'Confirmar Mudança'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
