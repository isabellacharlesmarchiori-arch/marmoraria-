import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MedicaoPill, normalizarJsonMedicao } from '../../utils/projetoUtils';
import AgendaMedidor from '../AgendaMedidor';

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
                    const tipo         = amb.extras?.tipo_medicao ?? 'producao';
                    const infoAmb      = (amb.extras?.info_adicional ?? '').trim();
                    const itensComInfo = (amb.itens ?? []).filter(it => (it.info_adicional ?? '').trim() !== '');
                    const nomeAmb      = amb.ambiente ?? amb.nome ?? `Ambiente ${i + 1}`;
                    const hasContent   = tipo === 'orcamento' || infoAmb !== '' || itensComInfo.length > 0;
                    if (!hasContent) return null;
                    return (
                        <div key={i} className="flex flex-col gap-2.5">
                            {ambientes.length > 1 && (
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                    <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                    {nomeAmb}
                                </div>
                            )}
                            {tipo === 'orcamento' ? (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-orange-400 shrink-0 mt-0.5"></iconify-icon>
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-widest text-orange-400 font-semibold leading-none mb-1">Orçamento Preliminar</div>
                                        <div className="text-[11px] text-orange-300/70">Medição prévia — necessário retornar para medição final</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-400/10 border border-green-400/30">
                                    <iconify-icon icon="solar:check-circle-linear" width="13" className="text-green-400 shrink-0"></iconify-icon>
                                    <div className="font-mono text-[10px] uppercase tracking-widest text-green-400 font-semibold">Pronto para Produção</div>
                                </div>
                            )}
                            {infoAmb !== '' && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <iconify-icon icon="solar:document-text-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações do Ambiente</span>
                                    </div>
                                    <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{infoAmb}</p>
                                </div>
                            )}
                            {itensComInfo.length > 0 && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <iconify-icon icon="solar:list-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações por Item</span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {itensComInfo.map((item, j) => (
                                            <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">{item.nome}</span>
                                                <span className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{item.info_adicional.trim()}</span>
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

const MedicoesTab = React.memo(function MedicoesTab({
    medicoes, setMedicoes,
    medidores,
    projeto, id,
    isViewOnlyAdmin,
    profile, session,
    navigate,
}) {
    const [painelMedicao, setPainelMedicao] = useState(null);
    const [imgLoading,    setImgLoading]    = useState(false);
    const [imgError,      setImgError]      = useState(false);
    const [imgZoomed,     setImgZoomed]     = useState(false);

    const [modalAgendar,     setModalAgendar]     = useState(false);
    const [editingMedicaoId, setEditingMedicaoId] = useState(null);
    const [agMedidor,        setAgMedidor]        = useState('');
    const [agData,           setAgData]           = useState('');
    const [agRua,            setAgRua]            = useState('');
    const [agNumero,         setAgNumero]         = useState('');
    const [agBairro,         setAgBairro]         = useState('');
    const [agCidade,         setAgCidade]         = useState('');
    const [agObservacoes,    setAgObservacoes]    = useState('');
    const [agendando,        setAgendando]        = useState(false);
    const [erroAgendar,      setErroAgendar]      = useState('');
    const [endSugestoes,     setEndSugestoes]     = useState([]);
    const [endBuscando,      setEndBuscando]      = useState(false);
    const [endConfirmado,    setEndConfirmado]    = useState(false);
    const endDebounceRef = useRef(null);

    const enderecoCompleto = [agRua, agNumero, agBairro, agCidade]
        .map(s => s.trim()).filter(Boolean).join(', ');

    function closeAll() {
        setModalAgendar(false);
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
    }

    function handleAbrirEditar(m) {
        setEditingMedicaoId(m.id);
        setAgMedidor(m.medidor_id ?? '');
        setAgData(m.data_medicao ? m.data_medicao.slice(0, 16) : '');
        setAgRua(m.endereco ?? '');
        setAgNumero('');
        setAgBairro('');
        setAgCidade('');
        setAgObservacoes(m.observacoes_acesso ?? '');
        setEndConfirmado(!!m.endereco);
        setEndSugestoes([]);
        setErroAgendar('');
        setModalAgendar(true);
    }

    async function handleExcluirMedicao(m) {
        if (!window.confirm(`Excluir a medição de ${m.data}? Esta ação não pode ser desfeita.`)) return;
        await supabase.from('ambientes').delete().eq('medicao_id', m.id);
        const { error } = await supabase.from('medicoes').delete().eq('id', m.id);
        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
        setMedicoes(prev => prev.filter(item => item.id !== m.id));
    }

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

    async function handleAgendarMedicao() {
        setErroAgendar('');
        if (!agMedidor) { alert('Selecione um medidor na lista antes de salvar.'); return; }
        if (!agData)    { setErroAgendar('Selecione a data e hora da medição.'); return; }
        if (!id)        { setErroAgendar('ID do projeto inválido. Recarregue a página.'); return; }

        const EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001';
        const empresaId = profile?.empresa_id ?? EMPRESA_ID_FALLBACK;
        const dataAgendadaISO = new Date(agData).toISOString();
        const medidorSelecionado = medidores.find(m => m.id === agMedidor);
        const nomeResponsavel = medidorSelecionado?.full_name ?? '';

        const formatarParaLista = (m) => ({
            ...m,
            data: new Date(m.data_medicao).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            medidor: m.responsavel ?? '—',
        });

        setAgendando(true);

        if (editingMedicaoId) {
            const isMedidor = profile?.role === 'medidor';
            const { data: updated, error: errUpd } = await supabase
                .from('medicoes')
                .update({
                    medidor_id:         agMedidor,
                    responsavel:        nomeResponsavel,
                    data_medicao:       dataAgendadaISO,
                    endereco:           enderecoCompleto || null,
                    observacoes_acesso: agObservacoes.trim() || null,
                    ...(isMedidor ? { status: 'concluida' } : {}),
                })
                .eq('id', editingMedicaoId)
                .select('id, data_medicao, responsavel, medidor_id, endereco, status, json_medicao, svg_url')
                .single();
            if (errUpd) {
                setErroAgendar(`Erro: ${errUpd.message}`);
                setAgendando(false);
                return;
            }
            setMedicoes(prev => prev.map(m => m.id === editingMedicaoId ? formatarParaLista(updated) : m));
            if (isMedidor) {
                const vendedorId = projeto?.vendedor_id;
                if (vendedorId && vendedorId !== session?.user?.id) {
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
                setErroAgendar(`Erro: ${errMed.message}`);
                setAgendando(false);
                return;
            }
            setMedicoes(prev => [formatarParaLista(med), ...prev]);
        }

        setAgendando(false);
        closeAll();
    }

    return (
        <>
            {/* ── Tabela de Medições ────────────────────────────── */}
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

            {/* ── Painel lateral: dados da medição ─────────────── */}
            {painelMedicao && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => { setPainelMedicao(null); setImgZoomed(false); }}></div>
                    <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Dados da medição</div>
                                <div className="text-white font-semibold text-sm">{painelMedicao?.data ?? '—'}</div>
                            </div>
                            <button onClick={() => { setPainelMedicao(null); setImgZoomed(false); }} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                            <div>
                                <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">Desenho Técnico</div>
                                {painelMedicao?.svg_url ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="relative border border-zinc-800 bg-black overflow-hidden cursor-zoom-in group" onClick={() => setImgZoomed(true)}>
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

                            <InfoMedicao ambientes={painelMedicao?.json_medicao?.ambientes} />

                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-1">Resumo da Medição</div>

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
                                const totalME = Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.meia_esquadria_ml ?? 0), 0) * 100) / 100;
                                const totalRS = Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.reto_simples_ml ?? 0), 0) * 100) / 100;
                                const todosRecortes = pecas.flatMap(p => (p.recortes ?? []).map(r => ({ ...r, pecaNome: p.nome })));
                                return (
                                    <>
                                        {isFlutter && (
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-yellow-400/5 border border-yellow-400/20">
                                                <iconify-icon icon="solar:smartphone-linear" width="11" className="text-yellow-400 shrink-0"></iconify-icon>
                                                <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-400">Enviado pelo app SmartStone</span>
                                            </div>
                                        )}
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
                                                                                {nomeItem && (
                                                                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1.5 ml-2 flex items-center gap-1.5">
                                                                                        <iconify-icon icon="solar:folder-linear" width="10" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                                        {nomeItem}
                                                                                    </div>
                                                                                )}
                                                                                <div className={`flex flex-col gap-1.5 ${nomeItem ? 'ml-2' : ''}`}>
                                                                                    {itensMapa.get(itemKey).map((r, i) => (
                                                                                        <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <span className="text-white font-semibold text-sm">{r.nome ?? 'Peça'}</span>
                                                                                                <span className="font-mono text-sm text-yellow-400 font-bold">{r.area_liquida_m2 ?? 0} m²</span>
                                                                                            </div>
                                                                                            {r.espessura_cm && <div className="font-mono text-[10px] text-zinc-500 mt-1">esp. {r.espessura_cm} cm</div>}
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
                                        {todosRecortes.length > 0 && (
                                            <>
                                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ RECORTES ]</div>
                                                <div className="flex flex-col gap-2">
                                                    {todosRecortes.map((rc, i) => {
                                                        const isCircular = rc.type === 'circular';
                                                        const dim = isCircular ? `∅ ${rc.diameter_cm ?? '?'} cm` : `${rc.dimX_cm ?? '?'} × ${rc.dimY_cm ?? '?'} cm`;
                                                        return (
                                                            <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                                        <span className="font-mono text-[11px] text-zinc-300">{rc.description || (isCircular ? 'Furo circular' : 'Recorte retangular')}</span>
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

                    {imgZoomed && painelMedicao?.svg_url && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out" onClick={() => setImgZoomed(false)}>
                            <button onClick={() => setImgZoomed(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors p-2 z-10">
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

            {/* ── Modal: Agendar/Editar Medição ─────────────────── */}
            {modalAgendar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
                    <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[480px] z-10">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
                                    {editingMedicaoId ? '[ EDITAR_MEDIÇÃO ]' : '[ AGENDAR_MEDIÇÃO ]'}
                                </div>
                                <div className="text-white font-semibold">{editingMedicaoId ? 'Editar medição' : 'Nova medição'}</div>
                            </div>
                            <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            {erroAgendar && (
                                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-red-400">{erroAgendar}</span>
                                </div>
                            )}

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
                                        {medidores.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                                    </select>
                                    <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                                </div>
                                {medidores.length === 0 && <p className="font-mono text-[9px] text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>}
                            </div>

                            {agMedidor && (
                                <AgendaMedidor
                                    medidorId={agMedidor}
                                    horarioEscolhido={agData || null}
                                    empresaId={profile?.empresa_id}
                                />
                            )}

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

                            <div className="space-y-3">
                                <div className="text-[10px] uppercase font-mono text-zinc-500 mb-1">
                                    Endereço <span className="text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Rua / Logradouro</label>
                                    <div className="relative">
                                        <iconify-icon
                                            icon={endConfirmado ? 'solar:check-circle-linear' : 'solar:map-point-linear'}
                                            className={`absolute left-3 top-3.5 ${endConfirmado ? 'text-green-400' : 'text-zinc-600'}`}
                                            width="14"
                                        ></iconify-icon>
                                        {endBuscando && <iconify-icon icon="solar:spinner-linear" className="absolute right-3 top-3.5 text-zinc-600 animate-spin" width="13"></iconify-icon>}
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
                                                            new URLSearchParams({ q: val, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'br', 'accept-language': 'pt-BR' }),
                                                            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
                                                        );
                                                        const data = await res.json();
                                                        setEndSugestoes(data);
                                                    } catch { setEndSugestoes([]); }
                                                    finally { setEndBuscando(false); }
                                                }, 450);
                                            }}
                                            onKeyDown={e => { if (e.key === 'Escape') { setEndSugestoes([]); setEndBuscando(false); } }}
                                            placeholder="Ex: Rua das Flores"
                                            autoComplete="off"
                                            className={`w-full bg-black border text-white text-sm pl-8 pr-8 py-2.5 rounded-none focus:outline-none transition-colors placeholder:text-zinc-700 ${endConfirmado ? 'border-green-500/50 focus:border-green-400' : 'border-zinc-800 focus:border-yellow-400'}`}
                                        />
                                        {endSugestoes.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-50 bg-[#0a0a0a] border border-zinc-700 border-t-0 shadow-2xl max-h-56 overflow-y-auto">
                                                {endSugestoes.map((s, i) => {
                                                    const a = s.address ?? {};
                                                    const rua = a.road || '';
                                                    const bairro = a.suburb || a.neighbourhood || a.quarter || '';
                                                    const cidade = a.city || a.town || a.village || a.municipality || '';
                                                    return (
                                                        <button key={i} type="button"
                                                            onMouseDown={e => {
                                                                e.preventDefault();
                                                                setAgRua(rua || s.display_name);
                                                                setAgBairro(bairro);
                                                                setAgCidade(cidade);
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
                                                                    {s.type && <div className="font-mono text-[9px] text-zinc-600 uppercase mt-0.5">{s.type}</div>}
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
                                <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Número</label>
                                    <input type="text" value={agNumero} onChange={e => setAgNumero(e.target.value)} placeholder="Ex: 142"
                                        className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Bairro</label>
                                        <input type="text" value={agBairro} onChange={e => setAgBairro(e.target.value)} placeholder="Ex: Centro"
                                            className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] uppercase font-mono text-zinc-600 block mb-1">Cidade</label>
                                        <input type="text" value={agCidade} onChange={e => setAgCidade(e.target.value)} placeholder="Ex: São Paulo"
                                            className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">
                                    Observações de Acesso <span className="text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                                </label>
                                <textarea
                                    value={agObservacoes} onChange={e => setAgObservacoes(e.target.value)} rows={3}
                                    placeholder="Ex: Interfone estragado, usar portão lateral."
                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={closeAll} className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors">
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
        </>
    );
});

export default MedicoesTab;
