import React, { useState } from 'react';
import { fmtBRL } from '../../utils/projetoUtils';

export default function AbaPedidos({ pedidosFechados = [], ambientes = [], actions, loadingPdf, setPdfModal }) {
    const [pedidosAbertos, setPedidosAbertos] = useState({});

    const pedidosOrdenados = [...pedidosFechados].reverse(); // oldest first → Pedido 1, 2, 3...

    const orcamentosMap = Object.fromEntries(
        ambientes.flatMap(a => (a.orcamentos ?? []).map(o => [o.id, { ...o, ambiente_nome: a.nome }]))
    );

    return (
        <div className="sys-reveal sys-delay-200">
            <div className="flex items-center justify-between mb-5">
                <div className="text-[9px] font-mono font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                    03 // Pedidos
                </div>
                {pedidosOrdenados.length > 0 && (
                    <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-600">
                        {pedidosOrdenados.length} pedido{pedidosOrdenados.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {pedidosOrdenados.length === 0 ? (
                <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-6 py-16 text-center">
                    <iconify-icon icon="solar:document-text-linear" width="36" className="text-gray-300 dark:text-zinc-800 mb-4 block mx-auto"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum pedido fechado ainda</p>
                    <p className="font-mono text-[10px] text-gray-400 dark:text-zinc-700 mt-2">Use a aba Orçamentos para fechar um pedido</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {pedidosOrdenados.map((pedido, idx) => {
                        const numero = idx + 1;
                        const aberto = pedidosAbertos[pedido.id] !== undefined ? pedidosAbertos[pedido.id] : true;
                        const toggle = () => setPedidosAbertos(prev => ({ ...prev, [pedido.id]: !aberto }));

                        const cenarios = (pedido.cenario_ids ?? []).map(cid => orcamentosMap[cid]).filter(Boolean);
                        const valorTotal = cenarios.reduce((s, o) => s + (o.valor_total ?? 0), 0);

                        return (
                            <div key={pedido.id} className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                                {/* Header */}
                                <button
                                    onClick={toggle}
                                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-zinc-900/40 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <iconify-icon icon="solar:document-text-bold" width="15" className="text-blue-400 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[11px] uppercase tracking-widest font-bold text-gray-900 dark:text-white">
                                            Pedido {numero}
                                        </span>
                                        {pedido.created_at && (
                                            <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">
                                                {new Date(pedido.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                        {valorTotal > 0 && (
                                            <span className="font-mono text-[11px] font-semibold text-yellow-400">
                                                {fmtBRL(valorTotal)}
                                            </span>
                                        )}
                                        <span className="font-mono text-[9px] px-2 py-0.5 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500">
                                            Sem medição de produção
                                        </span>
                                    </div>
                                    <iconify-icon
                                        icon={aberto ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                        width="14"
                                        className="text-gray-400 dark:text-zinc-500 shrink-0 ml-2"
                                    ></iconify-icon>
                                </button>

                                {aberto && (
                                    <div className="border-t border-gray-300 dark:border-zinc-800">
                                        {/* Detalhes do pedido */}
                                        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                                            <div>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">Pagamento</div>
                                                <div className="font-mono text-[11px] text-gray-700 dark:text-zinc-300">
                                                    {pedido.forma_pagamento ?? '—'}
                                                    {pedido.parcelas ? ` · ${pedido.parcelas}x` : ''}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">Prazo de entrega</div>
                                                <div className="font-mono text-[11px] text-gray-700 dark:text-zinc-300">
                                                    {pedido.prazo_entrega
                                                        ? new Date(pedido.prazo_entrega).toLocaleDateString('pt-BR')
                                                        : '—'}
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">Medição de Produção</div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-[11px] text-gray-500 dark:text-zinc-500">
                                                        Sem medição de produção
                                                    </span>
                                                    <button
                                                        disabled
                                                        title="Disponível quando a medição de produção for recebida"
                                                        className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest border border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-600 px-3 py-1 opacity-40 cursor-not-allowed"
                                                    >
                                                        <iconify-icon icon="solar:eye-linear" width="11"></iconify-icon>
                                                        Ver Diferença
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Cenários incluídos */}
                                        {cenarios.length > 0 && (
                                            <div className="border-t border-gray-300/60 dark:border-zinc-800/60 px-5 py-3">
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-2">Cenários incluídos</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {cenarios.map(orc => (
                                                        <div key={orc.id} className="flex items-center gap-1.5 font-mono text-[10px] bg-gray-200 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 px-2.5 py-1">
                                                            <span className="text-gray-400 dark:text-zinc-500 text-[9px]">{orc.ambiente_nome}</span>
                                                            <span className="text-gray-300 dark:text-zinc-700">·</span>
                                                            <span>{orc.nome ?? orc.nome_versao ?? 'Orçamento'}</span>
                                                            <span className="text-yellow-400/80 ml-1">{fmtBRL(orc.valor_total ?? 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Ações */}
                                        <div className="border-t border-gray-300/60 dark:border-zinc-800/60 px-5 py-3 flex justify-end">
                                            <button
                                                onClick={() => actions.openPdfModal('pedido', pedido, setPdfModal)}
                                                disabled={!!loadingPdf}
                                                className="flex items-center gap-2 border border-yellow-300 dark:border-yellow-400/40 text-yellow-700 dark:text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 hover:bg-yellow-100 dark:hover:bg-yellow-400/5 transition-colors disabled:opacity-40"
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
