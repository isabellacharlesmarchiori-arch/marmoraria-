import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATUS_CONFIG, fmtBRL, calcDataFinalDiasUteis, calcParcelas } from '../../utils/projetoUtils';
import CamposParcelamento from '../../pages/financeiro/lancamentos/CamposParcelamento';
import ModalImportarPDF from './ModalImportarPDF';

export default function AbaCarrinho({
    ambientes,
    pedidoFechado,
    projeto,
    projetoId,
    isViewOnlyAdmin,
    loadingPecasOrc,
    fetchPecasParaOrcamento,
    modoMesclar, setModoMesclar, mesclarIds, setMesclarIds,
    modalMesclar, setModalMesclar, loadingMesclar, setLoadingMesclar,
    orcsMesclados, setOrcsMesclados, toastMesclar, setToastMesclar,
    cancelarMesclar, toggleMesclarId,
    modoFecharPedido, setModoFecharPedido, fecharIds, setFecharIds,
    modalFechar, setModalFechar, loadingFechar, setLoadingFechar,
    toastFechar, setToastFechar, fecharOpen, setFecharOpen,
    cancelarFecharPedido, toggleFecharId,
    carrinhoExpandido, setCarrinhoExpandido,
    carrinhoEditandoNome, setCarrinhoEditandoNome,
    carrinhoEditandoDesconto, setCarrinhoEditandoDesconto,
    carrinhoEditandoAjustes, setCarrinhoEditandoAjustes,
    loadingPdf, setPdfModal,
    actions,
}) {
    const navigate = useNavigate();
    const id = projetoId;
    const [modalPdf, setModalPdf] = useState(false);
    const [editandoPecaCarrinho, setEditandoPecaCarrinho] = useState(null); // { orcId, pecaId, pecaDbId, nome }
    const [editandoItemCarrinho, setEditandoItemCarrinho] = useState(null); // { orcId, itemNome, novo }
    const [editandoAmbCarrinho,  setEditandoAmbCarrinho]  = useState(null); // { ambId, novo }

    function toggleCarrinhoDetalhes(orcId) {
        setCarrinhoExpandido(prev => {
            const nextVal = !prev[orcId];
            if (nextVal) {
                const orc = ambientes.flatMap(a => a.orcamentos ?? []).find(o => o.id === orcId);
                if (orc && (orc.pecas?.length ?? 0) === 0 && (orc.valor_total ?? 0) > 0) {
                    fetchPecasParaOrcamento(orcId);
                }
            }
            return { ...prev, [orcId]: nextVal };
        });
    }

    const orcamentosCarrinho = ambientes.flatMap(amb =>
        (amb.orcamentos ?? []).map(orc => ({ ...orc, ambiente_id: amb.id, ambiente_nome: amb.nome }))
    );
    const totalGeral = orcamentosCarrinho.reduce((s, o) => s + (o.valor_total ?? 0), 0);
    const modoAtivo = modoMesclar || modoFecharPedido;

    return (
        <>
        <div className="sys-reveal sys-delay-200">
            {/* Toasts */}
            {toastMesclar && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-orange-950 border border-orange-700/50 px-5 py-3 flex items-center gap-3 shadow-xl max-w-md w-full">
                    <iconify-icon icon="solar:check-circle-linear" width="16" className="text-orange-400 shrink-0"></iconify-icon>
                    <span className="font-mono text-[11px] text-orange-300 flex-1">{toastMesclar}</span>
                </div>
            )}
            {toastFechar && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-950 border border-green-700/50 px-5 py-3 flex items-center gap-3 shadow-xl max-w-md w-full">
                    <iconify-icon icon="solar:check-circle-linear" width="16" className="text-green-400 shrink-0"></iconify-icon>
                    <span className="font-mono text-[11px] text-green-300 flex-1">{toastFechar}</span>
                </div>
            )}

            {/* Badge pedido fechado */}
            {pedidoFechado && (
                <div className="mb-4 bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-700/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <iconify-icon icon="solar:check-circle-bold" width="16" className="text-green-700 dark:text-green-400 shrink-0"></iconify-icon>
                            <div className="min-w-0">
                                <div className="font-mono text-[10px] text-green-900 dark:text-green-400 uppercase tracking-widest font-bold">Pedido Fechado</div>
                                <div className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 mt-0.5 truncate">
                                    {pedidoFechado.forma_pagamento}
                                    {pedidoFechado.parcelas ? ` · ${pedidoFechado.parcelas}x` : ''}
                                    {pedidoFechado.prazo_entrega ? ` · Entrega: ${new Date(pedidoFechado.prazo_entrega).toLocaleDateString('pt-BR')}` : ''}
                                    {pedidoFechado.created_at ? ` · Fechado em ${new Date(pedidoFechado.created_at).toLocaleDateString('pt-BR')}` : ''}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => actions.openPdfModal('pedido', null, setPdfModal)}
                                disabled={!!loadingPdf}
                                className="flex items-center gap-2 border border-yellow-300 dark:border-yellow-400/40 text-yellow-700 dark:text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-2 hover:bg-yellow-100 dark:hover:bg-yellow-400/5 transition-colors disabled:opacity-40"
                            >
                                {loadingPdf === 'pedido'
                                    ? <><iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon> Gerando...</>
                                    : <><iconify-icon icon="solar:file-download-linear" width="13"></iconify-icon> Gerar PDF</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cabeçalho da aba */}
            <div className="flex items-center justify-between mb-5">
                <div className="text-[9px] font-mono font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                    02 // Carrinho
                </div>
                <div className="flex items-center gap-2">

                    {/* ── Modo Mesclar: botão de entrada ── */}
                    {orcamentosCarrinho.length >= 2 && !modoAtivo && !pedidoFechado && (
                        <button
                            onClick={() => setModoMesclar(true)}
                            className="flex items-center gap-1.5 border border-orange-500 dark:border-orange-500/40 text-orange-700 dark:text-orange-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-100 dark:hover:bg-orange-400/10 transition-colors"
                        >
                            <iconify-icon icon="solar:merge-linear" width="13"></iconify-icon>
                            Mesclar Cenários
                        </button>
                    )}
                    {/* ── Modo Mesclar: controles ativos ── */}
                    {modoMesclar && (
                        <>
                            <span className="font-mono text-[10px] text-orange-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block"></span>
                                {mesclarIds.length} selecionado{mesclarIds.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={cancelarMesclar} className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                Cancelar
                            </button>
                            <button
                                onClick={() => setModalMesclar({ nome: 'Cenário Mesclado' })}
                                disabled={mesclarIds.length < 2}
                                className="flex items-center gap-1.5 bg-orange-500 text-gray-900 dark:text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 hover:bg-orange-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <iconify-icon icon="solar:merge-linear" width="12"></iconify-icon>
                                Mesclar ({mesclarIds.length})
                            </button>
                        </>
                    )}

                    {/* ── Fechar Pedido: botão de entrada ── */}
                    {orcamentosCarrinho.length >= 1 && !modoAtivo && !pedidoFechado && !isViewOnlyAdmin && (
                        <button
                            onClick={() => setModoFecharPedido(true)}
                            className="flex items-center gap-1.5 bg-blue-600 text-gray-900 dark:text-white text-[11px] font-bold font-mono uppercase tracking-widest px-3 py-1 hover:bg-blue-500 transition-colors"
                        >
                            <iconify-icon icon="solar:lock-keyhole-minimalistic-linear" width="13"></iconify-icon>
                            Fechar Pedido
                        </button>
                    )}
                    {/* ── Fechar Pedido: controles ativos ── */}
                    {modoFecharPedido && (
                        <>
                            <span className="font-mono text-[10px] text-green-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block"></span>
                                {fecharIds.length} selecionado{fecharIds.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={cancelarFecharPedido} className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                Cancelar
                            </button>
                            <button
                                onClick={() => setModalFechar({ forma_pagamento: 'a_vista', parcelamento_tipo: 'a_vista', parcelas_lista: [], parcelas: 2, prazo_entrega: '' })}
                                disabled={fecharIds.length < 1}
                                className="flex items-center gap-1.5 bg-green-600 text-gray-900 dark:text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 hover:bg-green-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <iconify-icon icon="solar:arrow-right-linear" width="12"></iconify-icon>
                                Avançar ({fecharIds.length})
                            </button>
                        </>
                    )}

                    {/* ── Botões normais (fora de qualquer modo) ── */}
                    {!modoAtivo && orcamentosCarrinho.length > 0 && (
                        <button
                            onClick={() => {
                                const telefone = projeto?.cliente_telefone ?? '';
                                const linhas = orcamentosCarrinho.map((o, i) =>
                                    `${i + 1}. ${o.nome ?? o.nome_versao ?? 'Orçamento'} (${o.ambiente_nome}) — ${fmtBRL(o.valor_total)}`
                                );
                                const total = `\nTotal geral: ${fmtBRL(totalGeral)}`;
                                const msg = encodeURIComponent(`Olá! Segue resumo dos orçamentos:\n\n${linhas.join('\n')}${total}`);
                                window.open(`https://wa.me/${telefone.replace(/\D/g,'')}?text=${msg}`, '_blank');
                            }}
                            className="flex items-center gap-1.5 border border-green-500 dark:border-green-500/30 text-green-700 dark:text-green-400 text-sm font-mono uppercase tracking-widest px-3 py-1 hover:bg-green-100 dark:hover:bg-green-400/10 transition-colors"
                        >
                            <iconify-icon icon="solar:chat-round-linear" width="13"></iconify-icon>
                            Enviar todos
                        </button>
                    )}
                    {!isViewOnlyAdmin && !modoAtivo && (
                        <>
                            <button
                                onClick={() => setModalPdf(true)}
                                className="flex items-center gap-1.5 border border-zinc-600 text-zinc-300 text-sm font-mono uppercase tracking-widest px-3 py-1 hover:border-zinc-400 hover:text-white transition-colors"
                            >
                                <iconify-icon icon="solar:file-text-linear" width="13"></iconify-icon>
                                Orçamento por PDF
                            </button>
                            <button
                                onClick={() => navigate(`/projetos/${id}/orcamento/novo?modo=manual`)}
                                className="flex items-center gap-1.5 bg-yellow-400 text-black text-sm font-bold uppercase tracking-widest px-3 py-1 hover:shadow-[0_0_10px_rgba(250,204,21,0.25)] transition-all"
                            >
                                <iconify-icon icon="solar:add-linear" width="13"></iconify-icon>
                                Criar orçamento
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Lista de orçamentos */}
            {orcamentosCarrinho.length === 0 ? (
                <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-6 py-16 text-center">
                    <iconify-icon icon="solar:cart-large-minimalistic-linear" width="36" className="text-gray-300 dark:text-zinc-800 mb-4 block mx-auto"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum orçamento salvo ainda</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {orcamentosCarrinho.map((orc, idx) => {
                        const nPecas = (orc.pecas?.length ?? 0) + (orc.itens_manuais?.length ?? 0);
                        const statusCfg = STATUS_CONFIG[orc.status] ?? STATUS_CONFIG.orcado;
                        const isExp = !!carrinhoExpandido[orc.id];
                        const isEditNome = carrinhoEditandoNome?.id === orc.id;
                        const nomeAtual = orc.nome ?? orc.nome_versao ?? 'Orçamento';
                        const ajustes = actions.calcAjustes(orc);
                        const temAjustes = ajustes.maj > 0 || ajustes.rt > 0 || ajustes.frete > 0;
                        const arquitetoNomeProjeto = projeto?.arquitetos?.nome ?? null;
                        const isMesclarChecked = mesclarIds.includes(orc.id);
                        const isFecharChecked  = fecharIds.includes(orc.id);
                        const isDescartado     = !!orc.descartado_em;

                        return (
                            <div
                                key={orc.id}
                                className={`bg-gray-100 dark:bg-[#0a0a0a] border transition-colors
                                    ${modoMesclar && isMesclarChecked ? 'border-orange-500 dark:border-orange-500/60 bg-orange-100 dark:bg-orange-400/5' : ''}
                                    ${modoFecharPedido && isFecharChecked ? 'border-green-500 dark:border-green-500/60 bg-green-100 dark:bg-green-400/5' : ''}
                                    ${!modoMesclar && !modoFecharPedido ? 'border-gray-300 dark:border-zinc-800' : ''}
                                    ${isDescartado ? 'opacity-40' : ''}
                                    ${modoAtivo ? 'cursor-pointer' : ''}
                                `}
                                onClick={
                                    modoMesclar ? () => toggleMesclarId(orc.id) :
                                    modoFecharPedido ? () => toggleFecharId(orc.id) :
                                    undefined
                                }
                            >
                                {/* ── Header ── */}
                                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-zinc-900">
                                    {/* Checkbox mesclar (laranja) */}
                                    {modoMesclar && (
                                        <div
                                            className={`w-4 h-4 flex items-center justify-center shrink-0 border transition-colors ${isMesclarChecked ? 'border-orange-400 bg-orange-400/20' : 'border-gray-300 dark:border-zinc-600 hover:border-orange-400'}`}
                                            onClick={e => { e.stopPropagation(); toggleMesclarId(orc.id); }}
                                        >
                                            {isMesclarChecked && <iconify-icon icon="solar:check-read-linear" width="10" className="text-orange-400"></iconify-icon>}
                                        </div>
                                    )}
                                    {/* Checkbox fechar pedido (verde) */}
                                    {modoFecharPedido && (
                                        <div
                                            className={`w-4 h-4 flex items-center justify-center shrink-0 border transition-colors ${isFecharChecked ? 'border-green-400 bg-green-400/20' : 'border-gray-300 dark:border-zinc-600 hover:border-green-400'}`}
                                            onClick={e => { e.stopPropagation(); toggleFecharId(orc.id); }}
                                        >
                                            {isFecharChecked && <iconify-icon icon="solar:check-read-linear" width="10" className="text-green-400"></iconify-icon>}
                                        </div>
                                    )}
                                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">
                                        #{String(idx + 1).padStart(2, '0')}
                                    </span>

                                    {/* Nome editável */}
                                    {isEditNome ? (
                                        <input
                                            autoFocus
                                            value={carrinhoEditandoNome.nome}
                                            onChange={e => setCarrinhoEditandoNome(prev => ({ ...prev, nome: e.target.value }))}
                                            onBlur={() => actions.salvarNomeOrcamentoCarrinho(orc.id, carrinhoEditandoNome.nome, () => setCarrinhoEditandoNome(null))}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') actions.salvarNomeOrcamentoCarrinho(orc.id, carrinhoEditandoNome.nome, () => setCarrinhoEditandoNome(null));
                                                if (e.key === 'Escape') setCarrinhoEditandoNome(null);
                                            }}
                                            className="flex-1 bg-gray-100 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm font-bold outline-none px-1 min-w-0"
                                        />
                                    ) : (
                                        <span className="flex-1 flex items-center gap-2 min-w-0">
                                            <span className={`text-sm font-semibold tracking-tight truncate ${modoMesclar && isMesclarChecked ? 'text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                                                {nomeAtual}
                                            </span>
                                            {orcsMesclados.has(orc.id) && (
                                                <span className="shrink-0 px-1.5 py-0.5 border border-orange-400 dark:border-orange-400/40 text-[8px] font-mono uppercase tracking-widest text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-400/5">
                                                    Mesclado
                                                </span>
                                            )}
                                        </span>
                                    )}

                                    <span className={`shrink-0 px-2 py-0.5 border ${statusCfg.border} text-[9px] font-mono uppercase ${statusCfg.color} ${statusCfg.bg}`}>
                                        {statusCfg.label}
                                    </span>
                                    <div className="shrink-0 text-right">
                                        {orc.desconto_total > 0 && (
                                            <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 line-through">
                                                {fmtBRL(((orc.valor_total ?? 0) + (orc.desconto_total ?? 0)) * ajustes.fator)}
                                            </div>
                                        )}
                                        {temAjustes && !orc.desconto_total && (
                                            <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 line-through">
                                                {fmtBRL(orc.valor_total)}
                                            </div>
                                        )}
                                        <span className="font-mono text-sm font-bold text-yellow-400">
                                            {fmtBRL(ajustes.totalVenda)}
                                        </span>
                                    </div>

                                    {/* Ações do card */}
                                    <div className="flex items-center gap-0.5 border-l border-gray-300 dark:border-zinc-800 pl-3 shrink-0">
                                        <button
                                            onClick={() => setCarrinhoEditandoNome({ id: orc.id, nome: nomeAtual })}
                                            title="Editar nome"
                                            className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                        >
                                            <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                                        </button>
                                        <button
                                            onClick={() => actions.duplicarOrcamentoCarrinho(orc, orc.ambiente_id)}
                                            title="Duplicar"
                                            className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                        >
                                            <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                                        </button>
                                        <button
                                            onClick={() => actions.excluirOrcamentoCarrinho(orc.id)}
                                            title="Excluir"
                                            className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                        >
                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                                        </button>
                                    </div>
                                </div>

                                {/* ── Linha única: metadata + TODOS os botões ── */}
                                <div className="px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                                    {/* Metadata compacta */}
                                    <div className="flex items-center gap-3 flex-wrap min-w-0 text-gray-500 dark:text-zinc-500">
                                        <div className="flex items-center gap-1 text-[10px]">
                                            <iconify-icon icon="solar:layers-minimalistic-linear" width="11" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                                            {orc.ambiente_nome ?? 'Ambiente'}
                                        </div>
                                        {nPecas > 0 && (
                                            <div className="flex items-center gap-1 text-[10px]">
                                                <iconify-icon icon="solar:box-linear" width="11" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                                                {nPecas}
                                            </div>
                                        )}
                                        {orc.data && (
                                            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-700">{orc.data}</span>
                                        )}
                                        {arquitetoNomeProjeto && (
                                            <span className="font-mono text-[9px] text-amber-700 dark:text-amber-600/80 border border-amber-400 dark:border-amber-700/30 px-1.5 py-0.5">
                                                RT
                                            </span>
                                        )}
                                        {orc.desconto_total > 0 && (
                                            <span className="font-mono text-[10px] text-red-400/70">− {fmtBRL(orc.desconto_total)}</span>
                                        )}
                                    </div>

                                    {/* Todos os botões na mesma linha */}
                                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                        {/* Ver detalhes */}
                                        <button
                                            onClick={() => toggleCarrinhoDetalhes(orc.id)}
                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${isExp ? 'border-yellow-300 dark:border-yellow-400/40 text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/5' : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-800 dark:hover:text-zinc-300'}`}
                                        >
                                            <iconify-icon icon={isExp ? 'solar:alt-arrow-up-linear' : 'solar:eye-linear'} width="11"></iconify-icon>
                                            {isExp ? 'Fechar' : 'Detalhes'}
                                        </button>
                                        {/* PDF */}
                                        <button
                                            onClick={() => actions.openPdfModal('orcamento', orc, setPdfModal)}
                                            disabled={!!loadingPdf}
                                            className="flex items-center gap-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 text-[10px] font-mono uppercase tracking-widest px-2 py-1 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-800 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
                                        >
                                            <iconify-icon icon="solar:file-text-linear" width="11"></iconify-icon>
                                            PDF
                                        </button>
                                        {/* WhatsApp */}
                                        <button
                                            onClick={() => {
                                                const telefone = projeto?.cliente_telefone ?? '';
                                                const msg = encodeURIComponent(`Olá! Segue o orçamento "${nomeAtual}" — ${orc.ambiente_nome}: ${fmtBRL(ajustes.totalVenda)}`);
                                                window.open(`https://wa.me/${telefone.replace(/\D/g,'')}?text=${msg}`, '_blank');
                                            }}
                                            className="flex items-center gap-1 border border-gray-300 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-2 py-1 hover:border-gray-500 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-zinc-300 transition-colors"
                                        >
                                            <iconify-icon icon="solar:chat-round-linear" width="11"></iconify-icon>
                                            WA
                                        </button>

                                        {/* Separador */}
                                        <div className="w-px h-4 bg-gray-100 dark:bg-zinc-800 mx-0.5"></div>

                                        {/* Ajustes (toggle dropdown) */}
                                        <button
                                            onClick={() => setCarrinhoEditandoAjustes(prev =>
                                                prev?.id === orc.id ? null
                                                : { id: orc.id, majoramento: String(orc.majoramento_percentual ?? 0), rt: String(orc.rt_percentual ?? projeto?.rt_padrao_percentual ?? 0), rtNome: orc.rt_arquiteto_nome || projeto?.arquitetos?.nome || '', frete: String(orc.valor_frete ?? 0) }
                                            )}
                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${carrinhoEditandoAjustes?.id === orc.id ? 'border-blue-500 dark:border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15' : 'border-gray-300 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:border-gray-500 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-zinc-300'}`}
                                        >
                                            <iconify-icon icon="solar:percent-square-linear" width="11"></iconify-icon>
                                            Ajustes
                                        </button>

                                        {/* Desconto (toggle dropdown) */}
                                        <button
                                            onClick={() => setCarrinhoEditandoDesconto(prev =>
                                                prev?.id === orc.id ? null
                                                : { id: orc.id, valor: '', tipo: '%' }
                                            )}
                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${carrinhoEditandoDesconto?.id === orc.id ? 'border-blue-500 dark:border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15' : 'border-gray-300 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:border-gray-500 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-zinc-300'}`}
                                        >
                                            <iconify-icon icon="solar:tag-price-linear" width="11"></iconify-icon>
                                            {orc.desconto_total > 0 ? 'Desc.' : 'Desc.'}
                                        </button>
                                    </div>
                                </div>

                                {/* ── Dropdown: Desconto ── */}
                                {carrinhoEditandoDesconto?.id === orc.id && (
                                    <div className="px-5 py-4 border-t border-gray-300/60 dark:border-zinc-800/60 bg-gray-100/60 dark:bg-zinc-950/40">
                                        <div className="flex items-end gap-3 flex-wrap">
                                            <div className="flex flex-col gap-1">
                                                <label className="font-mono text-[9px] uppercase tracking-widest text-purple-400/70">Valor do desconto</label>
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="number" min="0" step="0.01"
                                                        value={carrinhoEditandoDesconto.valor}
                                                        onChange={e => setCarrinhoEditandoDesconto(prev => ({ ...prev, valor: e.target.value }))}
                                                        placeholder="0"
                                                        className="w-28 bg-gray-100 dark:bg-black border border-purple-700/40 text-gray-900 dark:text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-purple-500/60"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => setCarrinhoEditandoDesconto(prev => ({ ...prev, tipo: prev.tipo === '%' ? 'R$' : '%' }))}
                                                        className="font-mono text-[10px] border border-gray-300 dark:border-zinc-700 px-2 py-1.5 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
                                                    >
                                                        {carrinhoEditandoDesconto.tipo}
                                                    </button>
                                                </div>
                                            </div>
                                            {orc.desconto_total > 0 && (
                                                <div className="font-mono text-[10px] text-red-400/60 pb-1.5">
                                                    Atual: − {fmtBRL(orc.desconto_total)}
                                                </div>
                                            )}
                                            <div className="flex gap-2 pb-0.5">
                                                <button onClick={() => actions.salvarDescontoCarrinho(orc.id, carrinhoEditandoDesconto.valor, carrinhoEditandoDesconto.tipo, () => setCarrinhoEditandoDesconto(null))} className="font-mono text-[10px] bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-500 transition-colors uppercase tracking-widest">Salvar</button>
                                                <button onClick={() => setCarrinhoEditandoDesconto(null)} className="font-mono text-[10px] border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 px-3 py-1.5 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors">✕</button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Dropdown: Ajustes de Venda ── */}
                                {carrinhoEditandoAjustes?.id === orc.id && (
                                    <div className="px-5 py-4 border-t border-gray-300/60 dark:border-zinc-800/60 bg-gray-100/60 dark:bg-zinc-950/40">
                                        <div className="flex items-end gap-3 flex-wrap">
                                            {/* Majoramento — vermelho */}
                                            <div className="flex flex-col gap-1">
                                                <label className="font-mono text-[9px] uppercase tracking-widest text-red-400/70">Majoramento %</label>
                                                <input type="number" min="0" step="0.1" value={carrinhoEditandoAjustes.majoramento} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, majoramento: e.target.value }))} className="w-24 bg-gray-100 dark:bg-black border border-red-700/50 text-gray-900 dark:text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-red-500/70" placeholder="0" autoFocus />
                                            </div>
                                            {/* RT — laranja */}
                                            <div className="flex flex-col gap-1">
                                                <label className="font-mono text-[9px] uppercase tracking-widest text-orange-400/70">RT %</label>
                                                <input type="number" min="0" step="0.1" value={carrinhoEditandoAjustes.rt} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, rt: e.target.value }))} className="w-24 bg-gray-100 dark:bg-black border border-orange-700/50 text-gray-900 dark:text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-orange-500/70" placeholder="0" />
                                            </div>
                                            {/* Frete — verde */}
                                            <div className="flex flex-col gap-1">
                                                <label className="font-mono text-[9px] uppercase tracking-widest text-green-400/70">Frete R$</label>
                                                <input type="number" min="0" step="0.01" value={carrinhoEditandoAjustes.frete} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, frete: e.target.value }))} className="w-28 bg-gray-100 dark:bg-black border border-green-700/50 text-gray-900 dark:text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-green-500/70" placeholder="0,00" />
                                            </div>
                                            {/* Arquiteto — laranja (parte do RT) */}
                                            <div className="flex flex-col gap-1 flex-1 min-w-36">
                                                <label className="font-mono text-[9px] uppercase tracking-widest text-orange-400/70">Arquiteto / RT</label>
                                                <input type="text" value={carrinhoEditandoAjustes.rtNome} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, rtNome: e.target.value }))} className="bg-gray-100 dark:bg-black border border-orange-700/50 text-gray-900 dark:text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-orange-500/70 w-full" placeholder="Nome do arquiteto" />
                                            </div>
                                            <div className="flex gap-2 pb-0.5">
                                                <button onClick={() => actions.salvarAjustesCarrinho(orc.id, carrinhoEditandoAjustes.majoramento, carrinhoEditandoAjustes.rt, carrinhoEditandoAjustes.rtNome, carrinhoEditandoAjustes.frete, () => setCarrinhoEditandoAjustes(null))} className="font-mono text-[10px] bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-500 transition-colors uppercase tracking-widest">Salvar</button>
                                                <button onClick={() => setCarrinhoEditandoAjustes(null)} className="font-mono text-[10px] border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 px-3 py-1.5 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors">✕</button>
                                            </div>
                                        </div>
                                        {(() => {
                                            const maj   = Math.max(0, parseFloat(String(carrinhoEditandoAjustes.majoramento).replace(',', '.')) || 0);
                                            const rt    = Math.max(0, parseFloat(String(carrinhoEditandoAjustes.rt).replace(',', '.')) || 0);
                                            const frete = Math.max(0, parseFloat(String(carrinhoEditandoAjustes.frete).replace(',', '.')) || 0);
                                            const base = orc.valor_total ?? 0;
                                            const valorMaj = base * (1 + maj / 100);
                                            const valorRt  = valorMaj * (rt / 100);
                                            const total    = valorMaj + valorRt + frete;
                                            return (maj > 0 || rt > 0 || frete > 0) && (
                                                <div className="mt-3 border border-gray-300 dark:border-zinc-800 bg-gray-100/60 dark:bg-black/40 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                                                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Custo base</span>
                                                    <span className="font-mono text-[10px] text-gray-700 dark:text-zinc-300 text-right">{fmtBRL(base)}</span>
                                                    {maj > 0 && <><span className="font-mono text-[9px] text-red-400/60 uppercase tracking-widest">+ Majoramento ({maj}%)</span><span className="font-mono text-[10px] text-gray-700 dark:text-zinc-300 text-right">+ {fmtBRL(valorMaj - base)}</span></>}
                                                    {rt > 0 && <><span className="font-mono text-[9px] text-orange-400/60 uppercase tracking-widest">+ RT ({rt}%)</span><span className="font-mono text-[10px] text-gray-700 dark:text-zinc-300 text-right">+ {fmtBRL(valorRt)}</span></>}
                                                    {frete > 0 && <><span className="font-mono text-[9px] text-green-400/60 uppercase tracking-widest">+ Frete</span><span className="font-mono text-[10px] text-gray-700 dark:text-zinc-300 text-right">+ {fmtBRL(frete)}</span></>}
                                                    <span className="font-mono text-[9px] text-yellow-400 uppercase tracking-widest border-t border-gray-300 dark:border-zinc-800 pt-1.5">Total de venda</span>
                                                    <span className="font-mono text-sm font-bold text-yellow-400 text-right border-t border-gray-300 dark:border-zinc-800 pt-1.5">{fmtBRL(total)}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* ── Resumo de ajustes salvos ── */}
                                {!carrinhoEditandoAjustes && temAjustes && (
                                    <div className="px-5 py-3 border-t border-gray-300/60 dark:border-zinc-800/60 bg-gray-100 dark:bg-zinc-950/30">
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">Custo base</span>
                                            <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 text-right">{fmtBRL(ajustes.custoBase)}</span>
                                            {ajustes.maj > 0 && <>
                                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">+ Majoramento ({ajustes.maj}%)</span>
                                                <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 text-right">+ {fmtBRL(ajustes.valorMajorado - ajustes.custoBase)}</span>
                                            </>}
                                            {ajustes.rt > 0 && <>
                                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">+ RT ({ajustes.rt}%){orc.rt_arquiteto_nome ? ` — ${orc.rt_arquiteto_nome}` : ''}</span>
                                                <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 text-right">+ {fmtBRL(ajustes.valorRt)}</span>
                                            </>}
                                            {ajustes.frete > 0 && <>
                                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">+ Frete</span>
                                                <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 text-right">+ {fmtBRL(ajustes.frete)}</span>
                                            </>}
                                            <span className="font-mono text-[9px] text-yellow-400/80 uppercase tracking-widest border-t border-gray-300/60 dark:border-zinc-800/60 pt-1.5 mt-0.5">Total de venda</span>
                                            <span className="font-mono text-sm font-bold text-yellow-400 text-right border-t border-gray-300/60 dark:border-zinc-800/60 pt-1.5 mt-0.5">{fmtBRL(ajustes.totalVenda)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* ── Painel de detalhes expandível ── */}
                                {isExp && (() => {
                                    // Lazy load: mostra spinner se as peças ainda não chegaram
                                    const isLoadingP = !!loadingPecasOrc[orc.id];
                                    const todasPecas = orc.pecas ?? [];
                                    if (isLoadingP || (todasPecas.length === 0 && (orc.valor_total ?? 0) > 0 && (orc.itens_manuais ?? []).length === 0)) {
                                        return (
                                            <div className="border-t border-gray-300 dark:border-zinc-800 bg-gray-100/60 dark:bg-black/40 px-5 py-5 flex items-center gap-3 text-gray-500 dark:text-zinc-600">
                                                <iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin text-yellow-400/50"></iconify-icon>
                                                <span className="font-mono text-[10px] uppercase tracking-widest">Carregando detalhes...</span>
                                            </div>
                                        );
                                    }
                                    // Agrupar peças por ambiente_id
                                    const gruposMap = new Map();
                                    todasPecas.forEach(p => {
                                        const key = p.ambiente_id ?? '__sem_ambiente__';
                                        if (!gruposMap.has(key)) gruposMap.set(key, []);
                                        gruposMap.get(key).push(p);
                                    });
                                    // Garante que ambientes sem peca (itens manuais) também aparecem
                                    if (gruposMap.size === 0 && (orc.itens_manuais ?? []).length > 0) {
                                        gruposMap.set('__sem_ambiente__', []);
                                    }
                                    // Fallback: se não há nenhum grupo mas há peças sem ambiente_id
                                    const grupos = gruposMap.size > 0
                                        ? [...gruposMap.entries()]
                                        : [['__sem_ambiente__', todasPecas]];

                                    const nomeDoAmbiente = (ambId) => {
                                        if (!ambId || ambId === '__sem_ambiente__') return orc.ambiente_nome ?? 'Ambiente';
                                        return ambientes.find(a => a.id === ambId)?.nome ?? orc.ambiente_nome ?? 'Ambiente';
                                    };

                                    return (
                                        <div className="border-t border-gray-300 dark:border-zinc-800 bg-gray-100/60 dark:bg-black/40">
                                            {grupos.map(([ambId, pecasGrupo], gi) => {
                                                const ambNome = nomeDoAmbiente(ambId);
                                                const subtotal = pecasGrupo.reduce((s, p) => s + (p.valor ?? 0), 0);
                                                // Itens manuais só no último/único grupo
                                                const showManuais = gi === grupos.length - 1 && (orc.itens_manuais ?? []).length > 0;
                                                const subtotalComManuais = subtotal + (showManuais ? (orc.itens_manuais ?? []).reduce((s, it) => s + (it.total ?? 0), 0) : 0);

                                                return (
                                                    <div key={ambId} className={gi > 0 ? 'border-t border-gray-300 dark:border-zinc-800' : ''}>
                                                        {/* Header do ambiente */}
                                                        {(() => {
                                                            const isRealAmb = ambId && ambId !== '__sem_ambiente__';
                                                            const isEditAmb = isRealAmb && editandoAmbCarrinho?.ambId === ambId;
                                                            return (
                                                                <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-zinc-950/50 border-b border-gray-100 dark:border-zinc-900 group/amb">
                                                                    <div className="w-0.5 h-4 bg-yellow-400/50 shrink-0"></div>
                                                                    {isEditAmb ? (
                                                                        <>
                                                                            <input
                                                                                autoFocus
                                                                                value={editandoAmbCarrinho.novo}
                                                                                onChange={e => setEditandoAmbCarrinho(prev => ({ ...prev, novo: e.target.value }))}
                                                                                onBlur={() => actions.renomearAmbCarrinho(ambId, editandoAmbCarrinho.novo, () => setEditandoAmbCarrinho(null))}
                                                                                onKeyDown={e => {
                                                                                    if (e.key === 'Enter') actions.renomearAmbCarrinho(ambId, editandoAmbCarrinho.novo, () => setEditandoAmbCarrinho(null));
                                                                                    if (e.key === 'Escape') setEditandoAmbCarrinho(null);
                                                                                }}
                                                                                className="flex-1 min-w-0 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 outline-none font-semibold"
                                                                            />
                                                                            <button onClick={() => setEditandoAmbCarrinho(null)} className="font-mono text-[8px] text-gray-500 dark:text-zinc-600 px-1 shrink-0">✕</button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className="font-mono text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300 font-semibold flex-1">
                                                                                {ambNome}
                                                                            </span>
                                                                            {isRealAmb && (
                                                                                <button
                                                                                    onClick={() => setEditandoAmbCarrinho({ ambId, novo: ambNome })}
                                                                                    className="opacity-0 group-hover/amb:opacity-100 p-0.5 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-all shrink-0"
                                                                                    title="Renomear ambiente"
                                                                                >
                                                                                    <iconify-icon icon="solar:pen-linear" width="10"></iconify-icon>
                                                                                </button>
                                                                            )}
                                                                            <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 shrink-0">{fmtBRL(subtotalComManuais)}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Peças do grupo — agrupadas por item */}
                                                        {(() => {
                                                            const temItens = pecasGrupo.some(p => p.item_nome);
                                                            if (!temItens) {
                                                                const ACAB_LABELS_F = { meia_esquadria: 'Meia-Esquadria', reto_simples: 'Reto Simples', boleado: 'Boleado', boleado_duplo: 'Boleado Duplo', reto_duplo: 'Reto Duplo', chanfrado: 'Chanfrado', ME: 'Meia-Esquadria', RS: 'Reto Simples', BO: 'Boleado', BD: 'Boleado Duplo', RD: 'Reto Duplo', CF: 'Chanfrado' };
                                                                // Agrega acabamentos de todas as peças
                                                                const acabFlatMap = new Map();
                                                                pecasGrupo.forEach(p => {
                                                                    (p.acabamentos ?? []).forEach(ac => {
                                                                        if (Number(ac.ml ?? 0) <= 0) return;
                                                                        if (!acabFlatMap.has(ac.tipo)) acabFlatMap.set(ac.tipo, { ml: 0, valor: 0 });
                                                                        const e = acabFlatMap.get(ac.tipo);
                                                                        e.ml    += Number(ac.ml ?? 0);
                                                                        e.valor += Number(ac.valor ?? 0);
                                                                    });
                                                                });
                                                                return [
                                                                    ...pecasGrupo.map((p, pi) => {
                                                                        const valorPedra = (p.valor ?? 0) - (p.valor_acabamentos ?? 0);
                                                                        return (
                                                                            <div key={p.id ?? pi} className="flex items-center justify-between px-5 py-2 border-b border-gray-100/30 dark:border-zinc-900/30 hover:bg-gray-100/50 dark:hover:bg-zinc-900/15 transition-colors">
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <div className="w-px h-5 bg-gray-100 dark:bg-zinc-800 shrink-0 ml-1"></div>
                                                                                    <span className="text-[11px] text-gray-700 dark:text-zinc-300 truncate">{p.nome ?? 'Peça'}</span>
                                                                                    {p.area != null && <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 shrink-0">{Number(p.area).toFixed(2)} m²</span>}
                                                                                    {p.espessura && p.espessura !== '—' && <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 shrink-0">{p.espessura}cm</span>}
                                                                                </div>
                                                                                <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-400 shrink-0 ml-3">{fmtBRL(valorPedra)}</span>
                                                                            </div>
                                                                        );
                                                                    }),
                                                                    ...[...acabFlatMap.entries()].map(([tipo, { ml, valor }]) => {
                                                                        const label = ACAB_LABELS_F[tipo] ?? tipo;
                                                                        const vlrMl = ml > 0 ? valor / ml : 0;
                                                                        return (
                                                                            <div key={`acab-flat-${tipo}`} className="flex items-center justify-between px-5 py-1.5 border-b border-amber-200 dark:border-amber-900/20 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors">
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <iconify-icon icon="solar:ruler-angular-linear" width="11" className="text-amber-600/60 shrink-0 ml-1"></iconify-icon>
                                                                                    <span className="text-[10px] text-amber-700 dark:text-amber-400/80 truncate">{label}</span>
                                                                                    <span className="font-mono text-[9px] text-amber-700/70 shrink-0">{ml.toFixed(2)} ml</span>
                                                                                    {vlrMl > 0 && <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 shrink-0">({fmtBRL(vlrMl)}/ml)</span>}
                                                                                </div>
                                                                                <span className="font-mono text-[11px] text-amber-400 shrink-0 ml-3">{fmtBRL(valor)}</span>
                                                                            </div>
                                                                        );
                                                                    }),
                                                                ];
                                                            }
                                                            // Group by item_nome
                                                            const itMap = new Map();
                                                            const itOrdem = [];
                                                            pecasGrupo.forEach(p => {
                                                                const k = p.item_nome ?? '__sem_item__';
                                                                if (!itMap.has(k)) { itMap.set(k, []); itOrdem.push(k); }
                                                                itMap.get(k).push(p);
                                                            });
                                                            const ACAB_LABELS = { meia_esquadria: 'Meia-Esquadria', reto_simples: 'Reto Simples', boleado: 'Boleado', boleado_duplo: 'Boleado Duplo', reto_duplo: 'Reto Duplo', chanfrado: 'Chanfrado', ME: 'Meia-Esquadria', RS: 'Reto Simples', BO: 'Boleado', BD: 'Boleado Duplo', RD: 'Reto Duplo', CF: 'Chanfrado' };
                                                            return itOrdem.flatMap(itemKey => {
                                                                const nomeItem  = itemKey === '__sem_item__' ? null : itemKey;
                                                                const pecasItem = itMap.get(itemKey);
                                                                const subtotalItem = pecasItem.reduce((s, p) => s + (p.valor ?? 0), 0);

                                                                // Agrega acabamentos de todas as peças do item por tipo
                                                                const acabByTipo = new Map();
                                                                pecasItem.forEach(p => {
                                                                    (p.acabamentos ?? []).forEach(ac => {
                                                                        if (Number(ac.ml ?? 0) <= 0) return;
                                                                        const t = ac.tipo;
                                                                        if (!acabByTipo.has(t)) acabByTipo.set(t, { ml: 0, valor: 0 });
                                                                        const e = acabByTipo.get(t);
                                                                        e.ml    += Number(ac.ml    ?? 0);
                                                                        e.valor += Number(ac.valor ?? 0);
                                                                    });
                                                                });
                                                                const acabRows = [...acabByTipo.entries()];

                                                                const px = nomeItem ? 'px-7' : 'px-5';
                                                                const isEditItem = editandoItemCarrinho?.orcId === orc.id && editandoItemCarrinho?.itemNome === nomeItem;
                                                                return [
                                                                    // Header do item
                                                                    ...(nomeItem ? [
                                                                        <div key={`item-hdr-${itemKey}`} className="flex items-center gap-2 px-5 py-1.5 bg-gray-100/30 dark:bg-zinc-900/30 border-b border-gray-100/40 dark:border-zinc-900/40 group/item">
                                                                            <iconify-icon icon="solar:folder-linear" width="10" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                                                            {isEditItem ? (
                                                                                <>
                                                                                    <input
                                                                                        autoFocus
                                                                                        value={editandoItemCarrinho.novo}
                                                                                        onChange={e => setEditandoItemCarrinho(prev => ({ ...prev, novo: e.target.value }))}
                                                                                        onBlur={() => actions.renomearItemCarrinho(orc.id, nomeItem, editandoItemCarrinho.novo, () => setEditandoItemCarrinho(null))}
                                                                                        onKeyDown={e => {
                                                                                            if (e.key === 'Enter') actions.renomearItemCarrinho(orc.id, nomeItem, editandoItemCarrinho.novo, () => setEditandoItemCarrinho(null));
                                                                                            if (e.key === 'Escape') setEditandoItemCarrinho(null);
                                                                                        }}
                                                                                        className="flex-1 min-w-0 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 outline-none"
                                                                                    />
                                                                                    <button onClick={() => setEditandoItemCarrinho(null)} className="font-mono text-[8px] text-gray-500 dark:text-zinc-600 px-1 shrink-0">✕</button>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 flex-1">{nomeItem}</span>
                                                                                    <button
                                                                                        onClick={() => setEditandoItemCarrinho({ orcId: orc.id, itemNome: nomeItem, novo: nomeItem })}
                                                                                        className="opacity-0 group-hover/item:opacity-100 p-0.5 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-all shrink-0"
                                                                                        title="Renomear item"
                                                                                    >
                                                                                        <iconify-icon icon="solar:pen-linear" width="9"></iconify-icon>
                                                                                    </button>
                                                                                    <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{fmtBRL(subtotalItem)}</span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ] : []),
                                                                    // Linhas de pedra (valor = total − acabamentos)
                                                                    ...pecasItem.map((p, pi) => {
                                                                        const valorPedra = (p.valor ?? 0) - (p.valor_acabamentos ?? 0);
                                                                        const isEditPeca = editandoPecaCarrinho?.orcId === orc.id && editandoPecaCarrinho?.pecaId === p.id;
                                                                        return (
                                                                            <div key={p.id ?? pi} className={`flex items-center justify-between py-2 border-b border-gray-100/30 dark:border-zinc-900/30 hover:bg-gray-100/50 dark:hover:bg-zinc-900/15 transition-colors group/peca ${px}`}>
                                                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                                    <div className="w-px h-5 bg-gray-100 dark:bg-zinc-800 shrink-0 ml-1"></div>
                                                                                    {isEditPeca ? (
                                                                                        <input
                                                                                            autoFocus
                                                                                            value={editandoPecaCarrinho.nome}
                                                                                            onChange={e => setEditandoPecaCarrinho(prev => ({ ...prev, nome: e.target.value }))}
                                                                                            onBlur={() => actions.renomearPecaCarrinho(orc.id, p.id, p.pecaDbId, editandoPecaCarrinho.nome, () => setEditandoPecaCarrinho(null))}
                                                                                            onKeyDown={e => {
                                                                                                if (e.key === 'Enter') actions.renomearPecaCarrinho(orc.id, p.id, p.pecaDbId, editandoPecaCarrinho.nome, () => setEditandoPecaCarrinho(null));
                                                                                                if (e.key === 'Escape') setEditandoPecaCarrinho(null);
                                                                                            }}
                                                                                            className="flex-1 min-w-0 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-[11px] px-1.5 py-0.5 outline-none"
                                                                                        />
                                                                                    ) : (
                                                                                        <>
                                                                                            <span className="text-[11px] text-gray-700 dark:text-zinc-300 truncate">{p.nome ?? 'Peça'}</span>
                                                                                            <button
                                                                                                onClick={() => setEditandoPecaCarrinho({ orcId: orc.id, pecaId: p.id, pecaDbId: p.peca_id ?? null, nome: p.nome ?? '' })}
                                                                                                className="opacity-0 group-hover/peca:opacity-100 p-0.5 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-all shrink-0"
                                                                                                title="Renomear peça"
                                                                                            >
                                                                                                <iconify-icon icon="solar:pen-linear" width="9"></iconify-icon>
                                                                                            </button>
                                                                                        </>
                                                                                    )}
                                                                                    {p.area != null && <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 shrink-0">{Number(p.area).toFixed(2)} m²</span>}
                                                                                    {p.espessura && p.espessura !== '—' && <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 shrink-0">{p.espessura}cm</span>}
                                                                                </div>
                                                                                <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-400 shrink-0 ml-3">{fmtBRL(valorPedra)}</span>
                                                                            </div>
                                                                        );
                                                                    }),
                                                                    // Linhas de acabamento (após todas as pedras)
                                                                    ...acabRows.map(([tipo, { ml, valor }]) => {
                                                                        const label = ACAB_LABELS[tipo] ?? tipo;
                                                                        const vlrMl = ml > 0 ? valor / ml : 0;
                                                                        return (
                                                                            <div key={`acab-${itemKey}-${tipo}`} className={`flex items-center justify-between py-1.5 border-b border-amber-200 dark:border-amber-900/20 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors ${px}`}>
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <iconify-icon icon="solar:ruler-angular-linear" width="11" className="text-amber-600/60 shrink-0 ml-1"></iconify-icon>
                                                                                    <span className="text-[10px] text-amber-700 dark:text-amber-400/80 truncate">{label}</span>
                                                                                    <span className="font-mono text-[9px] text-amber-700/70 shrink-0">{ml.toFixed(2)} ml</span>
                                                                                    {vlrMl > 0 && <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 shrink-0">({fmtBRL(vlrMl)}/ml)</span>}
                                                                                </div>
                                                                                <span className="font-mono text-[11px] text-amber-400 shrink-0 ml-3">{fmtBRL(valor)}</span>
                                                                            </div>
                                                                        );
                                                                    }),
                                                                ];
                                                            });
                                                        })()}

                                                        {/* Itens manuais (último grupo) */}
                                                        {showManuais && (orc.itens_manuais ?? []).map((item, ii) => (
                                                            <div key={`manual-${ii}`} className="flex items-center justify-between px-5 py-2 border-b border-gray-100/30 dark:border-zinc-900/30 last:border-b-0 hover:bg-gray-100/50 dark:hover:bg-zinc-900/15 transition-colors">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-px h-5 bg-gray-100 dark:bg-zinc-800 shrink-0 ml-1"></div>
                                                                    <span className="text-[11px] text-gray-700 dark:text-zinc-300 truncate">{item.nome_peca || 'Item'}</span>
                                                                    <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 shrink-0">
                                                                        {Number(item.quantidade ?? 0).toFixed(2)} {item.tipo === 'area' ? 'm²' : 'ML'}
                                                                    </span>
                                                                </div>
                                                                <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-400 shrink-0 ml-3">{fmtBRL(item.total ?? 0)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })}

                                            {/* Produtos avulsos */}
                                            {(orc.avulsos ?? []).length > 0 && (
                                                <div className="border-t border-gray-300/50 dark:border-zinc-800/50">
                                                    <div className="flex items-center justify-between px-5 py-2 bg-gray-100/60 dark:bg-zinc-950/40">
                                                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Produtos avulsos</span>
                                                    </div>
                                                    {orc.avulsos.map(av => (
                                                        <div key={av.id} className="flex items-center justify-between px-5 py-2 border-b border-gray-100/30 dark:border-zinc-900/30 last:border-b-0 hover:bg-gray-100/50 dark:hover:bg-zinc-900/15 transition-colors">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-px h-5 bg-gray-100 dark:bg-zinc-800 shrink-0 ml-1"></div>
                                                                <span className="text-[11px] text-gray-700 dark:text-zinc-300 truncate">{av.nome}</span>
                                                                <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 shrink-0">{av.quantidade}x {fmtBRL(av.valor_unitario)}</span>
                                                            </div>
                                                            <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-400 shrink-0 ml-3">{fmtBRL(av.valor_total)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Vazio */}
                                            {todasPecas.length === 0 && (orc.itens_manuais ?? []).length === 0 && (orc.avulsos ?? []).length === 0 && (
                                                <div className="px-5 py-6 text-center">
                                                    <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 uppercase tracking-widest">Sem detalhes disponíveis</span>
                                                </div>
                                            )}

                                            {/* Total */}
                                            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-300 dark:border-zinc-800 bg-gray-200 dark:bg-zinc-950/80">
                                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Total</span>
                                                <span className="font-mono text-sm font-bold text-yellow-400">{fmtBRL(orc.valor_total)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}

                </div>
            )}

            {/* ══ Modal: Mesclar Cenários ══════════════════ */}
            {modalMesclar && (() => {
                const orcsSel = ambientes
                    .flatMap(amb => (amb.orcamentos ?? []).map(o => ({ ...o, ambiente_nome: amb.nome })))
                    .filter(o => mesclarIds.includes(o.id));
                const totalMesclar = orcsSel.reduce((s, o) => s + (o.valor_total ?? 0), 0);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-gray-100 dark:bg-[#0d0d0d] border border-gray-300 dark:border-zinc-700 w-full max-w-lg shadow-2xl">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <iconify-icon icon="solar:merge-linear" width="14" className="text-orange-400"></iconify-icon>
                                    <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">Mesclar Cenários</span>
                                </div>
                                <button onClick={cancelarMesclar} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                    <iconify-icon icon="solar:close-linear" width="16"></iconify-icon>
                                </button>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-2">Nome do Novo Cenário</label>
                                    <input
                                        autoFocus
                                        value={modalMesclar.nome}
                                        onChange={e => setModalMesclar(p => ({ ...p, nome: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter' && !loadingMesclar) actions.mesclarCenarios(mesclarIds, modalMesclar, { setLoadingMesclar, setOrcsMesclados, cancelarMesclar, setToastMesclar }); }}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-orange-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-2"
                                        placeholder="Ex: Proposta Final, Mescla Completa..."
                                    />
                                </div>
                                <div className="bg-gray-200/50 dark:bg-zinc-900/60 border border-gray-300 dark:border-zinc-800 p-3">
                                    <p className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
                                        Cenários que serão mesclados ({orcsSel.length}):
                                    </p>
                                    <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                                        {orcsSel.map(o => (
                                            <li key={o.id} className="flex items-center gap-2 font-mono text-[11px] text-gray-700 dark:text-zinc-300">
                                                <iconify-icon icon="solar:merge-linear" width="10" className="text-orange-400 shrink-0"></iconify-icon>
                                                <span className="text-gray-500 dark:text-zinc-500">{o.ambiente_nome}</span>
                                                <iconify-icon icon="solar:alt-arrow-right-linear" width="9" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                                <span className="truncate">{o.nome ?? o.nome_versao ?? 'Orçamento'}</span>
                                                <span className="ml-auto text-gray-500 dark:text-zinc-600 shrink-0">{fmtBRL(o.valor_total)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-300 dark:border-zinc-800">
                                        <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 uppercase">Total mesclado</span>
                                        <span className="font-mono text-sm font-bold text-orange-400">{fmtBRL(totalMesclar)}</span>
                                    </div>
                                </div>
                                <p className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 leading-relaxed">
                                    Os cenários originais são mantidos intactos. Um novo orçamento será criado com todas as peças e itens dos cenários selecionados.
                                </p>
                                <div className="flex gap-2 pt-1">
                                    <button onClick={cancelarMesclar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => actions.mesclarCenarios(mesclarIds, modalMesclar, { setLoadingMesclar, setOrcsMesclados, cancelarMesclar, setToastMesclar })}
                                        disabled={loadingMesclar || !modalMesclar.nome?.trim()}
                                        className="flex-1 bg-orange-500 text-gray-900 dark:text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loadingMesclar
                                            ? <><iconify-icon icon="solar:spinner-linear" width="12" className="animate-spin"></iconify-icon> Mesclando...</>
                                            : <><iconify-icon icon="solar:merge-linear" width="12"></iconify-icon> Confirmar Mescla</>
                                        }
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
        {/* ══ Modal: Fechar Pedido ═════════════════════ */}
        {modalFechar && (() => {
                const orcsSel       = orcamentosCarrinho.filter(o => fecharIds.includes(o.id));
                const totalSel      = orcsSel.reduce((s, o) => s + (o.valor_total ?? 0), 0);
                const formasParc    = ['cartao', 'boleto_parcelado'];
                const temParcelas   = formasParc.includes(modalFechar.forma_pagamento);
                const prazoTipo     = modalFechar.prazo_tipo ?? 'DATA';
                const dataFinalCalc = prazoTipo === 'DIAS_UTEIS'
                    ? calcDataFinalDiasUteis(modalFechar.prazo_dias ?? 0)
                    : null;
                const previewParcelas = temParcelas && (modalFechar.parcelas ?? 0) >= 2 && modalFechar.primeiro_vencimento
                    ? calcParcelas(totalSel, modalFechar.parcelas, modalFechar.primeiro_vencimento)
                    : [];
                const prazoValido = prazoTipo === 'DATA' ? !!modalFechar.prazo_data : (modalFechar.prazo_dias ?? 0) >= 1;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-gray-100 dark:bg-[#0d0d0d] border border-gray-300 dark:border-zinc-700 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0">
                                <div className="flex items-center gap-3">
                                    <iconify-icon icon="solar:lock-keyhole-minimalistic-linear" width="14" className="text-blue-400"></iconify-icon>
                                    <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">Fechar Pedido</span>
                                </div>
                                <button onClick={cancelarFecharPedido} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                    <iconify-icon icon="solar:close-linear" width="16"></iconify-icon>
                                </button>
                            </div>
                            <div className="overflow-y-auto flex-1 min-h-0">

                                {/* ── Accordion: Cenários incluídos ── */}
                                <div className="border-b border-gray-300 dark:border-zinc-800">
                                    <button
                                        onClick={() => setFecharOpen(s => ({ ...s, cenarios: !s.cenarios }))}
                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-100/60 dark:hover:bg-zinc-900/40 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-600 dark:text-zinc-400">Cenários incluídos</span>
                                            <span className="font-mono text-[9px] text-blue-400 shrink-0">({orcsSel.length}) · {fmtBRL(totalSel)}</span>
                                        </div>
                                        <iconify-icon icon={fecharOpen.cenarios ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-gray-500 dark:text-zinc-600 shrink-0 ml-2"></iconify-icon>
                                    </button>
                                    {fecharOpen.cenarios && (
                                        <div className="px-5 pb-3 border-t border-gray-300/50 dark:border-zinc-800/50">
                                            <ul className="space-y-1 max-h-28 overflow-y-auto mt-2">
                                                {orcsSel.map(o => (
                                                    <li key={o.id} className="flex items-center gap-2 font-mono text-[10px] text-gray-700 dark:text-zinc-300">
                                                        <iconify-icon icon="solar:check-circle-linear" width="10" className="text-blue-400 shrink-0"></iconify-icon>
                                                        <span className="text-gray-500 dark:text-zinc-500 shrink-0">{o.ambiente_nome}</span>
                                                        <iconify-icon icon="solar:alt-arrow-right-linear" width="9" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                                        <span className="truncate">{o.nome ?? o.nome_versao ?? 'Orçamento'}</span>
                                                        <span className="ml-auto text-gray-500 dark:text-zinc-500 shrink-0">{fmtBRL(o.valor_total)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* ── Accordion: Forma de Pagamento ── */}
                                <div className="border-b border-gray-300 dark:border-zinc-800">
                                    <button
                                        onClick={() => setFecharOpen(s => ({ ...s, pagamento: !s.pagamento }))}
                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-100/60 dark:hover:bg-zinc-900/40 transition-colors text-left"
                                    >
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-600 dark:text-zinc-400">Forma de Pagamento</span>
                                        <iconify-icon icon={fecharOpen.pagamento ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-gray-500 dark:text-zinc-600 shrink-0"></iconify-icon>
                                    </button>
                                    {fecharOpen.pagamento && (
                                        <div className="px-5 pb-4 border-t border-gray-300/50 dark:border-zinc-800/50 pt-3 space-y-3">
                                            <select
                                                value={modalFechar.forma_pagamento}
                                                onChange={e => setModalFechar(p => ({ ...p, forma_pagamento: e.target.value }))}
                                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-blue-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-2"
                                            >
                                                <option value="pix">PIX</option>
                                                <option value="transferencia">Transferência Bancária</option>
                                                <option value="dinheiro">Dinheiro</option>
                                                <option value="cartao">Cartão de Crédito</option>
                                                <option value="cheque">Cheque</option>
                                            </select>
                                            <div className="flex gap-px mt-2 w-max">
                                                {['a_vista', 'parcelado'].map(tipo => (
                                                    <button key={tipo} type="button"
                                                        onClick={() => setModalFechar(p => ({ ...p, parcelamento_tipo: tipo, parcelas_lista: [] }))}
                                                        className={`flex-1 py-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                                                            modalFechar.parcelamento_tipo === tipo
                                                                ? 'bg-yellow-400 text-black'
                                                                : 'bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white'
                                                        }`}>
                                                        {tipo === 'a_vista' ? 'À Vista' : 'Parcelado'}
                                                    </button>
                                                ))}
                                            </div>
                                            {modalFechar.parcelamento_tipo === 'parcelado' && (
                                                <CamposParcelamento
                                                    parcelas={modalFechar.parcelas_lista ?? []}
                                                    setParcelas={lista => setModalFechar(p => ({ ...p, parcelas_lista: lista }))}
                                                    valorTotal={totalSel}
                                                    dataPrimeiraParcela={modalFechar.prazo_data ?? new Date().toISOString().slice(0, 10)}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── Accordion: Prazo de Entrega ── */}
                                <div className="border-b border-gray-300 dark:border-zinc-800">
                                    <button
                                        onClick={() => setFecharOpen(s => ({ ...s, prazo: !s.prazo }))}
                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-100/60 dark:hover:bg-zinc-900/40 transition-colors text-left"
                                    >
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-600 dark:text-zinc-400">Prazo de Entrega</span>
                                        <iconify-icon icon={fecharOpen.prazo ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-gray-500 dark:text-zinc-600 shrink-0"></iconify-icon>
                                    </button>
                                    {fecharOpen.prazo && (
                                        <div className="px-5 pb-4 border-t border-gray-300/50 dark:border-zinc-800/50 pt-3 space-y-2">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="radio" name="prazo_tipo" value="DATA"
                                                    checked={prazoTipo === 'DATA'}
                                                    onChange={() => setModalFechar(p => ({ ...p, prazo_tipo: 'DATA' }))}
                                                    className="accent-blue-500"
                                                />
                                                <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Selecionar Data</span>
                                            </label>
                                            {prazoTipo === 'DATA' && (
                                                <div className="ml-5">
                                                    <input
                                                        type="date"
                                                        value={modalFechar.prazo_data ?? ''}
                                                        onChange={e => setModalFechar(p => ({ ...p, prazo_data: e.target.value }))}
                                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-blue-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-1.5"
                                                        style={{ colorScheme: 'dark' }}
                                                    />
                                                </div>
                                            )}
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="radio" name="prazo_tipo" value="DIAS_UTEIS"
                                                    checked={prazoTipo === 'DIAS_UTEIS'}
                                                    onChange={() => setModalFechar(p => ({ ...p, prazo_tipo: 'DIAS_UTEIS', prazo_dias: p.prazo_dias ?? 15 }))}
                                                    className="accent-blue-500"
                                                />
                                                <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Dias Úteis</span>
                                            </label>
                                            {prazoTipo === 'DIAS_UTEIS' && (
                                                <div className="ml-5 space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number" min="1" max="365"
                                                            value={modalFechar.prazo_dias ?? 15}
                                                            onChange={e => setModalFechar(p => ({ ...p, prazo_dias: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                            className="w-24 bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-blue-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-1.5"
                                                        />
                                                        <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">dias úteis</span>
                                                    </div>
                                                    {dataFinalCalc && (
                                                        <p className="font-mono text-[10px] text-blue-400">
                                                            → Entrega prevista: {new Date(dataFinalCalc + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <p className="px-5 py-3 font-mono text-[9px] text-gray-500 dark:text-zinc-600 leading-relaxed">
                                    Os cenários não selecionados serão descartados (mantidos por 7 dias). O projeto será marcado como FECHADO.
                                </p>
                            </div>

                            {/* ── Footer fixo com botões ── */}
                            <div className="flex gap-2 px-5 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
                                    <button onClick={cancelarFecharPedido} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => actions.confirmarFechamento(fecharIds, modalFechar, { setLoadingFechar, cancelarFecharPedido, setToastFechar })}
                                        disabled={loadingFechar || !prazoValido || !modalFechar.forma_pagamento}
                                        className="flex-1 bg-blue-600 text-gray-900 dark:text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loadingFechar
                                            ? <><iconify-icon icon="solar:spinner-linear" width="12" className="animate-spin"></iconify-icon> Fechando...</>
                                            : <><iconify-icon icon="solar:lock-keyhole-minimalistic-linear" width="12"></iconify-icon> Confirmar Fechamento</>
                                        }
                                    </button>
                            </div>
                        </div>
                    </div>
                );
        })()}

        {modalPdf && (
            <ModalImportarPDF projetoId={id} onClose={() => setModalPdf(false)} />
        )}
        </>
    );
}
