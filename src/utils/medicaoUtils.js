// Helpers compartilhados para lógica de medição de produção.
// Importar aqui em vez de duplicar em cada aba.

export function getTipoMedicao(medicao) {
    if (medicao.tipo) return medicao.tipo;
    const t = medicao?.json_medicao?.ambientes?.[0]?.tipo_medicao;
    return t === 'producao' ? 'producao' : 'preliminar';
}

// Set<string> dos nomes de ambientes com tipo_medicao='producao' dentro do json_medicao.
export function getAmbientesProducao(medicao) {
    return new Set(
        (medicao?.json_medicao?.ambientes ?? [])
            .filter(a => a.tipo_medicao === 'producao')
            .map(a => a.nome)
            .filter(Boolean)
    );
}

/**
 * Para um pedido, calcula cobertura de produção por ambiente.
 *
 * Uma medição "cobre" este pedido se:
 *   - m.pedido_id === pedido.id  (match direto), OU
 *   - algum ambiente do pedido aparece em getAmbientesProducao(m) (fallback por nome)
 *
 * Um ambiente é considerado "pronto" quando existe pelo menos uma medição
 * relevante com status='enviada' onde esse ambiente aparece em
 * json_medicao.ambientes com tipo_medicao='producao'.
 *
 * Retorna:
 *   total       — número de ambientes distintos no pedido
 *   prontos     — número de ambientes cobertos por medições completas
 *   faltantes   — Set<string> de nomes de ambientes ainda não cobertos
 *   status      — 'completo' | 'parcial' | 'nenhum'
 *   medicoesCobrem — array das medições relevantes para este pedido
 *   temAgendada — true se alguma medição relevante está com status='agendada'
 */
export function calcularCoberturaProducao(pedido, orcamentosMap, medicoes) {
    const ambientesDoPedido = new Set(
        (pedido.cenario_ids ?? []).flatMap(cid => {
            const orc = orcamentosMap[cid];
            if (!orc) return [];
            const ambsDasPecas = (orc.pecas ?? [])
                .map(p => p.ambiente_nome)
                .filter(Boolean);
            return [orc.ambiente_nome, ...ambsDasPecas];
        }).filter(Boolean)
    );
    const total = ambientesDoPedido.size;

    if (total === 0) {
        return { total: 0, prontos: 0, faltantes: new Set(), status: 'nenhum', medicoesCobrem: [], temAgendada: false };
    }

    const medicoesCobrem = [];
    const ambientesCobertos = new Set();
    let temAgendada = false;

    for (const m of medicoes) {
        const ambsProd = getAmbientesProducao(m);

        const relevant =
            (m.pedido_id && m.pedido_id === pedido.id) ||
            (ambsProd.size > 0 && [...ambientesDoPedido].some(n => ambsProd.has(n)));

        if (!relevant) continue;
        medicoesCobrem.push(m);

        if (m.status === 'agendada') temAgendada = true;

        if (m.status === 'enviada') {
            for (const nome of ambientesDoPedido) {
                if (ambsProd.has(nome)) ambientesCobertos.add(nome);
            }
        }
    }

    const prontos = ambientesCobertos.size;
    const faltantes = new Set([...ambientesDoPedido].filter(n => !ambientesCobertos.has(n)));
    const status = prontos === total ? 'completo' : prontos > 0 ? 'parcial' : 'nenhum';

    console.log('🧪 [cobertura]', {
        pedido_id: pedido?.id,
        cenario_ids: pedido?.cenario_ids,
        orcamentos_envolvidos: (pedido?.cenario_ids ?? []).map(cid => {
            const orc = orcamentosMap[cid];
            return {
                id: cid,
                ambiente_nome_pai: orc?.ambiente_nome,
                pecas_count: orc?.pecas?.length ?? 0,
                ambientes_das_pecas: (orc?.pecas ?? []).map(p => p.ambiente_nome),
            };
        }),
        ambientesDoPedido_final: [...ambientesDoPedido],
        status_resultado: status,
        prontos,
        total,
    });

    return { total, prontos, faltantes, status, medicoesCobrem, temAgendada };
}

/**
 * Retorna os pedidos que ainda têm ambientes de produção por agendar:
 * status !== 'completo' E sem medição agendada pendente.
 * (Se já há uma medição agendada, não exibir como pendente — já está na lista de produção.)
 */
export function getPedidosComProducaoPendente(pedidosOrdenados, orcamentosMap, medicoes) {
    return pedidosOrdenados.filter(pedido => {
        const { status, temAgendada } = calcularCoberturaProducao(pedido, orcamentosMap, medicoes);
        return status !== 'completo' && !temAgendada;
    });
}
