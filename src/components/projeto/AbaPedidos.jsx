import React, { useState } from 'react';
import { fmtBRL } from '../../utils/projetoUtils';
import { calcularCoberturaProducao, getAmbientesProducao, getTipoMedicao } from '../../utils/medicaoUtils';

export default function AbaPedidos({ pedidosFechados = [], ambientes = [], medicoes = [], onAgendarProducao, onEditarProducao, actions, loadingPdf, setPdfModal }) {
    const [pedidosAbertos, setPedidosAbertos] = useState({});
    const [faltantesAbertos, setFaltantesAbertos] = useState({});

    const pedidosOrdenados = [...pedidosFechados].reverse();

    const orcamentosMap = Object.fromEntries(
        ambientes.flatMap(a => (a.orcamentos ?? []).map(o => [o.id, { ...o, ambiente_nome: a.nome }]))
    );

    return (
        <div className="sys-reveal sys-delay-200">
            <div className="flex items-center justify-between mb-5">
                <div className="text-[9px] font-mono font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 w-max px-2 py-1">
                    03 // Pedidos
                </div>
                {pedidosOrdenados.length > 0 && (
                    <span className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600">
                        {pedidosOrdenados.length} pedido{pedidosOrdenados.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {pedidosOrdenados.length === 0 ? (
                <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none px-6 py-16 text-center">
                    <iconify-icon icon="solar:document-text-linear" width="36" className="text-zinc-300 dark:text-zinc-800 mb-4 block mx-auto"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Nenhum pedido fechado ainda</p>
                    <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-700 mt-2">Use a aba Orçamentos para fechar um pedido</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {pedidosOrdenados.map((pedido, idx) => {
                        const numero = idx + 1;
                        const aberto = pedidosAbertos[pedido.id] !== undefined ? pedidosAbertos[pedido.id] : true;
                        const toggle = () => setPedidosAbertos(prev => ({ ...prev, [pedido.id]: !aberto }));

                        const cenarios = (pedido.cenario_ids ?? []).map(cid => orcamentosMap[cid]).filter(Boolean);
                        const valorTotal = cenarios.reduce((s, o) => s + (o.valor_total ?? 0), 0);

                        const { total, prontos, faltantes, status: cobStatus, medicoesCobrem, temAgendada } =
                            calcularCoberturaProducao(pedido, orcamentosMap, medicoes);
                        const nCompletas = medicoesCobrem.filter(m => m.status === 'enviada').length;
                        const medicaoComProducao = medicoesCobrem.find(m =>
                            getAmbientesProducao(m).size > 0 && getTipoMedicao(m) !== 'producao'
                        ) ?? null;

                        return (
                            <div key={pedido.id} className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none">
                                {/* Header */}
                                <button
                                    onClick={toggle}
                                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <iconify-icon icon="solar:document-text-bold" width="15" className="text-blue-400 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[11px] uppercase tracking-widest font-bold text-zinc-900 dark:text-white">
                                            Pedido {numero}
                                        </span>
                                        {pedido.created_at && (
                                            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
                                                {new Date(pedido.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                        {valorTotal > 0 && (
                                            <span className="font-mono text-[11px] font-semibold text-orange-600 dark:text-yellow-400">
                                                {fmtBRL(valorTotal)}
                                            </span>
                                        )}
                                        {cobStatus === 'completo' ? (
                                            <span className="font-mono text-[9px] px-2 py-0.5 border border-green-500/40 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-400/5">
                                                Já medido como produção{nCompletas > 1 ? ` · ${nCompletas}` : ''}
                                            </span>
                                        ) : cobStatus === 'parcial' && !temAgendada ? (
                                            <span
                                                onClick={e => { e.stopPropagation(); setFaltantesAbertos(prev => ({ ...prev, [pedido.id]: !prev[pedido.id] })); }}
                                                className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 border border-sky-400/40 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-400/5 cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-400/10 transition-colors select-none"
                                            >
                                                Sem medição agendada ({prontos}/{total})
                                                <iconify-icon
                                                    icon={faltantesAbertos[pedido.id] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                                    width="10"
                                                ></iconify-icon>
                                            </span>
                                        ) : cobStatus === 'parcial' ? (
                                            <span
                                                onClick={e => { e.stopPropagation(); setFaltantesAbertos(prev => ({ ...prev, [pedido.id]: !prev[pedido.id] })); }}
                                                className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 border border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-400/10 transition-colors select-none"
                                            >
                                                Medição agendada ({prontos}/{total})
                                                <iconify-icon
                                                    icon={faltantesAbertos[pedido.id] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                                    width="10"
                                                ></iconify-icon>
                                            </span>
                                        ) : temAgendada ? (
                                            <span className="font-mono text-[9px] px-2 py-0.5 border border-orange-400/40 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-400/5">
                                                Medição agendada
                                            </span>
                                        ) : (
                                            <span className="font-mono text-[9px] px-2 py-0.5 border border-zinc-200/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-500 rounded-full dark:rounded-none">
                                                Sem medição de produção agendada
                                            </span>
                                        )}
                                    </div>
                                    <iconify-icon
                                        icon={aberto ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                        width="14"
                                        className="text-zinc-400 dark:text-zinc-500 shrink-0 ml-2"
                                    ></iconify-icon>
                                </button>

                                {cobStatus === 'parcial' && faltantesAbertos[pedido.id] && (
                                    <div className="px-5 py-3 border-b border-amber-400/20 bg-amber-50/60 dark:bg-amber-400/[0.03]">
                                        <p className="font-mono text-[9px] uppercase tracking-widest text-amber-600/70 dark:text-amber-400/60 mb-1.5">
                                            Faltam medir como produção
                                        </p>
                                        <ul className="flex flex-col gap-1">
                                            {[...faltantes].map(nome => (
                                                <li key={nome} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-700 dark:text-zinc-300">
                                                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0"></span>
                                                    {nome}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {aberto && (
                                    <div className="border-t border-zinc-200/80 dark:border-zinc-800">
                                        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                                            <div>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-1">Pagamento</div>
                                                <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                                                    {pedido.forma_pagamento ?? '—'}
                                                    {pedido.parcelas ? ` · ${pedido.parcelas}x` : ''}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-1">Prazo de entrega</div>
                                                <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                                                    {pedido.prazo_entrega
                                                        ? new Date(pedido.prazo_entrega).toLocaleDateString('pt-BR')
                                                        : '—'}
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2">Medição de Produção</div>
                                                {medicoesCobrem.length > 0 && (
                                                    <div className="flex flex-col gap-2 mb-2">
                                                        {medicoesCobrem.map(m => (
                                                            <div key={m.id} className="flex items-center gap-3 flex-wrap">
                                                                <iconify-icon
                                                                    icon={['concluida','processada','aprovada'].includes(m.status) ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                                                                    width="13"
                                                                    className={['concluida','processada','aprovada'].includes(m.status) ? 'text-green-500 shrink-0' : 'text-blue-400 shrink-0'}
                                                                ></iconify-icon>
                                                                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{m.data ?? '—'}</span>
                                                                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500">{m.medidor ?? '—'}</span>
                                                                {m.status === 'agendada' && (
                                                                    <button
                                                                        onClick={() => onEditarProducao?.(m, numero)}
                                                                        title="Editar agendamento"
                                                                        className="w-6 h-6 flex items-center justify-center border border-zinc-200/80 dark:border-zinc-700 text-zinc-500 dark:text-zinc-500 hover:border-zinc-500 dark:hover:border-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-md dark:rounded-none"
                                                                    >
                                                                        <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {medicaoComProducao && (
                                                    <button
                                                        disabled
                                                        title="Disponível em breve"
                                                        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 px-3 py-1 opacity-40 cursor-not-allowed mb-2 rounded-md dark:rounded-none"
                                                    >
                                                        <iconify-icon icon="solar:eye-linear" width="11"></iconify-icon>
                                                        Ver Diferença
                                                    </button>
                                                )}
                                                {cobStatus !== 'completo' && !temAgendada && (
                                                    <div className="flex items-center gap-3">
                                                        {medicoesCobrem.length === 0 && (
                                                            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                                                                Sem medição de produção
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => onAgendarProducao?.(pedido, numero)}
                                                            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 px-3 py-1 hover:border-orange-500 dark:hover:border-yellow-400 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors rounded-md dark:rounded-none"
                                                        >
                                                            <iconify-icon icon="solar:calendar-add-linear" width="11"></iconify-icon>
                                                            {cobStatus === 'parcial' ? 'Agendar Restantes' : 'Agendar Medição de Produção'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {cenarios.length > 0 && (
                                            <div className="border-t border-zinc-200/80 dark:border-zinc-800/60 px-5 py-3">
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-2">Cenários incluídos</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {cenarios.map(orc => (
                                                        <div key={orc.id} className="flex items-center gap-1.5 font-mono text-[10px] bg-zinc-200 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2.5 py-1 rounded-md dark:rounded-none">
                                                            <span className="text-zinc-400 dark:text-zinc-500 text-[9px]">{orc.ambiente_nome}</span>
                                                            <span className="text-zinc-300 dark:text-zinc-700">·</span>
                                                            <span>{orc.nome ?? orc.nome_versao ?? 'Orçamento'}</span>
                                                            <span className="text-orange-600/80 dark:text-yellow-400/80 ml-1">{fmtBRL(orc.valor_total ?? 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="border-t border-zinc-200/80 dark:border-zinc-800/60 px-5 py-3 flex justify-end">
                                            <button
                                                onClick={() => actions.openPdfModal('pedido', pedido, setPdfModal)}
                                                disabled={!!loadingPdf}
                                                className="flex items-center gap-2 border border-orange-300 dark:border-yellow-400/40 text-orange-700 dark:text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 hover:bg-orange-100 dark:hover:bg-yellow-400/5 transition-colors disabled:opacity-40 rounded-md dark:rounded-none"
                                            >
                                                {loadingPdf === 'pedido'
                                                    ? <><iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon> Gerando...</>
                                                    : <><iconify-icon icon="solar:file-download-linear" width="13"></iconify-icon> Emitir PDF</>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
