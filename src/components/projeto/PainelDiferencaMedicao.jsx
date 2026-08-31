import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { gerarPdfDiferenca } from '../../utils/gerarPdfDiferenca';

const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v, d = 4) => v == null ? '—' : Number(v).toFixed(d).replace('.', ',');
const fmtCm  = v => v == null ? null : (Number.isInteger(Number(v)) ? Number(v) : Number(v).toFixed(1).replace('.', ','));

const ACABAMENTO_LABELS = {
    meia_esquadria: 'Meia-Esquadria',
    reto_simples:   'Reto Simples',
    boleado:        'Boleado',
    meio_boleado:   'Meio Boleado',
    boleado_duplo:  'Boleado Duplo',
    reto_duplo:     'Reto Duplo',
    chanfrado:      'Chanfrado',
    outro:          'Outro',
};

// Agrupa peças da medição por "ambienteNome|||pecaNome" → lista de áreas ordenadas por valor.
// Permite match posicional quando há múltiplas peças com mesmo nome no mesmo ambiente.
// Inclui faixas (amb.faixas[]) e guarnições (_canvas.guarnicoes / _canvas.ambientes[n].guarnicoes).
function buildMedicaoIndex(jsonMedicao) {
    const map = new Map();
    const ambientes = jsonMedicao?.ambientes ?? [];

    ambientes.forEach(amb => {
        const ambNome = (amb.nome ?? amb.ambiente ?? '').trim();

        // Peças normais (comportamento existente) — sem largura/comprimento individual, só área
        (amb.pecas ?? []).forEach(p => {
            const pecaNome = (p.nome ?? '').trim();
            const key = `${ambNome}|||${pecaNome}`;
            if (!map.has(key)) map.set(key, []);
            const area = Math.round((parseFloat(p.area_m2 ?? p.area_liquida_m2 ?? 0)) * 10000) / 10000;
            map.get(key).push({ area, largura: null, comprimento: null });
        });

        // Faixas do ambiente — o medidor grava largura_cm/comprimento_cm, permite comparação dimensional
        (amb.faixas ?? []).forEach(f => {
            const faixaNome = (f.nome ?? 'Faixa').trim();
            const key = `${ambNome}|||${faixaNome}`;
            if (!map.has(key)) map.set(key, []);
            const area = Math.round((parseFloat(f.area_m2 ?? 0)) * 10000) / 10000;
            const largura     = f.largura_cm     != null ? Number(f.largura_cm)     : null;
            const comprimento = f.comprimento_cm != null ? Number(f.comprimento_cm) : null;
            map.get(key).push({ area, largura, comprimento });
        });
    });

    // Guarnições via _canvas — mesma lógica de _appendGuarnicoesFromCanvas (projetoUtils.jsx)
    // para garantir que ambNome e deduplicação sejam idênticos ao fluxo de salvamento.
    const rawCanvas = jsonMedicao?._canvas;
    if (rawCanvas) {
        let canvas;
        try { canvas = typeof rawCanvas === 'string' ? JSON.parse(rawCanvas) : rawCanvas; }
        catch { canvas = null; }

        if (canvas) {
            // Top-level → sem ambiente próprio → mapeadas para o primeiro ambiente (igual ao save)
            const firstAmbNome = (ambientes[0]?.nome ?? ambientes[0]?.ambiente ?? '').trim();
            const topLevel = Array.isArray(canvas.guarnicoes)
                ? canvas.guarnicoes.map(g => ({ ...g, _ambNome: firstAmbNome }))
                : [];

            // Por ambiente → usa nome do json.ambientes[idx]
            const perAmb = Array.isArray(canvas.ambientes)
                ? canvas.ambientes.flatMap((ca, idx) => {
                    const nomeReal = (
                        ambientes[idx]?.nome ?? ambientes[idx]?.ambiente ?? ca.nome ?? ''
                    ).trim();
                    return (ca.guarnicoes ?? []).map(g => ({ ...g, _ambNome: nomeReal }));
                })
                : [];

            // topLevel primeiro (igual ao _appendGuarnicoesFromCanvas) para dedup consistente
            const seen = new Set();
            [...topLevel, ...perAmb].forEach(g => {
                const dedupeKey = g.id ?? JSON.stringify(g);
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                // area_m2/area podem estar ausentes — calcula via dimensões quando necessário
                const area = Math.round((
                    parseFloat(g.area_m2 ?? g.area ?? 0) ||
                    (parseFloat(g.largura_cm ?? 0) * parseFloat(g.comprimento_cm ?? 0) / 10000)
                ) * 10000) / 10000;
                if (area <= 0) return;
                const key = `${g._ambNome}|||Guarnição`;
                if (!map.has(key)) map.set(key, []);
                const largura     = g.largura_cm     != null ? Number(g.largura_cm)     : null;
                const comprimento = g.comprimento_cm != null ? Number(g.comprimento_cm) : null;
                map.get(key).push({ area, largura, comprimento });
            });
        }
    }
    map.forEach(arr => arr.sort((a, b) => a.area - b.area));
    return map;
}

