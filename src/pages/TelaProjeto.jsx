import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { parseEndereco } from '../utils/endereco';
import ModalOrcamentoManual from '../components/ModalOrcamentoManual';
import PdfOptionsModal from '../components/PdfOptionsModal';
import CamposParcelamento from './financeiro/lancamentos/CamposParcelamento';
import { useProjectData } from '../hooks/useProjectData';
import { useProjectActions } from '../hooks/useProjectActions';
import { PainelDetalhesMedicao } from '../components/projeto/PainelDetalhesMedicao';
import PainelDiferencaMedicao from '../components/projeto/PainelDiferencaMedicao';
import ModalStatus from '../components/projeto/ModalStatus';
import ModalPerda from '../components/projeto/ModalPerda';
import ModalRenomearAmbiente from '../components/projeto/ModalRenomearAmbiente';
import ModalEditarVersao from '../components/projeto/ModalEditarVersao';
import DrawerItemManual from '../components/projeto/DrawerItemManual';
import DrawerEdicaoPeca from '../components/projeto/DrawerEdicaoPeca';
import ModalAgendarMedicao from '../components/projeto/ModalAgendarMedicao';
import AbaMedicoes from '../components/projeto/AbaMedicoes';
import AbaCarrinho from '../components/projeto/AbaCarrinho';
import AbaPedidos from '../components/projeto/AbaPedidos';
import {
    STATUS_CONFIG,
    StatusPill, MedicaoPill,
    fmtBRL, calcDataFinalDiasUteis, calcParcelas,
} from '../utils/projetoUtils';
// gerarPdfOrcamento é importado dinamicamente no click handler para não bloquear o bundle inicial

// ── Componente principal ──────────────────────────────────────────────────────

