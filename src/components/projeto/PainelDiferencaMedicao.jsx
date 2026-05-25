import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { gerarPdfDiferenca } from '../../utils/gerarPdfDiferenca';

const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v, d = 4) => v == null ? '—' : Number(v).toFixed(d).replace('.', ',');

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

        // Peças normais (comportamento existente)
        (amb.pecas ?? []).forEach(p => {
            const pecaNome = (p.nome ?? '').trim();
            const key = `${ambNome}|||${pecaNome}`;
            if (!map.has(key)) map.set(key, []);
            const area = Math.round((parseFloat(p.area_m2 ?? p.area_liquida_m2 ?? 0)) * 10000) / 10000;
            map.get(key).push(area);
        });

        // Faixas do ambiente
        (amb.faixas ?? []).forEach(f => {
            const faixaNome = (f.nome ?? 'Faixa').trim();
            const key = `${ambNome}|||${faixaNome}`;
            if (!map.has(key)) map.set(key, []);
            const area = Math.round((parseFloat(f.area_m2 ?? 0)) * 10000) / 10000;
            map.get(key).push(area);
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
                map.get(key).push(area);
            });
        }
    }
    map.forEach(arr => arr.sort((a, b) => a - b));
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
    const [gerandoPdf, setGerandoPdf] = useState(false);

    useEffect(() => {
        if (!pedido?.cenario_ids?.length || !medicao?.json_medicao) {
            setLoading(false);
            return;
        }

        async function buildRows() {
            setLoading(true);

            const { data: ops, error } = await supabase
                .from('orcamento_pecas')
                .select('peca_id, material_id, valor_area, item_nome, acabamentos, recortes, pecas(nome_livre, area_liquida_m2, ambiente_id)')
                .in('orcamento_id', pedido.cenario_ids);

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
                    const areaReal   = candidatos[idx] !== undefined ? candidatos[idx] : null;
                    const diferenca  = areaReal !== null && areaPedido !== null
                        ? Math.round((areaReal - areaPedido) * 10000) / 10000
                        : null;
                    const precoM2 = areaPedido && areaPedido > 0
                        ? (op.valor_area ?? 0) / areaPedido
                        : null;
                    const impacto = diferenca !== null && precoM2 !== null
                        ? diferenca * precoM2
                        : null;
                    todasPecas.push({
                        ambienteNome: ambNome,
                        pecaNome:     pecaNome || '—',
                        materialNome: matNomeMap[op.material_id] ?? '—',
                        areaPedido, areaReal, diferenca, precoM2, impacto,
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
                linhasRc.push({ funcao, qtdPedido, qtdReal, diferenca });
            });

            const totalPecas = linhasPecas.reduce((s, l) => s + (l.impacto ?? 0), 0);
            const totalAcab  = linhasAcab.reduce((s, l) => s + (l.impacto ?? 0), 0);

            setRows(linhasPecas);
            setRowsAcabamentos(linhasAcab);
            setRowsRecortes(linhasRc);
            setTotalImpacto(totalPecas + totalAcab);
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
            <div className="fixed right-0 top-0 h-full w-full max-w-[920px] bg-white dark:bg-[#0a0a0a] border-l border-gray-200 dark:border-zinc-800 z-50 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
                    <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Diferença de Medição</span>
                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Pedido {pedidoNumero}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGerarPdf}
                            disabled={gerandoPdf || loading || !temDados}
                            className="flex items-center gap-2 border border-yellow-300 dark:border-yellow-400/40 text-yellow-700 dark:text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 hover:bg-yellow-100 dark:hover:bg-yellow-400/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {gerandoPdf
                                ? <><iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon> Gerando...</>
                                : <><iconify-icon icon="solar:file-download-linear" width="13"></iconify-icon> Gerar PDF Nota de Ajuste</>}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center border border-gray-200 dark:border-zinc-800 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-400 dark:hover:border-zinc-600 transition-colors"
                        >
                            <iconify-icon icon="solar:close-linear" width="14"></iconify-icon>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <div className="w-6 h-6 border-2 border-gray-200 dark:border-zinc-700 border-t-yellow-400 rounded-full animate-spin"></div>
                        </div>
                    ) : !temDados ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <iconify-icon icon="solar:check-circle-linear" width="36" className="text-green-400 dark:text-green-500"></iconify-icon>
                            <p className="font-mono text-[11px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">Sem diferenças</p>
                            <p className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">Peças, acabamentos e recortes dentro da tolerância</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Seção: Peças ───────────────────────────────────────── */}
                            <SectionHeader label="Peças" />
                            {rows.length === 0 ? (
                                <EmptySection label="Sem diferenças de área" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-[11px] font-mono border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-800 dark:bg-zinc-900 text-white">
                                                {['Ambiente', 'Peça', 'Material', 'm² Ped.', 'm² Real', 'Diferença', 'R$/m²', 'Impacto'].map((h, i) => (
                                                    <th key={h} className={`py-2.5 px-3 font-semibold tracking-wider text-[10px] uppercase ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, i) => {
                                                const diffPos = row.diferenca !== null && row.diferenca > 0;
                                                const diffNeg = row.diferenca !== null && row.diferenca < 0;
                                                const diffStr = row.diferenca !== null
                                                    ? (row.diferenca >= 0 ? '+' : '') + fmtNum(row.diferenca, 4)
                                                    : '—';
                                                return (
                                                    <tr key={i} className={`border-b border-gray-100 dark:border-zinc-900 ${i % 2 === 1 ? 'bg-gray-50 dark:bg-zinc-900/30' : 'bg-white dark:bg-transparent'}`}>
                                                        <td className="px-3 py-2.5 text-gray-600 dark:text-zinc-400">{row.ambienteNome}</td>
                                                        <td className="px-3 py-2.5 text-gray-900 dark:text-white font-medium">{row.pecaNome}</td>
                                                        <td className="px-3 py-2.5 text-gray-600 dark:text-zinc-400">{row.materialNome}</td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">{fmtNum(row.areaPedido, 4)}</td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.areaReal !== null
                                                                ? fmtNum(row.areaReal, 4)
                                                                : <span className="text-amber-500 dark:text-amber-400">—</span>}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-semibold ${diffPos ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/5' : diffNeg ? 'text-green-700 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`}>
                                                            {diffStr}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.precoM2 !== null
                                                                ? fmtBRL(row.precoM2)
                                                                : <span className="text-gray-300 dark:text-zinc-700">—</span>}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-semibold ${row.impacto > 0 ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/5' : row.impacto < 0 ? 'text-green-700 dark:text-green-400' : 'text-gray-300 dark:text-zinc-700'}`}>
                                                            {row.impacto !== null ? fmtBRL(row.impacto) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── Seção: Acabamentos ─────────────────────────────────── */}
                            <SectionHeader label="Acabamentos" />
                            {rowsAcabamentos.length === 0 ? (
                                <EmptySection label="Sem diferenças de acabamento" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[600px] text-[11px] font-mono border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-800 dark:bg-zinc-900 text-white">
                                                {['Tipo', 'ml Ped.', 'ml Real', 'Diferença', 'R$/ml', 'Impacto'].map((h, i) => (
                                                    <th key={h} className={`py-2.5 px-3 font-semibold tracking-wider text-[10px] uppercase ${i >= 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rowsAcabamentos.map((row, i) => {
                                                const diffPos = row.diferenca !== null && row.diferenca > 0;
                                                const diffNeg = row.diferenca !== null && row.diferenca < 0;
                                                const diffStr = row.diferenca !== null
                                                    ? (row.diferenca >= 0 ? '+' : '') + fmtNum(row.diferenca, 2)
                                                    : '—';
                                                return (
                                                    <tr key={i} className={`border-b border-gray-100 dark:border-zinc-900 ${i % 2 === 1 ? 'bg-gray-50 dark:bg-zinc-900/30' : 'bg-white dark:bg-transparent'}`}>
                                                        <td className="px-3 py-2.5 text-gray-900 dark:text-white font-medium">
                                                            {ACABAMENTO_LABELS[row.tipo] ?? row.tipo}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.mlPedido !== null
                                                                ? fmtNum(row.mlPedido, 2)
                                                                : <span className="text-amber-500 dark:text-amber-400">—</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.mlReal !== null
                                                                ? fmtNum(row.mlReal, 2)
                                                                : <span className="text-amber-500 dark:text-amber-400">—</span>}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-semibold ${diffPos ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/5' : diffNeg ? 'text-green-700 dark:text-green-400' : 'text-gray-300 dark:text-zinc-700'}`}>
                                                            {diffStr}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.precoMl !== null
                                                                ? fmtBRL(row.precoMl)
                                                                : <span className="text-gray-300 dark:text-zinc-700">—</span>}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-semibold ${row.impacto > 0 ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/5' : row.impacto < 0 ? 'text-green-700 dark:text-green-400' : 'text-gray-300 dark:text-zinc-700'}`}>
                                                            {row.impacto !== null ? fmtBRL(row.impacto) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── Seção: Recortes ────────────────────────────────────── */}
                            <SectionHeader label="Recortes" />
                            {rowsRecortes.length === 0 ? (
                                <EmptySection label="Sem recortes registrados" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[420px] text-[11px] font-mono border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-800 dark:bg-zinc-900 text-white">
                                                {['Tipo de Furo', 'Qtd Ped.', 'Qtd Real', 'Diferença'].map((h, i) => (
                                                    <th key={h} className={`py-2.5 px-3 font-semibold tracking-wider text-[10px] uppercase ${i >= 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rowsRecortes.map((row, i) => {
                                                const diffPos = row.diferenca !== null && row.diferenca > 0;
                                                const diffNeg = row.diferenca !== null && row.diferenca < 0;
                                                const label   = row.funcao
                                                    .replace(/_/g, ' ')
                                                    .replace(/\b\w/g, c => c.toUpperCase());
                                                return (
                                                    <tr key={i} className={`border-b border-gray-100 dark:border-zinc-900 ${i % 2 === 1 ? 'bg-gray-50 dark:bg-zinc-900/30' : 'bg-white dark:bg-transparent'}`}>
                                                        <td className="px-3 py-2.5 text-gray-900 dark:text-white font-medium">{label}</td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.qtdPedido !== null
                                                                ? row.qtdPedido
                                                                : <span className="text-amber-500 dark:text-amber-400">—</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                                                            {row.qtdReal !== null
                                                                ? row.qtdReal
                                                                : <span className="text-amber-500 dark:text-amber-400">—</span>}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-semibold ${diffPos ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/5' : diffNeg ? 'text-green-700 dark:text-green-400' : 'text-gray-300 dark:text-zinc-700'}`}>
                                                            {row.diferenca !== null
                                                                ? (row.diferenca >= 0 ? '+' : '') + row.diferenca
                                                                : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="px-6 py-5 border-t border-gray-200 dark:border-zinc-800 flex items-end justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <span className={`font-mono text-[9px] uppercase tracking-widest ${isAcrescimo ? 'text-red-500' : isDesconto ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-zinc-600'}`}>
                                        {isAcrescimo ? 'Acréscimo total (peças + acabamentos)' : isDesconto ? 'Desconto total (peças + acabamentos)' : 'Sem ajuste financeiro'}
                                    </span>
                                    <span className={`font-mono text-2xl font-bold ${isAcrescimo ? 'text-red-600 dark:text-red-400' : isDesconto ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                                        {isAcrescimo ? '+' : isDesconto ? '−' : ''}{fmtBRL(Math.abs(totalImpacto))}
                                    </span>
                                </div>
                                {semCorrespondencia > 0 && (
                                    <span className="font-mono text-[10px] text-amber-500 dark:text-amber-400">
                                        {semCorrespondencia} peça{semCorrespondencia !== 1 ? 's' : ''} sem medição correspondente
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function SectionHeader({ label }) {
    return (
        <div className="px-6 py-2.5 bg-gray-100 dark:bg-zinc-900/60 border-b border-gray-200 dark:border-zinc-800">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-semibold">{label}</span>
        </div>
    );
}

function EmptySection({ label }) {
    return (
        <div className="px-6 py-3 border-b border-gray-100 dark:border-zinc-900">
            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">{label}</span>
        </div>
    );
}
