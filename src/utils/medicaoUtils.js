// Helpers compartilhados para lógica de medição de produção.
// Importar aqui em vez de duplicar em cada aba.

// tipo_medicao pode vir tanto em ambiente.tipo_medicao quanto aninhado em
// ambiente.extras.tipo_medicao, dependendo da versão do app medidor que gravou
// o registro (mesmo fallback usado em PainelDetalhesMedicao.jsx).
function tipoMedicaoDoAmbiente(a) {
    return a?.tipo_medicao ?? a?.extras?.tipo_medicao;
}

export function getTipoMedicao(medicao) {
    if (medicao.tipo) return medicao.tipo;
    const t = tipoMedicaoDoAmbiente(medicao?.json_medicao?.ambientes?.[0]);
    return t === 'producao' ? 'producao' : 'preliminar';
}

// Set<string> dos nomes de ambientes "de produção" dentro do json_medicao.
//
// O campo ambiente.tipo_medicao (e seu fallback em ambiente.extras.tipo_medicao)
// NÃO reflete preliminar-vs-produção na prática: no app medidor real, todo
// ambiente grava tipo_medicao='orcamento', independente do tipo da medição
// (confirmado em produção — nenhum registro real tem esse campo = 'producao').
// A classificação confiável é a coluna medicoes.tipo (via getTipoMedicao) —
// quando a medição inteira é de produção, todos os seus ambientes contam.
export function getAmbientesProducao(medicao) {
    if (getTipoMedicao(medicao) !== 'producao') return new Set();
    return new Set(
        (medicao?.json_medicao?.ambientes ?? [])
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

        // Fallback por nome só aplica quando a medição não tem pedido_id (legado).
        // Se pedido_id está preenchido, apenas o match direto vale — evita vazar
        // a mesma medição para múltiplos pedidos que compartilham nomes de ambiente.
        const relevant =
            (m.pedido_id && m.pedido_id === pedido.id) ||
            (!m.pedido_id && ambsProd.size > 0 && [...ambientesDoPedido].some(n => ambsProd.has(n)));

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
