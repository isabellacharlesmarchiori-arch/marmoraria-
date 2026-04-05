import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  orcado:     { label: 'Orçado',     color: 'text-zinc-400',   border: 'border-zinc-700',      bg: 'bg-zinc-900',     dot: 'bg-zinc-500'   },
  aprovado:   { label: 'Aprovado',   color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',  dot: 'bg-green-400'  },
  produzindo: { label: 'Produzindo', color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-400/5', dot: 'bg-violet-400' },
  entregue:   { label: 'Entregue',   color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-400/5',   dot: 'bg-blue-400'   },
  perdido:    { label: 'Perdido',    color: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-400/5',    dot: 'bg-red-400'    },
};

const MEDICAO_STATUS = {
  agendada:   { label: 'Agendada',   color: 'text-zinc-400',   border: 'border-zinc-700',      bg: 'bg-zinc-900',     dot: 'bg-zinc-500'   },
  enviada:    { label: 'Enviada',    color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/5', dot: 'bg-yellow-400' },
  processada: { label: 'Processada', color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-400/5',  dot: 'bg-green-400'  },
};

const STATUS_PROXIMOS = {
  orcado:     ['aprovado'],
  aprovado:   ['produzindo'],
  produzindo: ['entregue'],
  entregue:   [],
  perdido:    [],
};

// ── Pills ─────────────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.orcado;
  return (
    <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max shrink-0`}>
      <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
      {cfg.label}
    </span>
  );
}

function MedicaoPill({ status }) {
  const cfg = MEDICAO_STATUS[status] || MEDICAO_STATUS.agendada;
  return (
    <span className={`px-2 py-0.5 border ${cfg.border} text-[9px] font-mono uppercase ${cfg.color} ${cfg.bg} flex items-center gap-1.5 w-max shrink-0`}>
      <span className={`w-1 h-1 ${cfg.dot} rounded-full`}></span>
      {cfg.label}
    </span>
  );
}

// ── Helper: extrai resumo de peças do json_medicao ────────────────────────────

function extractResumoPecas(jsonMedicao) {
  if (!jsonMedicao) return [];
  const result = [];
  for (const amb of jsonMedicao.ambientes ?? []) {
    for (const p of amb.pecas ?? []) {
      let meia = 0, reto = 0;
      for (const a of Object.values(p.arestas ?? {})) {
        if (a.acabamento === 'meia_esquadria') meia += (a.comprimento_cm ?? 0) / 100;
        if (a.acabamento === 'reto_simples')   reto += (a.comprimento_cm ?? 0) / 100;
      }
      for (const s of p.segmentos ?? []) {
        if (s.acabamento === 'meia_esquadria') meia += (s.comprimento_cm ?? 0) / 100;
        if (s.acabamento === 'reto_simples')   reto += (s.comprimento_cm ?? 0) / 100;
      }
      const acabamentos = [
        meia > 0 ? `Meia-esquadria ${meia.toFixed(2)} m` : null,
        reto > 0 ? `Reto simples ${reto.toFixed(2)} m`   : null,
      ].filter(Boolean).join(' · ') || 'Sem acabamentos';

      result.push({
        nome:       p.nome_livre ?? '—',
        area:       `${(p.area_liquida_m2 ?? 0).toFixed(2)} m²`,
        acabamentos,
        recortes:   (p.recortes ?? []).length,
      });
    }
  }
  return result;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TelaProjetoVendedor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, session } = useAuth();

  // ── Dados do projeto ──────────────────────────────────────────────────────
  const [projeto,        setProjeto]        = useState(null);
  const [medicoes,       setMedicoes]        = useState([]);
  const [ambientes,      setAmbientes]       = useState([]);
  const [loadingProjeto, setLoadingProjeto]  = useState(true);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [activeTab,          setActiveTab]          = useState('medicoes');
  const [versoesExpandidas,  setVersoesExpandidas]  = useState({});
  const [painelMedicao,      setPainelMedicao]      = useState(null);
  const [selecionadosCarrinho, setSelecionadosCarrinho] = useState({});

  const MOCK_AMBIENTES = [
    {
      id: 'mock-amb-1',
      nome: 'Cozinha',
      orcamento_status: 'em_andamento',
      versoes: [
        {
          id: 'mock-versao-1',
          nome: 'Versão Granito',
          valor: 'R$ 12.500,00',
          data: '04 abr 2026',
          pecas: [
            { id: 'p1', nome: 'Bancada Principal', material: 'Granito São Gabriel', valor: 'R$ 8.000,00' },
            { id: 'p2', nome: 'Ilha', material: 'Granito São Gabriel', valor: 'R$ 4.500,00' }
          ]
        },
        {
          id: 'mock-versao-2',
          nome: 'Versão Silestone',
          valor: 'R$ 28.000,00',
          data: '04 abr 2026',
          pecas: [
            { id: 'p3', nome: 'Bancada Principal', material: 'Silestone Tigris Sand', valor: 'R$ 18.000,00' },
            { id: 'p4', nome: 'Ilha', material: 'Silestone Tigris Sand', valor: 'R$ 10.000,00' }
          ]
        }
      ]
    }
  ];

  const dataToRender = MOCK_AMBIENTES;

  // ── Modais ────────────────────────────────────────────────────────────────
  const [modalAgendar, setModalAgendar] = useState(false);
  const [modalPerda,   setModalPerda]   = useState(false);
  const [modalStatus,  setModalStatus]  = useState(false);

  // ── Agendar medição ───────────────────────────────────────────────────────
  const [medidores,  setMedidores]  = useState([]);
  const [agMedidor,  setAgMedidor]  = useState('');
  const [agData,     setAgData]     = useState('');
  const [agEndereco, setAgEndereco] = useState('');
  const [agendando,  setAgendando]  = useState(false);
  const [erroAgendar,setErroAgendar]= useState('');

  // ── Marcar como perdido ───────────────────────────────────────────────────
  const [motivoPerda,   setMotivoPerda]   = useState('');
  const [salvandoPerda, setSalvandoPerda] = useState(false);
  const [erroPerda,     setErroPerda]     = useState('');

  // ── Atualizar status ──────────────────────────────────────────────────────
  const [novoStatus,     setNovoStatus]     = useState('');
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [erroStatus,     setErroStatus]     = useState('');

  // ── Fetch: projeto ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoadingProjeto(true);
    supabase
      .from('projetos')
      .select('id, nome, status, motivo_perda, created_at, clientes(id, nome, endereco), vendedor:usuarios!vendedor_id(nome)')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        if (data) {
          setProjeto(data);
          // Pré-preenche endereço do agendamento com o do cliente
          const end = Array.isArray(data.clientes) ? data.clientes[0]?.endereco : data.clientes?.endereco;
          if (end) setAgEndereco(end);
        }
        setLoadingProjeto(false);
      });
  }, [id]);

  // ── Fetch: medições ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    supabase
      .from('medicoes')
      .select('id, data_agendada, status, json_medicao, medidor:usuarios!medidor_id(nome)')
      .eq('projeto_id', id)
      .order('data_agendada', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        if (data) setMedicoes(data);
      });
  }, [id]);

  // ── Fetch: ambientes + orçamentos ─────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    supabase
      .from('ambientes')
      .select(`
        id, nome,
        orcamentos(id, nome_versao, valor_total, status, created_at,
          orcamento_pecas(id, valor_total, pecas(nome_livre), materiais(nome))
        )
      `)
      .eq('projeto_id', id)
      .order('created_at')
      .then(({ data, error }) => {
        console.log('DEBUG ambientes — data:', data, '| error:', error);
        if (error) console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        if (data) {
          setAmbientes(data.map(amb => {
            const orcs = amb.orcamentos ?? [];
            const versoes = orcs.map(orc => ({
              id:    orc.id,
              nome:  orc.nome_versao,
              valor: orc.valor_total != null
                ? orc.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : 'R$ 0,00',
              data: orc.created_at
                ? new Date(orc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '',
              pecas: (orc.orcamento_pecas ?? []).map(op => ({
                id:       op.id,
                nome:     Array.isArray(op.pecas)     ? (op.pecas[0]?.nome_livre ?? '')  : (op.pecas?.nome_livre ?? ''),
                material: Array.isArray(op.materiais) ? (op.materiais[0]?.nome ?? '')    : (op.materiais?.nome ?? ''),
                valor:    op.valor_total != null
                  ? op.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '',
              })),
            }));
            const orcamento_status = versoes.length === 0
              ? 'sem_orcamento'
              : orcs.some(o => o.status === 'completo') ? 'completo' : 'em_andamento';
            return { id: amb.id, nome: amb.nome, orcamento_status, versoes };
          }));
        }
      });
  }, [id]);

  // ── Fetch: medidores da empresa ───────────────────────────────────────────
  useEffect(() => {
    if (!profile?.empresa_id) return;
    supabase
      .from('usuarios')
      .select('id, nome')
      .eq('empresa_id', profile.empresa_id)
      .eq('perfil', 'medidor')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => { if (data) setMedidores(data); });
  }, [profile?.empresa_id]);

  // ── IntersectionObserver ──────────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    // Timeout para dar pequena brecha no render do react
    const timeout = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [projeto, medicoes, ambientes, activeTab]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const closeAll = () => {
    setModalAgendar(false);
    setModalPerda(false);
    setModalStatus(false);
    setPainelMedicao(null);
    setErroAgendar('');
    setErroPerda('');
    setErroStatus('');
  };

  const toggleVersao = (e, versaoId) => {
    e.stopPropagation();
    setVersoesExpandidas(prev => ({ ...prev, [versaoId]: !prev[versaoId] }));
  };

  const clienteNome = Array.isArray(projeto?.clientes)
    ? (projeto.clientes[0]?.nome ?? '—')
    : (projeto?.clientes?.nome ?? '—');

  const clienteId = Array.isArray(projeto?.clientes)
    ? projeto.clientes[0]?.id
    : projeto?.clientes?.id;

  const vendedorNome = Array.isArray(projeto?.vendedor)
    ? (projeto.vendedor[0]?.nome ?? '—')
    : (projeto?.vendedor?.nome ?? '—');

  // ── Handler: agendar medição ──────────────────────────────────────────────
  async function handleAgendarMedicao() {
    setErroAgendar('');
    if (!agMedidor || !agData) { setErroAgendar('Selecione o medidor e a data.'); return; }
    if (!profile?.empresa_id || !id) { setErroAgendar('Sessão inválida. Recarregue a página.'); return; }

    const dataISO = new Date(agData).toISOString();
    setAgendando(true);

    try {
      const { data: med, error: errMed } = await supabase
        .from('medicoes')
        .insert({
          projeto_id:    id,
          medidor_id:    agMedidor,
          empresa_id:    profile.empresa_id,
          data_agendada: dataISO,
          status:        'agendada',
          json_medicao:  null,
        })
        .select('id')
        .single();

      if (errMed) {
        console.error(`ERRO CRÍTICO SUPABASE: ${errMed.message} - Detalhes: ${errMed.details}`);
        setErroAgendar(`Erro: ${errMed.message}`);
        return;
      }

      await supabase.from('notificacoes').insert({
        empresa_id: profile.empresa_id,
        usuario_id: agMedidor,
        tipo:       'medicao_agendada',
        titulo:     'Nova medição agendada',
        corpo:      `Medição agendada para ${new Date(dataISO).toLocaleString('pt-BR')}${agEndereco ? ' — ' + agEndereco : ''}`,
        lida:       false,
      });

      // Recarrega medições
      const { data: novasMedicoes } = await supabase
        .from('medicoes')
        .select('id, data_agendada, status, json_medicao, medidor:usuarios!medidor_id(nome)')
        .eq('projeto_id', id)
        .order('data_agendada', { ascending: false });
      if (novasMedicoes) setMedicoes(novasMedicoes);

      setAgMedidor('');
      setAgData('');
      closeAll();
    } catch (e) {
      console.error(`ERRO CRÍTICO SUPABASE: ${e.message} - Detalhes: ${e.details ?? ''}`);
      setErroAgendar(`Erro inesperado: ${e.message}`);
    } finally {
      setAgendando(false);
    }
  }

  // ── Handler: marcar como perdido ──────────────────────────────────────────
  async function handleMarcarPerdido() {
    setErroPerda('');
    if (!id) { setErroPerda('ID do projeto inválido.'); return; }
    setSalvandoPerda(true);
    try {
      const { error } = await supabase
        .from('projetos')
        .update({ status: 'perdido', motivo_perda: motivoPerda.trim() || null })
        .eq('id', id);

      if (error) {
        console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        setErroPerda(`Erro: ${error.message}`);
        return;
      }

      setProjeto(prev => ({ ...prev, status: 'perdido', motivo_perda: motivoPerda.trim() || null }));
      setMotivoPerda('');
      closeAll();
    } catch (e) {
      console.error(`ERRO CRÍTICO SUPABASE: ${e.message} - Detalhes: ${e.details ?? ''}`);
      setErroPerda(`Erro inesperado: ${e.message}`);
    } finally {
      setSalvandoPerda(false);
    }
  }

  // ── Handler: atualizar status ─────────────────────────────────────────────
  async function handleAtualizarStatus() {
    setErroStatus('');
    if (!novoStatus) { setErroStatus('Selecione um status.'); return; }
    setSalvandoStatus(true);
    try {
      const { error } = await supabase
        .from('projetos')
        .update({ status: novoStatus })
        .eq('id', id);

      if (error) {
        console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        setErroStatus(`Erro: ${error.message}`);
        return;
      }

      setProjeto(prev => ({ ...prev, status: novoStatus }));
      closeAll();

      // Se aprovado, abre formulário de fechamento
      if (novoStatus === 'aprovado') navigate(`/projetos/${id}/fechamento`);
    } catch (e) {
      console.error(`ERRO CRÍTICO SUPABASE: ${e.message} - Detalhes: ${e.details ?? ''}`);
      setErroStatus(`Erro inesperado: ${e.message}`);
    } finally {
      setSalvandoStatus(false);
    }
  }

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loadingProjeto) {
    return (
      <div className="bg-[#050505] min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <iconify-icon icon="solar:spinner-linear" width="28" className="text-zinc-700 animate-spin block"></iconify-icon>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Carregando projeto...</p>
        </div>
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="bg-[#050505] min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <iconify-icon icon="solar:danger-triangle-linear" width="28" className="text-zinc-700 block"></iconify-icon>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Projeto não encontrado</p>
          <button onClick={() => navigate('/projetos')} className="font-mono text-[10px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors">
            ← Voltar para projetos
          </button>
        </div>
      </div>
    );
  }

  const proximosStatus = STATUS_PROXIMOS[projeto.status] ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative min-h-screen overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-28">

        {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
        <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
          <span onClick={() => navigate('/projetos')} className="hover:text-yellow-400 transition-colors cursor-pointer">Projetos</span>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
          <span className="text-zinc-400 truncate max-w-[200px]">{projeto.nome}</span>
        </div>

        {/* ── Header do Projeto ────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

              {/* Info */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-white tracking-tighter">{projeto.nome}</h1>
                  <StatusPill status={projeto.status} />
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 flex-wrap">
                  <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600"></iconify-icon>
                  {clienteId ? (
                    <span onClick={() => navigate(`/clientes/${clienteId}`)} className="hover:text-yellow-400 transition-colors cursor-pointer">
                      {clienteNome}
                    </span>
                  ) : (
                    <span>{clienteNome}</span>
                  )}
                  <span className="text-zinc-700">·</span>
                  <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                  <span>
                    {projeto.created_at
                      ? new Date(projeto.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                  <span className="text-zinc-700">·</span>
                  <iconify-icon icon="solar:user-id-linear" width="13" className="text-zinc-600"></iconify-icon>
                  <span>{vendedorNome}</span>
                </div>
                {projeto.status === 'perdido' && projeto.motivo_perda && (
                  <div className="flex items-center gap-2 font-mono text-[10px] text-red-400/70">
                    <iconify-icon icon="solar:info-circle-linear" width="12" className="text-red-500/50"></iconify-icon>
                    Motivo: {projeto.motivo_perda}
                  </div>
                )}
              </div>

              {/* Ações */}
              {projeto.status !== 'perdido' && projeto.status !== 'entregue' && (
                <div className="flex items-center gap-2 flex-wrap">
                  {proximosStatus.length > 0 && (
                    <button
                      onClick={() => { setNovoStatus(proximosStatus[0]); setModalStatus(true); }}
                      className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors"
                    >
                      <iconify-icon icon="solar:refresh-linear" width="13"></iconify-icon>
                      Atualizar status
                    </button>
                  )}
                  <button
                    onClick={() => setModalPerda(true)}
                    className="flex items-center gap-2 border border-red-500/30 bg-red-400/5 text-red-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-red-400 transition-colors"
                  >
                    <iconify-icon icon="solar:close-circle-linear" width="13"></iconify-icon>
                    Marcar como perdido
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="sys-reveal sys-delay-100 flex border-b border-zinc-800 mb-6">
          {[
            { id: 'medicoes',  label: 'Medições',               icon: 'solar:ruler-pen-linear' },
            { id: 'ambientes', label: 'Ambientes e Orçamentos', icon: 'solar:layers-linear'    },
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

        {/* ══ ABA: MEDIÇÕES ═══════════════════════════════════════════════ */}
        {activeTab === 'medicoes' && (
          <div className="sys-reveal sys-active">
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
              {/* Cabeçalho */}
              <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Data</span>
                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Medidor</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Status</span>
                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Ação</span>
              </div>

              {medicoes.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <iconify-icon icon="solar:ruler-pen-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhuma medição agendada</p>
                </div>
              ) : (
                medicoes.map((m, i) => {
                  const medidorNome = Array.isArray(m.medidor) ? (m.medidor[0]?.nome ?? '—') : (m.medidor?.nome ?? '—');
                  const dataFormatada = m.data_agendada
                    ? new Date(m.data_agendada).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  return (
                    <div
                      key={m.id}
                      className={`grid grid-cols-12 items-center px-4 py-3.5 hover:bg-white/[0.01] transition-colors ${i < medicoes.length - 1 ? 'border-b border-zinc-900' : ''}`}
                    >
                      <div className="col-span-4 flex items-center gap-2">
                        <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600 shrink-0"></iconify-icon>
                        <span className="text-sm text-white font-medium">{dataFormatada}</span>
                      </div>
                      <div className="col-span-3 font-mono text-[11px] text-zinc-500">{medidorNome}</div>
                      <div className="col-span-2">
                        <MedicaoPill status={m.status} />
                      </div>
                      <div className="col-span-3 flex justify-end">
                        {m.status === 'processada' && (
                          <button
                            onClick={() => setPainelMedicao(m)}
                            className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 hover:border-white hover:text-white transition-colors"
                          >
                            <iconify-icon icon="solar:eye-linear" width="12"></iconify-icon>
                            Ver dados
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ══ ABA: AMBIENTES E ORÇAMENTOS ════════════════════════════════ */}
        {activeTab === 'ambientes' && (
          <div className="sys-reveal sys-active">
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
              02 // Ambientes e Orçamentos
            </div>

            {dataToRender.length === 0 ? (
              <div className="bg-[#0a0a0a] border border-zinc-800 px-4 py-12 text-center">
                <iconify-icon icon="solar:layers-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum ambiente encontrado</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {dataToRender.map(amb => (
                  <div key={amb.id} className="bg-[#0a0a0a] border border-zinc-800">

                    {/* Header do ambiente */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div 
                          className="w-4 h-4 border border-zinc-700 flex items-center justify-center shrink-0 cursor-pointer hover:border-yellow-400 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            const allSelected = amb.versoes.length > 0 && amb.versoes.every(v => selecionadosCarrinho[v.id]);
                            const newState = { ...selecionadosCarrinho };
                            amb.versoes.forEach(v => {
                              newState[v.id] = !allSelected;
                            });
                            setSelecionadosCarrinho(newState);
                          }}
                        >
                          {(amb.versoes.length > 0 && amb.versoes.every(v => selecionadosCarrinho[v.id])) && <iconify-icon icon="solar:check-read-linear" width="10" className="text-yellow-400"></iconify-icon>}
                          {(amb.versoes.length > 0 && !amb.versoes.every(v => selecionadosCarrinho[v.id]) && amb.versoes.some(v => selecionadosCarrinho[v.id])) && <div className="w-2 h-2 bg-yellow-400"></div>}
                        </div>
                        <iconify-icon icon="solar:layers-minimalistic-linear" width="14" className="text-zinc-600"></iconify-icon>
                        <span className="text-white font-semibold text-sm tracking-tight">{amb.nome}</span>
                        {amb.orcamento_status === 'sem_orcamento' && (
                          <span className="px-2 py-0.5 border border-zinc-800 text-[9px] font-mono uppercase text-zinc-600">Sem orçamento</span>
                        )}
                        {amb.orcamento_status === 'em_andamento' && (
                          <span className="px-2 py-0.5 border border-yellow-400/30 text-[9px] font-mono uppercase text-yellow-400 bg-yellow-400/5">Em andamento</span>
                        )}
                        {amb.orcamento_status === 'completo' && (
                          <span className="px-2 py-0.5 border border-green-500/30 text-[9px] font-mono uppercase text-green-400 bg-green-400/5">Completo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {amb.orcamento_status === 'sem_orcamento' ? (
                          <button
                            onClick={() => navigate(`/projetos/${id}/orcamento/novo?ambiente_id=${amb.id}`)}
                            className="flex items-center gap-1.5 bg-yellow-400 text-black text-[10px] font-bold uppercase tracking-widest px-3 py-2 hover:shadow-[0_0_10px_rgba(250,204,21,0.3)] transition-all"
                          >
                            <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                            Criar orçamento
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/projetos/${id}/orcamento/novo?ambiente_id=${amb.id}`)}
                            className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:border-white hover:text-white transition-colors"
                          >
                            <iconify-icon icon="solar:document-add-linear" width="12"></iconify-icon>
                            Nova versão
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Versões */}
                    {amb.versoes.length > 0 && (
                      <div>
                        {amb.versoes.map((v, i) => (
                          <div key={v.id} className={`flex flex-col group transition-colors ${i < amb.versoes.length - 1 ? 'border-b border-zinc-900' : ''}`}>
                            <div
                              onClick={(e) => toggleVersao(e, v.id)}
                              className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.01] cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div 
                                  className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${selecionadosCarrinho[v.id] ? 'border-yellow-400 bg-yellow-400/10' : 'border-zinc-700 hover:border-yellow-400'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelecionadosCarrinho(prev => ({ ...prev, [v.id]: !prev[v.id] }));
                                  }}
                                >
                                  {selecionadosCarrinho[v.id] && <iconify-icon icon="solar:check-read-linear" width="10" className="text-yellow-400"></iconify-icon>}
                                </div>
                                <iconify-icon icon="solar:document-text-linear" width="13" className="text-zinc-700 group-hover:text-yellow-400 transition-colors shrink-0"></iconify-icon>
                                <div className="min-w-0">
                                  <div className="text-sm text-white font-medium group-hover:text-yellow-400 transition-colors truncate">{v.nome}</div>
                                  <div className="font-mono text-[10px] text-zinc-600">{v.data}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="font-mono text-sm text-white font-semibold">{v.valor}</span>
                                <iconify-icon
                                  icon={versoesExpandidas[v.id] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                  width="13"
                                  className="text-zinc-700 group-hover:text-yellow-400 transition-colors"
                                ></iconify-icon>
                              </div>
                            </div>

                            {versoesExpandidas[v.id] && v.pecas.length > 0 && (
                              <div className="px-5 pb-4 flex flex-col gap-2 bg-[#0a0a0a]">
                                {v.pecas.map(p => (
                                  <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 border border-zinc-800 bg-black gap-3 hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className="w-1 h-5 bg-zinc-800 shrink-0"></div>
                                      <div>
                                        <div className="text-xs text-white font-medium">{p.nome}</div>
                                        <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{p.material || <span className="italic text-zinc-700">Sem material</span>}</div>
                                      </div>
                                    </div>
                                    <span className="font-mono text-xs text-zinc-400 shrink-0">{p.valor}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {amb.versoes.length === 0 && amb.orcamento_status === 'sem_orcamento' && (
                      <div className="px-5 py-6 text-center">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum orçamento para este ambiente</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Rodapé fixo */}
            <div className="sticky bottom-0 left-0 right-0 mt-6 bg-[#050505] border-t border-zinc-800 py-4 flex justify-end">
              <button
                onClick={() => alert('Funcionalidade simulada')}
                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-5 py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all"
              >
                <iconify-icon icon="solar:document-linear" width="14"></iconify-icon>
                Gerar PDF / WhatsApp
                <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ══ PAINEL LATERAL — Dados da medição ══════════════════════════════ */}
      {painelMedicao && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setPainelMedicao(null)}></div>
          <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Dados da medição</div>
                <div className="text-white font-semibold text-sm">
                  {painelMedicao.data_agendada
                    ? new Date(painelMedicao.data_agendada).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
              <button onClick={() => setPainelMedicao(null)} className="text-zinc-600 hover:text-white transition-colors p-1">
                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-1">
                Resumo por peça
              </div>
              {(() => {
                const resumo = extractResumoPecas(painelMedicao.json_medicao);
                if (resumo.length === 0) {
                  return (
                    <div className="py-8 text-center">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Sem dados de peças disponíveis</p>
                    </div>
                  );
                }
                return resumo.map((r, i) => (
                  <div key={i} className="bg-black border border-zinc-900 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-white font-semibold text-sm">{r.nome}</span>
                      <span className="font-mono text-sm text-yellow-400 font-bold">{r.area}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-600 mt-0.5 shrink-0"></iconify-icon>
                        <span className="font-mono text-[10px] text-zinc-500">{r.acabamentos}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-600 shrink-0"></iconify-icon>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {r.recortes === 0 ? 'Sem recortes' : `${r.recortes} recorte${r.recortes !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
              <button
                onClick={() => {
                  setPainelMedicao(null);
                  navigate(`/projetos/${id}/orcamento/novo?medicao_id=${painelMedicao.id}`);
                }}
                className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all"
              >
                <iconify-icon icon="solar:add-circle-linear" width="14"></iconify-icon>
                Criar orçamento com estes dados
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ MODAL — Agendar Medição ══════════════════════════════════════ */}
      {modalAgendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
          <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-[480px] z-10">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ AGENDAR_MEDIÇÃO ]</div>
                <div className="text-white font-semibold">Nova medição</div>
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
                    className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors appearance-none"
                  >
                    <option value="">Selecionar medidor</option>
                    {medidores.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                  <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
                </div>
                {medidores.length === 0 && (
                  <p className="font-mono text-[9px] text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa.</p>
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
                    className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Endereço <span className="text-zinc-700 normal-case">(opcional)</span></label>
                <div className="relative">
                  <iconify-icon icon="solar:map-point-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" width="16"></iconify-icon>
                  <input
                    type="text"
                    value={agEndereco}
                    onChange={e => setAgEndereco(e.target.value)}
                    placeholder="Endereço da medição"
                    className="w-full bg-black border border-zinc-800 text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700"
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeAll}
                  className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAgendarMedicao}
                  disabled={agendando}
                  className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-yellow-300 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {agendando && <iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon>}
                  {agendando ? 'Agendando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Marcar como Perdido ════════════════════════════════ */}
      {modalPerda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
          <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-md z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ MARCAR_PERDIDO ]</div>
                <div className="text-white font-semibold">Marcar projeto como perdido</div>
              </div>
              <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {erroPerda && (
                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                  <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                  <span className="font-mono text-[10px] text-red-400">{erroPerda}</span>
                </div>
              )}
              <p className="font-mono text-[11px] text-zinc-500 leading-relaxed">
                Esta ação marcará o projeto como perdido. Você pode informar o motivo abaixo (opcional).
              </p>
              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Motivo da perda <span className="text-zinc-700 normal-case">(opcional)</span></label>
                <textarea
                  value={motivoPerda}
                  onChange={e => setMotivoPerda(e.target.value)}
                  rows={3}
                  placeholder="Ex: Cliente escolheu outro fornecedor..."
                  className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeAll}
                  className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMarcarPerdido}
                  disabled={salvandoPerda}
                  className="flex-1 bg-red-500 text-white font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-red-400 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {salvandoPerda && <iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon>}
                  {salvandoPerda ? 'Salvando...' : 'Confirmar perda'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL — Atualizar Status ════════════════════════════════════ */}
      {modalStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
          <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-md z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ ATUALIZAR_STATUS ]</div>
                <div className="text-white font-semibold">Atualizar status do projeto</div>
              </div>
              <button onClick={closeAll} className="text-zinc-600 hover:text-white transition-colors p-1">
                <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {erroStatus && (
                <div className="border border-red-500/30 bg-red-400/5 px-3 py-2 flex items-center gap-2">
                  <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-400 shrink-0"></iconify-icon>
                  <span className="font-mono text-[10px] text-red-400">{erroStatus}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Atual:</span>
                <StatusPill status={projeto.status} />
              </div>

              <div className="flex flex-col gap-2">
                {proximosStatus.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <div
                      key={s}
                      onClick={() => setNovoStatus(s)}
                      className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                        novoStatus === s ? 'border-yellow-400/40 bg-yellow-400/[0.03]' : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${novoStatus === s ? 'border-yellow-400 bg-yellow-400' : 'border-zinc-700'}`}>
                        {novoStatus === s && <iconify-icon icon="solar:check-read-linear" width="9" className="text-black"></iconify-icon>}
                      </div>
                      <span className={`${cfg.color} font-mono text-[11px] uppercase tracking-widest`}>{cfg.label}</span>
                      {s === 'aprovado' && (
                        <span className="font-mono text-[9px] text-zinc-600 ml-auto">Abre formulário de fechamento</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeAll}
                  className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAtualizarStatus}
                  disabled={salvandoStatus || !novoStatus}
                  className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-yellow-300 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {salvandoStatus && <iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon>}
                  {salvandoStatus ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
