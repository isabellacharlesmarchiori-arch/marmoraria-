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
        if (json.resumo_por_peca[0]?.ambiente_index != null && json.resumo_por_peca[0]?.grupo_nome !== undefined) return json;
        const ambIndexMap = new Map();
        (json.ambientes ?? []).forEach((a, idx) => {
            [a.nome, a.ambiente, `Ambiente ${idx + 1}`]
                .filter(Boolean)
                .forEach(n => { if (!ambIndexMap.has(n)) ambIndexMap.set(n, idx); });
        });
        const grupoByPecaId = new Map();
        (json.ambientes ?? []).forEach(amb => {
            (amb.grupos ?? []).forEach((grupo, grupoIdx) => {
                (grupo.elemento_ids ?? []).forEach(eId => {
                    if (!grupoByPecaId.has(eId))
                        grupoByPecaId.set(eId, { grupo_nome: grupo.nome ?? `Grupo ${grupoIdx + 1}`, grupo_index: grupoIdx });
                });
            });
        });
        return {
            ...json,
            resumo_por_peca: json.resumo_por_peca.map(p => {
                const gi = p.peca_id ? grupoByPecaId.get(p.peca_id) : null;
                return {
                    ...p,
                    ambiente_index: p.ambiente_index ?? ambIndexMap.get(p.ambiente_nome) ?? null,
                    grupo_nome:  p.grupo_nome  ?? gi?.grupo_nome  ?? p.item_nome  ?? null,
                    grupo_index: p.grupo_index ?? gi?.grupo_index ?? null,
                };
            }),
        };
    }

    if (Array.isArray(json.ambientes)) {
        // Flutter 2.0: pecas têm segmentos[] em vez de width_cm/height_cm
        const isFlutter2 = !!json.versao_app ||
            Array.isArray(json.ambientes[0]?.pecas) && json.ambientes[0].pecas[0]?.segmentos !== undefined;

        if (isFlutter2) {
            const resumo = [];
            let ambTotalME = 0;
            let ambTotalRS = 0;
            let ambTotalBO = 0;
            let ambTotalBD = 0;
            let ambTotalRD = 0;
            let ambTotalCF = 0;
            for (let ambIdx = 0; ambIdx < json.ambientes.length; ambIdx++) {
                const amb = json.ambientes[ambIdx];
                const nomeAmbiente = amb.nome ?? amb.ambiente ?? `Ambiente ${ambIdx + 1}`;
                const meta = amb.metadados_ambiente;
                const pecasDoAmb = [];
                for (const p of (Array.isArray(amb.pecas) ? amb.pecas : [])) {
                    const area = parseFloat(p.area_m2) || 0;
                    const segs = Array.isArray(p.segmentos) ? p.segmentos : [];
                    const peca = {
                        nome:            p.nome ?? 'Peça',
                        peca_id:         p.peca_id ?? p.id ?? null,
                        area_liquida_m2: Math.round(area * 10000) / 10000,
                        espessura_cm:    p.espessura_cm ?? null,
                        ambiente_nome:   nomeAmbiente,
                        ambiente_index:  ambIdx,
                        grupo_nome:      null,
                        grupo_index:     null,
                        item_nome:       null,
                        item_id:         null,
                        type:            p.tipo ?? 'retangulo',
                        recortes_qty:    Array.isArray(p.recortes) ? p.recortes.length : 0,
                        recortes:        Array.isArray(p.recortes) ? p.recortes : [],
                        segmentos:       segs,
                        // zeramos aqui; distribuídos do metadados_ambiente abaixo
                        acabamentos:     { reto_simples_ml: 0, meia_esquadria_ml: 0, boleado_ml: 0, boleado_duplo_ml: 0, reto_duplo_ml: 0, chanfrado_ml: 0 },
                    };
                    pecasDoAmb.push(peca);
                    resumo.push(peca);
                }
                // Faixas do ambiente (construídas antes do enriquecimento para ficarem disponíveis no loop de grupos)
                const faixasDoAmb = [];
                (amb.faixas ?? []).forEach(f => {
                    const area = parseFloat(f.area_m2) || 0;
                    if (area <= 0) return;
                    const faixa = {
                        nome:            f.nome ?? 'Faixa',
                        peca_id:         f.id ?? f.peca_id ?? null,
                        descricao:       `${f.largura_cm ?? '?'}×${f.comprimento_cm ?? '?'}×${f.espessura_cm ?? '?'}cm — ${area.toFixed(3)}m²`,
                        area_liquida_m2: Math.round(area * 10000) / 10000,
                        espessura_cm:    f.espessura_cm ?? 2,
                        ambiente_nome:   nomeAmbiente,
                        ambiente_index:  ambIdx,
                        grupo_nome:      null,
                        grupo_index:     null,
                        item_nome:       null,
                        item_id:         null,
                        type:            'faixa',
                        recortes_qty:    0,
                        recortes:        [],
                        segmentos:       [],
                        acabamentos:     { meia_esquadria_ml: 0, reto_simples_ml: 0, boleado_ml: 0, boleado_duplo_ml: 0, reto_duplo_ml: 0, chanfrado_ml: 0 },
                    };
                    faixasDoAmb.push(faixa);
                    resumo.push(faixa);
                });
                // Enrich pieces and faixas with grupo_nome from amb.grupos[]
                (amb.grupos ?? []).forEach((grupo, grupoIdx) => {
                    const nome = grupo.nome ?? `Grupo ${grupoIdx + 1}`;
                    (grupo.elemento_ids ?? []).forEach(eId => {
                        const piece = pecasDoAmb.find(p => p.peca_id === eId);
                        if (piece) { piece.grupo_nome = nome; piece.grupo_index = grupoIdx; }
                        const faixa = faixasDoAmb.find(f => f.peca_id === eId);
                        if (faixa) { faixa.grupo_nome = nome; faixa.grupo_index = grupoIdx; }
                    });
                });
                // Fonte única: metadados_ambiente calculados pelo Flutter.
                // Distribui pelo representante do grupo que contém o segmento do tipo;
                // se nenhum tiver, usa a primeira peça do ambiente.
                const totalME = parseFloat(meta?.meia_esquadria_ml ?? 0) || 0;
                const totalRS = parseFloat(meta?.reto_simples_ml   ?? 0) || 0;
                const totalBO = parseFloat(meta?.boleado_ml        ?? 0) || 0;
                const totalBD = parseFloat(meta?.boleado_duplo_ml  ?? 0) || 0;
                const totalRD = parseFloat(meta?.reto_duplo_ml     ?? 0) || 0;
                const totalCF = parseFloat(meta?.chanfrado_ml      ?? 0) || 0;
                const distrib = [
                    ['ME', 'meia_esquadria_ml', totalME],
                    ['RS', 'reto_simples_ml',   totalRS],
                    ['BO', 'boleado_ml',        totalBO],
                    ['BD', 'boleado_duplo_ml',  totalBD],
                    ['RD', 'reto_duplo_ml',     totalRD],
                    ['CF', 'chanfrado_ml',      totalCF],
                ];
                if (pecasDoAmb.length > 0) {
                    distrib.forEach(([code, field, total]) => {
                        if (total <= 0) return;
                        const rep = pecasDoAmb.find(p => (p.segmentos ?? []).some(s => s.acabamento === code)) ?? pecasDoAmb[0];
                        rep.acabamentos[field] = Math.round(total * 100) / 100;
                    });
                }
                ambTotalME += totalME;
                ambTotalRS += totalRS;
                ambTotalBO += totalBO;
                ambTotalBD += totalBD;
                ambTotalRD += totalRD;
                ambTotalCF += totalCF;
            }
            return {
                resumo_por_peca: resumo,
                _fonte: 'flutter2',
                totais_acabamentos: {
                    meia_esquadria_ml: Math.round(ambTotalME * 100) / 100,
                    reto_simples_ml:   Math.round(ambTotalRS * 100) / 100,
                    boleado_ml:        Math.round(ambTotalBO * 100) / 100,
                    boleado_duplo_ml:  Math.round(ambTotalBD * 100) / 100,
                    reto_duplo_ml:     Math.round(ambTotalRD * 100) / 100,
                    chanfrado_ml:      Math.round(ambTotalCF * 100) / 100,
                },
            };
        }

        // Flutter 1.0 / formato legado
        const resumo = [];
        for (let ambIdx = 0; ambIdx < json.ambientes.length; ambIdx++) {
            const amb = json.ambientes[ambIdx];
            const nomeAmbiente = amb.nome ?? amb.ambiente ?? `Ambiente ${ambIdx + 1}`;
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
                let boleado_ml        = 0;
                let boleado_duplo_ml  = 0;
                let reto_duplo_ml     = 0;
                let chanfrado_ml      = 0;
                acabs.forEach((ac, i) => {
                    const len = arestas[i] ?? 0;
                    if (ac === 'RS') reto_simples_ml   += len;
                    if (ac === 'ME') meia_esquadria_ml += len;
                    if (ac === 'BO') boleado_ml        += len;
                    if (ac === 'BD') boleado_duplo_ml  += len;
                    if (ac === 'RD') reto_duplo_ml     += len;
                    if (ac === 'CF') chanfrado_ml      += len;
                });
                resumo.push({
                    nome:             p.name ?? 'Peça',
                    peca_id:          p.peca_id ?? p.id ?? null,
                    area_liquida_m2:  Math.round(area * 10000) / 10000,
                    espessura_cm:     p.thickness_cm ?? null,
                    ambiente_nome:    nomeAmbiente,
                    ambiente_index:   ambIdx,
                    grupo_nome:       item_nome ?? null,
                    grupo_index:      null,
                    item_nome,
                    item_id,
                    type:             p.type ?? 'retangulo',
                    recortes_qty:     Array.isArray(p.recortes) ? p.recortes.length : 0,
                    recortes:         Array.isArray(p.recortes) ? p.recortes : [],
                    segmentos:        p.width_cm != null && p.height_cm != null
                        ? [{ medida_cm: p.width_cm }, { medida_cm: p.height_cm }]
                        : [],
                    acabamentos: {
                        reto_simples_ml:   Math.round(reto_simples_ml   * 100) / 100,
                        meia_esquadria_ml: Math.round(meia_esquadria_ml * 100) / 100,
                        boleado_ml:        Math.round(boleado_ml        * 100) / 100,
                        boleado_duplo_ml:  Math.round(boleado_duplo_ml  * 100) / 100,
                        reto_duplo_ml:     Math.round(reto_duplo_ml     * 100) / 100,
                        chanfrado_ml:      Math.round(chanfrado_ml      * 100) / 100,
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
                    ambiente_index:  ambIdx,
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
