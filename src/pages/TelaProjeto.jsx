import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ModalOrcamentoManual from '../components/ModalOrcamentoManual';
import PdfOptionsModal from '../components/PdfOptionsModal';
import CamposParcelamento from './financeiro/lancamentos/CamposParcelamento';
import { loadPdfOpts, savePdfOpts } from '../utils/pdfOptions';
// gerarPdfOrcamento é importado dinamicamente no click handler para não bloquear o bundle inicial

const STATUS_CONFIG = {
    orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',   bg: 'bg-zinc-900',      dot: 'bg-zinc-500'   },
    aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30', bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-400/5', dot: 'bg-violet-400' },
    entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',  bg: 'bg-blue-400/5',   dot: 'bg-blue-400'   },
    perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',   bg: 'bg-red-400/5',    dot: 'bg-red-400'    },
};

const MEDICAO_STATUS = {
    agendada:   { label: 'Agendada',   color: 'text-zinc-400',   border: 'border-zinc-700',      bg: 'bg-zinc-900',       dot: 'bg-zinc-500'   },
    enviada:    { label: 'Enviada',    color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/5',  dot: 'bg-yellow-400' },
    processada: { label: 'Processada', color: 'text-violet-400', border: 'border-violet-400/30', bg: 'bg-violet-400/5',  dot: 'bg-violet-400' },
    concluida:  { label: 'Aprovada',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
    aprovada:   { label: 'Aprovada',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',   dot: 'bg-green-400'  },
};

function StatusPill({ status }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

function MedicaoPill({ status }) {
    const cfg = MEDICAO_STATUS[status] || MEDICAO_STATUS.agendada;
    return (
        <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max`}>
            <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
            {cfg.label}
        </span>
    );
}

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
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
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
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-2">
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
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <iconify-icon icon="solar:document-text-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                                            Observações do Ambiente
                                        </span>
                                    </div>
                                    <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{infoAmb}</p>
                                </div>
                            )}

                            {/* Observações por item */}
                            {itensComInfo.length > 0 && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <iconify-icon icon="solar:list-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                                            Observações por Item
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {itensComInfo.map((item, j) => (
                                            <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">
                                                    {item.nome}
                                                </span>
                                                <span className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">
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

// ─── Normaliza json_medicao para o formato interno resumo_por_peca ───────────
// Suporta dois formatos:
//   • Trigger web:  { resumo_por_peca: [...], totais: {...} }
//   • App Flutter:  { projeto, ambientes: [{ ambiente, pecas: [...] }] }
//
// Campos Flutter por peça:
//   name, type, width_cm, height_cm, thickness_cm, area_liquida_m2,
//   recortes (array), acabamentos (array de "RS"|"ME" por aresta)
//
// Cálculo de ml por acabamento (retangulo):
//   Arestas na ordem [width, height, width, height].
//   Cada item do array acabamentos mapeia para a aresta de mesmo índice.
//   RS = reto simples  →  soma dos comprimentos das arestas marcadas RS
//   ME = meia-esquadria → soma dos comprimentos das arestas marcadas ME
//   Polígonos: usa lados_cm exportados pelo app para calcular ml por acabamento
function normalizarJsonMedicao(json) {
    if (!json) return null;

    // Formato web — já está no padrão esperado
    if (Array.isArray(json.resumo_por_peca) && json.resumo_por_peca.length > 0) {
        return json;
    }

    // Formato Flutter
    if (Array.isArray(json.ambientes)) {
        const resumo = [];

        for (const amb of json.ambientes) {
            const nomeAmbiente = amb.ambiente ?? amb.nome ?? null;

            // Coleta peças com info de item (nova estrutura) ou sem (compat)
            const fontes = [];
            if (Array.isArray(amb.itens) && amb.itens.length > 0) {
                // Nova estrutura: ambientes[].itens[].pecas + ambientes[].pecas_sem_item
                for (const item of amb.itens) {
                    const pecasItem = Array.isArray(item.pecas) ? item.pecas : [];
                    for (const p of pecasItem) {
                        fontes.push({ p, item_nome: item.nome ?? null, item_id: item.item_id ?? null });
                    }
                }
                const semItem = Array.isArray(amb.pecas_sem_item) ? amb.pecas_sem_item : [];
                for (const p of semItem) fontes.push({ p, item_nome: null, item_id: null });
            } else {
                // Estrutura antiga: ambientes[].pecas
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
                acabs.forEach((ac, i) => {
                    const len = arestas[i] ?? 0;
                    if (ac === 'RS') reto_simples_ml   += len;
                    if (ac === 'ME') meia_esquadria_ml += len;
                });
                resumo.push({
                    nome:             p.name ?? 'Peça',
                    area_liquida_m2:  Math.round(area * 10000) / 10000,
                    espessura_cm:     p.thickness_cm ?? null,
                    ambiente_nome:    nomeAmbiente,
                    item_nome,
                    item_id,
                    type:             p.type ?? 'retangulo',
                    recortes_qty:     Array.isArray(p.recortes) ? p.recortes.length : 0,
                    recortes:         Array.isArray(p.recortes) ? p.recortes : [],
                    acabamentos: {
                        reto_simples_ml:   Math.round(reto_simples_ml   * 100) / 100,
                        meia_esquadria_ml: Math.round(meia_esquadria_ml * 100) / 100,
                    },
                });
            }
        }

        return { resumo_por_peca: resumo, _fonte: 'flutter' };
    }

    return json;
}

// ─── Funções puras de duplicação — FORA do componente, sem closures, sem side effects ───
// duplicarAmbiente: recebe um ambiente, retorna um clone 100% novo com novos UUIDs em todos os níveis.
// Não toca em nenhum estado global. Não cria versões extras. Retorna exatamente o que recebe, clonado.
function duplicarAmbiente(amb) {
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

// duplicarVersao: idem para uma versao individual.
function duplicarVersao(v) {
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

// duplicarPeca: idem para uma peça individual.
function duplicarPeca(p) {
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

// clonarAvulso: para uso em adicionarAvulso
function clonarAvulso(av) {
    return {
        id:             crypto.randomUUID(),
        produto_id:     av.produto_id,
        nome:           String(av.nome           || ''),
        quantidade:     Number(av.quantidade     || 1),
        valor_unitario: Number(av.valor_unitario || 0),
        valor_total:    Number(av.valor_total    || 0),
    };
}

// Recalcula valor_total de uma versão (pecas + avulsos)
function calcTotal(versao) {
    const tp = (versao.pecas   || []).reduce((s, p)  => s + (Number(p.valor)       || 0), 0);
    const ta = (versao.avulsos || []).reduce((s, av) => s + (Number(av.valor_total) || 0), 0);
    return tp + ta;
}

// ── Helpers de normalização — transforma a estrutura do Supabase ──────────────

function normalizarAmbiente(amb) {
    // Filtra orçamentos descartados (soft delete — descartado_em NOT NULL)
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
            nome:           av.nome ?? 'Produto',
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function TelaProjetoVendedor() {
    const { id } = useParams();
    console.log('ID do Projeto recebido:', id);
    const navigate = useNavigate();
    const { session, profile, empresa: empresaCtx, loading: authLoading, profileLoading } = useAuth();
    const isAdmin = profile?.perfil === 'admin' || profile?.role === 'admin';

    const [activeTab, setActiveTab] = useState('medicoes');

    // ── Estado único de ambientes — alimentado pelo Supabase ─────────────────
    const [ambientes, setAmbientes] = useState([]);
    const [projeto, setProjeto] = useState(null);
    const [loadingProjeto, setLoadingProjeto] = useState(true);

    const isViewOnlyAdmin = isAdmin && projeto && projeto.vendedor_id !== session?.user?.id;

    // ── Estado de medições — carregado do Supabase ───────────────────────────
    const [medicoes, setMedicoes] = useState([]);

    const recarregarMedicoes = React.useCallback(async () => {
        if (!id) return;
        const { data, error } = await supabase
            .from('medicoes')
            .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
            .eq('projeto_id', id)
            .order('data_medicao', { ascending: false });
        if (error) {
            console.error('[medicoes] Erro ao carregar:', error);
            return;
        }
        if (data) setMedicoes(data.map(m => ({
            ...m,
            data: m.data_medicao
                ? new Date(m.data_medicao).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—',
            medidor: m.responsavel ?? '—',
        })));
    }, [id]);

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

    async function handleExcluirMedicao(m) {
        if (!window.confirm(`Excluir a medição de ${m.data}? Esta ação não pode ser desfeita.`)) return;
        // Deletar ambientes vinculados antes da medição (evita violação de FK)
        await supabase.from('ambientes').delete().eq('medicao_id', m.id);
        const { error } = await supabase.from('medicoes').delete().eq('id', m.id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        setMedicoes(prev => prev.filter(item => item.id !== m.id));
    }

    // Helper para recarregar ambientes do banco após mutações
    const recarregarAmbientes = React.useCallback(async () => {
        if (!session || !id) return;
        const { data, error } = await supabase
            .from('ambientes')
            .select(`
                id, nome,
                orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais, descartado_em,
                    orcamento_pecas(*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)),
                    orcamento_avulsos(id, nome, quantidade, valor_unitario, valor_total)
                )
            `)
            .eq('projeto_id', id)
            .order('created_at');
        if (error) {
            console.error('Erro ao recarregar ambientes:', error.message, error.details);
            // Fallback sem sub-joins opcionais
            const { data: fb, error: fbErr } = await supabase
                .from('ambientes')
                .select(`
                    id, nome,
                    orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais)
                `)
                .eq('projeto_id', id)
                .order('created_at');
            if (fbErr) { console.error('Erro no fallback:', fbErr.message); return; }
            if (fb) setAmbientes(fb.map(normalizarAmbiente));
            return;
        }
        if (data) setAmbientes(data.map(normalizarAmbiente));
    }, [session, id]);

    // Fetch inicial de medições
    useEffect(() => {
        if (id) recarregarMedicoes();
    }, [id, recarregarMedicoes]);

    // Carregamento inicial
    useEffect(() => {
        if (!id) return;

        async function loadData() {
            setLoadingProjeto(true);
            try {
                const [resP, resA] = await Promise.all([
                    supabase.from('projetos').select('*, clientes(id, nome, telefone, email, endereco), arquitetos(id, nome), rt_padrao_percentual').eq('id', id).single(),
                    supabase.from('ambientes').select(`
                        id, nome,
                        orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais, descartado_em,
                            orcamento_pecas(*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)),
                            orcamento_avulsos(id, nome, quantidade, valor_unitario, valor_total)
                        )
                    `).eq('projeto_id', id).order('created_at'),
                ]);

                if (resP.error) console.error('[TelaProjeto] Erro projeto:', resP.error.message);

                if (resP.data) setProjeto(resP.data);

                if (resA.error) {
                    console.error('[TelaProjeto] Erro ao carregar ambientes+orçamentos:', resA.error.message, resA.error.details);
                    // Fallback: busca apenas ambientes com orcamentos básicos (sem sub-joins opcionais)
                    const { data: fallbackData, error: fallbackErr } = await supabase
                        .from('ambientes')
                        .select(`
                            id, nome,
                            orcamentos(id, nome_versao, valor_total, desconto_total, majoramento_percentual, rt_percentual, rt_arquiteto_nome, valor_frete, status, created_at, itens_manuais)
                        `)
                        .eq('projeto_id', id)
                        .order('created_at');
                    if (fallbackErr) {
                        console.error('[TelaProjeto] Erro no fallback de ambientes:', fallbackErr.message);
                    }
                    const dados = Array.isArray(fallbackData) ? fallbackData.map(normalizarAmbiente) : [];
                    setAmbientes(dados);
                } else {
                    const dadosNormalizados = Array.isArray(resA.data)
                        ? resA.data.map(normalizarAmbiente)
                        : [];
                    setAmbientes(dadosNormalizados);
                }

            } catch (err) {
                console.error('[TelaProjeto] Erro fatal no loadData:', err);
            } finally {
                setLoadingProjeto(false);
            }
        }

        loadData();
    }, [id]);

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

    // Catálogos do Supabase
    const [catMateriais,      setCatMateriais]      = useState([]);
    const [catProdAvulsos,    setCatProdAvulsos]    = useState([]);

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

    // ── DUPLICAR AMBIENTE — local-only por enquanto (INSERT complex) ──────────
    const mockDuplicarAmbiente = (e, ambienteId) => {
        e.stopPropagation();
        const idx = ambientes.findIndex(a => a.id === ambienteId);
        if (idx === -1) return;
        const clone = duplicarAmbiente(ambientes[idx]);
        setAmbientes([
            ...ambientes.slice(0, idx + 1),
            clone,
            ...ambientes.slice(idx + 1),
        ]);
    };

    // ── EXCLUIR AMBIENTE — persiste no Supabase (cascade: orcamentos + pecas) ─
    const mockExcluirAmbiente = async (e, ambienteId) => {
        e.stopPropagation();
        if (!window.confirm('Excluir este ambiente e todas as suas versões?')) return;

        // Optimistic update imediato
        const idsVersoes = (ambientes.find(a => a.id === ambienteId)?.orcamentos || []).map(v => v.id);
        setSelectedIds(s => s.filter(sid => !idsVersoes.includes(sid)));
        setAmbientes(prev => prev.filter(a => a.id !== ambienteId));

        // 1. Exclui as peças dos orçamentos (orcamento_pecas) para todos os orçamentos deste ambiente
        if (idsVersoes.length > 0) {
            const { error: errPecas } = await supabase
                .from('orcamento_pecas')
                .delete()
                .in('orcamento_id', idsVersoes);
            if (errPecas) console.error('Erro ao excluir peças do ambiente:', errPecas.message);

            // 2. Exclui os orçamentos (versões) do ambiente
            const { error: errOrcs } = await supabase
                .from('orcamentos')
                .delete()
                .in('id', idsVersoes);
            if (errOrcs) console.error('Erro ao excluir orçamentos do ambiente:', errOrcs.message);
        }

        // 3. Exclui o ambiente em si
        const { error: errAmb } = await supabase
            .from('ambientes')
            .delete()
            .eq('id', ambienteId);
        if (errAmb) {
            console.error('Erro ao excluir ambiente:', errAmb.message);
            // Reverte o optimistic update recarregando do banco
            recarregarAmbientes();
        }
    };

    // ── RENOMEAR AMBIENTE — persiste no Supabase ──────────────────────────────
    const salvarNomeAmbiente = async () => {
        if (!editingAmbNome) return;
        // Optimistic update
        setAmbientes(prev => prev.map(a =>
            a.id === editingAmbNome.id ? { ...a, nome: editingAmbNome.nome } : a
        ));
        setEditingAmbNome(null);
        // Persiste
        const { error } = await supabase
            .from('ambientes')
            .update({ nome: editingAmbNome.nome })
            .eq('id', editingAmbNome.id);
        if (error) {
            console.error('Erro ao renomear ambiente:', error.message);
            recarregarAmbientes();
        }
    };

    // ── DUPLICAR VERSÃO — local-only por enquanto ─────────────────────────────
    const mockDuplicarVersao = (e, ambienteId, versaoId) => {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            const base = amb.orcamentos.find(v => v.id === versaoId);
            if (!base) return amb;
            const novaVersao = duplicarVersao(base);
            return {
                ...amb,
                orcamentos: amb.orcamentos.flatMap(v => v.id === versaoId ? [v, novaVersao] : [v]),
            };
        }));
    };

    // ── EXCLUIR VERSÃO — persiste no Supabase (cascade: orcamento_pecas) ──────
    const mockRemoverVersao = async (e, ambienteId, versaoId) => {
        e.stopPropagation();
        if (!window.confirm('Excluir esta versão do orçamento?')) return;

        // Optimistic update
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return { ...amb, orcamentos: amb.orcamentos.filter(v => v.id !== versaoId) };
        }));
        setSelectedIds(p => p.filter(sid => sid !== versaoId));

        // 1. Exclui as peças desta versão
        const { error: errPecas } = await supabase
            .from('orcamento_pecas')
            .delete()
            .eq('orcamento_id', versaoId);
        if (errPecas) console.error('Erro ao excluir peças da versão:', errPecas.message);

        // 2. Exclui o orçamento (versão)
        const { error: errOrc } = await supabase
            .from('orcamentos')
            .delete()
            .eq('id', versaoId);
        if (errOrc) {
            console.error('Erro ao excluir versão:', errOrc.message);
            recarregarAmbientes();
        }
    };

    // ── BULK MATERIAL — atualiza material_id de todas as peças da versão ────
    const aplicarMaterialEmMassa = (ambId, versaoId) => {
        const matId = bulkMat[versaoId];
        if (!matId) return;
        const matNome = catMateriais.find(m => m.id === matId)?.nome || '';
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => ({
                        id:          p.id,
                        nome:        p.nome,
                        material_id: matId,
                        material:    matNome,
                        espessura:   p.espessura,
                        area:        p.area,
                        acabamento:  p.acabamento,
                        valor:       p.valor,
                        recortes:    p.recortes,
                    }));
                    return { ...v, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        setBulkMat(p => ({ ...p, [versaoId]: '' }));
    };

    // ── Carregar catálogos do Supabase ────────────────────────────────────────
    useEffect(() => {
        if (!profile?.empresa_id) return;
        Promise.all([
            supabase.from('materiais').select('id, nome').eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
            supabase.from('produtos_avulsos').select('id, nome, preco_unitario').eq('empresa_id', profile.empresa_id).eq('ativo', true).order('nome'),
        ]).then(([{ data: mats }, { data: prods }]) => {
            if (mats)  setCatMateriais(mats);
            if (prods) setCatProdAvulsos(prods);
        }).catch(() => {});
    }, [profile?.empresa_id]);

    // ── AVULSOS CRUD (local apenas — integração Supabase futura) ─────────────
    const adicionarAvulso = (ambId, versaoId) => {
        const sel  = novoAvulso[versaoId];
        if (!sel?.produto_id) return;
        const prod = catProdAvulsos.find(p => p.id === sel.produto_id);
        if (!prod) return;
        const qtd  = Number(sel.quantidade) || 1;
        const vu   = Number(prod.preco_unitario) || 0;
        const novo = clonarAvulso({ produto_id: prod.id, nome: prod.nome, quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu, id: 'tmp' });
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = [...(v.avulsos || []), novo];
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
        setNovoAvulso(p => ({ ...p, [versaoId]: { produto_id: '', quantidade: 1 } }));
    };

    const editarAvulso = (ambId, versaoId, avId, field, rawValue) => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = (v.avulsos || []).map(av => {
                        if (av.id !== avId) return av;
                        const qtd = field === 'quantidade'     ? Number(rawValue) : av.quantidade;
                        const vu  = field === 'valor_unitario' ? Number(rawValue) : av.valor_unitario;
                        return { id: av.id, produto_id: av.produto_id, nome: av.nome, quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu };
                    });
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
    };

    const removerAvulso = (ambId, versaoId, avId) => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novosAvulsos = (v.avulsos || []).filter(av => av.id !== avId);
                    return { ...v, avulsos: novosAvulsos, valor_total: calcTotal({ ...v, avulsos: novosAvulsos }) };
                }),
            };
        }));
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

    const salvarEdicaoVersao = () => {
        if (!editingVersao) return;
        const { ambId, versaoId, nomeAmb, nomeVersao, pecas: pecasEdit } = editingVersao;
        const matMap = Object.fromEntries(catMateriais.map(m => [m.id, m.nome]));
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambId) return amb;
            return {
                id:         amb.id,
                nome:       nomeAmb,
                status:     amb.status,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const novasPecas = (v.pecas || []).map(p => {
                        const ed = pecasEdit.find(ep => ep.id === p.id);
                        if (!ed) return p;
                        const matNome = matMap[ed.material_id] || p.material;
                        return { id: p.id, nome: ed.nome, material_id: ed.material_id, material: matNome, espessura: p.espessura, area: p.area, acabamento: p.acabamento, valor: p.valor, recortes: p.recortes };
                    });
                    return { ...v, nome: nomeVersao, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
        setEditingVersao(null);
    };

    const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const totalCarrinho = ambientes
        .flatMap(a => a.orcamentos)
        .filter(o => selectedIds.includes(o.id))
        .reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);

    // ── DUPLICAR PEÇA — local-only ────────────────────────────────────────────
    const mockDuplicarPeca = (e, ambienteId, versaoId, pecaId) => {
        e.stopPropagation();
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const orig = v.pecas.find(x => x.id === pecaId);
                    if (!orig) return v;
                    const copia = duplicarPeca(orig);
                    copia.nome = `${orig.nome} (Cópia)`;
                    const novasPecas = v.pecas.flatMap(x => x.id === pecaId ? [x, copia] : [x]);
                    return { ...v, pecas: novasPecas, valor_total: calcTotal({ ...v, pecas: novasPecas }) };
                }),
            };
        }));
    };

    // ── REMOVER PEÇA — persiste no Supabase ─────────────────────────────────
    const mockRemoverPeca = async (e, ambienteId, versaoId, pecaId) => {
        e.stopPropagation();

        // Optimistic update
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== versaoId) return v;
                    const newPecaList = v.pecas.filter(x => x.id !== pecaId);
                    const newTotal = newPecaList.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecaList, valor_total: newTotal };
                })
            };
        }));

        // Persiste no banco
        const { error } = await supabase
            .from('orcamento_pecas')
            .delete()
            .eq('id', pecaId);
        if (error) {
            console.error('Erro ao excluir peça:', error.message);
            recarregarAmbientes();
        }
    };

    const mockEditarPeca = (e, ambienteId, versaoId, peca) => {
        e.stopPropagation();
        setPecaEmEdicao({ ambienteId, versaoId, pecaId: peca.id, pecaData: JSON.parse(JSON.stringify(peca)) });
    };

    // ── ITENS MANUAIS — CRUD com persistência Supabase ────────────────────────
    const removerItemManual = async (e, ambienteId, orcamentoId, itemIndex) => {
        e.stopPropagation();
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const novosItens = versao.itens_manuais.filter((_, i) => i !== itemIndex);
        const novoTotal  = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )};
        }));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal })
            .eq('id', orcamentoId);
        if (error) { console.error('Erro ao remover item manual:', error.message); recarregarAmbientes(); }
    };

    const duplicarItemManual = async (e, ambienteId, orcamentoId, itemIndex) => {
        e.stopPropagation();
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const orig    = versao.itens_manuais[itemIndex];
        if (!orig) return;
        const copia   = { ...orig, nome_peca: orig.nome_peca ? `${orig.nome_peca} (Cópia)` : null };
        const novosItens = [...versao.itens_manuais];
        novosItens.splice(itemIndex + 1, 0, copia);
        const novoTotal  = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )};
        }));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal })
            .eq('id', orcamentoId);
        if (error) { console.error('Erro ao duplicar item manual:', error.message); recarregarAmbientes(); }
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

    const handleSalvarItemManual = async () => {
        if (!itemManualEmEdicao) return;
        const { ambienteId, orcamentoId, itemIndex, itemData } = itemManualEmEdicao;
        const versao = ambientes.find(a => a.id === ambienteId)?.orcamentos.find(o => o.id === orcamentoId);
        if (!versao) return;
        const itemAtualizado = {
            ...itemData,
            total: (parseFloat(itemData.quantidade) || 0) * (itemData.preco_unitario || 0),
        };
        const novosItens = versao.itens_manuais.map((it, i) => i === itemIndex ? itemAtualizado : it);
        const novoTotal  = novosItens.reduce((s, it) => s + (it.total || 0), 0);
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== ambienteId) return amb;
            return { ...amb, orcamentos: amb.orcamentos.map(v =>
                v.id !== orcamentoId ? v : { ...v, itens_manuais: novosItens, valor_total: novoTotal }
            )};
        }));
        const { error } = await supabase.from('orcamentos')
            .update({ itens_manuais: novosItens, valor_total: novoTotal })
            .eq('id', orcamentoId);
        if (error) { console.error('Erro ao salvar item manual:', error.message); recarregarAmbientes(); }
        setItemManualEmEdicao(null);
    };

    const handleSalvarEdicaoPeca = () => {
        setAmbientes(prev => prev.map(amb => {
            if (amb.id !== pecaEmEdicao.ambienteId) return amb;
            return {
                ...amb,
                orcamentos: amb.orcamentos.map(v => {
                    if (v.id !== pecaEmEdicao.versaoId) return v;
                    const newPecas = v.pecas.map(p => p.id === pecaEmEdicao.pecaId ? pecaEmEdicao.pecaData : p);
                    const novoValorTotal = newPecas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
                    return { ...v, pecas: newPecas, valor_total: novoValorTotal };
                })
            };
        }));
        setPecaEmEdicao(null);
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
    const [loadingPecasOrc,         setLoadingPecasOrc]         = useState({}); // { orcId: bool }

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
    const [pedidoFechado,      setPedidoFechado]      = useState(null);
    const [loadingPdf,         setLoadingPdf]         = useState(null);
    const [pdfModal,           setPdfModal]           = useState(null); // null | { tipo, orc?, defaults }

    const cancelarFecharPedido = () => { setModoFecharPedido(false); setFecharIds([]); setModalFechar(null); };
    const toggleFecharId = (orcId) => setFecharIds(p => p.includes(orcId) ? p.filter(x => x !== orcId) : [...p, orcId]);

    // Calcula data final dado N dias úteis a partir de hoje
    function calcDataFinalDiasUteis(dias) {
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

    // Calcula array de parcelas mensais a partir da data do primeiro vencimento
    function calcParcelas(total, qtd, primVenc) {
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

    async function confirmarFechamento() {
        if (!modalFechar || fecharIds.length === 0) return;
        const {
            forma_pagamento, parcelamento_tipo, parcelas_lista,
            prazo_tipo, prazo_data, prazo_dias,
        } = modalFechar;

        // Resolve data final do prazo
        const prazo_data_final = prazo_tipo === 'DIAS_UTEIS'
            ? calcDataFinalDiasUteis(prazo_dias)
            : prazo_data;
        if (!forma_pagamento || !prazo_data_final) return;

        const temParcelas = parcelamento_tipo === 'parcelado';

        // Calcula total selecionado
        const totalSel = fecharIds.reduce((s, oid) => {
            const orc = ambientes.flatMap(a => a.orcamentos ?? []).find(o => o.id === oid);
            return s + (orc?.valor_total ?? 0);
        }, 0);

        const parcelas_detalhes = temParcelas && parcelas_lista?.length > 0
            ? parcelas_lista
            : null;

        setLoadingFechar(true);
        try {
            // 1. Cria o pedido fechado
            const { data: pedido, error: ePedido } = await supabase
                .from('pedidos_fechados')
                .insert({
                    projeto_id:            id,
                    cenario_ids:           fecharIds,
                    forma_pagamento,
                    parcelas:              temParcelas ? (parcelas_lista?.length ?? null) : null,
                    parcelas_detalhes:     parcelas_detalhes ?? null,
                    prazo_entrega:         prazo_data_final,
                    prazo_entrega_tipo:    prazo_tipo,
                    prazo_entrega_valor:   prazo_tipo === 'DIAS_UTEIS' ? prazo_dias : null,
                    prazo_entrega_data_final: prazo_data_final,
                    status:                'FECHADO',
                    vendedor_id:           session?.user?.id,
                })
                .select('id').single();
            if (ePedido) throw new Error(ePedido.message);

            // 2. Atualiza status do projeto
            const { error: eProjeto } = await supabase
                .from('projetos').update({ status_pedido: 'FECHADO' }).eq('id', id);
            if (eProjeto) throw new Error(eProjeto.message);

            // 3. Soft delete nos cenários NÃO selecionados
            const todosOrcIds = ambientes.flatMap(amb => (amb.orcamentos ?? []).map(o => o.id));
            const descartarIds = todosOrcIds.filter(oid => !fecharIds.includes(oid));
            if (descartarIds.length > 0) {
                const { error: eDesc } = await supabase
                    .from('orcamentos').update({ descartado_em: new Date().toISOString() }).in('id', descartarIds);
                if (eDesc) console.error('[FecharPedido] Soft delete:', eDesc.message);
            }

            // 4. Notifica admins
            const clienteNome  = projeto?.clientes?.nome ?? projeto?.nome ?? '';
            const vendedorNome = profile?.nome ?? 'Vendedor';
            const { data: admins } = await supabase
                .from('profiles').select('id').eq('empresa_id', profile?.empresa_id).in('perfil', ['admin', 'master']);
            if (admins?.length) {
                await supabase.from('notificacoes').insert(
                    admins.filter(a => a.id !== session?.user?.id).map(a => ({
                        empresa_id: profile?.empresa_id,
                        usuario_id: a.id,
                        tipo:       'pedido_fechado',
                        titulo:     'Novo pedido fechado',
                        descricao:  `Cliente: ${clienteNome} · Vendedor: ${vendedorNome} · Valor: ${fmtBRL(totalSel)}`,
                        lida:       false,
                    }))
                );
            }

            setPedidoFechado({
                id: pedido.id, forma_pagamento, parcelas: temParcelas ? parcelas_lista?.length : null, parcelas_detalhes,
                prazo_entrega: prazo_data_final, prazo_entrega_tipo: prazo_tipo,
                prazo_entrega_valor: prazo_tipo === 'DIAS_UTEIS' ? prazo_dias : null,
                created_at: new Date().toISOString(),
            });
            cancelarFecharPedido();
            await recarregarAmbientes();
            setToastFechar('Pedido fechado com sucesso!');
            setTimeout(() => setToastFechar(''), 4000);
        } catch (err) {
            console.error('[FecharPedido]', err);
            alert('Erro ao fechar pedido: ' + err.message);
        } finally {
            setLoadingFechar(false);
        }
    }

    async function gerarPdfs(opts, modo) {
        if (!pedidoFechado?.id) return;
        setLoadingPdf('pedido');
        try {
            const incluirContrato = modo === 'pedido_contrato';

            // Busca peças frescas de todos os cenários do pedido
            const cenarioIds = pedidoFechado.cenario_ids ?? [];
            const todasPecas = [];
            for (const orcId of cenarioIds) {
                const pecas = await fetchPecasParaPdf(orcId);
                todasPecas.push(...pecas);
            }

            // Monta o orc unificado para o PDF de pedido
            const orcsSel = ambientes.flatMap(a => a.orcamentos ?? [])
                .filter(o => cenarioIds.includes(o.id));

            const orcUnificado = {
                id:                     pedidoFechado.id,
                nome:                   `Pedido #${pedidoFechado.id.slice(-8).toUpperCase()}`,
                pecas:                  todasPecas,
                itens_manuais:          orcsSel.flatMap(o => o.itens_manuais ?? []),
                valor_frete:            orcsSel.reduce((s, o) => s + (o.valor_frete ?? 0), 0),
                desconto_total:         orcsSel.reduce((s, o) => s + (o.desconto_total ?? 0), 0),
                majoramento_percentual: orcsSel[0]?.majoramento_percentual ?? 0,
                rt_percentual:          orcsSel[0]?.rt_percentual ?? 0,
                forma_pagamento:        pedidoFechado.forma_pagamento,
                parcelas:               pedidoFechado.parcelas,
                numero_serie:           `#${pedidoFechado.id.slice(-8).toUpperCase()}`,
                parcelas_detalhes:      pedidoFechado.parcelas_detalhes ?? null,
                valor_fechado:          pedidoFechado.valor_fechado     ?? null,
                data_fechamento:        pedidoFechado.created_at        ?? null,
            };

            const { gerarPdfPedidoFechado, gerarPdfContrato } = await import('../utils/gerarPdfOrcamento');

            await gerarPdfPedidoFechado({
                orc:          orcUnificado,
                projeto,
                ambientes,
                catMateriais,
                empresa:      empresaCtx ?? {},
                vendedorNome: profile?.nome ?? null,
                prazoEntrega: pedidoFechado.prazo_entrega ?? null,
                template:     opts,
            });

            if (incluirContrato) {
                // Contrato precisa do contrato_texto admin — busca do banco
                const { data: tplContrato } = await supabase
                    .from('pdf_templates').select('*')
                    .eq('empresa_id', profile?.empresa_id)
                    .eq('tipo', 'contrato').maybeSingle();
                await gerarPdfContrato({
                    pedido:   pedidoFechado,
                    projeto,
                    empresa:  empresaCtx ?? {},
                    template: tplContrato ?? null,
                });
            }

        } catch (err) {
            console.error('[PDF]', err);
            alert('Erro ao gerar PDF: ' + err.message);
        } finally {
            setLoadingPdf(null);
        }
    }

    async function openPdfModal(tipo, orc = null) {
        const { data: tpl } = await supabase
            .from('pdf_templates').select('*')
            .eq('empresa_id', profile?.empresa_id)
            .eq('tipo', tipo).maybeSingle();
        const defaults = loadPdfOpts(tipo, tpl ?? null);
        setPdfModal({ tipo, orc, defaults });
    }

    async function handlePdfConfirm(opts, modo) {
        savePdfOpts(pdfModal.tipo, opts);
        const mTipo = pdfModal.tipo;
        const mOrc  = pdfModal.orc ?? null;
        setPdfModal(null);

        if (mTipo === 'orcamento') {
            setLoadingPdf('orcamento');
            try {
                const pecasFrescas = await fetchPecasParaPdf(mOrc.id);
                if (pecasFrescas.length === 0) {
                    alert('Este orçamento não possui peças cadastradas. Verifique se as peças foram salvas corretamente no banco de dados.');
                    return;
                }
                const params = {
                    orc:          { ...mOrc, pecas: pecasFrescas },
                    projeto,
                    ambientes,
                    catMateriais,
                    empresa:      empresaCtx ?? {},
                    vendedorNome: profile?.nome ?? null,
                    template:     opts,
                };
                if (modo === 'bw') {
                    const { gerarPdfOrcamentoImpressao } = await import('../utils/gerarPdfOrcamento');
                    await gerarPdfOrcamentoImpressao(params);
                } else {
                    const { gerarPdfOrcamento } = await import('../utils/gerarPdfOrcamento');
                    await gerarPdfOrcamento(params);
                }
            } catch (e) {
                console.error('[PDF]', e);
                alert('Erro ao gerar PDF: ' + e.message);
            } finally {
                setLoadingPdf(null);
            }
        } else {
            await gerarPdfs(opts, modo);
        }
    }

    async function reverterParaOrcamento() {
        if (!pedidoFechado?.id) return;
        if (!window.confirm('Reverter pedido para status de orçamento? Os cenários descartados ainda dentro do prazo de 7 dias serão restaurados.')) return;
        try {
            // Reverte pedido
            await supabase.from('pedidos_fechados').update({ status: 'REVERTIDO' }).eq('id', pedidoFechado.id);
            // Reverte status do projeto
            await supabase.from('projetos').update({ status_pedido: 'ORCAMENTO' }).eq('id', id);
            // Restaura cenários descartados dentro dos 7 dias via ambientes do projeto
            const ambIds = ambientes.map(a => a.id);
            if (ambIds.length) {
                const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                await supabase.from('orcamentos')
                    .update({ descartado_em: null })
                    .in('ambiente_id', ambIds)
                    .not('descartado_em', 'is', null)
                    .gt('descartado_em', limite);
            }
            // Notifica o vendedor
            if (pedidoFechado.vendedor_id && pedidoFechado.vendedor_id !== session?.user?.id) {
                await supabase.from('notificacoes').insert({
                    empresa_id: profile?.empresa_id,
                    usuario_id: pedidoFechado.vendedor_id,
                    tipo:       'pedido_revertido',
                    titulo:     'Pedido revertido para orçamento',
                    descricao:  `O pedido do projeto ${projeto?.nome ?? ''} foi revertido para status de orçamento pelo admin.`,
                    lida:       false,
                });
            }
            setPedidoFechado(null);
            await recarregarAmbientes();
        } catch (err) {
            alert('Erro ao reverter: ' + err.message);
        }
    }

    // Carrega pedido fechado ativo ao abrir a aba
    useEffect(() => {
        if (activeTab !== 'carrinho' || !id) return;
        supabase.from('pedidos_fechados')
            .select('*')
            .eq('projeto_id', id)
            .eq('status', 'FECHADO')
            .order('created_at', { ascending: false })
            .limit(1)
            .then(({ data }) => { if (data?.[0]) setPedidoFechado(data[0]); });
    }, [activeTab, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Refetch quando o usuário abre a aba Carrinho
    useEffect(() => {
        if (activeTab === 'carrinho') recarregarAmbientes();
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Fetch completo de peças para geração de PDF (sempre fresh do banco) ──────
    async function fetchPecasParaPdf(orcId) {
        const { data, error } = await supabase
            .from('orcamento_pecas')
            .select('*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)')
            .eq('orcamento_id', orcId);
        if (error) throw error;
        return (data ?? []).map((op, idx) => ({
            id:                op.id,
            nome:              op.pecas?.nome_livre ?? `Peça ${idx + 1}`,
            material:          'Material Padrão',
            material_id:       op.material_id ?? '',
            espessura:         op.pecas?.espessura_cm != null ? `${op.pecas.espessura_cm}` : '—',
            area:              op.pecas?.area_liquida_m2 ?? null,
            acabamento:        '—',
            valor:             op.valor_total ?? 0,
            valor_acabamentos: op.valor_acabamentos ?? 0,
            recortes:          [],
            ambiente_id:       op.pecas?.ambiente_id ?? null,
            item_nome:         op.item_nome ?? op.pecas?.dimensoes?.item_nome ?? null,
            acabamentos:       op.acabamentos ?? [],
        }));
    }

    // Busca as peças de um orçamento específico sob demanda (lazy load)
    async function fetchPecasParaOrcamento(orcId) {
        setLoadingPecasOrc(prev => ({ ...prev, [orcId]: true }));
        const { data, error } = await supabase
            .from('orcamento_pecas')
            .select('*, pecas(nome_livre, area_liquida_m2, espessura_cm, ambiente_id, dimensoes)')
            .eq('orcamento_id', orcId);
        if (!error && data) {
            setAmbientes(prev => prev.map(amb => ({
                ...amb,
                orcamentos: (amb.orcamentos ?? []).map(o => {
                    if (o.id !== orcId) return o;
                    return {
                        ...o,
                        pecas: data.map((op, idx) => ({
                            id:                op.id,
                            nome:              op.pecas?.nome_livre ?? `Peça ${idx + 1}`,
                            material:          'Material Padrão',
                            material_id:       op.material_id ?? '',
                            espessura:         op.pecas?.espessura_cm != null ? `${op.pecas.espessura_cm}` : '—',
                            area:              op.pecas?.area_liquida_m2 ?? null,
                            acabamento:        '—',
                            valor:             op.valor_total ?? 0,
                            valor_acabamentos: op.valor_acabamentos ?? 0,
                            recortes:          [],
                            ambiente_id:       op.pecas?.ambiente_id ?? null,
                            item_nome:         op.item_nome ?? op.pecas?.dimensoes?.item_nome ?? null,
                            acabamentos:       op.acabamentos ?? [],
                        })),
                    };
                }),
            })));
        } else if (error) {
            console.error('[lazy pecas]', error.message);
        }
        setLoadingPecasOrc(prev => ({ ...prev, [orcId]: false }));
    }

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

    async function excluirOrcamentoCarrinho(orcId) {
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).filter(o => o.id !== orcId),
        })));
        const { error } = await supabase.from('orcamentos').delete().eq('id', orcId);
        if (error) { console.error('Erro ao excluir orçamento:', error.message); recarregarAmbientes(); }
    }

    async function duplicarOrcamentoCarrinho(orc, ambId) {
        const novoId = crypto.randomUUID();
        const novoNome = `${orc.nome ?? orc.nome_versao ?? 'Orçamento'} (Cópia)`;
        const { error } = await supabase.from('orcamentos').insert({
            id:            novoId,
            ambiente_id:   ambId,
            empresa_id:    profile?.empresa_id ?? null,
            vendedor_id:   session?.user?.id ?? null,
            nome_versao:   novoNome,
            valor_total:   orc.valor_total ?? 0,
            desconto_total: orc.desconto_total ?? 0,
            status:        orc.status ?? 'rascunho',
            itens_manuais: orc.itens_manuais ?? [],
        });
        if (error) { console.error('Erro ao duplicar orçamento:', error.message); return; }
        recarregarAmbientes();
    }

    async function salvarNomeOrcamentoCarrinho(orcId, nome) {
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId ? { ...o, nome: nome, nome_versao: nome } : o
            ),
        })));
        setCarrinhoEditandoNome(null);
        await supabase.from('orcamentos').update({ nome_versao: nome }).eq('id', orcId);
    }

    // Calcula o fator combinado e os valores derivados de majoramento + RT + frete
    function calcAjustes(orc) {
        const maj   = Number(orc.majoramento_percentual ?? 0);
        const rt    = Number(orc.rt_percentual ?? 0);
        const frete = Number(orc.valor_frete ?? 0);
        const fator = (1 + maj / 100) * (1 + rt / 100);
        const custoBase     = orc.valor_total ?? 0;
        const valorMajorado = custoBase * (1 + maj / 100);
        const valorRt       = valorMajorado * (rt / 100);
        const totalVenda    = custoBase * fator + frete;      // frete soma ao total de venda
        return { maj, rt, frete, fator, custoBase, valorMajorado, valorRt, totalVenda };
    }

    async function salvarDescontoCarrinho(orcId, valorStr, tipo) {
        // Recupera o orcamento para calcular subtotal
        const todos = ambientes.flatMap(a => a.orcamentos);
        const orc   = todos.find(o => o.id === orcId);
        if (!orc) return;
        const subtotal = (orc.valor_total ?? 0) + (orc.desconto_total ?? 0); // subtotal original
        const val = parseFloat(String(valorStr).replace(',', '.')) || 0;
        const desconto = tipo === '%'
            ? Math.min(subtotal * val / 100, subtotal)
            : Math.min(val, subtotal);
        const novoTotal = Math.max(0, subtotal - desconto);

        // Optimistic update
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId ? { ...o, desconto_total: desconto, valor_total: novoTotal } : o
            ),
        })));
        setCarrinhoEditandoDesconto(null);

        const { error } = await supabase.from('orcamentos')
            .update({ desconto_total: desconto, valor_total: novoTotal })
            .eq('id', orcId);
        if (error) { console.error('Erro ao salvar desconto:', error.message); recarregarAmbientes(); }
    }

    async function salvarAjustesCarrinho(orcId, majStr, rtStr, rtNome, freteStr) {
        const newMaj   = Math.max(0, parseFloat(String(majStr).replace(',', '.'))   || 0);
        const newRt    = Math.max(0, parseFloat(String(rtStr).replace(',', '.'))    || 0);
        const newFrete = Math.max(0, parseFloat(String(freteStr).replace(',', '.')) || 0);
        setCarrinhoEditandoAjustes(null);
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            orcamentos: (amb.orcamentos ?? []).map(o =>
                o.id === orcId
                    ? { ...o, majoramento_percentual: newMaj, rt_percentual: newRt, rt_arquiteto_nome: rtNome || '', valor_frete: newFrete }
                    : o
            ),
        })));
        const { error } = await supabase.from('orcamentos').update({
            majoramento_percentual: newMaj,
            rt_percentual:          newRt,
            rt_arquiteto_nome:      rtNome || null,
            valor_frete:            newFrete,
        }).eq('id', orcId);
        if (error) { console.error('Erro ao salvar ajustes:', error.message); recarregarAmbientes(); }
    }

    async function mesclarCenarios() {
        const nome = modalMesclar?.nome?.trim() || 'Mesclado';
        if (mesclarIds.length < 2) return;
        setLoadingMesclar(true);
        try {
            // Monta lista com ambiente_id correto vindo do estado local (amb.id = pai)
            const orcsSel = ambientes.flatMap(amb =>
                (amb.orcamentos ?? [])
                    .filter(o => mesclarIds.includes(o.id))
                    .map(o => ({ ...o, ambiente_id: amb.id, ambiente_nome: amb.nome }))
            );

            if (orcsSel.length < 2) throw new Error('Selecione ao menos 2 cenários.');

            // Busca peças e itens manuais frescos do banco
            const { data: pecasDB, error: ePecas } = await supabase
                .from('orcamento_pecas')
                .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total, orcamento_id')
                .in('orcamento_id', mesclarIds);
            if (ePecas) throw new Error(ePecas.message);

            const { data: orcsData, error: eOrcs } = await supabase
                .from('orcamentos')
                .select('id, itens_manuais')
                .in('id', mesclarIds);
            if (eOrcs) throw new Error(eOrcs.message);

            const itensManPorOrc = {};
            (orcsData || []).forEach(o => {
                itensManPorOrc[o.id] = Array.isArray(o.itens_manuais) ? o.itens_manuais : [];
            });

            // Consolida todas as peças (remove orcamento_id para reinserir depois) e itens manuais
            const todasPecas = (pecasDB || []).map(({ orcamento_id: _oid, ...p }) => p);
            const todosItens  = (orcsData || []).flatMap(o => itensManPorOrc[o.id] || []);
            const valorDB     = todasPecas.reduce((s, p) => s + (p.valor_total || 0), 0);
            const valorManual = todosItens.reduce((s, p) => s + (p.total || p.preco_unitario || 0), 0);
            const valorTotal  = valorDB + valorManual;

            // ambiente_id do primeiro orçamento selecionado (agora sempre preenchido)
            const primeiroAmbId = orcsSel[0].ambiente_id;
            if (!primeiroAmbId) throw new Error('ambiente_id não encontrado nos cenários selecionados.');

            // Resumo de nomes para o nome da versão
            const ambNames   = [...new Set(orcsSel.map(o => o.ambiente_nome))].join(' + ');
            const nomeVersao = `${nome} (${ambNames})`;

            const { data: novoOrc, error: eNew } = await supabase
                .from('orcamentos')
                .insert({
                    empresa_id:    profile?.empresa_id,
                    ambiente_id:   primeiroAmbId,
                    vendedor_id:   session?.user?.id,
                    nome_versao:   nomeVersao,
                    status:        'rascunho',
                    desconto_total: 0,
                    valor_total:   valorTotal,
                    itens_manuais: todosItens.length ? todosItens : [],
                })
                .select('id').single();
            if (eNew) throw new Error(eNew.message);

            if (todasPecas.length) {
                const { error: eIns } = await supabase
                    .from('orcamento_pecas')
                    .insert(todasPecas.map(p => ({ ...p, orcamento_id: novoOrc.id })));
                if (eIns) throw new Error(eIns.message);
            }

            setOrcsMesclados(prev => new Set([...prev, novoOrc.id]));
            cancelarMesclar();
            await recarregarAmbientes();
            setToastMesclar(`Cenário "${nomeVersao}" criado com sucesso!`);
            setTimeout(() => setToastMesclar(''), 3500);
        } catch (err) {
            console.error('[Mesclar]', err);
            alert('Erro ao mesclar: ' + err.message);
        } finally {
            setLoadingMesclar(false);
        }
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

    // Lista de medidores da empresa — busca na tabela profiles
    const [medidores, setMedidores] = useState([]);

    useEffect(() => {
        console.log('[medidores] Empresa ID logado:', profile?.empresa_id);
        // Monta a query base — filtra por role obrigatoriamente
        let query = supabase
            .from('profiles')
            .select('id, full_name')
            .eq('role', 'medidor')
            .order('full_name');

        // Aplica filtro de empresa somente se o campo estiver disponível
        if (profile?.empresa_id) {
            query = query.eq('empresa_id', profile.empresa_id);
        } else {
            console.warn('[medidores] empresa_id nulo — buscando todos os medidores sem filtro de empresa (modo diagnóstico)');
        }

        query.then(({ data, error }) => {
            if (error) console.error('[medidores] Erro ao buscar:', error);
            console.log('[medidores] Resultado:', data);
            if (data) setMedidores(data);
        });
    }, [profile?.empresa_id]);

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

    async function handleSalvarStatus() {
        if (!id || !novoStatus) return;
        const { error } = await supabase
            .from('projetos')
            .update({ status: novoStatus })
            .eq('id', id);
        if (error) { alert(`Erro ao atualizar status: ${error.message}`); return; }
        setProjeto(prev => prev ? { ...prev, status: novoStatus } : prev);
        closeAll();
    }

    async function handleMarcarPerdido() {
        if (!id) return;
        const { error } = await supabase
            .from('projetos')
            .update({ status: 'perdido', motivo_perda: motivoPerda || null })
            .eq('id', id);
        if (error) { alert(`Erro: ${error.message}`); return; }
        setProjeto(prev => prev ? { ...prev, status: 'perdido' } : prev);
        setMotivoPerda('');
        closeAll();
    }

    async function handleAgendarMedicao() {
        setErroAgendar('');

        // Guard explícito: medidor deve ser um UUID não-vazio
        if (!agMedidor) {
            alert('Erro: Selecione um medidor na lista antes de salvar.');
            return;
        }
        if (!agData) {
            setErroAgendar('Selecione a data e hora da medição.');
            return;
        }
        if (!id) {
            setErroAgendar('ID do projeto inválido. Recarregue a página.');
            return;
        }

        // Fallback de empresa_id: usa o do perfil ou o ID fixo da empresa
        const EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001';
        const empresaId = profile?.empresa_id ?? EMPRESA_ID_FALLBACK;

        // datetime-local retorna "YYYY-MM-DDTHH:mm" — converter para ISO 8601 completo
        const dataAgendadaISO = new Date(agData).toISOString();

        const medidorSelecionado = medidores.find(m => m.id === agMedidor);
        const nomeResponsavel = medidorSelecionado?.full_name ?? '';

        console.log('DEBUG AGENDAMENTO:', { projeto_id: id, medidor_id: agMedidor, empresa_id: empresaId, editingMedicaoId });

        const formatarParaLista = (m) => ({
            ...m,
            data: new Date(m.data_medicao).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            medidor: m.responsavel ?? '—',
        });

        setAgendando(true);

        if (editingMedicaoId) {
            // ── UPDATE ──────────────────────────────────────────────────────
            // Se quem salva é um medidor, a medição é automaticamente concluída
            const isMedidor = profile?.role === 'medidor';
            const updatePayload = {
                medidor_id:          agMedidor,
                responsavel:         nomeResponsavel,
                data_medicao:        dataAgendadaISO,
                endereco:            enderecoCompleto || null,
                observacoes_acesso:  agObservacoes.trim() || null,
                ...(isMedidor ? { status: 'concluida' } : {}),
            };

            const { data: updated, error: errUpd } = await supabase
                .from('medicoes')
                .update(updatePayload)
                .eq('id', editingMedicaoId)
                .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
                .single();

            if (errUpd) {
                console.error('[medicoes] Erro ao editar:', errUpd);
                setErroAgendar(`Erro: ${errUpd.message}`);
                setAgendando(false);
                return;
            }

            setMedicoes(prev => prev.map(m => m.id === editingMedicaoId ? formatarParaLista(updated) : m));

            // Notifica o vendedor quando o medidor conclui a medição
            if (isMedidor) {
                const EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001';
                const vendedorId = projeto?.vendedor_id;
                const usuarioAtualId = session?.user?.id;
                if (vendedorId && vendedorId !== usuarioAtualId) {
                    await supabase.from('notificacoes').insert({
                        empresa_id: projeto?.empresa_id ?? EMPRESA_ID_FALLBACK,
                        usuario_id: vendedorId,
                        tipo:       'medicao_agendada',
                        titulo:     'Medição concluída',
                        descricao:  `A medição do projeto ${projeto?.nome ?? ''} foi finalizada e já está disponível para orçamento.`,
                        lida:       false,
                    });
                }
            }
        } else {
            // ── INSERT ──────────────────────────────────────────────────────
            const { data: med, error: errMed } = await supabase
                .from('medicoes')
                .insert({
                    projeto_id:         id,
                    empresa_id:         empresaId,
                    medidor_id:         agMedidor,
                    responsavel:        nomeResponsavel,
                    data_medicao:       dataAgendadaISO,
                    endereco:           enderecoCompleto || null,
                    observacoes_acesso: agObservacoes.trim() || null,
                    status:             'agendada',
                })
                .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
                .single();

            if (errMed) {
                console.error('[medicoes] Erro ao agendar (objeto completo):', errMed);
                setErroAgendar(`Erro: ${errMed.message}`);
                setAgendando(false);
                return;
            }

            setMedicoes(prev => [formatarParaLista(med), ...prev]);
        }

        setAgendando(false);
        closeAll();
    }

    // ════════════════════════════════════════════════════════════════════════
    // SAFETY GUARD — impede renderização com dados nulos
    // Se qualquer uma dessas condições for verdadeira, a tela preta é impossível
    // ════════════════════════════════════════════════════════════════════════
    // Loading: aguarda auth + perfil + busca do projeto
    if (authLoading || profileLoading || loadingProjeto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-zinc-500">
                    <iconify-icon icon="solar:spinner-linear" width="40" className="animate-spin text-yellow-400"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest">Carregando dados do projeto...</p>
                </div>
            </div>
        );
    }

    // Loading terminou mas projeto não foi encontrado (ID inválido, acesso negado, etc.)
    if (!projeto) {
        return (
            <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
                <div className="text-center gap-4 flex flex-col">
                    <p className="font-mono text-xs text-zinc-500">Projeto não encontrado ou acesso negado.</p>
                    <button onClick={() => navigate('/projetos')} className="text-[10px] uppercase font-mono text-yellow-400 border border-yellow-400/20 px-4 py-2 hover:bg-yellow-400/10 transition-colors">Voltar para Projetos</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-yellow-400/30">


            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
            <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

            <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-64">
                {/* ── Breadcrumb ─────────────────────────────────────────── */}
                <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
                    <span onClick={() => navigate('/projetos')} className="hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
                    <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
                    <span className="text-zinc-400">{projeto?.nome ?? '—'}</span>
                </div>

                {/* ── Header do Projeto ──────────────────────────────────── */}
                <section className="sys-reveal mb-8">
                    <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                            {/* Info */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-white tracking-tighter">{projeto?.nome ?? '—'}</h1>
                                    <StatusPill status={projeto?.status ?? 'aprovado'} />
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                                    <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <a href={`/clientes/${projeto?.cliente?.id}`} className="hover:text-yellow-400 transition-colors">
                                        {projeto?.cliente?.nome ?? '—'}
                                    </a>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto?.criado_em ?? '—'}</span>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:user-id-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span>{projeto?.vendedor ?? '—'}</span>
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => { setNovoStatus(projeto?.status ?? 'orcado'); setModalStatus(true); }}
                                    className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors"
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
                <div className="sys-reveal sys-delay-100 flex border-b border-zinc-800 mb-6">
                    {[
                        { id: 'medicoes',   label: 'Medições',  icon: 'solar:ruler-pen-linear'              },
                        { id: 'carrinho',   label: 'Carrinho',  icon: 'solar:cart-large-minimalistic-linear' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-yellow-400 text-white'
                                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
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
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
                                01 // Medições
                            </div>
                            <button
                                onClick={() => setModalAgendar(true)}
                                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
                            >
                                <iconify-icon icon="solar:calendar-add-linear" width="14"></iconify-icon>
                                Agendar medição
                            </button>
                        </div>

                        <div className="bg-[#0a0a0a] border border-zinc-800">
                            {/* Cabeçalho tabela */}
                            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Medidor</span>
                                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Ação</span>
                            </div>

                            {(medicoes ?? []).map((m, i) => {
                                const isAprovada = m?.status === 'aprovada' || m?.status === 'concluida';
                                return (
                                <div
                                    key={m?.id}
                                    className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors ${
                                        isAprovada
                                            ? 'bg-green-400/[0.03] border-l-2 border-l-green-500/50 hover:bg-green-400/[0.05]'
                                            : 'hover:bg-white/[0.01]'
                                    } ${i < (medicoes?.length ?? 0) - 1 ? 'border-b border-zinc-900' : ''}`}
                                >
                                    <div className="col-span-4 flex items-start gap-2">
                                        <iconify-icon
                                            icon={isAprovada ? 'solar:check-circle-linear' : 'solar:calendar-linear'}
                                            width="13"
                                            className={`mt-0.5 shrink-0 ${isAprovada ? 'text-green-500' : 'text-zinc-600'}`}
                                        ></iconify-icon>
                                        <div className="flex flex-col">
                                            <span className="text-sm text-white font-medium">{m?.data ?? '—'}</span>
                                            {isAprovada && (
                                                <span className="font-mono text-[9px] text-green-500/70 uppercase tracking-widest">Aguardando orçamento</span>
                                            )}
                                            {!isAprovada && m?.endereco && (
                                                <span className="font-mono text-[9px] text-zinc-600 truncate max-w-[140px]">{m.endereco}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-span-3 font-mono text-[11px] text-zinc-500">{m?.medidor ?? '—'}</div>
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
                                                        : 'border-zinc-700 text-zinc-400 hover:border-white hover:text-white'
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
                                                className="w-7 h-7 flex items-center justify-center border border-zinc-800 text-zinc-500 hover:border-zinc-400 hover:text-white transition-colors"
                                            >
                                                <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                                            </button>
                                            <button
                                                onClick={() => handleExcluirMedicao(m)}
                                                title="Excluir medição"
                                                className="w-7 h-7 flex items-center justify-center border border-zinc-800 text-zinc-500 hover:border-red-400/50 hover:text-red-400 transition-colors"
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
                                    <iconify-icon icon="solar:ruler-pen-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhuma medição ainda</p>
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
                                                <div className="font-mono text-[10px] text-zinc-500 mt-0.5 truncate">
                                                    {pedidoFechado.forma_pagamento}
                                                    {pedidoFechado.parcelas ? ` · ${pedidoFechado.parcelas}x` : ''}
                                                    {pedidoFechado.prazo_entrega ? ` · Entrega: ${new Date(pedidoFechado.prazo_entrega).toLocaleDateString('pt-BR')}` : ''}
                                                    {pedidoFechado.created_at ? ` · Fechado em ${new Date(pedidoFechado.created_at).toLocaleDateString('pt-BR')}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => openPdfModal('pedido')}
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
                                <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
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
                                            <button onClick={cancelarMesclar} className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-white hover:text-white transition-colors">
                                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={() => setModalMesclar({ nome: 'Cenário Mesclado' })}
                                                disabled={mesclarIds.length < 2}
                                                className="flex items-center gap-1.5 bg-orange-500 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 hover:bg-orange-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                                            className="flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-bold font-mono uppercase tracking-widest px-3 py-1 hover:bg-blue-500 transition-colors"
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
                                            <button onClick={cancelarFecharPedido} className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-3 py-1 hover:border-white hover:text-white transition-colors">
                                                <iconify-icon icon="solar:close-linear" width="12"></iconify-icon>
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={() => setModalFechar({ forma_pagamento: 'a_vista', parcelamento_tipo: 'a_vista', parcelas_lista: [], parcelas: 2, prazo_entrega: '' })}
                                                disabled={fecharIds.length < 1}
                                                className="flex items-center gap-1.5 bg-green-600 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 hover:bg-green-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                                <div className="bg-[#0a0a0a] border border-zinc-800 px-6 py-16 text-center">
                                    <iconify-icon icon="solar:cart-large-minimalistic-linear" width="36" className="text-zinc-800 mb-4 block mx-auto"></iconify-icon>
                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Nenhum orçamento salvo ainda</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {orcamentosCarrinho.map((orc, idx) => {
                                        const nPecas = (orc.pecas?.length ?? 0) + (orc.itens_manuais?.length ?? 0);
                                        const statusCfg = STATUS_CONFIG[orc.status] ?? STATUS_CONFIG.orcado;
                                        const isExp = !!carrinhoExpandido[orc.id];
                                        const isEditNome = carrinhoEditandoNome?.id === orc.id;
                                        const nomeAtual = orc.nome ?? orc.nome_versao ?? 'Orçamento';
                                        const ajustes = calcAjustes(orc);
                                        const temAjustes = ajustes.maj > 0 || ajustes.rt > 0 || ajustes.frete > 0;
                                        const arquitetoNomeProjeto = projeto?.arquitetos?.nome ?? null;
                                        const isMesclarChecked = mesclarIds.includes(orc.id);
                                        const isFecharChecked  = fecharIds.includes(orc.id);
                                        const isDescartado     = !!orc.descartado_em;

                                        return (
                                            <div
                                                key={orc.id}
                                                className={`bg-[#0a0a0a] border transition-colors
                                                    ${modoMesclar && isMesclarChecked ? 'border-orange-500/60 bg-orange-400/5' : ''}
                                                    ${modoFecharPedido && isFecharChecked ? 'border-green-500/60 bg-green-400/5' : ''}
                                                    ${!modoMesclar && !modoFecharPedido ? 'border-zinc-800' : ''}
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
                                                <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-900">
                                                    {/* Checkbox mesclar (laranja) */}
                                                    {modoMesclar && (
                                                        <div
                                                            className={`w-4 h-4 flex items-center justify-center shrink-0 border transition-colors ${isMesclarChecked ? 'border-orange-400 bg-orange-400/20' : 'border-zinc-600 hover:border-orange-400'}`}
                                                            onClick={e => { e.stopPropagation(); toggleMesclarId(orc.id); }}
                                                        >
                                                            {isMesclarChecked && <iconify-icon icon="solar:check-read-linear" width="10" className="text-orange-400"></iconify-icon>}
                                                        </div>
                                                    )}
                                                    {/* Checkbox fechar pedido (verde) */}
                                                    {modoFecharPedido && (
                                                        <div
                                                            className={`w-4 h-4 flex items-center justify-center shrink-0 border transition-colors ${isFecharChecked ? 'border-green-400 bg-green-400/20' : 'border-zinc-600 hover:border-green-400'}`}
                                                            onClick={e => { e.stopPropagation(); toggleFecharId(orc.id); }}
                                                        >
                                                            {isFecharChecked && <iconify-icon icon="solar:check-read-linear" width="10" className="text-green-400"></iconify-icon>}
                                                        </div>
                                                    )}
                                                    <span className="font-mono text-[9px] text-zinc-600 shrink-0">
                                                        #{String(idx + 1).padStart(2, '0')}
                                                    </span>

                                                    {/* Nome editável */}
                                                    {isEditNome ? (
                                                        <input
                                                            autoFocus
                                                            value={carrinhoEditandoNome.nome}
                                                            onChange={e => setCarrinhoEditandoNome(prev => ({ ...prev, nome: e.target.value }))}
                                                            onBlur={() => salvarNomeOrcamentoCarrinho(orc.id, carrinhoEditandoNome.nome)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') salvarNomeOrcamentoCarrinho(orc.id, carrinhoEditandoNome.nome);
                                                                if (e.key === 'Escape') setCarrinhoEditandoNome(null);
                                                            }}
                                                            className="flex-1 bg-black border-b border-yellow-400 text-white text-sm font-bold outline-none px-1 min-w-0"
                                                        />
                                                    ) : (
                                                        <span className="flex-1 flex items-center gap-2 min-w-0">
                                                            <span className={`text-sm font-semibold tracking-tight truncate ${modoMesclar && isMesclarChecked ? 'text-orange-300' : 'text-white'}`}>
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
                                                            <div className="font-mono text-[9px] text-zinc-600 line-through">
                                                                {fmtBRL(((orc.valor_total ?? 0) + (orc.desconto_total ?? 0)) * ajustes.fator)}
                                                            </div>
                                                        )}
                                                        {temAjustes && !orc.desconto_total && (
                                                            <div className="font-mono text-[9px] text-zinc-600 line-through">
                                                                {fmtBRL(orc.valor_total)}
                                                            </div>
                                                        )}
                                                        <span className="font-mono text-sm font-bold text-yellow-400">
                                                            {fmtBRL(ajustes.totalVenda)}
                                                        </span>
                                                    </div>

                                                    {/* Ações do card */}
                                                    <div className="flex items-center gap-0.5 border-l border-zinc-800 pl-3 shrink-0">
                                                        <button
                                                            onClick={() => setCarrinhoEditandoNome({ id: orc.id, nome: nomeAtual })}
                                                            title="Editar nome"
                                                            className="p-1.5 rounded text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                                        >
                                                            <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                                                        </button>
                                                        <button
                                                            onClick={() => duplicarOrcamentoCarrinho(orc, orc.ambiente_id)}
                                                            title="Duplicar"
                                                            className="p-1.5 rounded text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                                        >
                                                            <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                                                        </button>
                                                        <button
                                                            onClick={() => excluirOrcamentoCarrinho(orc.id)}
                                                            title="Excluir"
                                                            className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                        >
                                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* ── Linha única: metadata + TODOS os botões ── */}
                                                <div className="px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                                                    {/* Metadata compacta */}
                                                    <div className="flex items-center gap-3 flex-wrap min-w-0 text-zinc-500">
                                                        <div className="flex items-center gap-1 text-[10px]">
                                                            <iconify-icon icon="solar:layers-minimalistic-linear" width="11" className="text-zinc-700"></iconify-icon>
                                                            {orc.ambiente_nome ?? 'Ambiente'}
                                                        </div>
                                                        {nPecas > 0 && (
                                                            <div className="flex items-center gap-1 text-[10px]">
                                                                <iconify-icon icon="solar:box-linear" width="11" className="text-zinc-700"></iconify-icon>
                                                                {nPecas}
                                                            </div>
                                                        )}
                                                        {orc.data && (
                                                            <span className="font-mono text-[10px] text-zinc-700">{orc.data}</span>
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
                                                            className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest px-2 py-1 border transition-colors ${isExp ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                                                        >
                                                            <iconify-icon icon={isExp ? 'solar:alt-arrow-up-linear' : 'solar:eye-linear'} width="11"></iconify-icon>
                                                            {isExp ? 'Fechar' : 'Detalhes'}
                                                        </button>
                                                        {/* PDF */}
                                                        <button
                                                            onClick={() => openPdfModal('orcamento', orc)}
                                                            disabled={!!loadingPdf}
                                                            className="flex items-center gap-1 border border-zinc-800 text-zinc-500 text-[10px] font-mono uppercase tracking-widest px-2 py-1 hover:border-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40"
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
                                                        <div className="w-px h-4 bg-zinc-800 mx-0.5"></div>

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
                                                    <div className="px-5 py-4 border-t border-zinc-800/60 bg-zinc-950/40">
                                                        <div className="flex items-end gap-3 flex-wrap">
                                                            <div className="flex flex-col gap-1">
                                                                <label className="font-mono text-[9px] uppercase tracking-widest text-purple-400/70">Valor do desconto</label>
                                                                <div className="flex items-center gap-1.5">
                                                                    <input
                                                                        type="number" min="0" step="0.01"
                                                                        value={carrinhoEditandoDesconto.valor}
                                                                        onChange={e => setCarrinhoEditandoDesconto(prev => ({ ...prev, valor: e.target.value }))}
                                                                        placeholder="0"
                                                                        className="w-28 bg-black border border-purple-700/40 text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-purple-500/60"
                                                                        autoFocus
                                                                    />
                                                                    <button
                                                                        onClick={() => setCarrinhoEditandoDesconto(prev => ({ ...prev, tipo: prev.tipo === '%' ? 'R$' : '%' }))}
                                                                        className="font-mono text-[10px] border border-zinc-700 px-2 py-1.5 text-zinc-400 hover:border-white hover:text-white transition-colors"
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
                                                                <button onClick={() => salvarDescontoCarrinho(orc.id, carrinhoEditandoDesconto.valor, carrinhoEditandoDesconto.tipo)} className="font-mono text-[10px] border border-yellow-400/40 text-yellow-400 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors uppercase tracking-widest">Salvar</button>
                                                                <button onClick={() => setCarrinhoEditandoDesconto(null)} className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-3 py-1.5 hover:border-white hover:text-white transition-colors">✕</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Dropdown: Ajustes de Venda ── */}
                                                {carrinhoEditandoAjustes?.id === orc.id && (
                                                    <div className="px-5 py-4 border-t border-zinc-800/60 bg-zinc-950/40">
                                                        <div className="flex items-end gap-3 flex-wrap">
                                                            {/* Majoramento — vermelho */}
                                                            <div className="flex flex-col gap-1">
                                                                <label className="font-mono text-[9px] uppercase tracking-widest text-red-400/70">Majoramento %</label>
                                                                <input type="number" min="0" step="0.1" value={carrinhoEditandoAjustes.majoramento} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, majoramento: e.target.value }))} className="w-24 bg-black border border-red-700/50 text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-red-500/70" placeholder="0" autoFocus />
                                                            </div>
                                                            {/* RT — laranja */}
                                                            <div className="flex flex-col gap-1">
                                                                <label className="font-mono text-[9px] uppercase tracking-widest text-orange-400/70">RT %</label>
                                                                <input type="number" min="0" step="0.1" value={carrinhoEditandoAjustes.rt} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, rt: e.target.value }))} className="w-24 bg-black border border-orange-700/50 text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-orange-500/70" placeholder="0" />
                                                            </div>
                                                            {/* Frete — verde */}
                                                            <div className="flex flex-col gap-1">
                                                                <label className="font-mono text-[9px] uppercase tracking-widest text-green-400/70">Frete R$</label>
                                                                <input type="number" min="0" step="0.01" value={carrinhoEditandoAjustes.frete} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, frete: e.target.value }))} className="w-28 bg-black border border-green-700/50 text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-green-500/70" placeholder="0,00" />
                                                            </div>
                                                            {/* Arquiteto — laranja (parte do RT) */}
                                                            <div className="flex flex-col gap-1 flex-1 min-w-36">
                                                                <label className="font-mono text-[9px] uppercase tracking-widest text-orange-400/70">Arquiteto / RT</label>
                                                                <input type="text" value={carrinhoEditandoAjustes.rtNome} onChange={e => setCarrinhoEditandoAjustes(prev => ({ ...prev, rtNome: e.target.value }))} className="bg-black border border-orange-700/50 text-white font-mono text-[11px] px-2 py-1.5 focus:outline-none focus:border-orange-500/70 w-full" placeholder="Nome do arquiteto" />
                                                            </div>
                                                            <div className="flex gap-2 pb-0.5">
                                                                <button onClick={() => salvarAjustesCarrinho(orc.id, carrinhoEditandoAjustes.majoramento, carrinhoEditandoAjustes.rt, carrinhoEditandoAjustes.rtNome, carrinhoEditandoAjustes.frete)} className="font-mono text-[10px] border border-yellow-400/40 text-yellow-400 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors uppercase tracking-widest">Salvar</button>
                                                                <button onClick={() => setCarrinhoEditandoAjustes(null)} className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-3 py-1.5 hover:border-white hover:text-white transition-colors">✕</button>
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
                                                                <div className="mt-3 border border-zinc-800 bg-black/40 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                                                                    <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Custo base</span>
                                                                    <span className="font-mono text-[10px] text-zinc-300 text-right">{fmtBRL(base)}</span>
                                                                    {maj > 0 && <><span className="font-mono text-[9px] text-red-400/60 uppercase tracking-widest">+ Majoramento ({maj}%)</span><span className="font-mono text-[10px] text-zinc-300 text-right">+ {fmtBRL(valorMaj - base)}</span></>}
                                                                    {rt > 0 && <><span className="font-mono text-[9px] text-orange-400/60 uppercase tracking-widest">+ RT ({rt}%)</span><span className="font-mono text-[10px] text-zinc-300 text-right">+ {fmtBRL(valorRt)}</span></>}
                                                                    {frete > 0 && <><span className="font-mono text-[9px] text-green-400/60 uppercase tracking-widest">+ Frete</span><span className="font-mono text-[10px] text-zinc-300 text-right">+ {fmtBRL(frete)}</span></>}
                                                                    <span className="font-mono text-[9px] text-yellow-400 uppercase tracking-widest border-t border-zinc-800 pt-1.5">Total de venda</span>
                                                                    <span className="font-mono text-sm font-bold text-yellow-400 text-right border-t border-zinc-800 pt-1.5">{fmtBRL(total)}</span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}

                                                {/* ── Resumo de ajustes salvos ── */}
                                                {!carrinhoEditandoAjustes && temAjustes && (
                                                    <div className="px-5 py-3 border-t border-zinc-800/60 bg-zinc-950/30">
                                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                                                            <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Custo base</span>
                                                            <span className="font-mono text-[10px] text-zinc-400 text-right">{fmtBRL(ajustes.custoBase)}</span>
                                                            {ajustes.maj > 0 && <>
                                                                <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">+ Majoramento ({ajustes.maj}%)</span>
                                                                <span className="font-mono text-[10px] text-zinc-400 text-right">+ {fmtBRL(ajustes.valorMajorado - ajustes.custoBase)}</span>
                                                            </>}
                                                            {ajustes.rt > 0 && <>
                                                                <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">+ RT ({ajustes.rt}%){orc.rt_arquiteto_nome ? ` — ${orc.rt_arquiteto_nome}` : ''}</span>
                                                                <span className="font-mono text-[10px] text-zinc-400 text-right">+ {fmtBRL(ajustes.valorRt)}</span>
                                                            </>}
                                                            {ajustes.frete > 0 && <>
                                                                <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">+ Frete</span>
                                                                <span className="font-mono text-[10px] text-zinc-400 text-right">+ {fmtBRL(ajustes.frete)}</span>
                                                            </>}
                                                            <span className="font-mono text-[9px] text-yellow-400/80 uppercase tracking-widest border-t border-zinc-800/60 pt-1.5 mt-0.5">Total de venda</span>
                                                            <span className="font-mono text-sm font-bold text-yellow-400 text-right border-t border-zinc-800/60 pt-1.5 mt-0.5">{fmtBRL(ajustes.totalVenda)}</span>
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
                                                            <div className="border-t border-zinc-800 bg-black/40 px-5 py-5 flex items-center gap-3 text-zinc-600">
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
                                                        <div className="border-t border-zinc-800 bg-black/40">
                                                            {grupos.map(([ambId, pecasGrupo], gi) => {
                                                                const ambNome = nomeDoAmbiente(ambId);
                                                                const subtotal = pecasGrupo.reduce((s, p) => s + (p.valor ?? 0), 0);
                                                                // Itens manuais só no último/único grupo
                                                                const showManuais = gi === grupos.length - 1 && (orc.itens_manuais ?? []).length > 0;
                                                                const subtotalComManuais = subtotal + (showManuais ? (orc.itens_manuais ?? []).reduce((s, it) => s + (it.total ?? 0), 0) : 0);

                                                                return (
                                                                    <div key={ambId} className={gi > 0 ? 'border-t border-zinc-800' : ''}>
                                                                        {/* Header do grupo */}
                                                                        <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-950/50 border-b border-zinc-900">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-0.5 h-4 bg-yellow-400/50 shrink-0"></div>
                                                                                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-300 font-semibold">
                                                                                    {ambNome}
                                                                                </span>
                                                                            </div>
                                                                            <span className="font-mono text-[10px] text-zinc-500">{fmtBRL(subtotalComManuais)}</span>
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
                                                                                            <div key={p.id ?? pi} className="flex items-center justify-between px-5 py-2 border-b border-zinc-900/30 hover:bg-zinc-900/15 transition-colors">
                                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                                    <div className="w-px h-5 bg-zinc-800 shrink-0 ml-1"></div>
                                                                                                    <span className="text-[11px] text-zinc-300 truncate">{p.nome ?? 'Peça'}</span>
                                                                                                    {p.area != null && <span className="font-mono text-[10px] text-zinc-600 shrink-0">{Number(p.area).toFixed(2)} m²</span>}
                                                                                                    {p.espessura && p.espessura !== '—' && <span className="font-mono text-[9px] text-zinc-700 shrink-0">{p.espessura}cm</span>}
                                                                                                </div>
                                                                                                <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-3">{fmtBRL(valorPedra)}</span>
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
                                                                                                    {vlrMl > 0 && <span className="font-mono text-[9px] text-zinc-700 shrink-0">({fmtBRL(vlrMl)}/ml)</span>}
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
                                                                                        <div key={`item-hdr-${itemKey}`} className="flex items-center justify-between px-5 py-1.5 bg-zinc-900/30 border-b border-zinc-900/40">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <iconify-icon icon="solar:folder-linear" width="10" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{nomeItem}</span>
                                                                                            </div>
                                                                                            <span className="font-mono text-[9px] text-zinc-600">{fmtBRL(subtotalItem)}</span>
                                                                                        </div>
                                                                                    ] : []),
                                                                                    // Linhas de pedra (valor = total − acabamentos)
                                                                                    ...pecasItem.map((p, pi) => {
                                                                                        const valorPedra = (p.valor ?? 0) - (p.valor_acabamentos ?? 0);
                                                                                        return (
                                                                                            <div key={p.id ?? pi} className={`flex items-center justify-between py-2 border-b border-zinc-900/30 hover:bg-zinc-900/15 transition-colors ${px}`}>
                                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                                    <div className="w-px h-5 bg-zinc-800 shrink-0 ml-1"></div>
                                                                                                    <span className="text-[11px] text-zinc-300 truncate">{p.nome ?? 'Peça'}</span>
                                                                                                    {p.area != null && <span className="font-mono text-[10px] text-zinc-600 shrink-0">{Number(p.area).toFixed(2)} m²</span>}
                                                                                                    {p.espessura && p.espessura !== '—' && <span className="font-mono text-[9px] text-zinc-700 shrink-0">{p.espessura}cm</span>}
                                                                                                </div>
                                                                                                <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-3">{fmtBRL(valorPedra)}</span>
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
                                                                                                    {vlrMl > 0 && <span className="font-mono text-[9px] text-zinc-700 shrink-0">({fmtBRL(vlrMl)}/ml)</span>}
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
                                                                            <div key={`manual-${ii}`} className="flex items-center justify-between px-5 py-2 border-b border-zinc-900/30 last:border-b-0 hover:bg-zinc-900/15 transition-colors">
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <div className="w-px h-5 bg-zinc-800 shrink-0 ml-1"></div>
                                                                                    <span className="text-[11px] text-zinc-300 truncate">{item.nome_peca || 'Item'}</span>
                                                                                    <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                                                                                        {Number(item.quantidade ?? 0).toFixed(2)} {item.tipo === 'area' ? 'm²' : 'ML'}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-3">{fmtBRL(item.total ?? 0)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })}

                                                            {/* Produtos avulsos */}
                                                            {(orc.avulsos ?? []).length > 0 && (
                                                                <div className="border-t border-zinc-800/50">
                                                                    <div className="flex items-center justify-between px-5 py-2 bg-zinc-950/40">
                                                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Produtos avulsos</span>
                                                                    </div>
                                                                    {orc.avulsos.map(av => (
                                                                        <div key={av.id} className="flex items-center justify-between px-5 py-2 border-b border-zinc-900/30 last:border-b-0 hover:bg-zinc-900/15 transition-colors">
                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                <div className="w-px h-5 bg-zinc-800 shrink-0 ml-1"></div>
                                                                                <span className="text-[11px] text-zinc-300 truncate">{av.nome}</span>
                                                                                <span className="font-mono text-[10px] text-zinc-600 shrink-0">{av.quantidade}x {fmtBRL(av.valor_unitario)}</span>
                                                                            </div>
                                                                            <span className="font-mono text-[11px] text-zinc-400 shrink-0 ml-3">{fmtBRL(av.valor_total)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Vazio */}
                                                            {todasPecas.length === 0 && (orc.itens_manuais ?? []).length === 0 && (orc.avulsos ?? []).length === 0 && (
                                                                <div className="px-5 py-6 text-center">
                                                                    <span className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest">Sem detalhes disponíveis</span>
                                                                </div>
                                                            )}

                                                            {/* Total */}
                                                            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-950/80">
                                                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Total</span>
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
                                        <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-lg shadow-2xl">
                                            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:merge-linear" width="14" className="text-orange-400"></iconify-icon>
                                                    <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Mesclar Cenários</span>
                                                </div>
                                                <button onClick={cancelarMesclar} className="text-zinc-500 hover:text-white transition-colors">
                                                    <iconify-icon icon="solar:close-linear" width="16"></iconify-icon>
                                                </button>
                                            </div>
                                            <div className="p-5 space-y-4">
                                                <div>
                                                    <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block mb-2">Nome do Novo Cenário</label>
                                                    <input
                                                        autoFocus
                                                        value={modalMesclar.nome}
                                                        onChange={e => setModalMesclar(p => ({ ...p, nome: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !loadingMesclar) mesclarCenarios(); }}
                                                        className="w-full bg-black border border-zinc-800 focus:border-orange-400 outline-none text-white text-sm font-mono px-3 py-2"
                                                        placeholder="Ex: Proposta Final, Mescla Completa..."
                                                    />
                                                </div>
                                                <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                                                    <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-2">
                                                        Cenários que serão mesclados ({orcsSel.length}):
                                                    </p>
                                                    <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                                                        {orcsSel.map(o => (
                                                            <li key={o.id} className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                                                                <iconify-icon icon="solar:merge-linear" width="10" className="text-orange-400 shrink-0"></iconify-icon>
                                                                <span className="text-zinc-500">{o.ambiente_nome}</span>
                                                                <iconify-icon icon="solar:alt-arrow-right-linear" width="9" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                <span className="truncate">{o.nome ?? o.nome_versao ?? 'Orçamento'}</span>
                                                                <span className="ml-auto text-zinc-600 shrink-0">{fmtBRL(o.valor_total)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800">
                                                        <span className="font-mono text-[9px] text-zinc-500 uppercase">Total mesclado</span>
                                                        <span className="font-mono text-sm font-bold text-orange-400">{fmtBRL(totalMesclar)}</span>
                                                    </div>
                                                </div>
                                                <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">
                                                    Os cenários originais são mantidos intactos. Um novo orçamento será criado com todas as peças e itens dos cenários selecionados.
                                                </p>
                                                <div className="flex gap-2 pt-1">
                                                    <button onClick={cancelarMesclar} className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={mesclarCenarios}
                                                        disabled={loadingMesclar || !modalMesclar.nome?.trim()}
                                                        className="flex-1 bg-orange-500 text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                        <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
                                            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:lock-keyhole-minimalistic-linear" width="14" className="text-blue-400"></iconify-icon>
                                                    <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Fechar Pedido</span>
                                                </div>
                                                <button onClick={cancelarFecharPedido} className="text-zinc-500 hover:text-white transition-colors">
                                                    <iconify-icon icon="solar:close-linear" width="16"></iconify-icon>
                                                </button>
                                            </div>
                                            <div className="overflow-y-auto flex-1 min-h-0">

                                                {/* ── Accordion: Cenários incluídos ── */}
                                                <div className="border-b border-zinc-800">
                                                    <button
                                                        onClick={() => setFecharOpen(s => ({ ...s, cenarios: !s.cenarios }))}
                                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-900/40 transition-colors text-left"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">Cenários incluídos</span>
                                                            <span className="font-mono text-[9px] text-blue-400 shrink-0">({orcsSel.length}) · {fmtBRL(totalSel)}</span>
                                                        </div>
                                                        <iconify-icon icon={fecharOpen.cenarios ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-zinc-600 shrink-0 ml-2"></iconify-icon>
                                                    </button>
                                                    {fecharOpen.cenarios && (
                                                        <div className="px-5 pb-3 border-t border-zinc-800/50">
                                                            <ul className="space-y-1 max-h-28 overflow-y-auto mt-2">
                                                                {orcsSel.map(o => (
                                                                    <li key={o.id} className="flex items-center gap-2 font-mono text-[10px] text-zinc-300">
                                                                        <iconify-icon icon="solar:check-circle-linear" width="10" className="text-blue-400 shrink-0"></iconify-icon>
                                                                        <span className="text-zinc-500 shrink-0">{o.ambiente_nome}</span>
                                                                        <iconify-icon icon="solar:alt-arrow-right-linear" width="9" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                        <span className="truncate">{o.nome ?? o.nome_versao ?? 'Orçamento'}</span>
                                                                        <span className="ml-auto text-zinc-500 shrink-0">{fmtBRL(o.valor_total)}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ── Accordion: Forma de Pagamento ── */}
                                                <div className="border-b border-zinc-800">
                                                    <button
                                                        onClick={() => setFecharOpen(s => ({ ...s, pagamento: !s.pagamento }))}
                                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-900/40 transition-colors text-left"
                                                    >
                                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">Forma de Pagamento</span>
                                                        <iconify-icon icon={fecharOpen.pagamento ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-zinc-600 shrink-0"></iconify-icon>
                                                    </button>
                                                    {fecharOpen.pagamento && (
                                                        <div className="px-5 pb-4 border-t border-zinc-800/50 pt-3 space-y-3">
                                                            <select
                                                                value={modalFechar.forma_pagamento}
                                                                onChange={e => setModalFechar(p => ({ ...p, forma_pagamento: e.target.value }))}
                                                                className="w-full bg-black border border-zinc-800 focus:border-blue-400 outline-none text-white text-sm font-mono px-3 py-2"
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
                                                                                : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
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
                                                <div className="border-b border-zinc-800">
                                                    <button
                                                        onClick={() => setFecharOpen(s => ({ ...s, prazo: !s.prazo }))}
                                                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-900/40 transition-colors text-left"
                                                    >
                                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">Prazo de Entrega</span>
                                                        <iconify-icon icon={fecharOpen.prazo ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="11" className="text-zinc-600 shrink-0"></iconify-icon>
                                                    </button>
                                                    {fecharOpen.prazo && (
                                                        <div className="px-5 pb-4 border-t border-zinc-800/50 pt-3 space-y-2">
                                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                                <input
                                                                    type="radio" name="prazo_tipo" value="DATA"
                                                                    checked={prazoTipo === 'DATA'}
                                                                    onChange={() => setModalFechar(p => ({ ...p, prazo_tipo: 'DATA' }))}
                                                                    className="accent-blue-500"
                                                                />
                                                                <span className="font-mono text-[10px] text-zinc-400 group-hover:text-white transition-colors">Selecionar Data</span>
                                                            </label>
                                                            {prazoTipo === 'DATA' && (
                                                                <div className="ml-5">
                                                                    <input
                                                                        type="date"
                                                                        value={modalFechar.prazo_data ?? ''}
                                                                        onChange={e => setModalFechar(p => ({ ...p, prazo_data: e.target.value }))}
                                                                        className="w-full bg-black border border-zinc-800 focus:border-blue-400 outline-none text-white text-sm font-mono px-3 py-1.5"
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
                                                                <span className="font-mono text-[10px] text-zinc-400 group-hover:text-white transition-colors">Dias Úteis</span>
                                                            </label>
                                                            {prazoTipo === 'DIAS_UTEIS' && (
                                                                <div className="ml-5 space-y-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="number" min="1" max="365"
                                                                            value={modalFechar.prazo_dias ?? 15}
                                                                            onChange={e => setModalFechar(p => ({ ...p, prazo_dias: Math.max(1, parseInt(e.target.value) || 1) }))}
                                                                            className="w-24 bg-black border border-zinc-800 focus:border-blue-400 outline-none text-white text-sm font-mono px-3 py-1.5"
                                                                        />
                                                                        <span className="font-mono text-[10px] text-zinc-500">dias úteis</span>
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

                                                <p className="px-5 py-3 font-mono text-[9px] text-zinc-600 leading-relaxed">
                                                    Os cenários não selecionados serão descartados (mantidos por 7 dias). O projeto será marcado como FECHADO.
                                                </p>
                                            </div>

                                            {/* ── Footer fixo com botões ── */}
                                            <div className="flex gap-2 px-5 py-4 border-t border-zinc-800 shrink-0">
                                                    <button onClick={cancelarFecharPedido} className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={confirmarFechamento}
                                                        disabled={loadingFechar || !prazoValido || !modalFechar.forma_pagamento}
                                                        className="flex-1 bg-blue-600 text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Dados da medição</div>
                                <div className="text-white font-semibold text-sm">{painelMedicao?.data ?? '—'}</div>
                            </div>
                            <button
                                onClick={() => { setPainelMedicao(null); setImgZoomed(false); }}
                                className="text-zinc-600 hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                            {/* ── DESENHO TÉCNICO ── */}
                            <div>
                                <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                                    Desenho Técnico
                                </div>
                                {painelMedicao?.svg_url ? (
                                    <div className="flex flex-col gap-2">
                                        <div
                                            className="relative border border-zinc-800 bg-black overflow-hidden cursor-zoom-in group"
                                            onClick={() => setImgZoomed(true)}
                                        >
                                            {imgLoading && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black z-10 min-h-[160px]">
                                                    <div className="w-5 h-5 border-2 border-zinc-700 border-t-yellow-400 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                            {imgError ? (
                                                <div className="flex flex-col items-center justify-center py-8 gap-2 min-h-[100px]">
                                                    <iconify-icon icon="solar:image-broken-linear" width="24" className="text-zinc-700"></iconify-icon>
                                                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Imagem indisponível</span>
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
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 pointer-events-none">
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/80 border border-zinc-700">
                                                                <iconify-icon icon="solar:magnifer-zoom-in-linear" width="13" className="text-white"></iconify-icon>
                                                                <span className="font-mono text-[9px] uppercase tracking-widest text-white">Ampliar</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {!imgError && !imgLoading && (
                                            <button
                                                onClick={() => handleDownloadDesenho(painelMedicao.svg_url, painelMedicao.id)}
                                                className="flex items-center justify-center gap-2 w-full border border-zinc-700 text-zinc-400 hover:border-white hover:text-white transition-colors text-[10px] font-mono uppercase tracking-widest py-2.5"
                                            >
                                                <iconify-icon icon="solar:download-linear" width="13"></iconify-icon>
                                                Baixar Desenho
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 gap-2 border border-zinc-900 bg-black">
                                        <iconify-icon icon="solar:ruler-pen-linear" width="20" className="text-zinc-700"></iconify-icon>
                                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Desenho não disponível</span>
                                    </div>
                                )}
                            </div>

                            {/* ── INFORMAÇÕES DA MEDIÇÃO ── */}
                            <InfoMedicao ambientes={painelMedicao?.json_medicao?.ambientes} />

                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-1">
                                Resumo da Medição
                            </div>

                            {(() => {
                                const jsonNorm  = normalizarJsonMedicao(painelMedicao?.json_medicao);
                                const pecas     = jsonNorm?.resumo_por_peca ?? [];
                                const isFlutter = jsonNorm?._fonte === 'flutter';

                                if (pecas.length === 0) {
                                    return (
                                        <div className="text-center py-10 px-4 border border-zinc-900 bg-black">
                                            <iconify-icon icon="solar:document-text-linear" width="24" className="text-zinc-700 mb-2"></iconify-icon>
                                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Nenhum dado processado ainda</div>
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
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-1 pb-2">[ PEÇAS ]</div>
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
                                                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-2 pl-1 flex items-center gap-2">
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
                                                                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1.5 ml-2 flex items-center gap-1.5">
                                                                                        <iconify-icon icon="solar:folder-linear" width="10" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                                        {nomeItem}
                                                                                    </div>
                                                                                )}
                                                                                <div className={`flex flex-col gap-1.5 ${nomeItem && temItens ? 'ml-2' : ''}`}>
                                                                                    {itensMapa.get(itemKey).map((r, i) => (
                                                                                        <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <span className="text-white font-semibold text-sm">{r.nome ?? 'Peça'}</span>
                                                                                                <span className="font-mono text-sm text-yellow-400 font-bold">{r.area_liquida_m2 ?? 0} m²</span>
                                                                                            </div>
                                                                                            {r.espessura_cm && (
                                                                                                <div className="font-mono text-[10px] text-zinc-500 mt-1">esp. {r.espessura_cm} cm</div>
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
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ ACABAMENTOS ]</div>
                                                <div className="bg-black border border-zinc-900 px-4 py-3 flex flex-col gap-2">
                                                    {totalME > 0 && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                                <span className="font-mono text-[11px] text-zinc-300">Meia-Esquadria</span>
                                                            </div>
                                                            <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalME} ml</span>
                                                        </div>
                                                    )}
                                                    {totalRS > 0 && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                                <span className="font-mono text-[11px] text-zinc-300">Reto Simples</span>
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
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ RECORTES ]</div>
                                                <div className="flex flex-col gap-2">
                                                    {todosRecortes.map((rc, i) => {
                                                        const isCircular = rc.type === 'circular';
                                                        const dim = isCircular
                                                            ? `∅ ${rc.diameter_cm ?? '?'} cm`
                                                            : `${rc.dimX_cm ?? '?'} × ${rc.dimY_cm ?? '?'} cm`;
                                                        return (
                                                            <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                                        <span className="font-mono text-[11px] text-zinc-300">
                                                                            {rc.description || (isCircular ? 'Furo circular' : 'Recorte retangular')}
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-mono text-[10px] text-zinc-500">{dim}</span>
                                                                </div>
                                                                <div className="font-mono text-[9px] text-zinc-600 mt-1 pl-5">{rc.pecaNome}</div>
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
                        <div className="px-6 py-4 border-t border-zinc-800">
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
                                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors p-2 z-10"
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
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[480px] z-10">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
                                    {editingMedicaoId ? '[ EDITAR_MEDIÇÃO ]' : '[ AGENDAR_MEDIÇÃO ]'}
                                </div>
                                <div className="text-white font-semibold">
                                    {editingMedicaoId ? 'Editar medição' : 'Nova medição'}
                                </div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Form */}
                        <div className="p-6 flex flex-col gap-5">
                            {erroAgendar && (
                                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-red-400">{erroAgendar}</span>
                                </div>
                            )}

                            {/* Medidor */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Medidor</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" width="16"></iconify-icon>
                                    <select
                                        value={agMedidor}
                                        onChange={e => setAgMedidor(e.target.value)}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                                    >
                                        <option value="">Selecionar medidor</option>
                                        {medidores.map(m => (
                                            <option key={m.id} value={m.id}>{m.full_name}</option>
                                        ))}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                                </div>
                                {medidores.length === 0 && (
                                    <p className="font-mono text-[9px] text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
                                )}
                            </div>

                            {/* Data e hora */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Data e hora</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" width="16"></iconify-icon>
                                    <input
                                        type="datetime-local"
                                        value={agData}
                                        onChange={e => setAgData(e.target.value)}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            {/* Endereço — Rua (autocomplete) + Número manual + Bairro + Cidade */}
                            <div className="space-y-3">
                                <div className="text-[10px] uppercase font-mono text-zinc-500 mb-1">
                                    Endereço{' '}
                                    <span className="text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                                </div>

                                {/* Rua — com autocompletar Nominatim */}
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Rua / Logradouro</label>
                                    <div className="relative">
                                        <iconify-icon
                                            icon={endConfirmado ? 'solar:check-circle-linear' : 'solar:map-point-linear'}
                                            className={`absolute left-3 top-3.5 ${endConfirmado ? 'text-green-400' : 'text-zinc-600'}`}
                                            width="14"
                                        ></iconify-icon>
                                        {endBuscando && (
                                            <iconify-icon
                                                icon="solar:spinner-linear"
                                                className="absolute right-3 top-3.5 text-zinc-600 animate-spin"
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
                                            className={`w-full bg-black border text-white text-sm pl-8 pr-8 py-2.5 rounded-none focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                                endConfirmado
                                                    ? 'border-green-500/50 focus:border-green-400'
                                                    : 'border-zinc-800 focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)]'
                                            }`}
                                        />

                                        {/* Dropdown de sugestões */}
                                        {endSugestoes.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-50 bg-[#0a0a0a] border border-zinc-700 border-t-0 shadow-2xl max-h-56 overflow-y-auto">
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
                                                            className="w-full text-left px-3 py-2.5 hover:bg-white/[0.04] border-b border-zinc-800/60 last:border-0 transition-colors group"
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <iconify-icon icon="solar:map-point-linear" width="11" className="text-zinc-600 shrink-0 mt-0.5"></iconify-icon>
                                                                <div className="min-w-0">
                                                                    <div className="text-xs text-white group-hover:text-yellow-400 transition-colors leading-snug truncate">
                                                                        {[rua, bairro, cidade].filter(Boolean).join(', ') || s.display_name}
                                                                    </div>
                                                                    {s.type && (
                                                                        <div className="font-mono text-[9px] text-zinc-600 uppercase mt-0.5">
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
                                            Bairro e cidade preenchidos automaticamente
                                        </div>
                                    )}
                                    {!endConfirmado && agRua.trim().length > 0 && endSugestoes.length === 0 && !endBuscando && (
                                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-zinc-600">
                                            <iconify-icon icon="solar:info-circle-linear" width="10"></iconify-icon>
                                            Nenhuma sugestão — endereço será salvo como digitado
                                        </div>
                                    )}
                                </div>

                                {/* Número — sempre manual */}
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Número</label>
                                    <input
                                        type="text"
                                        value={agNumero}
                                        onChange={e => setAgNumero(e.target.value)}
                                        placeholder="Ex: 142"
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                    />
                                </div>

                                {/* Bairro + Cidade lado a lado */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Bairro</label>
                                        <input
                                            type="text"
                                            value={agBairro}
                                            onChange={e => setAgBairro(e.target.value)}
                                            placeholder="Ex: Centro"
                                            className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Cidade</label>
                                        <input
                                            type="text"
                                            value={agCidade}
                                            onChange={e => setAgCidade(e.target.value)}
                                            placeholder="Ex: São Paulo"
                                            className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Observações de Acesso / Info Adicional */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">
                                    Observações de Acesso
                                    <span className="text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                                </label>
                                <textarea
                                    value={agObservacoes}
                                    onChange={e => setAgObservacoes(e.target.value)}
                                    rows={3}
                                    placeholder="Ex: Interfone estragado, usar portão lateral. Casa de esquina com a Rua das Flores. Avisar 30min antes."
                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                                />
                                <div className="mt-1 font-mono text-[9px] text-zinc-700">
                                    Ponto de referência, instruções de entrada, outra cidade, etc.
                                </div>
                            </div>

                            {/* Botões */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={closeAll}
                                    className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAgendarMedicao}
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
                </div>
            )}

            {/* ══ MODAL — Atualizar Status ═══════════════════════════════ */}
            {modalStatus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[400px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ ATUALIZAR_STATUS ]</div>
                                <div className="text-white font-semibold">Novo status do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
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
                                                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${novoStatus === s ? cfg.dot : 'bg-zinc-700'}`}></span>
                                            <span className="font-mono text-[11px] uppercase tracking-widest">{cfg.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleSalvarStatus} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all">
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
                    <div className="relative bg-[#0a0a0a] border border-red-500/30 w-full max-w-[440px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-red-400/70 mb-0.5">[ MARCAR_COMO_PERDIDO ]</div>
                                <div className="text-white font-semibold">Confirmar perda do projeto</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <p className="font-mono text-xs text-zinc-500">
                                Ao confirmar, o projeto <span className="text-white">{projeto?.nome ?? 'Este projeto'}</span> será marcado como perdido. Esta ação notificará o admin.
                            </p>

                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Motivo (opcional)</label>
                                <textarea
                                    value={motivoPerda}
                                    onChange={e => setMotivoPerda(e.target.value)}
                                    placeholder="Ex: cliente escolheu outro fornecedor..."
                                    rows={3}
                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-zinc-700 resize-none font-mono text-xs"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={closeAll} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleMarcarPerdido} className="flex-1 border border-red-500/50 bg-red-400/5 text-red-400 text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:bg-red-400/10 transition-all">
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
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-md z-10">
                        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
                            <span className="font-mono text-[10px] uppercase text-white font-bold tracking-widest">Renomear Ambiente</span>
                            <button onClick={() => setEditingAmbNome(null)} className="text-zinc-500 hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6">
                            <input
                                autoFocus
                                value={editingAmbNome.nome}
                                onChange={e => setEditingAmbNome({ ...editingAmbNome, nome: e.target.value })}
                                className="w-full bg-black border border-zinc-800 p-3 text-sm text-white focus:border-yellow-400 outline-none font-mono"
                            />
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setEditingAmbNome(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-800 py-3 hover:text-white transition-colors">Cancelar</button>
                                <button onClick={salvarNomeAmbiente} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ MODAL — Editar Versão (granular) ══════════════════════════ */}
            {editingVersao && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingVersao(null)}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-700 w-full max-w-lg z-10 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
                            <span className="font-mono text-[10px] uppercase text-white font-bold tracking-widest">Editar Versão</span>
                            <button onClick={() => setEditingVersao(null)} className="text-zinc-500 hover:text-white transition-colors">
                                <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex flex-col gap-4">
                            <div>
                                <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-1">Nome do Ambiente</label>
                                <input
                                    value={editingVersao.nomeAmb}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeAmb: e.target.value }))}
                                    className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-1">Nome da Versão</label>
                                <input
                                    value={editingVersao.nomeVersao}
                                    onChange={e => setEditingVersao(p => ({ ...p, nomeVersao: e.target.value }))}
                                    className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                                />
                            </div>
                            {editingVersao.pecas.length > 0 && (
                                <div>
                                    <label className="font-mono text-[9px] uppercase text-zinc-500 block mb-2">Nome e Material por Peça</label>
                                    <div className="flex flex-col gap-2">
                                        {editingVersao.pecas.map((ep, i) => (
                                            <div key={ep.id} className="flex flex-col gap-1.5 bg-black/40 border border-zinc-800/50 px-3 py-2.5">
                                                <input
                                                    value={ep.nome}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-black border border-zinc-800 focus:border-zinc-600 outline-none text-zinc-200 text-[11px] font-mono px-2 py-1"
                                                    placeholder="Nome da peça"
                                                />
                                                <select
                                                    value={ep.material_id || ''}
                                                    onChange={e => setEditingVersao(p => ({
                                                        ...p,
                                                        pecas: p.pecas.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x)
                                                    }))}
                                                    className="w-full bg-black border border-zinc-800 text-zinc-300 text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400"
                                                >
                                                    <option value="">Sem material definido</option>
                                                    {catMateriais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                                </select>
                                                {catMateriais.length === 0 && (
                                                    <p className="font-mono text-[9px] text-zinc-700">Conecte-se para ver catálogo de materiais.</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 px-6 py-4 border-t border-zinc-800 shrink-0">
                            <button onClick={() => setEditingVersao(null)} className="flex-1 font-mono text-[10px] uppercase border border-zinc-800 py-3 text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                            <button onClick={salvarEdicaoVersao} className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 hover:bg-yellow-300">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ PAINEL LATERAL — Edição de Peça Mock ══════════════════════ */}
            {/* ── Drawer: editar item manual ────────────────────────────────── */}
            {itemManualEmEdicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setItemManualEmEdicao(null)}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 border-t-2 border-t-yellow-400">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Editar Item Manual</div>
                                <div className="text-white font-semibold text-sm">{itemManualEmEdicao.itemData.nome_peca || 'Item sem nome'}</div>
                            </div>
                            <button onClick={() => setItemManualEmEdicao(null)} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                            {/* Nome */}
                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Nome da Peça</label>
                                <input
                                    type="text"
                                    value={itemManualEmEdicao.itemData.nome_peca ?? ''}
                                    onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, nome_peca: e.target.value } }))}
                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors"
                                />
                            </div>
                            {/* Tipo (read-only) */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Tipo</label>
                                    <div className={`px-4 py-3 border font-mono text-xs ${itemManualEmEdicao.itemData.tipo === 'area' ? 'border-blue-500/30 text-blue-400 bg-blue-400/5' : 'border-purple-500/30 text-purple-400 bg-purple-400/5'}`}>
                                        {itemManualEmEdicao.itemData.tipo === 'area' ? 'Área (m²)' : 'Linear (ML)'}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">
                                        {itemManualEmEdicao.itemData.tipo === 'area' ? 'Quantidade (m²)' : 'Metragem (ML)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={itemManualEmEdicao.itemData.quantidade ?? ''}
                                        onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, quantidade: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                                    />
                                </div>
                            </div>
                            {/* Acabamento + Espessura (somente leitura) */}
                            {itemManualEmEdicao.itemData.tipo === 'area' && (
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Acabamento</label>
                                        <div className="px-4 py-3 border border-zinc-800 font-mono text-xs text-zinc-400 bg-zinc-900">
                                            {itemManualEmEdicao.itemData.acabamento || '—'}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Espessura</label>
                                        <div className="px-4 py-3 border border-zinc-800 font-mono text-xs text-zinc-400 bg-zinc-900">
                                            {itemManualEmEdicao.itemData.espessura || '—'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Preço + Total */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">
                                        Preço unit. (R$/{itemManualEmEdicao.itemData.tipo === 'area' ? 'm²' : 'ML'})
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={itemManualEmEdicao.itemData.preco_unitario ?? 0}
                                        onChange={e => setItemManualEmEdicao(prev => ({ ...prev, itemData: { ...prev.itemData, preco_unitario: parseFloat(e.target.value) || 0 } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Total</label>
                                    <div className="px-4 py-3 border border-yellow-400/20 bg-yellow-400/5 font-mono text-sm text-yellow-400 font-semibold">
                                        {fmtBRL((parseFloat(itemManualEmEdicao.itemData.quantidade) || 0) * (itemManualEmEdicao.itemData.preco_unitario || 0))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
                            <button onClick={() => setItemManualEmEdicao(null)} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleSalvarItemManual} className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all flex items-center justify-center gap-2">
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
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        {/* Header painel */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Editar Peça</div>
                                <div className="text-white font-semibold text-sm">{pecaEmEdicao?.pecaData?.nome ?? 'Peça'}</div>
                            </div>
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="text-zinc-600 hover:text-white transition-colors p-1"
                            >
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        {/* Conteúdo Formulario */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                            {/* Nome e Valor */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Nome da peça</label>
                                    <input
                                        type="text"
                                        value={pecaEmEdicao?.pecaData?.nome ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, nome: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Valor (R$)</label>
                                    <input
                                        type="number"
                                        value={pecaEmEdicao?.pecaData?.valor ?? 0}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, valor: Number(e.target.value) } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Espessura */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Espessura</label>
                                    <select
                                        value={pecaEmEdicao?.pecaData?.espessura ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, espessura: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="1cm">1cm</option>
                                        <option value="2cm">2cm</option>
                                        <option value="3cm">3cm</option>
                                    </select>
                                </div>
                                {/* Material */}
                                <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Material</label>
                                    <select
                                        value={pecaEmEdicao?.pecaData?.material ?? ''}
                                        onChange={e => setPecaEmEdicao(prev => ({ ...prev, pecaData: { ...prev?.pecaData, material: e.target.value } }))}
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none cursor-pointer"
                                    >
                                        <option value="Granito São Gabriel">Granito São Gabriel</option>
                                        <option value="Silestone Tigris Sand">Silestone Tigris Sand</option>
                                        <option value="Quartzo Branco">Quartzo Branco</option>
                                    </select>
                                </div>
                            </div>

                            {/* Recortes */}
                            <div>
                                <div className="text-[10px] uppercase font-mono text-zinc-500 block mb-3 border-b border-zinc-800 pb-2">Recortes ({(pecaEmEdicao?.pecaData?.recortes ?? []).length})</div>
                                <div className="flex flex-col gap-2">
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).map(rec => (
                                        <div key={rec?.id} className="flex flex-col border border-zinc-800 bg-black p-3 group hover:border-zinc-700 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <iconify-icon icon="solar:scissors-linear" width="14" className="text-zinc-600"></iconify-icon>
                                                    <div>
                                                        <div className="text-xs text-white pb-0.5">{rec?.nome ?? 'Recorte'}</div>
                                                        <div className="text-[10px] font-mono text-zinc-500">{rec?.dimensao ?? '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleRemoverRecorteDrawer(rec?.id)}
                                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded"
                                                        title="Remover recorte"
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(pecaEmEdicao?.pecaData?.recortes ?? []).length === 0 && (
                                        <div className="p-3 border border-dashed border-zinc-800 text-center">
                                            <span className="text-[10px] font-mono text-zinc-600">Nenhum recorte</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer painel */}
                        <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
                            <button
                                onClick={() => setPecaEmEdicao(null)}
                                className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSalvarEdicaoPeca}
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
                onConfirm={handlePdfConfirm}
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
