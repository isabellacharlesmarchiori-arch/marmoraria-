import React from 'react';

// ─── SVG URL parsers ─────────────────────────────────────────────────────────
// O banco armazena svg_url como string JSON `["url_amb1","url_amb2"]`.

export function parseSvgUrls(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
            try { return JSON.parse(trimmed); } catch {}
        }
        return [raw];
    }
    return [];
}

export function parseSvgUrl(raw) {
    const arr = parseSvgUrls(raw);
    return arr.length > 0 ? arr[0] : null;
}

// ─── Status configs ──────────────────────────────────────────────────────────

export const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',   bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
    aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30', bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-400/5', dot: 'bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',  bg: 'bg-blue-400/5',   dot: 'bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',   bg: 'bg-red-400/5',    dot: 'bg-red-400'    },
};

export const MEDICAO_STATUS = {
    agendada:   { label: 'Agendada',   color: 'text-zinc-400',   border: 'border-zinc-700',      bg: 'bg-zinc-900',       dot: 'bg-zinc-500'   },
    enviada:    { label: 'Enviada',    color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/5',  dot: 'bg-yellow-400' },
    processada: { label: 'Processada', color: 'text-violet-400', border: 'border-violet-400/30', bg: 'bg-violet-400/5',  dot: 'bg-violet-400' },
    concluida:  { label: 'Aprovada',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    aprovada:   { label: 'Aprovada',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
};

// ─── Pill components ─────────────────────────────────────────────────────────

export function StatusPill({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

export function MedicaoPill({ status }) {
    const cfg = MEDICAO_STATUS[status] || MEDICAO_STATUS.agendada;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

// ─── Normalização ─────────────────────────────────────────────────────────────

export function normalizarJsonMedicao(json) {
    if (!json) return null;

    if (Array.isArray(json.resumo_por_peca) && json.resumo_por_peca.length > 0) {
        return json;
    }

    if (Array.isArray(json.ambientes)) {
        // Flutter 2.0: pecas têm segmentos[] em vez de width_cm/height_cm
        const isFlutter2 = !!json.versao_app ||
            Array.isArray(json.ambientes[0]?.pecas) && json.ambientes[0].pecas[0]?.segmentos !== undefined;

        if (isFlutter2) {
            const resumo = [];
            let ambTotalME = 0;
            let ambTotalRS = 0;
            for (const amb of json.ambientes) {
                const nomeAmbiente = amb.nome ?? amb.ambiente ?? null;
                const meta = amb.metadados_ambiente;
                const pecasDoAmb = [];
                for (const p of (Array.isArray(amb.pecas) ? amb.pecas : [])) {
                    const area = parseFloat(p.area_m2) || 0;
                    const segs = Array.isArray(p.segmentos) ? p.segmentos : [];
                    let reto_simples_ml   = 0;
                    let meia_esquadria_ml = 0;
                    segs.forEach(s => {
                        const lenM = (parseFloat(s.medida_cm) || 0) / 100;
                        if (s.acabamento === 'RS') reto_simples_ml   += lenM;
                        if (s.acabamento === 'ME') meia_esquadria_ml += lenM;
                    });
                    const peca = {
                        nome:            p.nome ?? 'Peça',
                        area_liquida_m2: Math.round(area * 10000) / 10000,
                        espessura_cm:    p.espessura_cm ?? null,
                        ambiente_nome:   nomeAmbiente,
                        item_nome:       null,
                        item_id:         null,
                        type:            p.tipo ?? 'retangulo',
                        recortes_qty:    Array.isArray(p.recortes) ? p.recortes.length : 0,
                        recortes:        Array.isArray(p.recortes) ? p.recortes : [],
                        segmentos:       segs,
                        acabamentos: {
                            reto_simples_ml:   Math.round(reto_simples_ml   * 100) / 100,
                            meia_esquadria_ml: Math.round(meia_esquadria_ml * 100) / 100,
                        },
                    };
                    pecasDoAmb.push(peca);
                    resumo.push(peca);
                }
                // Faixas do ambiente
                (amb.faixas ?? []).forEach(f => {
                    const area = parseFloat(f.area_m2) || 0;
                    if (area <= 0) return;
                    resumo.push({
                        nome:            f.nome ?? 'Faixa',
                        descricao:       `${f.largura_cm ?? '?'}×${f.comprimento_cm ?? '?'}×${f.espessura_cm ?? '?'}cm — ${area.toFixed(3)}m²`,
                        area_liquida_m2: Math.round(area * 10000) / 10000,
                        espessura_cm:    f.espessura_cm ?? 2,
                        ambiente_nome:   nomeAmbiente,
                        item_nome:       null,
                        item_id:         null,
                        type:            'faixa',
                        recortes_qty:    0,
                        recortes:        [],
                        segmentos:       [],
                        acabamentos:     { meia_esquadria_ml: 0, reto_simples_ml: 0 },
                    });
                });
                // Flutter já calculou o total correto do ambiente — usa quando disponível.
                // Sem metadados, soma por peça (pode duplicar lados opostos em retângulos).
                if (meta) {
                    ambTotalME += parseFloat(meta.meia_esquadria_ml) || 0;
                    ambTotalRS += parseFloat(meta.reto_simples_ml)   || 0;
                } else {
                    pecasDoAmb.forEach(p => {
                        ambTotalME += p.acabamentos.meia_esquadria_ml;
                        ambTotalRS += p.acabamentos.reto_simples_ml;
                    });
                }
            }
            return {
                resumo_por_peca: resumo,
                _fonte: 'flutter2',
                totais_acabamentos: {
                    meia_esquadria_ml: Math.round(ambTotalME * 100) / 100,
                    reto_simples_ml:   Math.round(ambTotalRS * 100) / 100,
                },
            };
        }

        // Flutter 1.0 / formato legado
        const resumo = [];
        for (const amb of json.ambientes) {
            const nomeAmbiente = amb.ambiente ?? amb.nome ?? null;
            const fontes = [];
            if (Array.isArray(amb.itens) && amb.itens.length > 0) {
                for (const item of amb.itens) {
                    const pecasItem = Array.isArray(item.pecas) ? item.pecas : [];
                    for (const p of pecasItem) {
                        fontes.push({ p, item_nome: item.nome ?? null, item_id: item.item_id ?? null });
                    }
                }
                const semItem = Array.isArray(amb.pecas_sem_item) ? amb.pecas_sem_item : [];
                for (const p of semItem) fontes.push({ p, item_nome: null, item_id: null });
            } else {
                const pecas = Array.isArray(amb.pecas) ? amb.pecas : [];
                for (const p of pecas) fontes.push({ p, item_nome: null, item_id: null });
            }

            for (const { p, item_nome, item_id } of fontes) {
                const widthM  = (parseFloat(p.width_cm)  || 0) / 100;
                const heightM = (parseFloat(p.height_cm) || 0) / 100;
                const area = parseFloat(p.area_liquida_m2 ?? p.area_bruta_m2) || 0;
                const acabs = Array.isArray(p.acabamentos) ? p.acabamentos : [];
                let arestas;
                if (p.type === 'retangulo') {
                    arestas = [widthM, heightM, widthM, heightM];
                } else if (p.type === 'poligono' && Array.isArray(p.lados_cm)) {
                    arestas = p.lados_cm.map(l => Number(l) / 100);
                } else {
                    arestas = [];
                }
                let reto_simples_ml   = 0;
                let meia_esquadria_ml = 0;
                acabs.forEach((ac, i) => {
                    const len = arestas[i] ?? 0;
                    if (ac === 'RS') reto_simples_ml   += len;
                    if (ac === 'ME') meia_esquadria_ml += len;
                });
                resumo.push({
                    nome:             p.name ?? 'Peça',
                    area_liquida_m2:  Math.round(area * 10000) / 10000,
                    espessura_cm:     p.thickness_cm ?? null,
                    ambiente_nome:    nomeAmbiente,
                    item_nome,
                    item_id,
                    type:             p.type ?? 'retangulo',
                    recortes_qty:     Array.isArray(p.recortes) ? p.recortes.length : 0,
                    recortes:         Array.isArray(p.recortes) ? p.recortes : [],
                    acabamentos: {
                        reto_simples_ml:   Math.round(reto_simples_ml   * 100) / 100,
                        meia_esquadria_ml: Math.round(meia_esquadria_ml * 100) / 100,
                    },
                });
            }
            // Faixas do ambiente
            (amb.faixas ?? []).forEach(f => {
                const area = parseFloat(f.area_m2) || 0;
                if (area <= 0) return;
                resumo.push({
                    nome:            f.nome ?? 'Faixa',
                        descricao:       `${f.largura_cm ?? '?'}×${f.comprimento_cm ?? '?'}×${f.espessura_cm ?? '?'}cm — ${area.toFixed(3)}m²`,
                    area_liquida_m2: Math.round(area * 10000) / 10000,
                    espessura_cm:    f.espessura_cm ?? 2,
                    ambiente_nome:   nomeAmbiente,
                    item_nome:       null,
                    item_id:         null,
                    type:            'faixa',
                    recortes_qty:    0,
                    recortes:        [],
                    acabamentos:     { meia_esquadria_ml: 0, reto_simples_ml: 0 },
                });
            });
        }
        return { resumo_por_peca: resumo, _fonte: 'flutter' };
    }

    return json;
}

export function normalizarAmbiente(amb) {
    const orcamentosDoAmb = (amb.orcamentos ?? []).filter(o => !o.descartado_em);
    const versoes = orcamentosDoAmb.map(orc => ({
        id:             orc.id,
        nome:           orc.nome_versao ?? orc.nome ?? 'Versão',
        status:         orc.status ?? 'rascunho',
        valor_total:    orc.valor_total ?? 0,
        desconto_total: orc.desconto_total ?? 0,
        majoramento_percentual: orc.majoramento_percentual ?? 0,
        rt_percentual:          orc.rt_percentual ?? 0,
        rt_arquiteto_nome:      orc.rt_arquiteto_nome ?? '',
        valor_frete:            orc.valor_frete ?? 0,
        data:           orc.created_at
            ? new Date(orc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
            : '',
        itens_manuais: orc.itens_manuais ?? [],
        pecas: (orc.orcamento_pecas ?? []).map((op, idx) => ({
            id:               op.id,
            nome:             op.pecas?.nome_livre ?? `Peça ${idx + 1}`,
            material:         'Material Padrão',
            material_id:      op.material_id ?? '',
            espessura:        op.pecas?.espessura_cm != null ? `${op.pecas.espessura_cm}` : '—',
            area:             op.pecas?.area_liquida_m2 != null ? op.pecas.area_liquida_m2 : null,
            acabamento:       '—',
            valor:            op.valor_total ?? 0,
            valor_acabamentos: op.valor_acabamentos ?? 0,
            recortes:         [],
            ambiente_id:      op.pecas?.ambiente_id ?? null,
            item_nome:        op.pecas?.dimensoes?.item_nome ?? null,
            acabamentos:      op.acabamentos ?? [],
        })),
        avulsos: (orc.orcamento_avulsos ?? []).map(av => ({
            id:             av.id,
            nome:           av.produtos_avulsos?.nome ?? av.nome ?? 'Produto',
            quantidade:     av.quantidade ?? 1,
            valor_unitario: av.valor_unitario ?? 0,
            valor_total:    av.valor_total ?? 0,
        })),
    }));
    const orcamento_status = versoes.length === 0
        ? 'sem_orcamento'
        : orcamentosDoAmb.some(o => o.status === 'completo') ? 'completo' : 'em_andamento';
    return { id: amb.id, nome: amb.nome, orcamento_status, orcamentos: versoes };
}

// ─── Funções de duplicação ────────────────────────────────────────────────────

export function duplicarAmbiente(amb) {
    return {
        id:     crypto.randomUUID(),
        nome:   `${amb.nome} (Cópia)`,
        status: amb.status || 'em_andamento',
        orcamentos: (amb.orcamentos || []).map(v => ({
            id:          crypto.randomUUID(),
            nome:        v.nome,
            data:        v.data || '',
            valor_total: v.valor_total || 0,
            avulsos: (v.avulsos || []).map(av => ({
                id:             crypto.randomUUID(),
                produto_id:     av.produto_id,
                nome:           av.nome,
                quantidade:     av.quantidade,
                valor_unitario: av.valor_unitario,
                valor_total:    av.valor_total,
            })),
            pecas: (v.pecas || []).map(p => ({
                id:          crypto.randomUUID(),
                nome:        p.nome,
                material_id: p.material_id || '',
                material:    p.material || '',
                espessura:   p.espessura || '',
                area:        p.area || '',
                acabamento:  p.acabamento || '',
                valor:       p.valor || 0,
                recortes: (p.recortes || []).map(r => ({
                    id:      crypto.randomUUID(),
                    nome:    r.nome,
                    dimensao: r.dimensao,
                })),
            })),
        })),
    };
}

export function duplicarVersao(v) {
    return {
        id:          crypto.randomUUID(),
        nome:        `${v.nome} (Cópia)`,
        data:        v.data || '',
        valor_total: v.valor_total || 0,
        avulsos: (v.avulsos || []).map(av => ({
            id:             crypto.randomUUID(),
            produto_id:     av.produto_id,
            nome:           av.nome,
            quantidade:     av.quantidade,
            valor_unitario: av.valor_unitario,
            valor_total:    av.valor_total,
        })),
        pecas: (v.pecas || []).map(p => ({
            id:          crypto.randomUUID(),
            nome:        p.nome,
            material_id: p.material_id || '',
            material:    p.material || '',
            espessura:   p.espessura || '',
            area:        p.area || '',
            acabamento:  p.acabamento || '',
            valor:       p.valor || 0,
            recortes: (p.recortes || []).map(r => ({
                id:      crypto.randomUUID(),
                nome:    r.nome,
                dimensao: r.dimensao,
            })),
        })),
    };
}

export function duplicarPeca(p) {
    return {
        id:          crypto.randomUUID(),
        nome:        `${p.nome} (Cópia)`,
        material_id: p.material_id || '',
        material:    p.material || '',
        espessura:   p.espessura || '',
        area:        p.area || '',
        acabamento:  p.acabamento || '',
        valor:       p.valor || 0,
        recortes: (p.recortes || []).map(r => ({
            id:      crypto.randomUUID(),
            nome:    r.nome,
            dimensao: r.dimensao,
        })),
    };
}

export function clonarAvulso(av) {
    return {
        id:             crypto.randomUUID(),
        produto_id:     av.produto_id,
        nome:           String(av.nome           || ''),
        quantidade:     Number(av.quantidade     || 1),
        valor_unitario: Number(av.valor_unitario || 0),
        valor_total:    Number(av.valor_total    || 0),
    };
}

export function calcTotal(versao) {
    const tp = (versao.pecas   || []).reduce((s, p)  => s + (Number(p.valor)       || 0), 0);
    const ta = (versao.avulsos || []).reduce((s, av) => s + (Number(av.valor_total) || 0), 0);
    return tp + ta;
}

export const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function calcDataFinalDiasUteis(dias) {
    if (!dias || dias < 1) return null;
    let count = 0;
    let d = new Date();
    while (count < dias) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
    }
    return d.toISOString().slice(0, 10);
}

export function calcParcelas(total, qtd, primVenc) {
    if (!qtd || qtd < 1 || !primVenc) return [];
    const valorParcela = total / qtd;
    const result = [];
    const base = new Date(primVenc + 'T12:00:00');
    for (let i = 0; i < qtd; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        result.push({
            numero:     i + 1,
            valor:      Math.round(valorParcela * 100) / 100,
            vencimento: d.toISOString().slice(0, 10),
        });
    }
    return result;
}