export default function TelaProjetoVendedor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { session, profile, empresa: empresaCtx, loading: authLoading, profileLoading } = useAuth();
    const isAdmin = profile?.perfil === 'admin' || profile?.role === 'admin';
    const perfilAtual = profile?.perfil ?? profile?.role ?? '';
    const isMedidorCombinado = perfilAtual === 'admin_medidor' || perfilAtual === 'vendedor_medidor';

    const [activeTab, setActiveTab] = useState('medicoes');
    const location = useLocation();
    useEffect(() => {
        if (location.state?.activeTab) setActiveTab(location.state.activeTab);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const {
        projeto,         setProjeto,
        ambientes,       setAmbientes,
        medicoes,        setMedicoes,
        catMateriais,    catProdAvulsos,
        medidores,
        pedidosFechados, setPedidosFechados, pedidoFechado,
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
        pedidoFechado, pedidosFechados, setPedidosFechados,
        catMateriais, catProdAvulsos,
        recarregarAmbientes,
    });

    const isViewOnlyAdmin = isAdmin && projeto && projeto.vendedor_id !== session?.user?.id;

    // Abre modal de edição preenchido com dados existentes
    function handleAbrirEditar(m) {
        setAgPedidoContext(null);
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
    const [painelMedicao,      setPainelMedicao]      = useState(null);
    const [painelDiferenca,    setPainelDiferenca]    = useState(null); // null | { medicao, pedido, pedidoNumero }
    // Fluxo único de agendamento: ModalAgendarMedicao serve preliminar e produção.
    // null → preliminar; { pedido, numero } → medição de produção vinculada a um pedido.
    const [agPedidoContext,    setAgPedidoContext]    = useState(null);

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
    const [agCep,        setAgCep]        = useState('');
    const [agEstado,     setAgEstado]     = useState('');
    const [agendando,    setAgendando]    = useState(false);
    const [erroAgendar,  setErroAgendar]  = useState('');
    const [editingMedicaoId, setEditingMedicaoId] = useState(null);
    // Cliente sem endereço no cadastro: o endereço preenchido aqui será salvo
    // também em clientes.endereco ao confirmar o agendamento.
    const [clienteSemEndereco, setClienteSemEndereco] = useState(false);

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
        setAgCep('');
        setAgEstado('');
        setClienteSemEndereco(false);
        setEndSugestoes([]);
        setEndConfirmado(false);
        setAgPedidoContext(null);
    };

    function parseEnderecoCliente(str) {
        return parseEndereco(str);
    }

    function handleAbrirNovoAgendamento() {
        const cliente = projeto?.clientes;
        const end = parseEnderecoCliente(cliente?.endereco);
        // Endereço é opcional no cadastro do cliente. Se não houver, o modal abre
        // com uma seção para preencher na hora — e o endereço é salvo também no
        // cadastro do cliente ao confirmar (ver clienteSemEndereco).
        const temEndereco = !!(end.rua?.trim() || end.numero?.trim() || end.bairro?.trim() || end.cidade?.trim() || end.cep?.trim());
        setAgRua(end.rua);
        setAgNumero(end.numero);
        setAgBairro(end.bairro);
        setAgCidade(end.cidade);
        setAgCep(end.cep);
        setAgEstado(end.estado);
        setAgPedidoContext(null);
        setEndConfirmado(temEndereco);
        setClienteSemEndereco(!temEndereco);
        setModalAgendar(true);
    }

    // Prefill dos campos de endereço a partir do cadastro do cliente (usado nos
    // agendamentos de produção — o endereço já é o do cliente, mas fica editável + CEP)
    function prefillEnderecoDoCliente() {
        const end = parseEnderecoCliente(projeto?.clientes?.endereco);
        setAgRua(end.rua);
        setAgNumero(end.numero);
        setAgBairro(end.bairro);
        setAgCidade(end.cidade);
        setAgCep(end.cep);
        setAgEstado(end.estado);
        setEndConfirmado(!!(end.rua?.trim() || end.cidade?.trim()));
        setEndSugestoes([]);
        setClienteSemEndereco(false);
    }

    // Agendar medição de PRODUÇÃO (vinculada a um pedido) — mesmo modal do preliminar
    function handleAgendarProducao(pedido, numero) {
        setEditingMedicaoId(null);
        setAgMedidor(medidores.length === 1 ? medidores[0].id : '');
        setAgData('');
        setAgObservacoes('');
        prefillEnderecoDoCliente();
        setErroAgendar('');
        setAgPedidoContext({ pedido, numero });
        setModalAgendar(true);
    }

    // Editar agendamento de produção existente — mesmo modal
    function handleEditarProducao(medicao, pedidoNumero) {
        const pedido = pedidosFechados.find(p => p.id === medicao.pedido_id) ?? {};
        setEditingMedicaoId(medicao.id);
        setAgMedidor(medicao.medidor_id ?? '');
        setAgData(medicao.data_medicao ? medicao.data_medicao.slice(0, 16) : '');
        setAgObservacoes(medicao.observacoes_acesso ?? '');
        prefillEnderecoDoCliente();
        setErroAgendar('');
        setAgPedidoContext({ pedido, numero: pedidoNumero });
        setModalAgendar(true);
    }

    // Confirmação única: roteia para a ação de produção ou preliminar conforme o contexto
    async function handleConfirmarAgendamento() {
        if (agPedidoContext) {
            if (!agMedidor) { setErroAgendar('Selecione um medidor.'); return; }
            if (!agData)    { setErroAgendar('Selecione a data e hora.'); return; }
            setErroAgendar('');
            setAgendando(true);
            try {
                if (editingMedicaoId) {
                    await actions.handleEditarMedicaoProducao({
                        medicaoId:   editingMedicaoId,
                        medidorId:   agMedidor,
                        dataStr:     agData,
                        observacoes: agObservacoes.trim() || null,
                        endereco:    enderecoCompleto || null,
                    });
                } else {
                    await actions.handleAgendarMedicaoProducao({
                        pedidoId:    agPedidoContext.pedido.id,
                        medidorId:   agMedidor,
                        dataStr:     agData,
                        observacoes: agObservacoes.trim() || null,
                        endereco:    enderecoCompleto || null,
                    });
                }
                closeAll();
            } catch (e) {
                setErroAgendar(e.message ?? 'Erro ao salvar. Tente novamente.');
            } finally {
                setAgendando(false);
            }
            return;
        }
        // Medição preliminar
        actions.handleAgendarMedicao({
            agMedidor, agData, editingMedicaoId, enderecoCompleto, agObservacoes,
            // Só salva no cliente se houver endereço de fato preenchido
            salvarNoCliente: clienteSemEndereco && !!enderecoCompleto,
            enderecoClienteJson: clienteSemEndereco && enderecoCompleto
                ? JSON.stringify({ cep: agCep, rua: agRua, numero: agNumero, complemento: '', bairro: agBairro, cidade: agCidade, estado: agEstado })
                : null,
        }, { setErroAgendar, setAgendando, closeAll });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAFETY GUARD — impede renderização com dados nulos
    // Se qualquer uma dessas condições for verdadeira, a tela preta é impossível
    // ════════════════════════════════════════════════════════════════════════
    // Loading: aguarda auth + perfil + busca do projeto
    if (authLoading || profileLoading || loadingProjeto) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-zinc-500 dark:text-zinc-500">
                    <iconify-icon icon="solar:spinner-linear" width="40" className="animate-spin text-orange-500 dark:text-yellow-400"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest">Carregando dados do projeto...</p>
                </div>
            </div>
        );
    }

    // Loading terminou mas projeto não foi encontrado (ID inválido, acesso negado, etc.)
    if (!projeto) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-white flex items-center justify-center">
                <div className="text-center gap-4 flex flex-col">
                    <p className="font-mono text-xs text-zinc-500 dark:text-zinc-500">Projeto não encontrado ou acesso negado.</p>
                    <button onClick={() => navigate('/projetos')} className="text-[10px] uppercase font-mono text-orange-700 dark:text-yellow-400 border border-orange-300 dark:border-yellow-400/20 rounded-md dark:rounded-none px-4 py-2 hover:bg-orange-50 dark:hover:bg-yellow-400/10 transition-colors">Voltar para Projetos</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-white flex flex-col font-sans selection:bg-orange-500 selection:text-white dark:selection:bg-gray-50 dark:selection:text-black">


            {/* Backgrounds — light */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-[length:40px_40px] bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:hidden"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.15] bg-[radial-gradient(circle_at_50%_0%,rgba(0,0,0,0.1),transparent_70%)] dark:hidden"></div>
            {/* Backgrounds — dark */}
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-64">
                {/* ── Breadcrumb ─────────────────────────────────────────── */}
                <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-6">
                    <span onClick={() => navigate('/projetos')} className="hover:text-orange-600 dark:hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
                    <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-400 dark:text-zinc-700"></iconify-icon>
                    <span className="text-zinc-700 dark:text-zinc-400">{projeto?.nome ?? '—'}</span>
                </div>

                {/* ── Header do Projeto ──────────────────────────────────── */}
                <section className="sys-reveal mb-8">
                    <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                            {/* Info */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tighter">{projeto?.nome ?? '—'}</h1>
                                    <StatusPill status={projeto?.status ?? 'aprovado'} />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                                    <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-500 dark:text-zinc-600"></iconify-icon>
                                    <a href={`/clientes/${projeto?.cliente?.id}`} className="hover:text-orange-600 dark:hover:text-yellow-400 transition-colors">
                                        {projeto?.cliente?.nome ?? '—'}
                                    </a>
                                    <span className="text-zinc-400 dark:text-zinc-700">·</span>
                                    <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-500 dark:text-zinc-600"></iconify-icon>
                                    <span>{projeto?.criado_em ?? '—'}</span>
                                    <span className="text-zinc-400 dark:text-zinc-700">·</span>
                                    <iconify-icon icon="solar:user-id-linear" width="13" className="text-zinc-500 dark:text-zinc-600"></iconify-icon>
                                    <span>{projeto?.vendedor ?? '—'}</span>
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => { setNovoStatus(projeto?.status ?? 'orcado'); setModalStatus(true); }}
                                    className="flex items-center gap-2 border border-zinc-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 rounded-md dark:rounded-none hover:border-orange-500 hover:text-orange-600 dark:hover:border-white dark:hover:text-white transition-colors"
                                >
                                    <iconify-icon icon="solar:refresh-linear" width="13"></iconify-icon>
                                    Atualizar status
                                </button>
                                {pedidosFechados.length === 0 && (
                                <button
                                    onClick={() => setModalPerda(true)}
                                    className="flex items-center gap-2 border bg-red-600 border-red-600 text-white dark:border-red-500/30 dark:bg-red-400/5 dark:text-red-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 rounded-md dark:rounded-none hover:bg-red-700 dark:hover:bg-transparent dark:hover:border-red-400 transition-colors"
                                >
                                    <iconify-icon icon="solar:close-circle-linear" width="13"></iconify-icon>
                                    Marcar como perdido
                                </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Tabs ──────────────────────────────────────────────── */}
                <div className="sys-reveal sys-delay-100 flex border-b border-zinc-200/80 dark:border-zinc-800 mb-6">
                    {[
                        { id: 'medicoes',   label: 'Medições',   icon: 'solar:ruler-pen-linear'              },
                        { id: 'orcamentos', label: 'Orçamentos', icon: 'solar:cart-large-minimalistic-linear' },
                        { id: 'pedidos',    label: 'Pedidos',    icon: 'solar:document-text-linear'          },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-orange-500 dark:border-yellow-400 text-zinc-900 dark:text-white'
                                    : 'border-transparent text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-400'
                            }`}
                        >
                            <iconify-icon icon={tab.icon} width="13"></iconify-icon>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ══ ABA: MEDIÇÕES ══════════════════════════════════════ */}
                {activeTab === 'medicoes' && (
                    <AbaMedicoes
                        medicoes={medicoes}
                        pedidosFechados={pedidosFechados}
                        ambientes={ambientes}
                        onAgendarProducao={handleAgendarProducao}
                        onEditarProducao={handleEditarProducao}
                        isMedidorCombinado={isMedidorCombinado}
                        vendedorId={projeto?.vendedor_id}
                        sessionUserId={session?.user?.id}
                        isViewOnlyAdmin={isViewOnlyAdmin}
                        onAbrirNovoAgendamento={handleAbrirNovoAgendamento}
                        onAbrirEditar={handleAbrirEditar}
                        onVerDados={setPainelMedicao}
                        onVerDiferenca={(medicao, pedidoNumero) => {
                            const pedido = pedidosFechados.find(p => p.id === medicao.pedido_id)
                                ?? pedidosFechados[pedidosFechados.length - pedidoNumero];
                            setPainelDiferenca({ medicao, pedido: pedido ?? null, pedidoNumero });
                        }}
                        onFazerMedicao={() => actions.handleFazerMedicao()}
                        onExcluirMedicao={actions.handleExcluirMedicao}
                    />
                )}

                {/* ══ ABA: ORÇAMENTOS ════════════════════════════════════ */}
                {activeTab === 'orcamentos' && (
                    <AbaCarrinho
                        ambientes={ambientes}
                        pedidoFechado={pedidoFechado}
                        pedidosFechados={pedidosFechados}
                        projeto={projeto}
                        projetoId={id}
                        isViewOnlyAdmin={isViewOnlyAdmin}
                        loadingPecasOrc={loadingPecasOrc}
                        fetchPecasParaOrcamento={fetchPecasParaOrcamento}
                        modoMesclar={modoMesclar} setModoMesclar={setModoMesclar}
                        mesclarIds={mesclarIds} setMesclarIds={setMesclarIds}
                        modalMesclar={modalMesclar} setModalMesclar={setModalMesclar}
                        loadingMesclar={loadingMesclar} setLoadingMesclar={setLoadingMesclar}
                        orcsMesclados={orcsMesclados} setOrcsMesclados={setOrcsMesclados}
                        toastMesclar={toastMesclar} setToastMesclar={setToastMesclar}
                        cancelarMesclar={cancelarMesclar} toggleMesclarId={toggleMesclarId}
                        modoFecharPedido={modoFecharPedido} setModoFecharPedido={setModoFecharPedido}
                        fecharIds={fecharIds} setFecharIds={setFecharIds}
                        modalFechar={modalFechar} setModalFechar={setModalFechar}
                        loadingFechar={loadingFechar} setLoadingFechar={setLoadingFechar}
                        toastFechar={toastFechar} setToastFechar={setToastFechar}
                        fecharOpen={fecharOpen} setFecharOpen={setFecharOpen}
                        cancelarFecharPedido={cancelarFecharPedido} toggleFecharId={toggleFecharId}
                        carrinhoExpandido={carrinhoExpandido} setCarrinhoExpandido={setCarrinhoExpandido}
                        carrinhoEditandoNome={carrinhoEditandoNome} setCarrinhoEditandoNome={setCarrinhoEditandoNome}
                        carrinhoEditandoDesconto={carrinhoEditandoDesconto} setCarrinhoEditandoDesconto={setCarrinhoEditandoDesconto}
                        carrinhoEditandoAjustes={carrinhoEditandoAjustes} setCarrinhoEditandoAjustes={setCarrinhoEditandoAjustes}
                        loadingPdf={loadingPdf} setPdfModal={setPdfModal}
                        actions={actions}
                    />
                )}

                {/* ══ ABA: PEDIDOS ═══════════════════════════════════════ */}
                {activeTab === 'pedidos' && (
                    <AbaPedidos
                        pedidosFechados={pedidosFechados}
                        ambientes={ambientes}
                        medicoes={medicoes}
                        onAgendarProducao={handleAgendarProducao}
                        onEditarProducao={handleEditarProducao}
                        actions={actions}
                        loadingPdf={loadingPdf}
                        setPdfModal={setPdfModal}
                    />
                )}
            </main>

            {/* ══ PAINEL LATERAL — Dados da medição ══════════════════════ */}
            {painelMedicao && (() => {
                const perfil = profile?.perfil ?? profile?.role;
                const podeGerarOrcamento = perfil !== 'medidor';
                return (
                    <PainelDetalhesMedicao
                        medicao={painelMedicao}
                        onClose={() => setPainelMedicao(null)}
                        footer={podeGerarOrcamento ? (
                            <button
                                onClick={() => {
                                    const params = new URLSearchParams({ medicao_id: painelMedicao.id });
                                    setPainelMedicao(null);
                                    navigate(`/projetos/${id}/orcamento/novo?${params}`);
                                }}
                                className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black text-[11px] font-bold uppercase tracking-widest py-3 rounded-md dark:rounded-none hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
                                Criar orçamento com estes dados
                            </button>
                        ) : null}
                    />
                );
            })()}

            {/* ══ PAINEL LATERAL — Diferença de Medição ══════════════════ */}
            {painelDiferenca && (
                <PainelDiferencaMedicao
                    medicao={painelDiferenca.medicao}
                    pedido={painelDiferenca.pedido}
                    pedidoNumero={painelDiferenca.pedidoNumero}
                    projeto={projeto}
                    empresa={empresaCtx}
                    ambientes={ambientes}
                    catMateriais={catMateriais}
                    onClose={() => setPainelDiferenca(null)}
                />
            )}

            {/* ══ MODAL — Agendar Medição ════════════════════════════════ */}
            <ModalAgendarMedicao
                modalAgendar={modalAgendar}
                closeAll={closeAll}
                editingMedicaoId={editingMedicaoId}
                erroAgendar={erroAgendar}
                agMedidor={agMedidor} setAgMedidor={setAgMedidor}
                agData={agData} setAgData={setAgData}
                agRua={agRua} setAgRua={setAgRua}
                agNumero={agNumero} setAgNumero={setAgNumero}
                agBairro={agBairro} setAgBairro={setAgBairro}
                agCidade={agCidade} setAgCidade={setAgCidade}
                agCep={agCep} setAgCep={setAgCep}
                agEstado={agEstado} setAgEstado={setAgEstado}
                agObservacoes={agObservacoes} setAgObservacoes={setAgObservacoes}
                agendando={agendando}
                clienteSemEndereco={clienteSemEndereco}
                endSugestoes={endSugestoes} setEndSugestoes={setEndSugestoes}
                endBuscando={endBuscando} setEndBuscando={setEndBuscando}
                endConfirmado={endConfirmado} setEndConfirmado={setEndConfirmado}
                endDebounceRef={endDebounceRef}
                enderecoCompleto={enderecoCompleto}
                medidores={medidores}
                profile={profile}
                pedidoContext={agPedidoContext}
                onConfirmar={handleConfirmarAgendamento}
            />

            {/* ══ MODAL — Atualizar Status ═══════════════════════════════ */}
            <ModalStatus
                modalStatus={modalStatus}
                novoStatus={novoStatus}
                setNovoStatus={setNovoStatus}
                closeAll={closeAll}
                onSalvar={(s) => actions.handleSalvarStatus(s, closeAll)}
            />

            {/* ══ MODAL — Marcar como Perdido ════════════════════════════ */}
            <ModalPerda
                modalPerda={modalPerda}
                closeAll={closeAll}
                projetoNome={projeto?.nome}
                motivoPerda={motivoPerda}
                setMotivoPerda={setMotivoPerda}
                onConfirmar={() => actions.handleMarcarPerdido(motivoPerda, { setMotivoPerda, closeAll })}
            />

            {/* ══ MODAL — Renomear Ambiente ════════════════════════════════ */}
            <ModalRenomearAmbiente
                editingAmbNome={editingAmbNome}
                setEditingAmbNome={setEditingAmbNome}
                onSalvar={() => actions.salvarNomeAmbiente(editingAmbNome, () => setEditingAmbNome(null))}
            />

            {/* ══ MODAL — Editar Versão (granular) ══════════════════════════ */}
            <ModalEditarVersao
                editingVersao={editingVersao}
                setEditingVersao={setEditingVersao}
                catMateriais={catMateriais}
                onSalvar={() => actions.salvarEdicaoVersao(editingVersao, () => setEditingVersao(null))}
            />

            {/* ══ PAINEL LATERAL — Edição de Peça Mock ══════════════════════ */}
            {/* ── Drawer: editar item manual ────────────────────────────────── */}
            <DrawerItemManual
                itemManualEmEdicao={itemManualEmEdicao}
                setItemManualEmEdicao={setItemManualEmEdicao}
                onSalvar={() => actions.handleSalvarItemManual(itemManualEmEdicao, () => setItemManualEmEdicao(null))}
            />

            <DrawerEdicaoPeca
                pecaEmEdicao={pecaEmEdicao}
                setPecaEmEdicao={setPecaEmEdicao}
                onRemoverRecorte={handleRemoverRecorteDrawer}
                onSalvar={() => actions.handleSalvarEdicaoPeca(pecaEmEdicao, () => setPecaEmEdicao(null))}
            />

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