// Agrega acabamentos de todos os orcamento_pecas por tipo → { tipo: { ml, valor } }
function buildAcabamentosPedido(ops) {
    const map = {};
    (ops ?? []).forEach(op => {
        (op.acabamentos ?? []).forEach(ac => {
            const tipo = ac.tipo ?? 'outro';
            if (!map[tipo]) map[tipo] = { ml: 0, valor: 0 };
            map[tipo].ml    += Number(ac.ml    ?? 0);
            map[tipo].valor += Number(ac.valor ?? 0);
        });
    });
    return map;
}

// Agrega recortes de todos os orcamento_pecas por funcao → { funcao: count }
function buildRecortesPedido(ops) {
    const map = {};
    (ops ?? []).forEach(op => {
        (op.recortes ?? []).forEach(rc => {
            const key = rc.funcao ?? 'recorte';
            map[key] = (map[key] ?? 0) + 1;
        });
    });
    return map;
}

// Agrega recortes_consolidados de todos os ambientes da medição → { funcao: count }
function buildRecortesMedicao(jsonMedicao) {
    const map = {};
    (jsonMedicao?.ambientes ?? []).forEach(amb => {
        const cons = amb.metadados_ambiente?.recortes_consolidados ?? {};
        Object.entries(cons).forEach(([k, v]) => {
            map[k] = (map[k] ?? 0) + Number(v ?? 0);
        });
    });
    return map;
}

