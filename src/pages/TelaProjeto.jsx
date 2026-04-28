import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import ModalOrcamentoManual from '../components/ModalOrcamentoManual';
import PdfOptionsModal from '../components/PdfOptionsModal';
import AgendaMedidor from '../components/AgendaMedidor';
import CamposParcelamento from './financeiro/lancamentos/CamposParcelamento';
import { useProjectData } from '../hooks/useProjectData';
import { useProjectActions } from '../hooks/useProjectActions';
import {
    STATUS_CONFIG,
    StatusPill, MedicaoPill,
    normalizarJsonMedicao,
    fmtBRL, calcDataFinalDiasUteis, calcParcelas,
} from '../utils/projetoUtils';
// gerarPdfOrcamento é importado dinamicamente no click handler para não bloquear o bundle inicial


// ─── Informações da medição (tipo + observações) ─────────────────────────────
// Exibe badge de tipo de medição, observações do ambiente e dos itens.
// Só renderiza quando há pelo menos um dado a mostrar.
// Recebe o array `ambientes` direto do json_medicao Flutter.
function InfoMedicao({ ambientes }) {
    if (!Array.isArray(ambientes) || ambientes.length === 0) return null;

    const temInfo = ambientes.some(amb => {
        const tipo = amb.extras?.tipo_medicao ?? 'producao';
        const infoAmb = (amb.extras?.info_adicional ?? '').trim();
        const itensComInfo = (amb.itens ?? []).some(it => (it.info_adicional ?? '').trim() !== '');
        return tipo === 'orcamento' || infoAmb !== '' || itensComInfo;
    });

    if (!temInfo) return null;

    return (
        <div>
            <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-3">
                Informações da Medição
            </div>

            <div className="flex flex-col gap-4">
                {ambientes.map((amb, i) => {
                    const tipo        = amb.extras?.tipo_medicao ?? 'producao';
                    const infoAmb     = (amb.extras?.info_adicional ?? '').trim();
                    const itensComInfo = (amb.itens ?? []).filter(it => (it.info_adicional ?? '').trim() !== '');
                    const nomeAmb     = amb.ambiente ?? amb.nome ?? `Ambiente ${i + 1}`;

                    const hasContent = tipo === 'orcamento' || infoAmb !== '' || itensComInfo.length > 0;
                    if (!hasContent) return null;

                    return (
                        <div key={i} className="flex flex-col gap-2.5">
                            {/* Rótulo do ambiente — só quando há mais de 1 */}
                            {ambientes.length > 1 && (
                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 flex items-center gap-2">
                                    <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                    {nomeAmb}
                                </div>
                            )}

                            {/* Badge tipo de medição */}
                            {tipo === 'orcamento' ? (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-orange-400 shrink-0 mt-0.5"></iconify-icon>
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-widest text-orange-400 font-semibold leading-none mb-1">
                                            Orçamento Preliminar
                                        </div>
                                        <div className="text-[11px] text-orange-300/70">
                                            Medição prévia — necessário retornar para medição final
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-400/10 border border-green-400/30">
                                    <iconify-icon icon="solar:check-circle-linear" width="13" className="text-green-400 shrink-0"></iconify-icon>
                                    <div className="font-mono text-[10px] uppercase tracking-widest text-green-400 font-semibold">
                                        Pronto para Produção
                                    </div>
                                </div>
                            )}

                            {/* Observações do ambiente */}
                            {infoAmb !== '' && (
                                <div className="bg-gray-100 dark:bg-black border border-gray-100 dark:border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <iconify-icon icon="solar:document-text-linear" width="11" className="text-gray-500 dark:text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">
                                            Observações do Ambiente
                                        </span>
                                    </div>
                                    <p className="text-gray-700 dark:text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{infoAmb}</p>
                                </div>
                            )}

                            {/* Observações por item */}
                            {itensComInfo.length > 0 && (
                                <div className="bg-gray-100 dark:bg-black border border-gray-100 dark:border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <iconify-icon icon="solar:list-linear" width="11" className="text-gray-500 dark:text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">
                                            Observações por Item
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {itensComInfo.map((item, j) => (
                                            <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">
                                                    {item.nome}
                                                </span>
                                                <span className="text-gray-700 dark:text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">
                                                    {item.info_adicional.trim()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}



// ── Componente principal ──────────────────────────────────────────────────────

export default function TelaProjetoVendedor() {
    const { id } = useParams();
    console.log('ID do Projeto recebido:', id);
    const navigate = useNavigate();
    const { session, profile, empresa: empresaCtx, loading: authLoading, profileLoading } = useAuth();
    const isAdmin = profile?.perfil === 'admin' || profile?.role === 'admin';

    const [activeTab, setActiveTab] = useState('medicoes');

    const {
        projeto,         setProjeto,
        ambientes,       setAmbientes,
        medicoes,        setMedicoes,
        catMateriais,    catProdAvulsos,
        medidores,
        pedidoFechado,   setPedidoFechado,
        loadingProjeto,
        loadingPecasOrc,
        recarregarAmbientes,
        recarregarMedicoes,
        fetchPecasParaOrcamento,
    } = useProjectData(id, activeTab);

    const actions = useProjectActions(id, {
        ambientes, setAmbientes,
        projeto, setProjeto,
        setMedicoes,
        medidores,
        pedidoFechado, setPedidoFechado,
        catMateriais, catProdAvulsos,
        recarregarAmbientes,
    });

    const isViewOnlyAdmin = isAdmin && projeto && projeto.vendedor_id !== session?.user?.id;

    // Abre modal de edição preenchido com dados existentes
    function handleAbrirEditar(m) {
        setEditingMedicaoId(m.id);
        setAgMedidor(m.medidor_id ?? '');
        // Converte ISO → "YYYY-MM-DDTHH:mm" para o input datetime-local
        setAgData(m.data_medicao ? m.data_medicao.slice(0, 16) : '');
        // Popula o campo Rua com o endereço existente (campos separados serão ajustados manualmente)
        setAgRua(m.endereco ?? '');
        setAgNumero('');
        setAgBairro('');
        setAgCidade('');
        setAgObservacoes(m.observacoes_acesso ?? '');
        setEndConfirmado(!!m.endereco);  // endereço existente já está validado
        setEndSugestoes([]);
        setErroAgendar('');
        setModalAgendar(true);
    }

    const [versoesExpandidas, setVersoesExpandidas] = useState({});

    const toggleVersao = (e, versaoId) => {
        e.stopPropagation();
        setVersoesExpandidas(prev => ({ ...prev, [versaoId]: !prev[versaoId] }));
    };

    // ── Seleção de versões para o carrinho ──────────────────────────────
    const [selectedIds, setSelectedIds] = useState([]);
    const [pecaEmEdicao, setPecaEmEdicao] = useState(null);
    const [itemManualEmEdicao, setItemManualEmEdicao] = useState(null);
    // ^ { ambienteId, orcamentoId, itemIndex, itemData }

    // Modais / edição de versão
    const [editingAmbNome,   setEditingAmbNome]   = useState(null);
    const [editingVersaoMat, setEditingVersaoMat] = useState(null);
    const [editingVersao,    setEditingVersao]    = useState(null);
    const [novoAvulso,       setNovoAvulso]       = useState({});
    const [bulkMat,          setBulkMat]          = useState({});

    const toggleSelection = (e, versaoId) => {
        e.stopPropagation();
        setSelectedIds(p => p.includes(versaoId) ? p.filter(x => x !== versaoId) : [...p, versaoId]);
    };

    // • EDITAR VERSÃO — modal granular
    // Recebe ambId, ambNome e versao diretamente do JSX (nunca lê MOCK_AMBIENTES)
    const abrirEditarVersao = (e, ambId, ambNome, versao) => {
        e.stopPropagation();
        setEditingVersao({
            ambId,
            versaoId:   versao.id,
            nomeAmb:    ambNome,
            nomeVersao: versao.nome,
            pecas: (versao.pecas || []).map(p => ({ id: p.id, nome: p.nome, material_id: p.material_id || '' })),
        });
    };

    const totalCarrinho = ambientes
        .flatMap(a => a.orcamentos)
        .filter(o => selectedIds.includes(o.id))
        .reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);

    const mockEditarPeca = (e, ambienteId, versaoId, peca) => {
        e.stopPropagation();
        setPecaEmEdicao({ ambienteId, versaoId, pecaId: peca.id, pecaData: JSON.parse(JSON.stringify(peca)) });
    };

    const abrirEditarItemManual = (e, ambienteId, orcamentoId, itemIndex) => {
        e.stopPropagation();
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        setItemManualEmEdicao({
            ambienteId, orcamentoId, itemIndex,
            itemData: { ...versao.itens_manuais[itemIndex] },
        });
    };

    const handleRemoverRecorteDrawer = (recorteId) => {
        setPecaEmEdicao(prev => ({
            ...prev,
            pecaData: {
                ...prev.pecaData,
                recortes: prev.pecaData.recortes.filter(r => r.id !== recorteId)
            }
        }));
    };

    const [modalAgendar,     setModalAgendar]     = useState(false);
    const [modalPerda,       setModalPerda]       = useState(false);
    const [modalStatus,      setModalStatus]      = useState(false);
    const [modalOrcManual,   setModalOrcManual]   = useState(false);
    const [painelMedicao, setPainelMedicao] = useState(null);
    const [imgLoading,    setImgLoading]    = useState(false);
    const [imgError,      setImgError]      = useState(false);
    const [imgZoomed,     setImgZoomed]     = useState(false);

    async function handleDownloadDesenho(url, medicaoId) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Falha ao baixar');
            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `desenho-medicao-${medicaoId ?? Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(objectUrl);
        } catch (err) {
            console.error('[download] Erro ao baixar desenho:', err);
        }
    }

    // ── Carrinho: expansão, edição de nome, edição de desconto ─────────────────
    const [carrinhoExpandido,       setCarrinhoExpandido]       = useState({});
    const [carrinhoEditandoNome,    setCarrinhoEditandoNome]    = useState(null); // { id, nome }
    const [carrinhoEditandoDesconto, setCarrinhoEditandoDesconto] = useState(null); // { id, valor, tipo }
    const [carrinhoEditandoAjustes, setCarrinhoEditandoAjustes] = useState(null); // { id, majoramento, rt, rtNome }

    // ── Mesclar Cenários ─────────────────────────────────────────────────────
    const [modoMesclar,      setModoMesclar]      = useState(false);
    const [mesclarIds,       setMesclarIds]       = useState([]);       // orcIds selecionados
    const [modalMesclar,     setModalMesclar]     = useState(null);     // null | { nome: string }
    const [loadingMesclar,   setLoadingMesclar]   = useState(false);
    const [orcsMesclados,    setOrcsMesclados]    = useState(new Set()); // ids de orcs criados por mescla
    const [toastMesclar,     setToastMesclar]     = useState('');

    const cancelarMesclar = () => { setModoMesclar(false); setMesclarIds([]); setModalMesclar(null); };
    const toggleMesclarId = (orcId) => setMesclarIds(p => p.includes(orcId) ? p.filter(x => x !== orcId) : [...p, orcId]);

    // ── Fechar Pedido ────────────────────────────────────────────────────────
    const [modoFecharPedido,   setModoFecharPedido]   = useState(false);
    const [fecharIds,          setFecharIds]          = useState([]);
    const [modalFechar,        setModalFechar]        = useState(null);
    // modalFechar shape: {
    //   forma_pagamento: string,
    //   parcelas: number,
    //   primeiro_vencimento: string (date),
    //   prazo_tipo: 'DATA' | 'DIAS_UTEIS',
    //   prazo_data: string (date),
    //   prazo_dias: number,
    // }
    const [loadingFechar,      setLoadingFechar]      = useState(false);
    const [toastFechar,        setToastFechar]        = useState('');
    const [fecharOpen,         setFecharOpen]         = useState({ cenarios: false, pagamento: true, prazo: false });
    const [loadingPdf,         setLoadingPdf]         = useState(null);
    const [pdfModal,           setPdfModal]           = useState(null); // null | { tipo, orc?, defaults }

    const cancelarFecharPedido = () => { setModoFecharPedido(false); setFecharIds([]); setModalFechar(null); };
    const toggleFecharId = (orcId) => setFecharIds(p => p.includes(orcId) ? p.filter(x => x !== orcId) : [...p, orcId]);

    function toggleCarrinhoDetalhes(orcId) {
        setCarrinhoExpandido(prev => {
            const nextVal = !prev[orcId];
            if (nextVal) {
                // Lazy load: busca peças se o card abrirá e ainda não tem dados
                const orc = ambientes.flatMap(a => a.orcamentos ?? []).find(o => o.id === orcId);
                if (orc && (orc.pecas?.length ?? 0) === 0 && (orc.valor_total ?? 0) > 0) {
                    fetchPecasParaOrcamento(orcId);
                }
            }
            return { ...prev, [orcId]: nextVal };
        });
    }


    const [motivoPerda, setMotivoPerda] = useState('');
    const [novoStatus, setNovoStatus] = useState('produzindo');

    // Formulário agendar/editar medição
    const [agMedidor,    setAgMedidor]    = useState('');
    const [agData,       setAgData]       = useState('');
    const [agRua,        setAgRua]        = useState('');
    const [agNumero,     setAgNumero]     = useState('');
    const [agBairro,     setAgBairro]     = useState('');
    const [agCidade,     setAgCidade]     = useState('');
    const [agObservacoes, setAgObservacoes] = useState('');
    const [agendando,    setAgendando]    = useState(false);
    const [erroAgendar,  setErroAgendar]  = useState('');
    const [editingMedicaoId, setEditingMedicaoId] = useState(null);

    // Autocomplete de endereço (Nominatim / OpenStreetMap — gratuito, sem API key)
    const [endSugestoes,  setEndSugestoes]  = useState([]);
    const [endBuscando,   setEndBuscando]   = useState(false);
    const [endConfirmado, setEndConfirmado] = useState(false);
    const endDebounceRef = React.useRef(null);

    // Combina os campos em uma string para salvar no banco
    const enderecoCompleto = [agRua, agNumero, agBairro, agCidade]
        .map(s => s.trim()).filter(Boolean).join(', ');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
            { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        const timeout = setTimeout(() => {
            document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        }, 10);
        return () => {
            clearTimeout(timeout);
            observer.disconnect();
        };
    }, [ambientes, activeTab]);

    const closeAll = () => {
        setModalAgendar(false);
        setModalPerda(false);
        setModalStatus(false);
        setPainelMedicao(null);
        setErroAgendar('');
        setEditingMedicaoId(null);
        setAgMedidor('');
        setAgData('');
        setAgRua('');
        setAgNumero('');
        setAgBairro('');
        setAgCidade('');
        setAgObservacoes('');
        setEndSugestoes([]);
        setEndConfirmado(false);
    };

    function parseEnderecoCliente(str) {
        if (!str?.trim()) return { rua: '', numero: '', bairro: '', cidade: '' };
        // Tenta separar "Rua Nome, 123, Bairro, Cidade" (campos separados por vírgula)
        const partes = str.split(',').map(s => s.trim());
        return {
            rua:    partes[0] || '',
            numero: partes[1] || '',
            bairro: partes[2] || '',
            cidade: partes[3] || '',
        };
    }

    function handleAbrirNovoAgendamento() {
        const cliente = projeto?.clientes;
        if (cliente?.endereco) {
            const { rua, numero, bairro, cidade } = parseEnderecoCliente(cliente.endereco);
            setAgRua(rua);
            setAgNumero(numero);
            setAgBairro(bairro);
            setAgCidade(cidade);
            setEndConfirmado(true);
        }
        setModalAgendar(true);
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAFETY GUARD — impede renderização com dados nulos
    // Se qualquer uma dessas condições for verdadeira, a tela preta é impossível
    // ════════════════════════════════════════════════════════════════════════
    // Loading: aguarda auth + perfil + busca do projeto
    if (authLoading || profileLoading || loadingProjeto) {
        return (
            <div className="min-h-screen bg-gray-100 dark:bg-[#050505] text-gray-900 dark:text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-zinc-500">
                    <iconify-icon icon="solar:spinner-linear" width="40" className="animate-spin text-yellow-400"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest">Carregando dados do projeto...</p>
                </div>
            </div>
        );
    }

    // Loading terminou mas projeto não foi encontrado (ID inválido, acesso negado, etc.)
    if (!projeto) {
        return (
            <div className="min-h-screen bg-gray-100 dark:bg-[#050505] text-gray-900 dark:text-white flex items-center justify-center">
                <div className="text-center gap-4 flex flex-col">
                    <p className="font-mono text-xs text-gray-500 dark:text-zinc-500">Projeto não encontrado ou acesso negado.</p>
                    <button onClick={() => navigate('/projetos')} className="text-[10px] uppercase font-mono text-yellow-400 border border-yellow-400/20 px-4 py-2 hover:bg-yellow-400/10 transition-colors">Voltar para Projetos</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#050505] text-gray-900 dark:text-white flex flex-col font-sans selection:bg-yellow-400/30">


            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-64">
                {/* ── Breadcrumb ─────────────────────────────────────────── */}
                <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-6">
                    <span onClick={() => navigate('/projetos')} className="hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
                    <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                    <span className="text-gray-600 dark:text-zinc-400">{projeto?.nome ?? '—'}</span>
                </div>

                {/* ── Header do Projeto ──────────────────────────────────── */}
                <section className="sys-reveal mb-8">
                    <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                            {/* Info */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">{projeto?.nome ?? '—'}</h1>
                                    <StatusPill status={projeto?.status ?? 'aprovado'} />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 dark:text-zinc-500">
                                    <iconify-icon icon="solar:user-linear" width="13" className="text-gray-500 dark:text-zinc-600"></iconify-icon>
                                    <a href={`/clientes/${projeto?.cliente?.id}`} className="hover:text-yellow-400 transition-colors">
                                        {projeto?.cliente?.nome ?? '—'}
                                    </a>
                                    <span className="text-gray-400 dark:text-zinc-700">·</span>
                                    <iconify-icon icon="solar:calendar-linear" width="13" className="text-gray-500 dark:text-zinc-600"></iconify-icon>
                                    <span>{projeto?.criado_em ?? '—'}</span>
                                    <span className="text-gray-400 dark:text-zinc-700">·</span>
                                    <iconify-icon icon="solar:user-id-linear" width="13" className="text-gray-500 dark:text-zinc-600"></iconify-icon>
                                    <span>{projeto?.vendedor ?? '—'}</span>
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => { setNovoStatus(projeto?.status ?? 'orcado'); setModalStatus(true); }}
                                    className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    <iconify-icon icon="solar:refresh-linear" width="13"></iconify-icon>
                                    Atualizar status
                                </button>
                                <button
                                    onClick={() => setModalPerda(true)}
                                    className="flex items-center gap-2 border border-red-500/30 bg-red-400/5 text-red-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-red-400 transition-colors"
                                >
                                    <iconify-icon icon="solar:close-circle-linear" width="13"></iconify-icon>
                                    Marcar como perdido
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Tabs ──────────────────────────────────────────────── */}
                <div className="sys-reveal sys-delay-100 flex border-b border-gray-300 dark:border-zinc-800 mb-6">
                    {[
                        { id: 'medicoes',   label: 'Medições',  icon: 'solar:ruler-pen-linear'              },
                        { id: 'carrinho',   label: 'Carrinho',  icon: 'solar:cart-large-minimalistic-linear' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-yellow-400 text-gray-900 dark:text-white'
                                    : 'border-transparent text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-400'
                            }`}
                        >
                            <iconify-icon icon={tab.icon} width="13"></iconify-icon>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ══ ABA: MEDIÇÕES ══════════════════════════════════════ */}
                {activeTab === 'medicoes' && (
                    <div className="sys-reveal sys-delay-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                                01 // Medições
                            </div>
                            <button
                                onClick={handleAbrirNovoAgendamento}
                                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                                Agendar medição
                            </button>
                        </div>

                        <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                            {/* Cabeçalho tabela */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Medidor</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Status</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Ação</span>
                            </div>

                            {(medicoes ?? []).map((m, i) => {
                                const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
                                return (
                                <div
                                    key={m?.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                                        isAprovada
                                            ? 'bg-green-400/[0.03] border-l-2 border-l-green-500/50 hover:bg-green-400/[0.05]'
                                            : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.01]'
                                    } ${i < (medicoes?.length ?? 0) - 1 ? 'border-b border-gray-100 dark:border-zinc-900' : ''}`}
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
                                                <span className="font-mono text-[9px] text-green-500/70 uppercase tracking-widest">Aguardando orçamento</span>
                                            )}
                                            {!isAprovada && m?.endereco && (
                                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 truncate max-w-[140px]">{m.endereco}</span>
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
                                                onClick={() => { setPainelMedicao(m); setImgLoading(!!m?.svg_url); setImgError(false); setImgZoomed(false); }}
                                                className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 transition-colors border ${
                                                    isAprovada
                                                        ? 'border-green-500/40 text-green-400 hover:border-green-400 hover:bg-green-400/10'
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
                                                onClick={() => handleAbrirEditar(m)}
                                                title="Editar medição"
                                                className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-500 dark:hover:border-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                            >
                                                <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                                            </button>
                                            <button
                                                onClick={() => actions.handleExcluirMedicao(m)}
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
                            })}

                            {(medicoes?.length ?? 0) === 0 && (
                                <div className="px-4 py-12 text-center">
                                    <iconify-icon icon="solar:ruler-pen-linear" width="32" className="text-gray-300 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhuma medição ainda</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══ ABA: CARRINHO ══════════════════════════════════════ */}
                {activeTab === 'carrinho' && (() => {
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
                                <div className="mb-4 bg-green-950/40 border border-green-700/40 px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <iconify-icon icon="solar:check-circle-bold" width="16" className="text-green-400 shrink-0"></iconify-icon>
                                            <div className="min-w-0">
                                                <div className="font-mono text-[10px] text-green-400 uppercase tracking-widest font-bold">Pedido Fechado</div>
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
                                                className="flex items-center gap-2 border border-yellow-400/40 text-yellow-400 font-mono text-[10px] uppercase tracking-widest px-3 py-2 hover:bg-yellow-400/5 transition-colors disabled:opacity-40"
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
                                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                                    02 // Carrinho
                                </div>
                                <div className="flex items-center gap-2">

                                    {/* ── Modo Mesclar: botão de entrada ── */}
                                    {orcamentosCarrinho.length >= 2 && !modoAtivo && !pedidoFechado && (
                                        <button
                                            onClick={() => setModoMesclar(true)}
                                            className="flex items-center gap-1.5 border border-orange-500/40 text-orange-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-orange-400 hover:bg-orange-400/10 transition-colors"
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
                                            className="flex items-center gap-1.5 border border-green-500/30 text-green-400 text-sm font-mono uppercase tracking-widest px-3 py-1 hover:bg-green-400/10 transition-colors"
                                        >
                                            <iconify-icon icon="solar:chat-round-linear" width="13"></iconify-icon>
                                            Enviar todos
                                        </button>
                                    )}
                                    {!isViewOnlyAdmin && !modoAtivo && (
                                        <button
                                            onClick={() => navigate(`/projetos/${id}/orcamento/novo?modo=manual`)}
                                            className="flex items-center gap-1.5 bg-yellow-400 text-black text-sm font-bold uppercase tracking-widest px-3 py-1 hover:shadow-[0_0_10px_rgba(250,204,21,0.25)] transition-all"
                                        >
                                            <iconify-icon icon="solar:add-linear" width="13"></iconify-icon>
                                            Criar orçamento
                                        </button>
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
                                                    ${modoMesclar && isMesclarChecked ? 'border-orange-500/60 bg-orange-400/5' : ''}
                                                    ${modoFecharPedido && isFecharChecked ? 'border-green-500/60 bg-green-400/5' : ''}
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
                                                                <span className="shrink-0 px-1.5 py-0.5 border border-orange-400/40 text-[8px] font-mono uppercase tracking-widest text-orange-400 bg-orange-400/5">
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
                                                            <span className="font-mono text-[9px] text-amber-600/80 border border-amber-700/30 px-1.5 py-0.5">
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
                                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${isExp ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5' : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-800 dark:hover:text-zinc-300'}`}
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
                                                            className="flex items-center gap-1 border border-green-800/50 text-green-600 text-[10px] font-mono uppercase tracking-widest px-2 py-1 hover:border-green-600 hover:text-green-400 transition-colors"
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
                                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border transition-colors ${carrinhoEditandoAjustes?.id === orc.id ? 'border-blue-500 text-blue-300 bg-blue-500/15' : 'border-blue-700/40 text-blue-500/80 bg-blue-500/5 hover:bg-blue-500/15 hover:border-blue-500/70'}`}
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
                                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border transition-colors ${carrinhoEditandoDesconto?.id === orc.id ? 'border-purple-500 text-purple-300 bg-purple-500/15' : 'border-purple-700/40 text-purple-400/80 bg-purple-500/5 hover:bg-purple-500/15 hover:border-purple-500/70'}`}
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
                                                                <button onClick={() => actions.salvarDescontoCarrinho(orc.id, carrinhoEditandoDesconto.valor, carrinhoEditandoDesconto.tipo, () => setCarrinhoEditandoDesconto(null))} className="font-mono text-[10px] border border-yellow-400/40 text-yellow-400 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors uppercase tracking-widest">Salvar</button>
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
                                                                <button onClick={() => actions.salvarAjustesCarrinho(orc.id, carrinhoEditandoAjustes.majoramento, carrinhoEditandoAjustes.rt, carrinhoEditandoAjustes.rtNome, carrinhoEditandoAjustes.frete, () => setCarrinhoEditandoAjustes(null))} className="font-mono text-[10px] border border-yellow-400/40 text-yellow-400 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors uppercase tracking-widest">Salvar</button>
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
                                                                        {/* Header do grupo */}
                                                                        <div className="flex items-center justify-between px-5 py-2.5 bg-gray-100 dark:bg-zinc-950/50 border-b border-gray-100 dark:border-zinc-900">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-0.5 h-4 bg-yellow-400/50 shrink-0"></div>
                                                                                <span className="font-mono text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300 font-semibold">
                                                                                    {ambNome}
                                                                                </span>
                                                                            </div>
                                                                            <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">{fmtBRL(subtotalComManuais)}</span>
                                                                        </div>

                                                                        {/* Peças do grupo — agrupadas por item */}
                                                                        {(() => {
                                                                            const temItens = pecasGrupo.some(p => p.item_nome);
                                                                            if (!temItens) {
                                                                                const ACAB_LABELS_F = { meia_esquadria: 'Meia-Esquadria', reto_simples: 'Reto Simples', ME: 'Meia-Esquadria', RS: 'Reto Simples' };
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
                                                                                            <div key={`acab-flat-${tipo}`} className="flex items-center justify-between px-5 py-1.5 border-b border-amber-900/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors">
                                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                                    <iconify-icon icon="solar:ruler-angular-linear" width="11" className="text-amber-600/60 shrink-0 ml-1"></iconify-icon>
                                                                                                    <span className="text-[10px] text-amber-400/80 truncate">{label}</span>
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
                                                                            const ACAB_LABELS = { meia_esquadria: 'Meia-Esquadria', reto_simples: 'Reto Simples', ME: 'Meia-Esquadria', RS: 'Reto Simples' };
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
                                                                                return [
                                                                                    // Header do item
                                                                                    ...(nomeItem ? [
                                                                                        <div key={`item-hdr-${itemKey}`} className="flex items-center justify-between px-5 py-1.5 bg-gray-100/30 dark:bg-zinc-900/30 border-b border-gray-100/40 dark:border-zinc-900/40">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <iconify-icon icon="solar:folder-linear" width="10" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                                                                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">{nomeItem}</span>
                                                                                            </div>
                                                                                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{fmtBRL(subtotalItem)}</span>
                                                                                        </div>
                                                                                    ] : []),
                                                                                    // Linhas de pedra (valor = total − acabamentos)
                                                                                    ...pecasItem.map((p, pi) => {
                                                                                        const valorPedra = (p.valor ?? 0) - (p.valor_acabamentos ?? 0);
                                                                                        return (
                                                                                            <div key={p.id ?? pi} className={`flex items-center justify-between py-2 border-b border-gray-100/30 dark:border-zinc-900/30 hover:bg-gray-100/50 dark:hover:bg-zinc-900/15 transition-colors ${px}`}>
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
                                                                                    // Linhas de acabamento (após todas as pedras)
                                                                                    ...acabRows.map(([tipo, { ml, valor }]) => {
                                                                                        const label = ACAB_LABELS[tipo] ?? tipo;
                                                                                        const vlrMl = ml > 0 ? valor / ml : 0;
                                                                                        return (
                                                                                            <div key={`acab-${itemKey}-${tipo}`} className={`flex items-center justify-between py-1.5 border-b border-amber-900/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors ${px}`}>
                                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                                    <iconify-icon icon="solar:ruler-angular-linear" width="11" className="text-amber-600/60 shrink-0 ml-1"></iconify-icon>
                                                                                                    <span className="text-[10px] text-amber-400/80 truncate">{label}</span>
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
                        </>
                    );
                })()}
            </main>

            {/* ══ PAINEL LATERAL — Dados da medição ══════════════════════ */}
            {painelMedicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => { setPainelMedicao(null); setImgZoomed(false); }}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-gray-100 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Dados da medição</div>
                                <div className="text-gray-900 dark:text-white font-semibold text-sm">{painelMedicao?.data ?? '—'}</div>
                            </div>
                            <button
                                onClick={() => { setPainelMedicao(null); setImgZoomed(false); }}
                                className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                            {/* ── DESENHO TÉCNICO ── */}
                            <div>
                                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-3">
                                    Desenho Técnico
                                </div>
                                {painelMedicao?.svg_url ? (
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className="relative border border-gray-300 dark:border-zinc-800 bg-gray-100 dark:bg-black overflow-hidden cursor-zoom-in group"
                                            onClick={() => setImgZoomed(true)}
                                        >
                                            {imgLoading && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-black z-10 min-h-[160px]">
                                                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-zinc-700 border-t-yellow-400 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                            {imgError ? (
                                                <div className="flex flex-col items-center justify-center py-8 gap-2 min-h-[100px]">
                                                    <iconify-icon icon="solar:image-broken-linear" width="24" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                                                    <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Imagem indisponível</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <img
                                                        src={painelMedicao.svg_url}
                                                        alt="Desenho técnico da medição"
                                                        className={`w-full h-auto max-h-[280px] object-contain transition-opacity duration-200 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                                                        onLoad={() => setImgLoading(false)}
                                                        onError={() => { setImgLoading(false); setImgError(true); }}
                                                    />
                                                    {!imgLoading && (
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gray-100/60 dark:bg-black/40 pointer-events-none">
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/80 border border-gray-300 dark:border-zinc-700">
                                                                <iconify-icon icon="solar:magnifer-zoom-in-linear" width="13" className="text-gray-900 dark:text-white"></iconify-icon>
                                                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-900 dark:text-white">Ampliar</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {!imgError && !imgLoading && (
                                            <button
                                                onClick={() => handleDownloadDesenho(painelMedicao.svg_url, painelMedicao.id)}
                                                className="flex items-center justify-center gap-2 w-full border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors text-[10px] font-mono uppercase tracking-widest py-2.5"
                                            >
                                                <iconify-icon icon="solar:download-linear" width="13"></iconify-icon>
                                                Baixar Desenho
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 gap-2 border border-gray-100 dark:border-zinc-900 bg-gray-100 dark:bg-black">
                                        <iconify-icon icon="solar:ruler-pen-linear" width="20" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
                                        <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Desenho não disponível</span>
                                    </div>
                                )}
                            </div>

                            {/* ── INFORMAÇÕES DA MEDIÇÃO ── */}
                            <InfoMedicao ambientes={painelMedicao?.json_medicao?.ambientes} />

                            <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-1">
                                Resumo da Medição
                            </div>

                            {(() => {
                                const jsonNorm  = normalizarJsonMedicao(painelMedicao?.json_medicao);
                                const pecas     = jsonNorm?.resumo_por_peca ?? [];
                                const isFlutter = jsonNorm?._fonte === 'flutter';

                                if (pecas.length === 0) {
                                    return (
                                        <div className="text-center py-10 px-4 border border-gray-100 dark:border-zinc-900 bg-gray-100 dark:bg-black">
                                            <iconify-icon icon="solar:document-text-linear" width="24" className="text-gray-400 dark:text-zinc-700 mb-2"></iconify-icon>
                                            <div className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Nenhum dado processado ainda</div>
                                        </div>
                                    );
                                }

                                // Totais de acabamentos somados de todas as peças
                                const totalME = Math.round(
                                    pecas.reduce((s, p) => s + (p.acabamentos?.meia_esquadria_ml ?? 0), 0) * 100
                                ) / 100;
                                const totalRS = Math.round(
                                    pecas.reduce((s, p) => s + (p.acabamentos?.reto_simples_ml ?? 0), 0) * 100
                                ) / 100;

                                // Lista plana de recortes de todas as peças
                                const todosRecortes = pecas.flatMap(p =>
                                    (p.recortes ?? []).map(r => ({ ...r, pecaNome: p.nome }))
                                );

                                return (
                                    <>
                                        {isFlutter && (
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-yellow-400/5 border border-yellow-400/20">
                                                <iconify-icon icon="solar:smartphone-linear" width="11" className="text-yellow-400 shrink-0"></iconify-icon>
                                                <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-400">Enviado pelo app SmartStone</span>
                                            </div>
                                        )}

                                        {/* ── PEÇAS (agrupadas por ambiente → item) ── */}
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 pt-1 pb-2">[ PEÇAS ]</div>
                                        {(() => {
                                            const ambGrupos = [];
                                            const ambMapa = new Map();
                                            pecas.forEach(r => {
                                                const amb = r.ambiente_nome ?? '';
                                                if (!ambMapa.has(amb)) { ambMapa.set(amb, []); ambGrupos.push(amb); }
                                                ambMapa.get(amb).push(r);
                                            });
                                            const temAmb = ambGrupos.some(g => g !== '');
                                            return (
                                                <div className="flex flex-col gap-4">
                                                    {ambGrupos.map(amb => {
                                                        const pecasDoAmb = ambMapa.get(amb);
                                                        const temItens = pecasDoAmb.some(r => r.item_nome);
                                                        // group by item
                                                        const itensOrdem = [];
                                                        const itensMapa = new Map();
                                                        pecasDoAmb.forEach(r => {
                                                            const k = r.item_nome ?? '__sem_item__';
                                                            if (!itensMapa.has(k)) { itensMapa.set(k, []); itensOrdem.push(k); }
                                                            itensMapa.get(k).push(r);
                                                        });
                                                        return (
                                                            <div key={amb}>
                                                                {temAmb && amb && (
                                                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2 pl-1 flex items-center gap-2">
                                                                        <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                                                        {amb}
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-col gap-2">
                                                                    {itensOrdem.map(itemKey => {
                                                                        const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                                                                        return (
                                                                            <div key={itemKey}>
                                                                                {nomeItem && temItens && (
                                                                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1.5 ml-2 flex items-center gap-1.5">
                                                                                        <iconify-icon icon="solar:folder-linear" width="10" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                                                                        {nomeItem}
                                                                                    </div>
                                                                                )}
                                                                                <div className={`flex flex-col gap-1.5 ${nomeItem && temItens ? 'ml-2' : ''}`}>
                                                                                    {itensMapa.get(itemKey).map((r, i) => (
                                                                                        <div key={i} className="bg-gray-100 dark:bg-black border border-gray-100 dark:border-zinc-900 px-4 py-3">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <span className="text-gray-900 dark:text-white font-semibold text-sm">{r.nome ?? 'Peça'}</span>
                                                                                                <span className="font-mono text-sm text-yellow-400 font-bold">{r.area_liquida_m2 ?? 0} m²</span>
                                                                                            </div>
                                                                                            {r.espessura_cm && (
                                                                                                <div className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 mt-1">esp. {r.espessura_cm} cm</div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}

                                        {/* ── ACABAMENTOS ── */}
                                        {(totalME > 0 || totalRS > 0) && (
                                            <>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 pt-3 pb-2">[ ACABAMENTOS ]</div>
                                                <div className="bg-gray-100 dark:bg-black border border-gray-100 dark:border-zinc-900 px-4 py-3 flex flex-col gap-2">
                                                    {totalME > 0 && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-gray-500 dark:text-zinc-500"></iconify-icon>
                                                                <span className="font-mono text-[11px] text-gray-700 dark:text-zinc-300">Meia-Esquadria</span>
                                                            </div>
                                                            <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalME} ml</span>
                                                        </div>
                                                    )}
                                                    {totalRS > 0 && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-gray-500 dark:text-zinc-500"></iconify-icon>
                                                                <span className="font-mono text-[11px] text-gray-700 dark:text-zinc-300">Reto Simples</span>
                                                            </div>
                                                            <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalRS} ml</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {/* ── RECORTES ── */}
                                        {todosRecortes.length > 0 && (
                                            <>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 pt-3 pb-2">[ RECORTES ]</div>
                                                <div className="flex flex-col gap-2">
                                                    {todosRecortes.map((rc, i) => {
                                                        const isCircular = rc.type === 'circular';
                                                        const dim = isCircular
                                                            ? `∅ ${rc.diameter_cm ?? '?'} cm`
                                                            : `${rc.dimX_cm ?? '?'} × ${rc.dimY_cm ?? '?'} cm`;
                                                        return (
                                                            <div key={i} className="bg-gray-100 dark:bg-black border border-gray-100 dark:border-zinc-900 px-4 py-3">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <iconify-icon icon="solar:scissors-linear" width="12" className="text-gray-500 dark:text-zinc-500"></iconify-icon>
                                                                        <span className="font-mono text-[11px] text-gray-700 dark:text-zinc-300">
                                                                            {rc.description || (isCircular ? 'Furo circular' : 'Recorte retangular')}
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">{dim}</span>
                                                                </div>
                                                                <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-1 pl-5">{rc.pecaNome}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Footer painel */}
                        <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-800">
                            <button
                                onClick={() => {
                                    const params = new URLSearchParams({ medicao_id: painelMedicao.id });
                                    setPainelMedicao(null);
                                    navigate(`/projetos/${id}/orcamento/novo?${params}`);
                                }}
                                className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
                                Criar orçamento com estes dados
                            </button>
                        </div>
                    </div>

                    {/* ── Lightbox — Zoom do desenho ── */}
                    {imgZoomed && painelMedicao?.svg_url && (
                        <div
                            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out"
                            onClick={() => setImgZoomed(false)}
                        >
                            <button
                                onClick={() => setImgZoomed(false)}
                                className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors p-2 z-10"
                            >
                                <iconify-icon icon="solar:close-linear" width="22"></iconify-icon>
                            </button>
                            <img
                                src={painelMedicao.svg_url}
                                alt="Desenho técnico (ampliado)"
                                className="max-w-full max-h-full object-contain"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                </>
            )}

            {/* ══ MODAL — Agendar Medição ════════════════════════════════ */}
            {modalAgendar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-[480px] z-10 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">
                                    {editingMedicaoId ? '[ EDITAR_MEDIÇÃO ]' : '[ AGENDAR_MEDIÇÃO ]'}
                                </div>
                                <div className="text-gray-900 dark:text-white font-semibold">
                                    {editingMedicaoId ? 'Editar medição' : 'Nova medição'}
                                </div>
                            </div>
                            <button onClick={closeAll} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Form */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-5">
                            {erroAgendar && (
                                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-red-400">{erroAgendar}</span>
                                </div>
                            )}

                            {/* Medidor */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Medidor</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                                    <select
                                        value={agMedidor}
                                        onChange={e => setAgMedidor(e.target.value)}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                                    >
                                        <option value="">Selecionar medidor</option>
                                        {medidores.map(m => (
                                            <option key={m.id} value={m.id}>{m.nome}</option>
                                        ))}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                                </div>
                                {medidores.length === 0 && (
                                    <p className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
                                )}
                            </div>

                            {/* Agenda do medidor — aparece ao selecionar */}
                            {agMedidor && (
                                <AgendaMedidor
                                    medidorId={agMedidor}
                                    horarioEscolhido={agData || null}
                                    empresaId={profile?.empresa_id}
                                    onDataChange={val => setAgData(val)}
                                />
                            )}

                            {/* Data e hora */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Data e hora</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                                    <input
                                        type="datetime-local"
                                        value={agData}
                                        onChange={e => setAgData(e.target.value)}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            {/* Endereço da medição — Rua (autocomplete) + Número manual + Bairro + Cidade */}
                            <div className="space-y-3">
                                <div className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 mb-1">
                                    Endereço da medição{' '}
                                    <span className="text-gray-400 dark:text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                                </div>

                                {/* Rua — com autocompletar Nominatim */}
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Rua / Logradouro</label>
                                    <div className="relative">
                                        <iconify-icon
                                            icon={endConfirmado ? 'solar:check-circle-linear' : 'solar:map-point-linear'}
                                            className={`absolute left-3 top-3.5 ${endConfirmado ? 'text-green-400' : 'text-gray-500 dark:text-zinc-600'}`}
                                            width="14"
                                        ></iconify-icon>
                                        {endBuscando && (
                                            <iconify-icon
                                                icon="solar:spinner-linear"
                                                className="absolute right-3 top-3.5 text-gray-500 dark:text-zinc-600 animate-spin"
                                                width="13"
                                            ></iconify-icon>
                                        )}
                                        <input
                                            type="text"
                                            value={agRua}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setAgRua(val);
                                                setEndConfirmado(false);
                                                setEndSugestoes([]);
                                                clearTimeout(endDebounceRef.current);
                                                if (val.trim().length < 4) { setEndBuscando(false); return; }
                                                setEndBuscando(true);
                                                endDebounceRef.current = setTimeout(async () => {
                                                    try {
                                                        const res = await fetch(
                                                            `https://nominatim.openstreetmap.org/search?` +
                                                            new URLSearchParams({
                                                                q:              val,
                                                                format:         'jsonv2',
                                                                addressdetails: '1',
                                                                limit:          '6',
                                                                countrycodes:   'br',
                                                                'accept-language': 'pt-BR',
                                                            }),
                                                            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
                                                        );
                                                        const data = await res.json();
                                                        setEndSugestoes(data);
                                                    } catch {
                                                        setEndSugestoes([]);
                                                    } finally {
                                                        setEndBuscando(false);
                                                    }
                                                }, 450);
                                            }}
                                            onKeyDown={e => { if (e.key === 'Escape') { setEndSugestoes([]); setEndBuscando(false); } }}
                                            placeholder="Ex: Rua das Flores"
                                            autoComplete="off"
                                            className={`w-full bg-gray-100 dark:bg-black border text-gray-900 dark:text-white text-sm pl-8 pr-8 py-2.5 rounded-none focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                                endConfirmado
                                                    ? 'border-green-500/50 focus:border-green-400'
                                                    : 'border-gray-300 dark:border-zinc-800 focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)]'
                                            }`}
                                        />

                                        {/* Dropdown de sugestões */}
                                        {endSugestoes.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-50 bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-700 border-t-0 shadow-2xl max-h-56 overflow-y-auto">
                                                {endSugestoes.map((s, i) => {
                                                    const a = s.address ?? {};
                                                    const rua = a.road || '';
                                                    const bairro = a.suburb || a.neighbourhood || a.quarter || '';
                                                    const cidade = a.city || a.town || a.village || a.municipality || '';
                                                    return (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onMouseDown={e => {
                                                                e.preventDefault();
                                                                setAgRua(rua || s.display_name);
                                                                setAgBairro(bairro);
                                                                setAgCidade(cidade);
                                                                // Número não é preenchido — usuário preenche manualmente
                                                                setEndSugestoes([]);
                                                                setEndConfirmado(true);
                                                            }}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border-b border-gray-300/60 dark:border-zinc-800/60 last:border-0 transition-colors group"
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <iconify-icon icon="solar:map-point-linear" width="11" className="text-gray-500 dark:text-zinc-600 shrink-0 mt-0.5"></iconify-icon>
                                                                <div className="min-w-0">
                                                                    <div className="text-xs text-gray-900 dark:text-white group-hover:text-yellow-400 transition-colors leading-snug truncate">
                                                                        {[rua, bairro, cidade].filter(Boolean).join(', ') || s.display_name}
                                                                    </div>
                                                                    {s.type && (
                                                                        <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase mt-0.5">
                                                                            {s.type}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {endConfirmado && agRua && (
                                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-green-400">
                                            <iconify-icon icon="solar:check-circle-linear" width="10"></iconify-icon>
                                            {editingMedicaoId ? 'Endereço confirmado' : 'Preenchido do cadastro do cliente — editável'}
                                        </div>
                                    )}
                                    {!endConfirmado && agRua.trim().length > 0 && endSugestoes.length === 0 && !endBuscando && (
                                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-gray-500 dark:text-zinc-600">
                                            <iconify-icon icon="solar:info-circle-linear" width="10"></iconify-icon>
                                            Nenhuma sugestão — endereço será salvo como digitado
                                        </div>
                                    )}
                                </div>

                                {/* Número — sempre manual */}
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Número</label>
                                    <input
                                        type="text"
                                        value={agNumero}
                                        onChange={e => setAgNumero(e.target.value)}
                                        placeholder="Ex: 142"
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                    />
                                </div>

                                {/* Bairro + Cidade lado a lado */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Bairro</label>
                                        <input
                                            type="text"
                                            value={agBairro}
                                            onChange={e => setAgBairro(e.target.value)}
                                            placeholder="Ex: Centro"
                                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Cidade</label>
                                        <input
                                            type="text"
                                            value={agCidade}
                                            onChange={e => setAgCidade(e.target.value)}
                                            placeholder="Ex: São Paulo"
                                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Observações de Acesso / Info Adicional */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                                    Observações de Acesso
                                    <span className="text-gray-400 dark:text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                                </label>
                                <textarea
                                    value={agObservacoes}
                                    onChange={e => setAgObservacoes(e.target.value)}
                                    rows={3}
                                    placeholder="Ex: Interfone estragado, usar portão lateral. Casa de esquina com a Rua das Flores. Avisar 30min antes."
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                                />
                                <div className="mt-1 font-mono text-[9px] text-gray-400 dark:text-zinc-700">
                                    Ponto de referência, instruções de entrada, outra cidade, etc.
                                </div>
                            </div>

                        </div>

                        {/* Footer fixo — fora do scroll */}
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
                            <button
                                onClick={closeAll}
                                className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => actions.handleAgendarMedicao({ agMedidor, agData, editingMedicaoId, enderecoCompleto, agObservacoes }, { setErroAgendar, setAgendando, closeAll })}
                                disabled={agendando || !agMedidor || !agData}
                                className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                            >
                                {agendando
                                    ? <><iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>Agendando...</>
                                    : <><iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>Confirmar</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Atualizar Status ═══════════════════════════════ */}
            {modalStatus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-[400px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ ATUALIZAR_STATUS ]</div>
                                <div className="text-gray-900 dark:text-white font-semibold">Novo status do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                {['aprovado', 'produzindo', 'entregue'].map(s => {
                                    const cfg = STATUS_CONFIG[s];
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setNovoStatus(s)}
                                            className={`flex items-center gap-3 px-4 py-3.5 border transition-colors ${
                                                novoStatus === s
                                                    ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                                                    : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-300 dark:hover:border-zinc-700 hover:text-gray-800 dark:hover:text-zinc-300'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${novoStatus === s ? cfg.dot : 'bg-gray-300 dark:bg-zinc-700'}`}></span>
                                            <span className="font-mono text-[11px] uppercase tracking-widest">{cfg.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={() => actions.handleSalvarStatus(novoStatus, closeAll)} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all">
                                    <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Marcar como Perdido ════════════════════════════ */}
            {modalPerda && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-red-500/30 w-full max-w-[440px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-red-400/70 mb-0.5">[ MARCAR_COMO_PERDIDO ]</div>
                                <div className="text-gray-900 dark:text-white font-semibold">Confirmar perda do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <p className="font-mono text-xs text-gray-500 dark:text-zinc-500">
                                Ao confirmar, o projeto <span className="text-gray-900 dark:text-white">{projeto?.nome ?? 'Este projeto'}</span> será marcado como perdido. Esta ação notificará o admin.
                            </p>

                            <div>
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Motivo (opcional)</label>
                                <textarea
                                    value={motivoPerda}
                                    onChange={e => setMotivoPerda(e.target.value)}
                                    placeholder="Ex: cliente escolheu outro fornecedor..."
                                    rows={3}
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-zinc-700 resize-none font-mono text-xs"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={() => actions.handleMarcarPerdido(motivoPerda, { setMotivoPerda, closeAll })} className="flex-1 border border-red-500/50 bg-red-400/5 text-red-400 text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:bg-red-400/10 transition-all">
                                    <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                                    Confirmar perda
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Renomear Ambiente ════════════════════════════════ */}
            {editingAmbNome && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingAmbNome(null)}></div>
                    <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md z-10">
                        <div className="px-6 py-4 border-b border-gray-300 dark:border-zinc-800 flex justify-between items-center">
                            <span className="font-mono text-[10px] uppercase text-gray-900 dark:text-white font-bold tracking-widest">Renomear Ambiente</span>
                            <button onClick={() => setEditingAmbNome(null)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6">
                            <input
                                autoFocus
                                value={editingAmbNome.nome}
                                onChange={e => setEditingAmbNome({ ...editingAmbNome, nome: e.target.value })}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 p-3 text-sm text-gray-900 dark:text-white focus:border-yellow-400 outline-none font-mono"
                            />
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setEditingAmbNome(null)} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                                <button onClick={() => actions.salvarNomeAmbiente(editingAmbNome, () => setEditingAmbNome(null))} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Editar Versão (granular) ══════════════════════════ */}
            {editingVersao && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingVersao(null)}></div>
                    <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-700 w-full max-w-lg z-10 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-300 dark:border-zinc-800 flex justify-between items-center shrink-0">
                            <span className="font-mono text-[10px] uppercase text-gray-900 dark:text-white font-bold tracking-widest">Editar Versão</span>
                            <button onClick={() => setEditingVersao(null)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex flex-col gap-4">
                            <div>
                                <label className="font-mono text-[9px] uppercase text-gray-500 dark:text-zinc-500 block mb-1">Nome do Ambiente</label>
                                <input
                                    value={editingVersao.nomeAmb}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeAmb: e.target.value }))}
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-yellow-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="font-mono text-[9px] uppercase text-gray-500 dark:text-zinc-500 block mb-1">Nome da Versão</label>
                                <input
                                    value={editingVersao.nomeVersao}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeVersao: e.target.value }))}
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-yellow-400 outline-none text-gray-900 dark:text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            {editingVersao.pecas.length > 0 && (
                                <div>
                                    <label className="font-mono text-[9px] uppercase text-gray-500 dark:text-zinc-500 block mb-2">Nome e Material por Peça</label>
                                    <div className="flex flex-col gap-2">
                                        {editingVersao.pecas.map((ep, i) => (
                                            <div key={ep.id} className="flex flex-col gap-1.5 bg-gray-100/60 dark:bg-black/40 border border-gray-300/50 dark:border-zinc-800/50 px-3 py-2.5">
                                                <input
                                                    value={ep.nome}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 focus:border-zinc-600 outline-none text-gray-800 dark:text-zinc-200 text-[11px] font-mono px-2 py-1"
                                                    placeholder="Nome da peça"
                                                />
                                                <select
                                                    value={ep.material_id || ''}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-700 dark:text-zinc-300 text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400"
                                                >
                                                    <option value="">Sem material definido</option>
                                                    {catMateriais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                                </select>
                                                {catMateriais.length === 0 && (
                                                    <p className="font-mono text-[9px] text-gray-400 dark:text-zinc-700">Conecte-se para ver catálogo de materiais.</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
                            <button onClick={() => setEditingVersao(null)} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 py-3 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                            <button onClick={() => actions.salvarEdicaoVersao(editingVersao, () => setEditingVersao(null))} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ PAINEL LATERAL — Edição de Peça Mock ══════════════════════ */}
            {/* ── Drawer: editar item manual ────────────────────────────────── */}
            {itemManualEmEdicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setItemManualEmEdicao(null)}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-gray-100 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 z-50 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 border-t-2 border-t-yellow-400">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Editar Item Manual</div>
                                <div className="text-gray-900 dark:text-white font-semibold text-sm">{itemManualEmEdicao.itemData.nome_peca || 'Item sem nome'}</div>
                            </div>
                            <button onClick={() => setItemManualEmEdicao(null)} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                            {/* Nome */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Nome da Peça</label>
                                <input
                                    type="text"
                                    value={itemManualEmEdicao.itemData.nome_peca ?? ''}
                                    onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, nome_peca: e.target.value } }))}
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors"
                                />
                            </div>
                            {/* Tipo (read-only) */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Tipo</label>
                                    <div className={`px-4 py-3 border font-mono text-xs ${itemManualEmEdicao.itemData.tipo === 'area' ? 'border-blue-500/30 text-blue-400 bg-blue-400/5' : 'border-purple-500/30 text-purple-400 bg-purple-400/5'}`}>
                                        {itemManualEmEdicao.itemData.tipo === 'area' ? 'Área (m²)' : 'Linear (ML)'}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                                        {itemManualEmEdicao.itemData.tipo === 'area' ? 'Quantidade (m²)' : 'Metragem (ML)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={itemManualEmEdicao.itemData.quantidade ?? ''}
                                        onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, quantidade: e.target.value } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                                    />
                                </div>
                            </div>
                            {/* Acabamento + Espessura (somente leitura) */}
                            {itemManualEmEdicao.itemData.tipo === 'area' && (
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Acabamento</label>
                                        <div className="px-4 py-3 border border-gray-300 dark:border-zinc-800 font-mono text-xs text-gray-600 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-900">
                                            {itemManualEmEdicao.itemData.acabamento || '—'}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Espessura</label>
                                        <div className="px-4 py-3 border border-gray-300 dark:border-zinc-800 font-mono text-xs text-gray-600 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-900">
                                            {itemManualEmEdicao.itemData.espessura || '—'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Preço + Total */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                                        Preço unit. (R$/{itemManualEmEdicao.itemData.tipo === 'area' ? 'm²' : 'ML'})
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={itemManualEmEdicao.itemData.preco_unitario ?? 0}
                                        onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, preco_unitario: parseFloat(e.target.value) || 0 } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Total</label>
                                    <div className="px-4 py-3 border border-yellow-400/20 bg-yellow-400/5 font-mono text-sm text-yellow-400 font-semibold">
                                        {fmtBRL((parseFloat(itemManualEmEdicao.itemData.quantidade) || 0) * (itemManualEmEdicao.itemData.preco_unitario || 0))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-800 flex gap-3">
                            <button onClick={() => setItemManualEmEdicao(null)} className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button onClick={() => actions.handleSalvarItemManual(itemManualEmEdicao, () => setItemManualEmEdicao(null))} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2">
                                <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                                Salvar Item
                            </button>
                        </div>
                    </div>
                </>
            )}

            {pecaEmEdicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setPecaEmEdicao(null)}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-gray-100 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">Editar Peça</div>
                                <div className="text-gray-900 dark:text-white font-semibold text-sm">{pecaEmEdicao?.pecaData?.nome ?? 'Peça'}</div>
                            </div>
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo Formulario */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                            {/* Nome e Valor */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Nome da peça</label>
                                    <input
                                        type="text"
                                        value={pecaEmEdicao?.pecaData?.nome ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, nome: e.target.value } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Valor (R$)</label>
                                    <input
                                        type="number"
                                        value={pecaEmEdicao?.pecaData?.valor ?? 0}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, valor: Number(e.target.value) } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Espessura */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Espessura</label>
                                    <select
                                        value={pecaEmEdicao?.pecaData?.espessura ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, espessura: e.target.value } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="1cm">1cm</option>
                                        <option value="2cm">2cm</option>
                                        <option value="3cm">3cm</option>
                                    </select>
                                </div>
                                {/* Material */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Material</label>
                                    <select
                                        value={pecaEmEdicao?.pecaData?.material ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, material: e.target.value } }))}
                                        className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="Granito São Gabriel">Granito São Gabriel</option>
                                        <option value="Silestone Tigris Sand">Silestone Tigris Sand</option>
                                        <option value="Quartzo Branco">Quartzo Branco</option>
                                    </select>
                                </div>
                            </div>

                            {/* Recortes */}
                            <div>
                                <div className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-3 border-b border-gray-300 dark:border-zinc-800 pb-2">Recortes ({(pecaEmEdicao?.pecaData?.recortes ?? []).length})</div>
                                <div className="flex flex-col gap-2">
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).map(rec => (
                                        <div key={rec?.id} className="flex flex-col border border-gray-300 dark:border-zinc-800 bg-gray-100 dark:bg-black p-3 group hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:scissors-linear" width="14" className="text-gray-500 dark:text-zinc-600"></iconify-icon>
                                                    <div>
                                                        <div className="text-xs text-gray-900 dark:text-white pb-0.5">{rec?.nome ?? 'Recorte'}</div>
                                                        <div className="text-[10px] font-mono text-gray-500 dark:text-zinc-500">{rec?.dimensao ?? '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleRemoverRecorteDrawer(rec?.id)}
                                                        className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded"
                                                        title="Remover recorte"
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).length === 0 && (
                                        <div className="p-3 border border-dashed border-gray-300 dark:border-zinc-800 text-center">
                                            <span className="text-[10px] font-mono text-gray-500 dark:text-zinc-600">Nenhum recorte</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer painel */}
                        <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-800 flex gap-3">
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => actions.handleSalvarEdicaoPeca(pecaEmEdicao, () => setPecaEmEdicao(null))}
                                className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2"
                            >
                                <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                                Salvar Peça
                            </button>
                        </div>
                    </div>
                </>
            )}

        {/* ══ MODAL — Opções de PDF ═════════════════════════════════════ */}
        {pdfModal && (
            <PdfOptionsModal
                tipo={pdfModal.tipo}
                defaults={pdfModal.defaults}
                onConfirm={(opts, modo) => actions.handlePdfConfirm(opts, modo, pdfModal, { setPdfModal, setLoadingPdf })}
                onClose={() => setPdfModal(null)}
            />
        )}

        {/* ══ MODAL — Orçamento Manual ══════════════════════════════════ */}
        {modalOrcManual && (
            <ModalOrcamentoManual
                projetoId={id}
                onClose={() => setModalOrcManual(false)}
                onSalvo={() => { recarregarAmbientes(); setModalOrcManual(false); }}
            />
        )}

        </div>
    );
}
