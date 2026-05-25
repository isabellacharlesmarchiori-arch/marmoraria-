import React from 'react';
import { MedicaoPill } from '../../utils/projetoUtils';
import { formatarEndereco } from '../../utils/endereco';

function getTipoMedicao(m) {
    if (m.tipo) return m.tipo;
    const t = m?.json_medicao?.ambientes?.[0]?.tipo_medicao;
    return t === 'producao' ? 'producao' : 'preliminar';
}

function getAmbsProducao(medicao) {
    return new Set(
        (medicao?.json_medicao?.ambientes ?? [])
            .filter(a => a.tipo_medicao === 'producao')
            .map(a => a.nome)
            .filter(Boolean)
    );
}

const TABLE_HEADER = (
    <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
        <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Data</span>
        <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Medidor</span>
        <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Status</span>
        <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Ação</span>
    </div>
);

export default function AbaMedicoes({
    medicoes,
    pedidosFechados = [],
    ambientes = [],
    onAgendarProducao,
    onEditarProducao,
    isMedidorCombinado,
    vendedorId,
    sessionUserId,
    isViewOnlyAdmin,
    onAbrirNovoAgendamento,
    onAbrirEditar,
    onVerDados,
    onVerDiferenca,
    onFazerMedicao,
    onExcluirMedicao,
}) {
    const medicoesList = medicoes ?? [];

    const medicoesPrelim = medicoesList.filter(m => getTipoMedicao(m) === 'preliminar');
    const medProducao    = medicoesList.filter(m => getTipoMedicao(m) === 'producao');

    const orcamentosMap = Object.fromEntries(
        ambientes.flatMap(a => (a.orcamentos ?? []).map(o => [o.id, { ...o, ambiente_nome: a.nome }]))
    );

    const pedidosOrdenados = [...pedidosFechados].reverse();

    // Returns the number (1-based) of the pedido linked to this production measurement.
    function getPedidoNumero(medicao) {
        if (medicao.pedido_id) {
            const idx = pedidosOrdenados.findIndex(p => p.id === medicao.pedido_id);
            return idx === -1 ? null : idx + 1;
        }
        // fallback: cruzamento por nome de ambiente (medições antigas sem pedido_id)
        const ambs = getAmbsProducao(medicao);
        if (ambs.size === 0) return null;
        const idx = pedidosOrdenados.findIndex(pedido => {
            const pedidoAmbientes = new Set(
                (pedido.cenario_ids ?? [])
                    .map(cid => orcamentosMap[cid]?.ambiente_nome)
                    .filter(Boolean)
            );
            return [...pedidoAmbientes].some(n => ambs.has(n));
        });
        return idx === -1 ? null : idx + 1;
    }

    // IDs of pedidos que já têm ao menos uma medição de produção vinculada
    const pedidosComMedicao = new Set();
    for (const m of medProducao) {
        if (m.pedido_id) {
            pedidosComMedicao.add(m.pedido_id);
            continue;
        }
        // fallback para medições antigas
        const ambs = getAmbsProducao(m);
        if (ambs.size === 0) continue;
        for (const pedido of pedidosOrdenados) {
            const pedidoAmbientes = new Set(
                (pedido.cenario_ids ?? [])
                    .map(cid => orcamentosMap[cid]?.ambiente_nome)
                    .filter(Boolean)
            );
            if ([...pedidoAmbientes].some(n => ambs.has(n))) {
                pedidosComMedicao.add(pedido.id);
            }
        }
    }

    const temPreliminar = medicoesPrelim.length > 0;
    const pedidosPendentes = temPreliminar
        ? pedidosOrdenados.filter(p => !pedidosComMedicao.has(p.id))
        : [];

    function renderPrelimRow(m, i, total) {
        const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
        return (
            <div
                key={m?.id}
                className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                    isAprovada
                        ? 'bg-green-50 dark:bg-green-400/[0.03] border-l-2 border-l-green-300 dark:border-l-green-500/50 hover:bg-green-100 dark:hover:bg-green-400/[0.05]'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                } ${i < total - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
            >
                <div className="col-span-4 flex items-start gap-2">
                    <iconify-icon
                        icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                        width="13"
                        className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-gray-500 dark:text-zinc-600'}`}
                    ></iconify-icon>
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-900 dark:text-white font-medium">{m?.data ?? '—'}</span>
                        {isAprovada && (
                            <span className="font-mono text-[9px] text-green-600 dark:text-green-500/70 uppercase tracking-widest">Aguardando orçamento</span>
                        )}
                        {!isAprovada && m?.endereco && (
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 truncate max-w-[140px]">{formatarEndereco(m.endereco)}</span>
                        )}
                    </div>
                </div>
                <div className="col-span-3 font-mono text-[11px] text-gray-500 dark:text-zinc-500">{m?.medidor ?? '—'}</div>
                <div className="col-span-2">
                    <MedicaoPill status={m?.status ?? 'agendada'} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1.5">
                    {m?.status !== 'agendada' && m?.status !== 'pendente' && (
                        <button
                            onClick={() => onVerDados(m)}
                            className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 transition-colors border ${
                                isAprovada
                                    ? 'border-green-400 dark:border-green-500/40 text-green-700 dark:text-green-400 hover:border-green-600 dark:hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-400/10'
                                    : 'border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                            Ver Dados
                        </button>
                    )}
                    {!isViewOnlyAdmin && (
                        <>
                            <button
                                onClick={() => onAbrirEditar(m)}
                                title="Editar medição"
                                className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-500 dark:hover:border-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                            </button>
                            <button
                                onClick={() => onExcluirMedicao(m)}
                                title="Excluir medição"
                                className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-red-500/50 dark:hover:border-red-400/50 hover:text-red-400 transition-colors"
                            >
                                <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    function renderProdRow(m, i, total) {
        const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
        const pedidoNum = getPedidoNumero(m);
        return (
            <div
                key={m?.id}
                className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                    isAprovada
                        ? 'bg-green-50 dark:bg-green-400/[0.03] border-l-2 border-l-green-300 dark:border-l-green-500/50 hover:bg-green-100 dark:hover:bg-green-400/[0.05]'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                } ${i < total - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
            >
                <div className="col-span-4 flex items-start gap-2">
                    <iconify-icon
                        icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                        width="13"
                        className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-gray-500 dark:text-zinc-600'}`}
                    ></iconify-icon>
                    <div className="flex flex-col">
                        <span className="text-sm text-gray-900 dark:text-white font-medium">{m?.data ?? '—'}</span>
                        {pedidoNum !== null && (
                            <span className="font-mono text-[9px] text-blue-500 dark:text-blue-400/70 uppercase tracking-widest">
                                Pedido {pedidoNum}
                            </span>
                        )}
                    </div>
                </div>
                <div className="col-span-3 font-mono text-[11px] text-gray-500 dark:text-zinc-500">{m?.medidor ?? '—'}</div>
                <div className="col-span-2">
                    <MedicaoPill status={m?.status ?? 'agendada'} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1.5">
                    {m?.status !== 'agendada' && m?.status !== 'pendente' && (
                        <button
                            onClick={() => onVerDados(m)}
                            className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 transition-colors border ${
                                isAprovada
                                    ? 'border-green-400 dark:border-green-500/40 text-green-700 dark:text-green-400 hover:border-green-600 dark:hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-400/10'
                                    : 'border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                            Ver Dados
                        </button>
                    )}
                    {(() => {
                        const canDiff = !!m?.json_medicao && pedidoNum !== null;
                        return (
                            <button
                                onClick={canDiff ? () => onVerDiferenca?.(m, pedidoNum) : undefined}
                                disabled={!canDiff}
                                title={canDiff ? 'Ver diferença de área' : 'Medição sem dados ou pedido não vinculado'}
                                className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 border transition-colors ${canDiff ? 'border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white' : 'border-gray-200 dark:border-zinc-800 text-gray-300 dark:text-zinc-700 cursor-not-allowed'}`}
                            >
                                <iconify-icon icon="solar:layers-minimalistic-linear" width="12"></iconify-icon>
                                Diferença
                            </button>
                        );
                    })()}
                    {!isViewOnlyAdmin && m?.status === 'agendada' && (
                        <button
                            onClick={() => onEditarProducao?.(m, pedidoNum)}
                            title="Editar agendamento"
                            className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-500 dark:hover:border-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const totalProdRows = medProducao.length + pedidosPendentes.length;

    return (
        <div className="sys-reveal sys-delay-200">
            <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                    01 // Medições
                </div>
                <div className="flex items-center gap-2">
                    {isMedidorCombinado && vendedorId === sessionUserId && (
                        <button
                            onClick={onFazerMedicao}
                            className="flex items-center gap-2 bg-gray-900 dark:bg-zinc-800 text-yellow-400 text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 border border-yellow-400/40 hover:border-yellow-400 hover:shadow-[0_0_12px_rgba(250,204,21,0.2)] transition-all"
                        >
                            <iconify-icon icon="solar:ruler-pen-bold" width="14"></iconify-icon>
                            Fazer Medição
                        </button>
                    )}
                    <button
                        onClick={onAbrirNovoAgendamento}
                        className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                    >
                        <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                        Agendar medição
                    </button>
                </div>
            </div>

            {/* ── Medições Preliminares ─────────────────────────────────── */}
            <div className="mb-4">
                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2 px-0.5">
                    Medições Preliminares
                </div>
                <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                    {TABLE_HEADER}
                    {medicoesPrelim.length > 0
                        ? medicoesPrelim.map((m, i) => renderPrelimRow(m, i, medicoesPrelim.length))
                        : (
                            <div className="px-4 py-10 text-center">
                                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhuma medição preliminar</p>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* ── Medições de Produção ──────────────────────────────────── */}
            <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2 px-0.5">
                    Medições de Produção
                </div>
                <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                    {TABLE_HEADER}

                    {medProducao.map((m, i) => renderProdRow(m, i, totalProdRows))}

                    {pedidosPendentes.map((pedido, i) => {
                        const pedidoNum = pedidosOrdenados.indexOf(pedido) + 1;
                        const pedidoAmbientes = [...new Set(
                            (pedido.cenario_ids ?? [])
                                .map(cid => orcamentosMap[cid]?.ambiente_nome)
                                .filter(Boolean)
                        )];
                        const rowIdx = medProducao.length + i;
                        return (
                            <div
                                key={`pending-${pedido.id}`}
                                className={`grid grid-cols-12 items-center px-4 py-3.5 ${
                                    rowIdx < totalProdRows - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''
                                }`}
                            >
                                <div className="col-span-4 flex items-start gap-2">
                                    <iconify-icon icon="solar:clock-circle-linear" width="13" className="mt-0.5 shrink-0 text-amber-500"></iconify-icon>
                                    <div className="flex flex-col">
                                        <span className="font-mono text-[11px] text-gray-500 dark:text-zinc-500">Pendente</span>
                                        <span className="font-mono text-[9px] text-blue-500 dark:text-blue-400/70 uppercase tracking-widest">
                                            Pedido {pedidoNum}
                                            {pedidoAmbientes.length > 0 && ` · ${pedidoAmbientes.join(', ')}`}
                                        </span>
                                    </div>
                                </div>
                                <div className="col-span-3 font-mono text-[11px] text-gray-400 dark:text-zinc-600">—</div>
                                <div className="col-span-2">
                                    <span className="font-mono text-[9px] px-2 py-0.5 border border-amber-400/40 text-amber-600 dark:text-amber-400/70 bg-amber-50 dark:bg-amber-400/5 uppercase tracking-widest whitespace-nowrap">
                                        Aguardando
                                    </span>
                                </div>
                                <div className="col-span-3 flex items-center justify-end gap-1.5">
                                    <button
                                        onClick={() => onAgendarProducao?.(pedido, pedidoNum)}
                                        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 px-3 py-1 hover:border-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                                    >
                                        <iconify-icon icon="solar:calendar-add-linear" width="11"></iconify-icon>
                                        Agendar
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {totalProdRows === 0 && (
                        <div className="px-4 py-10 text-center">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhuma medição de produção</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