export default function PainelDiferencaMedicao({
    medicao,
    pedido,
    pedidoNumero,
    projeto,
    empresa,
    ambientes = [],
    catMateriais = [],
    onClose,
}) {
    const [rows, setRows] = useState([]);
    const [rowsAcabamentos, setRowsAcabamentos] = useState([]);
    const [rowsRecortes, setRowsRecortes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalImpacto, setTotalImpacto] = useState(0);
    const [ajuste, setAjuste] = useState(null);
    const [gerandoPdf, setGerandoPdf] = useState(false);

    useEffect(() => {
        if (!pedido?.cenario_ids?.length || !medicao?.json_medicao) {
            setLoading(false);
            return;
        }

        async function buildRows() {
            setLoading(true);

            const [opsResult, orcsResult] = await Promise.all([
                supabase
                    .from('orcamento_pecas')
                    .select('peca_id, material_id, valor_area, valor_total, item_nome, acabamentos, recortes, pecas(nome_livre, area_liquida_m2, ambiente_id, dimensoes)')
                    .in('orcamento_id', pedido.cenario_ids),
                supabase
                    .from('orcamentos')
                    .select('id, desconto_total, valor_frete, majoramento_percentual, rt_percentual')
                    .in('id', pedido.cenario_ids),
            ]);

            const { data: ops, error } = opsResult;
            const { data: orcsData }   = orcsResult;

            if (error) {
                console.error('[PainelDiferenca] Erro ao buscar orcamento_pecas:', error.message);
                setLoading(false);
                return;
            }

            const ambNomeMap = Object.fromEntries(ambientes.map(a => [a.id, a.nome ?? '—']));
            const matNomeMap = Object.fromEntries(catMateriais.map(m => [m.id, m.nome ?? '—']));
            const jm = medicao.json_medicao;
            const medicaoIdx = buildMedicaoIndex(jm);

            // ── Peças ──────────────────────────────────────────────────────────
            const grupos = new Map();
            (ops ?? []).forEach(op => {
                const ambNome  = ambNomeMap[op.pecas?.ambiente_id] ?? '—';
                const pecaNome = (op.pecas?.nome_livre ?? op.item_nome ?? '').trim() || '—';
                const key = `${ambNome}|||${pecaNome}`;
                if (!grupos.has(key)) grupos.set(key, []);
                grupos.get(key).push(op);
            });
            grupos.forEach(arr => arr.sort((a, b) =>
                (a.pecas?.area_liquida_m2 ?? 0) - (b.pecas?.area_liquida_m2 ?? 0)
            ));

            const todasPecas = [];
            grupos.forEach((opsGroup, key) => {
                const candidatos = medicaoIdx.get(key) ?? [];
                const [ambNome, pecaNome] = key.split('|||');
                opsGroup.forEach((op, idx) => {
                    const areaPedido = op.pecas?.area_liquida_m2 ?? null;
                    const candidato  = candidatos[idx] !== undefined ? candidatos[idx] : null;
                    const areaReal   = candidato?.area ?? null;
                    const diferenca  = areaReal !== null && areaPedido !== null
                        ? Math.round((areaReal - areaPedido) * 10000) / 10000
                        : null;
                    const precoM2 = areaPedido && areaPedido > 0
                        ? (op.valor_area ?? 0) / areaPedido
                        : null;
                    const impacto = diferenca !== null && precoM2 !== null
                        ? diferenca * precoM2
                        : null;

                    // Largura/comprimento só existem para faixas/guarnições — o medidor grava
                    // essas dimensões; peças de área normal não têm essa granularidade (só m²).
                    const dim = op.pecas?.dimensoes ?? {};
                    const da  = Number(dim.altura  ?? 0);
                    const dl  = Number(dim.largura ?? 0);
                    const larguraPedido     = (da && dl) ? Math.min(da, dl) : null;
                    const comprimentoPedido = (da || dl) ? Math.max(da, dl) : null;
                    const larguraReal       = candidato?.largura     ?? null;
                    const comprimentoReal   = candidato?.comprimento ?? null;

                    todasPecas.push({
                        ambienteNome: ambNome,
                        pecaNome:     pecaNome || '—',
                        materialNome: matNomeMap[op.material_id] ?? '—',
                        areaPedido, areaReal, diferenca, precoM2, impacto,
                        larguraPedido, comprimentoPedido, larguraReal, comprimentoReal,
                        semCorrespondencia: areaReal === null,
                    });
                });
            });
            const linhasPecas = todasPecas.filter(l =>
                l.semCorrespondencia || (l.diferenca !== null && Math.abs(l.diferenca) > 0.001)
            );

            // ── Acabamentos ────────────────────────────────────────────────────
            const acPedido  = buildAcabamentosPedido(ops);
            const acMedicao = jm?.metadados?.acabamentos_consolidados ?? {};
            const tiposAcab = new Set([
                ...Object.keys(acPedido),
                ...Object.keys(acMedicao).map(k => k.replace(/_ml$/, '')),
            ]);
            const linhasAcab = [];
            tiposAcab.forEach(tipo => {
                const mlPedido    = acPedido[tipo]?.ml    ?? null;
                const valorPedido = acPedido[tipo]?.valor ?? null;
                const mlReal      = acMedicao[`${tipo}_ml`] != null ? Number(acMedicao[`${tipo}_ml`]) : null;
                const diferenca   = mlReal !== null && mlPedido !== null
                    ? Math.round((mlReal - mlPedido) * 100) / 100
                    : null;
                const precoMl = mlPedido && mlPedido > 0 && valorPedido != null
                    ? valorPedido / mlPedido
                    : null;
                const impacto = diferenca !== null && precoMl !== null
                    ? diferenca * precoMl
                    : null;
                if (mlPedido === null || mlReal === null || (diferenca !== null && Math.abs(diferenca) > 0.01)) {
                    linhasAcab.push({ tipo, mlPedido, mlReal, diferenca, precoMl, impacto });
                }
            });

            // ── Recortes ───────────────────────────────────────────────────────
            const rcPedido  = buildRecortesPedido(ops);
            const rcMedicao = buildRecortesMedicao(jm);
            const funcoes   = new Set([...Object.keys(rcPedido), ...Object.keys(rcMedicao)]);
            const linhasRc  = [];
            funcoes.forEach(funcao => {
                const qtdPedido = rcPedido[funcao]  != null ? rcPedido[funcao]  : null;
                const qtdReal   = rcMedicao[funcao] != null ? rcMedicao[funcao] : null;
                const diferenca = qtdReal !== null && qtdPedido !== null
                    ? qtdReal - qtdPedido
                    : null;
                if (qtdPedido === qtdReal) return; // contagem igual nos dois lados — sem mudança, não lista
                linhasRc.push({ funcao, qtdPedido, qtdReal, diferenca });
            });

            const totalPecas = linhasPecas.reduce((s, l) => s + (l.impacto ?? 0), 0);
            const totalAcab  = linhasAcab.reduce((s, l) => s + (l.impacto ?? 0), 0);
            const impactoBase = totalPecas + totalAcab;

            const frete       = (orcsData ?? []).reduce((s, o) => s + (o.valor_frete    ?? 0), 0);
            const desconto    = (orcsData ?? []).reduce((s, o) => s + (o.desconto_total ?? 0), 0);
            const majoramento = orcsData?.[0]?.majoramento_percentual ?? 0;
            const rt          = orcsData?.[0]?.rt_percentual          ?? 0;
            const fatorMaj    = 1 + majoramento / 100;
            const fatorRt     = 1 + rt / 100;
            const totalFinal  = impactoBase * fatorMaj * fatorRt;

            setRows(linhasPecas);
            setRowsAcabamentos(linhasAcab);
            setRowsRecortes(linhasRc);
            setTotalImpacto(impactoBase);
            setAjuste({ frete, desconto, majoramento, rt, totalFinal });
            setLoading(false);
        }

        buildRows();
    }, [medicao?.id, pedido?.id]);

    async function handleGerarPdf() {
        setGerandoPdf(true);
        try {
            await gerarPdfDiferenca({ linhas: rows, totalImpacto, medicao, pedido, pedidoNumero, projeto, empresa });
        } finally {
            setGerandoPdf(false);
        }
    }

    const isAcrescimo        = totalImpacto > 0;
    const isDesconto         = totalImpacto < 0;
    const semCorrespondencia = rows.filter(r => r.semCorrespondencia).length;
    const temDados           = rows.length > 0 || rowsAcabamentos.length > 0 || rowsRecortes.length > 0;

    return (
        <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
            <div className="fixed right-0 top-0 h-full w-full max-w-[920px] bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border-l border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none z-50 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
                    <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Diferença de Medição</span>
                        <span className="font-mono text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest">Pedido {pedidoNumero}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGerarPdf}
                            disabled={gerandoPdf || loading || !temDados}
                            className="flex items-center gap-2 border border-orange-300 dark:border-yellow-400/40 text-orange-700 dark:text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md dark:rounded-none hover:bg-orange-50 dark:hover:bg-yellow-400/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {gerandoPdf
                                ? <><iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon> Gerando...</>
                                : <><iconify-icon icon="solar:file-download-linear" width="13"></iconify-icon> Gerar PDF Nota de Ajuste</>}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center border border-zinc-200/80 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600 rounded-md dark:rounded-none transition-colors"
                        >
                            <iconify-icon icon="solar:close-linear" width="14"></iconify-icon>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-700 border-t-orange-500 dark:border-t-yellow-400 rounded-full animate-spin"></div>
                        </div>
                    ) : !temDados ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <iconify-icon icon="solar:check-circle-linear" width="36" className="text-green-400 dark:text-green-500"></iconify-icon>
                            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Sem diferenças</p>
                            <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">Peças, acabamentos e recortes dentro da tolerância</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Seção: Peças ───────────────────────────────────────── */}
                            {rows.length > 0 && (
                                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                                    <h3 className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 font-semibold mb-3">Peças</h3>
                                    <div className="flex flex-col gap-2.5">
                                        {rows.map((row, i) => {
                                            const temDimensao =
                                                !row.semCorrespondencia &&
                                                row.larguraPedido != null && row.comprimentoPedido != null &&
                                                row.larguraReal   != null && row.comprimentoReal   != null;
                                            const temArea = !row.semCorrespondencia && row.areaPedido != null && row.areaReal != null;
                                            return (
                                                <div key={i} className="flex items-start justify-between gap-4 border border-zinc-200/80 dark:border-zinc-800 rounded-lg dark:rounded-none px-4 py-3">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="text-sm font-medium text-zinc-900 dark:text-white">{row.pecaNome}</span>
                                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                                                            {row.ambienteNome} · {row.materialNome}
                                                        </span>
                                                        {row.semCorrespondencia ? (
                                                            <span className="text-[12px] text-amber-600 dark:text-amber-400 mt-1">
                                                                Não encontrada na medição de produção
                                                            </span>
                                                        ) : temDimensao ? (
                                                            <span className="text-[12px] text-zinc-600 dark:text-zinc-300 mt-1">
                                                                Metragem: {fmtCm(row.larguraPedido)}x{fmtCm(row.comprimentoPedido)} → {fmtCm(row.larguraReal)}x{fmtCm(row.comprimentoReal)} cm
                                                            </span>
                                                        ) : temArea ? (
                                                            <span className="text-[12px] text-zinc-600 dark:text-zinc-300 mt-1">
                                                                Área: {fmtNum(row.areaPedido, 2)} m² → {fmtNum(row.areaReal, 2)} m²
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {row.impacto != null && Math.abs(row.impacto) > 0.005 && (
                                                        <span className={`font-mono text-sm font-semibold shrink-0 ${row.impacto > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                                            {row.impacto > 0 ? '+' : '−'}{fmtBRL(Math.abs(row.impacto))}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Seção: Acabamentos ─────────────────────────────────── */}
                            {rowsAcabamentos.length > 0 && (
                                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                                    <h3 className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 font-semibold mb-3">Acabamentos</h3>
                                    <div className="flex flex-col gap-2.5">
                                        {rowsAcabamentos.map((row, i) => (
                                            <div key={i} className="flex items-start justify-between gap-4 border border-zinc-200/80 dark:border-zinc-800 rounded-lg dark:rounded-none px-4 py-3">
                                                <div className="flex flex-col gap-1 min-w-0">
                                                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                                                        {ACABAMENTO_LABELS[row.tipo] ?? row.tipo}
                                                    </span>
                                                    <span className="text-[12px] text-zinc-600 dark:text-zinc-300">
                                                        Metragem: {row.mlPedido != null ? `${fmtNum(row.mlPedido, 2)} m` : 'não previsto'} → {row.mlReal != null ? `${fmtNum(row.mlReal, 2)} m` : 'não medido'}
                                                    </span>
                                                </div>
                                                {row.impacto != null && Math.abs(row.impacto) > 0.005 && (
                                                    <span className={`font-mono text-sm font-semibold shrink-0 ${row.impacto > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                                        {row.impacto > 0 ? '+' : '−'}{fmtBRL(Math.abs(row.impacto))}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Seção: Recortes ────────────────────────────────────── */}
                            {rowsRecortes.length > 0 && (
                                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                                    <h3 className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 font-semibold mb-3">Recortes</h3>
                                    <div className="flex flex-col gap-2">
                                        {rowsRecortes.map((row, i) => {
                                            const label = row.funcao
                                                .replace(/_/g, ' ')
                                                .replace(/\b\w/g, c => c.toUpperCase());
                                            return (
                                                <div key={i} className="flex items-center justify-between border border-zinc-200/80 dark:border-zinc-800 rounded-lg dark:rounded-none px-4 py-2.5">
                                                    <span className="text-sm text-zinc-900 dark:text-white">{label}</span>
                                                    <span className="text-[12px] text-zinc-600 dark:text-zinc-300">
                                                        {row.qtdPedido ?? 'nenhum'} → {row.qtdReal ?? 'nenhum'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="px-6 py-5 border-t border-zinc-200/80 dark:border-zinc-800">
                                <div className="flex flex-col gap-1.5">
                                    {/* Subtotal das diferenças (antes dos multiplicadores) */}
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                                            Subtotal das diferenças
                                        </span>
                                        <span className={`font-mono text-sm font-semibold ${isAcrescimo ? 'text-red-600 dark:text-red-400' : isDesconto ? 'text-green-700 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                            {isAcrescimo ? '+' : isDesconto ? '−' : ''}{fmtBRL(Math.abs(totalImpacto))}
                                        </span>
                                    </div>

                                    {/* Itens informativos do orçamento */}
                                    {ajuste && (
                                        <>
                                            {ajuste.frete > 0 && (
                                                <InfoRow label="Frete" value={fmtBRL(ajuste.frete)} />
                                            )}
                                            {ajuste.desconto > 0 && (
                                                <InfoRow label="Desconto" value={`−${fmtBRL(ajuste.desconto)}`} valueClass="text-green-600 dark:text-green-500" />
                                            )}
                                            <InfoRow label="Majoramento" value={`${ajuste.majoramento}%`} />
                                            <InfoRow label="RT" value={`${ajuste.rt}%`} />
                                        </>
                                    )}

                                    {/* Total final com multiplicadores */}
                                    {ajuste && (
                                        <div className="border-t border-zinc-200/80 dark:border-zinc-800 mt-1 pt-3 flex items-center justify-between">
                                            <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-zinc-700 dark:text-zinc-300">
                                                Total do Ajuste
                                            </span>
                                            <span className={`font-mono text-2xl font-bold ${ajuste.totalFinal > 0 ? 'text-red-600 dark:text-red-400' : ajuste.totalFinal < 0 ? 'text-green-700 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                                {ajuste.totalFinal > 0 ? '+' : ajuste.totalFinal < 0 ? '−' : ''}{fmtBRL(Math.abs(ajuste.totalFinal))}
                                            </span>
                                        </div>
                                    )}

                                    {semCorrespondencia > 0 && (
                                        <span className="font-mono text-[10px] text-amber-500 dark:text-amber-400 mt-1">
                                            {semCorrespondencia} peça{semCorrespondencia !== 1 ? 's' : ''} sem medição correspondente
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function InfoRow({ label, value, valueClass = '' }) {
    return (
        <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{label}</span>
            <span className={`font-mono text-[10px] text-zinc-400 dark:text-zinc-600 ${valueClass}`}>{value}</span>
        </div>
    );
}
