import React, { useState } from 'react';
import { MedicaoPill, parseSvgUrl } from '../../utils/projetoUtils';
import { formatarEndereco } from '../../utils/endereco';
import { getTipoMedicao, getAmbientesProducao, calcularCoberturaProducao, getPedidosComProducaoPendente } from '../../utils/medicaoUtils';

const TABLE_HEADER = (
    <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-200/80 dark:border-zinc-800">
        <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Data</span>
        <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Medidor</span>
        <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Status</span>
        <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 text-right">Ação</span>
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
    modoMigrar = false, migrarIds = [], toggleMigrarId, cancelarMigrar, onEscolherDestino,
    onAbrirNovoAgendamento,
    onAbrirEditar,
    onVerDados,
    onVerDiferenca,
    onFazerMedicao,
    onExcluirMedicao,
}) {
    const [desenhoAberto, setDesenhoAberto] = useState(null);

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
        // Usa maior sobreposição em vez de first-match, para evitar falsos positivos
        // quando múltiplos pedidos têm algum ambiente em comum com a medição.
        const ambs = getAmbientesProducao(medicao);
        if (ambs.size === 0) return null;
        let bestIdx = -1;
        let bestScore = 0;
        pedidosOrdenados.forEach((pedido, idx) => {
            const pedidoAmbientes = new Set(
                (pedido.cenario_ids ?? [])
                    .map(cid => orcamentosMap[cid]?.ambiente_nome)
                    .filter(Boolean)
            );
            const score = [...ambs].filter(n => pedidoAmbientes.has(n)).length;
            if (score > bestScore) { bestScore = score; bestIdx = idx; }
        });
        return bestIdx === -1 ? null : bestIdx + 1;
    }

    const pedidosPendentes = getPedidosComProducaoPendente(pedidosOrdenados, orcamentosMap, medicoesList);

    // Checkbox âmbar do modo migrar — mesmo markup dos checkboxes do AbaCarrinho
    function CheckboxMigrar({ medicaoId }) {
        const marcada = migrarIds.includes(medicaoId);
        return (
            <div
                className={`w-4 h-4 mt-0.5 flex items-center justify-center shrink-0 border transition-colors ${marcada ? 'border-amber-400 bg-amber-400/20' : 'border-zinc-200/80 dark:border-zinc-600 hover:border-amber-400'}`}
                onClick={e => { e.stopPropagation(); toggleMigrarId(medicaoId); }}
            >
                {marcada && <iconify-icon icon="solar:check-read-linear" width="10" className="text-amber-400"></iconify-icon>}
            </div>
        );
    }

    function renderPrelimRow(m, i, total) {
        const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
        const isMigrarChecked = modoMigrar && migrarIds.includes(m?.id);
        return (
            <div
                key={m?.id}
                onClick={modoMigrar ? () => toggleMigrarId(m.id) : undefined}
                className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                    isMigrarChecked
                        ? 'bg-amber-100 dark:bg-amber-400/5 border-l-2 border-l-amber-500 dark:border-l-amber-400/60'
                        : isAprovada
                            ? 'bg-green-50 dark:bg-green-400/[0.03] border-l-2 border-l-green-300 dark:border-l-green-500/50 hover:bg-green-100 dark:hover:bg-green-400/[0.05]'
                            : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                } ${modoMigrar ? 'cursor-pointer' : ''} ${i < total - 1 ? 'border-b border-zinc-100 dark:border-zinc-900' : ''}`}
            >
                <div className="col-span-4 flex items-start gap-2">
                    {modoMigrar && <CheckboxMigrar medicaoId={m?.id} />}
                    <iconify-icon
                        icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                        width="13"
                        className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-zinc-500 dark:text-zinc-600'}`}
                    ></iconify-icon>
                    <div className="flex flex-col">
                        <span className="text-sm text-zinc-900 dark:text-white font-medium">{m?.data ?? '—'}</span>
                        {isAprovada && (
                            <span className="font-mono text-[9px] text-green-600 dark:text-green-500/70 uppercase tracking-widest">Aguardando orçamento</span>
                        )}
                        {!isAprovada && m?.endereco && (
                            <span className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600 truncate max-w-[140px]">{formatarEndereco(m.endereco)}</span>
                        )}
                    </div>
                </div>
                <div className="col-span-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">{m?.medidor ?? '—'}</div>
                <div className="col-span-2">
                    <MedicaoPill status={m?.status ?? 'agendada'} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1.5">
                    {!modoMigrar && m?.status !== 'agendada' && m?.status !== 'pendente' && (
                        <button
                            onClick={() => onVerDados(m)}
                            className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-md dark:rounded-none transition-colors border ${
                                isAprovada
                                    ? 'border-green-400 dark:border-green-500/40 text-green-700 dark:text-green-400 hover:border-green-600 dark:hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-400/10'
                                    : 'border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                            Ver Dados
                        </button>
                    )}
                    {!modoMigrar && !isViewOnlyAdmin && (
                        <>
                            <button
                                onClick={() => onAbrirEditar(m)}
                                title="Editar medição"
                                className="w-7 h-7 flex items-center justify-center rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500 hover:border-zinc-500 dark:hover:border-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                            >
                                <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                            </button>
                            <button
                                onClick={() => onExcluirMedicao(m)}
                                title="Excluir medição"
                                className="w-7 h-7 flex items-center justify-center rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500 hover:border-red-500/50 dark:hover:border-red-400/50 hover:text-red-400 transition-colors"
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
        const isMigrarChecked = modoMigrar && migrarIds.includes(m?.id);
        return (
            <div
                key={m?.id}
                onClick={modoMigrar ? () => toggleMigrarId(m.id) : undefined}
                className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                    isMigrarChecked
                        ? 'bg-amber-100 dark:bg-amber-400/5 border-l-2 border-l-amber-500 dark:border-l-amber-400/60'
                        : isAprovada
                            ? 'bg-green-50 dark:bg-green-400/[0.03] border-l-2 border-l-green-300 dark:border-l-green-500/50 hover:bg-green-100 dark:hover:bg-green-400/[0.05]'
                            : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                } ${modoMigrar ? 'cursor-pointer' : ''} ${i < total - 1 ? 'border-b border-zinc-100 dark:border-zinc-900' : ''}`}
            >
                <div className="col-span-4 flex items-start gap-2">
                    {modoMigrar && <CheckboxMigrar medicaoId={m?.id} />}
                    <iconify-icon
                        icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                        width="13"
                        className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-zinc-500 dark:text-zinc-600'}`}
                    ></iconify-icon>
                    <div className="flex flex-col">
                        <span className="text-sm text-zinc-900 dark:text-white font-medium">{m?.data ?? '—'}</span>
                        {pedidoNum !== null && (
                            <span className="font-mono text-[9px] text-blue-500 dark:text-blue-400/70 uppercase tracking-widest">
                                Pedido {pedidoNum}
                            </span>
                        )}
                    </div>
                </div>
                <div className="col-span-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">{m?.medidor ?? '—'}</div>
                <div className="col-span-2">
                    <MedicaoPill status={m?.status ?? 'agendada'} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1.5">
                    {!modoMigrar && m?.status !== 'agendada' && (() => {
                        const svgUrl = parseSvgUrl(m?.svg_url);
                        return svgUrl ? (
                            <button
                                onClick={() => setDesenhoAberto(svgUrl)}
                                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-md dark:rounded-none transition-colors border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white"
                            >
                                <iconify-icon icon="solar:map-linear" width="12"></iconify-icon>
                                Ver Desenho
                            </button>
                        ) : (
                            <span
                                title="Desenho não disponível"
                                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
                            >
                                <iconify-icon icon="solar:map-linear" width="12"></iconify-icon>
                                Ver Desenho
                            </span>
                        );
                    })()}
                    {!modoMigrar && m?.status !== 'agendada' && getAmbientesProducao(m).size > 0 && (() => {
                        const canDiff = !!m?.json_medicao && pedidoNum !== null;
                        return (
                            <button
                                onClick={canDiff ? () => onVerDiferenca?.(m, pedidoNum) : undefined}
                                disabled={!canDiff}
                                title={canDiff ? 'Ver diferença de área' : 'Medição sem dados ou pedido não vinculado'}
                                className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-md dark:rounded-none border transition-colors ${canDiff ? 'border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white' : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 cursor-not-allowed'}`}
                            >
                                <iconify-icon icon="solar:layers-minimalistic-linear" width="12"></iconify-icon>
                                Diferença
                            </button>
                        );
                    })()}
                    {!modoMigrar && !isViewOnlyAdmin && m?.status === 'agendada' && (
                        <button
                            onClick={() => onEditarProducao?.(m, pedidoNum)}
                            title="Editar agendamento"
                            className="w-7 h-7 flex items-center justify-center rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500 hover:border-zinc-500 dark:hover:border-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
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
        <>
        <div className="sys-reveal sys-delay-200">
            <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono text-zinc-900 dark:text-white uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 w-max px-2 py-1 rounded-md dark:rounded-none">
                    01 // Medições
                </div>
                <div className="flex items-center gap-2">
                    {/* ── Modo Migrar (avulso): controles ativos — mesmo padrão do AbaCarrinho ── */}
                    {modoMigrar && (
                        <>
                            <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse inline-block"></span>
                                {migrarIds.length} selecionada{migrarIds.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={cancelarMigrar} className="flex items-center gap-1.5 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-zinc-900 dark:hover:border-white hover:text-zinc-900 dark:hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                Cancelar
                            </button>
                            <button
                                onClick={onEscolherDestino}
                                disabled={migrarIds.length < 1}
                                className="flex items-center gap-1.5 bg-amber-500 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 hover:bg-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <iconify-icon icon="solar:arrow-right-up-linear" width="12"></iconify-icon>
                                Escolher destino ({migrarIds.length})
                            </button>
                        </>
                    )}
                    {!modoMigrar && isMedidorCombinado && vendedorId === sessionUserId && (
                        <button
                            onClick={onFazerMedicao}
                            className="flex items-center gap-2 bg-orange-500 dark:bg-yellow-400 text-white dark:text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl dark:rounded-none border border-orange-500 dark:border-yellow-400/40 hover:bg-orange-600 dark:hover:bg-yellow-300 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)] dark:hover:shadow-[0_0_12px_rgba(250,204,21,0.2)] transition-all"
                        >
                            <iconify-icon icon="solar:ruler-pen-bold" width="14"></iconify-icon>
                            Fazer Medição
                        </button>
                    )}
                    {!modoMigrar && (
                    <button
                        onClick={onAbrirNovoAgendamento}
                        className="flex items-center gap-2 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-md dark:rounded-none hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                    >
                        <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                        Agendar medição
                    </button>
                    )}
                </div>
            </div>

            {/* ── Medições Preliminares ─────────────────────────────────── */}
            <div className="mb-4">
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2 px-0.5">
                    Medições Preliminares
                </div>
                <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none">
                    {TABLE_HEADER}
                    {medicoesPrelim.length > 0
                        ? medicoesPrelim.map((m, i) => renderPrelimRow(m, i, medicoesPrelim.length))
                        : (
                            <div className="px-4 py-10 text-center">
                                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhuma medição preliminar</p>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* ── Medições de Produção ──────────────────────────────────── */}
            <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2 px-0.5">
                    Medições de Produção
                </div>
                <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none">
                    {TABLE_HEADER}

                    {medProducao.map((m, i) => renderProdRow(m, i, totalProdRows))}

                    {pedidosPendentes.map((pedido, i) => {
                        const pedidoNum = pedidosOrdenados.indexOf(pedido) + 1;
                        const { total, faltantes } = calcularCoberturaProducao(pedido, orcamentosMap, medicoesList);
                        const rowIdx = medProducao.length + i;
                        return (
                            <div
                                key={`pending-${pedido.id}`}
                                className={`grid grid-cols-12 items-center px-4 py-3.5 ${
                                    rowIdx < totalProdRows - 1 ? 'border-b border-zinc-100 dark:border-zinc-900' : ''
                                }`}
                            >
                                <div className="col-span-4 flex items-start gap-2">
                                    <iconify-icon icon="solar:clock-circle-linear" width="13" className="mt-0.5 shrink-0 text-amber-500"></iconify-icon>
                                    <div className="flex flex-col">
                                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500">Pendente</span>
                                        <span className="font-mono text-[9px] text-blue-500 dark:text-blue-400/70 uppercase tracking-widest">
                                            Pedido {pedidoNum}
                                            {total > 0 && ` · ${faltantes.size}/${total} ambientes`}
                                        </span>
                                    </div>
                                </div>
                                <div className="col-span-3 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">—</div>
                                <div className="col-span-2">
                                    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full dark:rounded-none border border-amber-400/40 text-amber-600 dark:text-amber-400/70 bg-amber-50 dark:bg-amber-400/5 uppercase tracking-widest whitespace-nowrap">
                                        Aguardando
                                    </span>
                                </div>
                                <div className="col-span-3 flex items-center justify-end gap-1.5">
                                    {!modoMigrar && (
                                    <button
                                        onClick={() => onAgendarProducao?.(pedido, pedidoNum)}
                                        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest rounded-md dark:rounded-none border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 px-3 py-1 hover:border-orange-500 dark:hover:border-yellow-400 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors"
                                    >
                                        <iconify-icon icon="solar:calendar-add-linear" width="11"></iconify-icon>
                                        Agendar
                                    </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {totalProdRows === 0 && (
                        <div className="px-4 py-10 text-center">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhuma medição de produção</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {desenhoAberto && (
                <>
                    <div
                        className="fixed inset-0 bg-black/85 z-50"
                        onClick={() => setDesenhoAberto(null)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <div className="flex flex-col items-center gap-3 pointer-events-auto">
                            <div className="flex items-center gap-2">
                                <a
                                    href={desenhoAberto}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-zinc-600 text-zinc-300 hover:border-white hover:text-white transition-colors bg-black/60"
                                >
                                    <iconify-icon icon="solar:download-linear" width="12"></iconify-icon>
                                    Baixar
                                </a>
                                <button
                                    onClick={() => setDesenhoAberto(null)}
                                    className="flex items-center justify-center w-8 h-8 border border-zinc-600 text-zinc-300 hover:border-white hover:text-white transition-colors bg-black/60"
                                >
                                    <iconify-icon icon="solar:close-linear" width="14"></iconify-icon>
                                </button>
                            </div>
                            <img
                                src={desenhoAberto}
                                alt="Desenho da medição"
                                className="max-h-[80vh] max-w-[90vw] object-contain"
                            />
                        </div>
                    </div>
                </>
        )}
        </>
    );
}
