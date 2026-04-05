/**
 * Carrinho.jsx
 * Clone visual de TelaProjeto.jsx — mesmas cores, cards, iconify-icon, espaçamento.
 * Hierarquia: Ambiente → Versões (lista com checkbox) → Peças (expand por chevron)
 * Tríade completa (Editar · Duplicar · Excluir) em Ambientes e Versões
 * Botão "Mudar Material" por versão — atualiza todas as peças em massa
 * Persistência híbrida: IDs mock → local only | IDs reais → Supabase
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// ── Utilitários ───────────────────────────────────────────────────────────────
const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fkStr = (val, f) => !val ? '' : Array.isArray(val) ? (val[0]?.[f] ?? '') : (val[f] ?? '');
const isMock = id => typeof id === 'string' && id.startsWith('mock-');
const newId = () => `mock-${crypto.randomUUID()}`;

// ── Mock Data (fallback completo com versões e peças) ────────────────────────
const MOCK_INICIAL = [
  {
    id: 'mock-amb-1',
    nome: 'Cozinha',
    versoes: [
      {
        id: 'mock-v-1',
        nome: 'Versão — Branco Siena',
        valor_total: 14800,
        pecas: [
          { id: 'mock-p-1', nome: 'Bancada Principal', material: 'Branco Siena', espessura: '2cm', area: '1,80 m²', acabamento: 'Meia Esquadria', valor: 6200 },
          { id: 'mock-p-2', nome: 'Ilha Central', material: 'Branco Siena', espessura: '2cm', area: '1,40 m²', acabamento: 'Reto Simples', valor: 5100 },
          { id: 'mock-p-3', nome: 'Pingadeira', material: 'Branco Siena', espessura: '1cm', area: '0,60 m²', acabamento: 'Boleado', valor: 1900 },
          { id: 'mock-p-4', nome: 'Rodapé', material: 'Branco Siena', espessura: '1cm', area: '0,80 m²', acabamento: 'Reto Simples', valor: 1600 },
        ],
      },
      {
        id: 'mock-v-2',
        nome: 'Versão — Granito São Gabriel',
        valor_total: 11200,
        pecas: [
          { id: 'mock-p-5', nome: 'Bancada Principal', material: 'Granito São Gabriel', espessura: '2cm', area: '1,80 m²', acabamento: 'Meia Esquadria', valor: 4800 },
          { id: 'mock-p-6', nome: 'Ilha Central', material: 'Granito São Gabriel', espessura: '2cm', area: '1,40 m²', acabamento: 'Reto Simples', valor: 3900 },
          { id: 'mock-p-7', nome: 'Pingadeira', material: 'Granito São Gabriel', espessura: '1cm', area: '0,60 m²', acabamento: 'Boleado', valor: 1400 },
          { id: 'mock-p-8', nome: 'Rodapé', material: 'Granito São Gabriel', espessura: '1cm', area: '0,80 m²', acabamento: 'Reto Simples', valor: 1100 },
        ],
      },
      {
        id: 'mock-v-3',
        nome: 'Versão — Silestone Tigris Sand',
        valor_total: 28500,
        pecas: [
          { id: 'mock-p-9', nome: 'Bancada Principal', material: 'Silestone Tigris Sand', espessura: '2cm', area: '1,80 m²', acabamento: 'Meia Esquadria', valor: 11800 },
          { id: 'mock-p-10', nome: 'Ilha Central', material: 'Silestone Tigris Sand', espessura: '2cm', area: '1,40 m²', acabamento: 'Reto Simples', valor: 9200 },
          { id: 'mock-p-11', nome: 'Pingadeira', material: 'Silestone Tigris Sand', espessura: '1cm', area: '0,60 m²', acabamento: 'Boleado', valor: 4100 },
          { id: 'mock-p-12', nome: 'Rodapé', material: 'Silestone Tigris Sand', espessura: '1cm', area: '0,80 m²', acabamento: 'Reto Simples', valor: 3400 },
        ],
      },
    ],
  },
  {
    id: 'mock-amb-2',
    nome: 'Quarto Master',
    versoes: [
      {
        id: 'mock-v-4',
        nome: 'Versão — Calacata Gold',
        valor_total: 9800,
        pecas: [
          { id: 'mock-p-13', nome: 'Bancada do Banheiro', material: 'Calacata Gold', espessura: '2cm', area: '0,90 m²', acabamento: 'Reto Simples', valor: 6200 },
          { id: 'mock-p-14', nome: 'Peitoril Janela', material: 'Calacata Gold', espessura: '2cm', area: '0,40 m²', acabamento: 'Boleado', valor: 2400 },
          { id: 'mock-p-15', nome: 'Nicho Parede', material: 'Calacata Gold', espessura: '2cm', area: '0,20 m²', acabamento: 'Polido', valor: 1200 },
        ],
      },
      {
        id: 'mock-v-5',
        nome: 'Versão — Nanoglass Glacial',
        valor_total: 15400,
        pecas: [
          { id: 'mock-p-16', nome: 'Bancada do Banheiro', material: 'Nanoglass Glacial', espessura: '2cm', area: '0,90 m²', acabamento: 'Reto Simples', valor: 9800 },
          { id: 'mock-p-17', nome: 'Peitoril Janela', material: 'Nanoglass Glacial', espessura: '2cm', area: '0,40 m²', acabamento: 'Boleado', valor: 3800 },
          { id: 'mock-p-18', nome: 'Nicho Parede', material: 'Nanoglass Glacial', espessura: '2cm', area: '0,20 m²', acabamento: 'Polido', valor: 1800 },
        ],
      },
    ],
  },
  {
    id: 'mock-amb-3',
    nome: 'Área Gourmet',
    versoes: [
      {
        id: 'mock-v-6',
        nome: 'Versão — Verde Ubatuba',
        valor_total: 7400,
        pecas: [
          { id: 'mock-p-19', nome: 'Churrasqueira', material: 'Verde Ubatuba', espessura: '3cm', area: '1,20 m²', acabamento: 'Apicoado', valor: 4200 },
          { id: 'mock-p-20', nome: 'Pia Área Externa', material: 'Verde Ubatuba', espessura: '3cm', area: '0,80 m²', acabamento: 'Polido', valor: 3200 },
        ],
      },
    ],
  },
];

// ── Mappers (Supabase → estrutura interna) ────────────────────────────────────
function mapVersao(orc) {
  if (!orc) return null;
  const pecas = (orc.orcamento_pecas || []).map(op => ({
    id: op.id,
    material_id: op.material_id,
    nome: fkStr(op.pecas, 'nome_livre') || '—',
    material: fkStr(op.materiais, 'nome') || '—',
    espessura: op.espessura || '—',
    area: op.area || '—',
    acabamento: '—',
    valor: op.valor_total ?? 0,
  })).filter(Boolean);
  return {
    id: orc.id,
    nome: orc.nome_versao || 'Versão',
    valor_total: pecas.reduce((s, p) => s + p.valor, 0),
    pecas,
  };
}
function mapAmbiente(amb) {
  if (!amb) return null;
  return {
    id: amb.id,
    nome: amb.nome || 'Sem nome',
    versoes: (amb.orcamentos || []).map(mapVersao).filter(Boolean),
  };
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Carrinho() {
  const navigate = useNavigate();
  const { id: projetoId } = useParams();
  const { session, profile } = useAuth();

  // Estado
  const [ambientes, setAmbientes] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);     // versoes selecionadas (checkbox)
  const [expandidos, setExpandidos] = useState({});     // { versaoId: bool }
  const [loading, setLoading] = useState(true);
  const [loadingAmbId, setLoadingAmbId] = useState(null);
  const [loadingVersaoId, setLoadingVersaoId] = useState(null);
  const [projeto, setProjeto] = useState(null);
  const [erro, setErro] = useState('');

  // Modais
  const [editingAmbNome, setEditingAmbNome] = useState(null); // { id, nome }
  const [editingVersaoNome, setEditingVersaoNome] = useState(null); // { ambId, id, nome }
  const [editingMaterial, setEditingMaterial] = useState(null); // { ambId, versaoId, material }

  // ── Carregar dados ────────────────────────────────────────────────────────
  function carregarLista(lista) {
    setAmbientes(lista);
  }

  useEffect(() => {
    if (session === undefined || !projetoId) return;
    if (!session) { navigate('/login', { replace: true }); return; }
    let mounted = true;

    (async () => {
      setLoading(true); setErro('');
      try {
        const { data: proj } = await supabase
          .from('projetos').select('id, nome, clientes(id, nome)')
          .eq('id', projetoId).single();
        if (mounted && proj) setProjeto(proj);

        const { data: raw } = await supabase
          .from('ambientes')
          .select(`id, nome, created_at,
            orcamentos(id, nome_versao, valor_total, created_at,
              orcamento_pecas(id, valor_total, material_id,
                pecas(nome_livre), materiais(nome)))`)
          .eq('projeto_id', projetoId)
          .order('created_at', { ascending: true });

        if (!mounted) return;
        console.log('[Carrinho] Dados do banco:', raw);
        const parsed = (raw || []).map(mapAmbiente).filter(Boolean);
        carregarLista(parsed.length > 0 ? parsed : MOCK_INICIAL);
        if (parsed.length === 0) console.info('[Carrinho] Banco vazio → MOCK carregado');
      } catch (err) {
        console.error('[Carrinho] Exceção:', err);
        if (mounted) carregarLista(MOCK_INICIAL);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [session, projetoId]); // eslint-disable-line

  // ── Toggle versão expandida ───────────────────────────────────────────────
  const toggleExpandido = (e, versaoId) => {
    e.stopPropagation();
    setExpandidos(p => ({ ...p, [versaoId]: !p[versaoId] }));
  };

  // ── Toggle seleção (checkbox) ─────────────────────────────────────────────
  const toggleSelecionar = (e, versaoId) => {
    e.stopPropagation();
    setSelectedIds(p => p.includes(versaoId) ? p.filter(x => x !== versaoId) : [...p, versaoId]);
  };

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalSelecionado = ambientes
    .flatMap(a => a.versoes)
    .filter(v => selectedIds.includes(v.id))
    .reduce((s, v) => s + v.valor_total, 0);

  const projetoNome = projeto?.nome || 'Projeto';
  const clienteNome = fkStr(projeto?.clientes, 'nome');

  // ── Renomear Ambiente ─────────────────────────────────────────────────────
  const salvarNomeAmbiente = async () => {
    if (!editingAmbNome) return;
    const { id, nome } = editingAmbNome;
    setAmbientes(p => p.map(a => a.id === id ? { ...a, nome } : a));
    setEditingAmbNome(null);
    if (!isMock(id)) await supabase.from('ambientes').update({ nome }).eq('id', id);
  };

  // ── Renomear Versão ───────────────────────────────────────────────────────
  const salvarNomeVersao = async () => {
    if (!editingVersaoNome) return;
    const { ambId, id, nome } = editingVersaoNome;
    setAmbientes(p => p.map(a => a.id !== ambId ? a : {
      ...a, versoes: a.versoes.map(v => v.id === id ? { ...v, nome } : v),
    }));
    setEditingVersaoNome(null);
    if (!isMock(id)) await supabase.from('orcamentos').update({ nome_versao: nome }).eq('id', id);
  };

  // ── Duplicar Ambiente ─────────────────────────────────────────────────────
  const duplicarAmbiente = async (e, ambId) => {
    e.stopPropagation();
    const orig = ambientes.find(a => a.id === ambId);
    if (!orig) return;

    if (isMock(ambId) || !profile?.empresa_id) {
      const copia = JSON.parse(JSON.stringify(orig));
      copia.id = newId(); copia.nome = `${orig.nome} (Cópia)`;
      copia.versoes = copia.versoes.map(v => ({
        ...v, id: newId(), pecas: v.pecas.map(p => ({ ...p, id: newId() }))
      }));
      setAmbientes(p => { const l = [...p]; l.splice(l.findIndex(a => a.id === ambId) + 1, 0, copia); return l; });
      return;
    }

    setLoadingAmbId(ambId);
    try {
      const { data: na, error: e1 } = await supabase.from('ambientes')
        .insert({ projeto_id: projetoId, empresa_id: profile.empresa_id, nome: `${orig.nome} (Cópia)` })
        .select('id').single();
      if (e1) throw new Error(e1.message);
      const versoesCopia = [];
      for (const v of orig.versoes) {
        const { data: no, error: e2 } = await supabase.from('orcamentos')
          .insert({ ambiente_id: na.id, empresa_id: profile.empresa_id, vendedor_id: session.user.id, nome_versao: v.nome, valor_total: v.valor_total, status: 'rascunho', desconto_total: 0 })
          .select('id').single();
        if (e2) throw new Error(e2.message);
        const { data: ops } = await supabase.from('orcamento_pecas')
          .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total')
          .eq('orcamento_id', v.id);
        if (ops?.length) await supabase.from('orcamento_pecas').insert(ops.map(op => ({ ...op, orcamento_id: no.id })));
        versoesCopia.push({ ...v, id: no.id, pecas: v.pecas.map(p => ({ ...p })) });
      }
      const novoAmb = { id: na.id, nome: `${orig.nome} (Cópia)`, versoes: versoesCopia };
      setAmbientes(p => { const l = [...p]; l.splice(l.findIndex(a => a.id === ambId) + 1, 0, novoAmb); return l; });
    } catch (err) { setErro(err.message); }
    finally { setLoadingAmbId(null); }
  };

  // ── Excluir Ambiente ──────────────────────────────────────────────────────
  const excluirAmbiente = async (e, ambId) => {
    e.stopPropagation();
    if (!window.confirm('Excluir este ambiente e todos os seus orçamentos?')) return;
    // Remove imediatamente da tela
    const idsVersoes = ambientes.find(a => a.id === ambId)?.versoes.map(v => v.id) || [];
    setAmbientes(p => p.filter(a => a.id !== ambId));
    setSelectedIds(p => p.filter(id => !idsVersoes.includes(id)));
    if (isMock(ambId)) return;
    setLoadingAmbId(ambId);
    try {
      const { error } = await supabase.from('ambientes').delete().eq('id', ambId);
      if (error) setErro(error.message);
    } catch (err) { setErro(err.message); }
    finally { setLoadingAmbId(null); }
  };

  // ── Duplicar Versão ───────────────────────────────────────────────────────
  const duplicarVersao = async (e, ambId, versaoId) => {
    e.stopPropagation();
    const amb = ambientes.find(a => a.id === ambId);
    const v = amb?.versoes.find(x => x.id === versaoId);
    if (!v) return;

    if (isMock(versaoId) || isMock(ambId) || !profile?.empresa_id) {
      const copia = { ...JSON.parse(JSON.stringify(v)), id: newId(), nome: `${v.nome} (Cópia)`, pecas: v.pecas.map(p => ({ ...p, id: newId() })) };
      setAmbientes(p => p.map(a => {
        if (a.id !== ambId) return a;
        const vs = [...a.versoes]; vs.splice(vs.findIndex(x => x.id === versaoId) + 1, 0, copia); return { ...a, versoes: vs };
      }));
      return;
    }

    setLoadingVersaoId(versaoId);
    try {
      const { data: no, error: e1 } = await supabase.from('orcamentos')
        .insert({ ambiente_id: ambId, empresa_id: profile.empresa_id, vendedor_id: session.user.id, nome_versao: `${v.nome} (Cópia)`, valor_total: v.valor_total, status: 'rascunho', desconto_total: 0 })
        .select('id').single();
      if (e1) throw new Error(e1.message);
      const { data: ops } = await supabase.from('orcamento_pecas')
        .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total')
        .eq('orcamento_id', versaoId);
      if (ops?.length) await supabase.from('orcamento_pecas').insert(ops.map(op => ({ ...op, orcamento_id: no.id })));
      const copia = { ...v, id: no.id, nome: `${v.nome} (Cópia)`, pecas: v.pecas.map(p => ({ ...p })) };
      setAmbientes(p => p.map(a => {
        if (a.id !== ambId) return a;
        const vs = [...a.versoes]; vs.splice(vs.findIndex(x => x.id === versaoId) + 1, 0, copia); return { ...a, versoes: vs };
      }));
    } catch (err) { setErro(err.message); }
    finally { setLoadingVersaoId(null); }
  };

  // ── Excluir Versão ────────────────────────────────────────────────────────
  const excluirVersao = async (e, ambId, versaoId) => {
    e.stopPropagation();
    if (!window.confirm('Excluir esta versão do orçamento?')) return;
    setAmbientes(p => p.map(a => a.id !== ambId ? a : { ...a, versoes: a.versoes.filter(v => v.id !== versaoId) }));
    setSelectedIds(p => p.filter(id => id !== versaoId));
    if (isMock(versaoId) || isMock(ambId)) return;
    setLoadingVersaoId(versaoId);
    try {
      const { error } = await supabase.from('orcamentos').delete().eq('id', versaoId);
      if (error) setErro(error.message);
    } catch (err) { setErro(err.message); }
    finally { setLoadingVersaoId(null); }
  };

  // ── Aplicar Material em Massa ─────────────────────────────────────────────
  const aplicarMaterial = async () => {
    if (!editingMaterial) return;
    const { ambId, versaoId, material } = editingMaterial;
    setEditingMaterial(null);

    // Atualiza localmente primeiro
    setAmbientes(prev => prev.map(a => a.id !== ambId ? a : {
      ...a, versoes: a.versoes.map(v => v.id !== versaoId ? v : {
        ...v, nome: `Versão — ${material}`,
        pecas: v.pecas.map(p => ({ ...p, material })),
      }),
    }));

    if (isMock(versaoId) || isMock(ambId)) return;

    setLoadingVersaoId(versaoId);
    try {
      // Busca material no banco
      const { data: mats } = await supabase.from('materiais')
        .select('id').ilike('nome', `%${material}%`).limit(1);
      const matId = mats?.[0]?.id;
      if (matId) {
        // Atualiza nome da versão
        await supabase.from('orcamentos').update({ nome_versao: `Versão — ${material}` }).eq('id', versaoId);
        // Atualiza material de todas as peças
        const amb = ambientes.find(a => a.id === ambId);
        const v = amb?.versoes.find(x => x.id === versaoId);
        const ids = (v?.pecas || []).map(p => p.id);
        if (ids.length) await supabase.from('orcamento_pecas').update({ material_id: matId }).in('id', ids);
      }
    } catch (err) { setErro(err.message); }
    finally { setLoadingVersaoId(null); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-zinc-600 gap-4">
      <iconify-icon icon="solar:spinner-linear" width="40" class="animate-spin" />
      <p className="font-mono text-xs uppercase tracking-widest">Carregando orçamento...</p>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-yellow-400/30">

      {/* Backgrounds — mesmo padrão do TelaProjeto */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid" />
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]" />

      <main className="relative z-10 max-w-[1100px] mx-auto w-full p-4 md:p-8 pt-10 pb-40">

        {/* Toast erro */}
        {erro && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-950 border border-red-700/50 px-5 py-3 flex items-center gap-3 shadow-xl max-w-md w-full">
            <iconify-icon icon="solar:danger-triangle-linear" width="16" class="text-red-400 shrink-0" />
            <span className="font-mono text-[11px] text-red-300 flex-1">{erro}</span>
            <button onClick={() => setErro('')} className="text-red-500 hover:text-white">
              <iconify-icon icon="solar:close-linear" width="14" />
            </button>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
          <button onClick={() => navigate(`/projetos/${projetoId}`)} className="hover:text-yellow-400 transition-colors">
            {projetoNome}
          </button>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" class="text-zinc-700" />
          <span className="text-zinc-400">Gerar Orçamento</span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5 mb-2">
                11 // Carrinho
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Gerar Orçamento</h1>
              {clienteNome && <p className="font-mono text-[11px] text-zinc-500 mt-0.5">{clienteNome}</p>}
            </div>
            <button
              onClick={() => navigate(`/projetos/${projetoId}`)}
              className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors self-start md:self-auto"
            >
              <iconify-icon icon="solar:arrow-left-linear" width="13" />
              Voltar ao projeto
            </button>
          </div>
        </section>

        {/* Label seção */}
        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-4">
          02 // Ambientes e Versões
        </div>

        {/* Estado vazio */}
        {ambientes.length === 0 ? (
          <div className="bg-[#0a0a0a] border border-zinc-800 px-6 py-16 text-center">
            <iconify-icon icon="solar:layers-linear" width="36" class="text-zinc-800 block mx-auto mb-4" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-700 mb-6">
              Este projeto ainda não tem ambientes com orçamento.
            </p>
            <button
              onClick={() => navigate(`/projetos/${projetoId}`)}
              className="border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-5 py-2.5 hover:border-white hover:text-white transition-colors"
            >
              Ir para o projeto
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {ambientes.map(amb => (
              <div key={amb.id} className="bg-[#0a0a0a] border border-zinc-800">

                {/* ── Cabeçalho do Ambiente ── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <iconify-icon icon="solar:layers-minimalistic-linear" width="14" class="text-zinc-600 shrink-0" />
                    <span className="text-white font-semibold text-sm tracking-tight">{amb.nome}</span>
                    <span className="px-2 py-0.5 border border-yellow-400/30 text-[9px] font-mono uppercase text-yellow-400 bg-yellow-400/5">
                      {amb.versoes.length} {amb.versoes.length === 1 ? 'versão' : 'versões'}
                    </span>
                  </div>

                  {/* Tríade do Ambiente */}
                  <div className="flex items-center gap-1.5">
                    {loadingAmbId === amb.id ? (
                      <iconify-icon icon="solar:spinner-linear" width="16" class="animate-spin text-yellow-400 mx-2" />
                    ) : (
                      <>
                        <button
                          title="Renomear ambiente"
                          onClick={e => { e.stopPropagation(); setEditingAmbNome({ id: amb.id, nome: amb.nome }); }}
                          className="flex items-center border border-zinc-700 text-zinc-400 text-[9px] font-mono px-2 py-1.5 hover:border-white hover:text-white transition-colors"
                        >
                          <iconify-icon icon="solar:pen-linear" width="12" />
                        </button>
                        <button
                          title="Duplicar ambiente"
                          onClick={e => duplicarAmbiente(e, amb.id)}
                          className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 hover:border-yellow-400 hover:text-yellow-400 transition-colors"
                        >
                          <iconify-icon icon="solar:copy-linear" width="12" />
                          Duplicar
                        </button>
                        <button
                          title="Excluir ambiente"
                          onClick={e => excluirAmbiente(e, amb.id)}
                          className="flex items-center border border-zinc-700 text-zinc-400 text-[9px] font-mono px-2 py-1.5 hover:border-red-400 hover:text-red-400 transition-colors"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="12" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Lista de Versões ── */}
                {amb.versoes.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum orçamento neste ambiente</p>
                  </div>
                ) : (
                  amb.versoes.map((v, vi) => {
                    const isChecked = selectedIds.includes(v.id);
                    const isExpandido = !!expandidos[v.id];
                    const vBusy = loadingVersaoId === v.id;

                    return (
                      <div
                        key={v.id}
                        className={`flex flex-col group transition-colors ${vi < amb.versoes.length - 1 ? 'border-b border-zinc-900' : ''}`}
                      >
                        {/* Linha da versão */}
                        <div
                          onClick={e => toggleExpandido(e, v.id)}
                          className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.01] cursor-pointer"
                        >
                          {/* Esquerda: checkbox + ícone + nome */}
                          <div className="flex items-center gap-3">
                            {/* Checkbox de seleção */}
                            <div
                              onClick={e => toggleSelecionar(e, v.id)}
                              className={`w-4 h-4 flex items-center justify-center shrink-0 border cursor-pointer transition-colors ${isChecked ? 'border-yellow-400 bg-yellow-400/10' : 'border-zinc-700 hover:border-yellow-400'
                                }`}
                            >
                              {isChecked && <iconify-icon icon="solar:check-read-linear" width="10" class="text-yellow-400" />}
                            </div>

                            <iconify-icon
                              icon="solar:document-text-linear"
                              width="13"
                              class={`transition-colors shrink-0 ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}
                            />

                            <div>
                              <div className={`text-sm font-medium transition-colors ${isChecked ? 'text-yellow-400' : 'text-white group-hover:text-yellow-400'}`}>
                                {v.nome}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-600">
                                {v.pecas.length} peça{v.pecas.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Direita: ações + valor + chevron */}
                          <div className="flex items-center gap-3">
                            {/* Tríade da versão (visível no hover) */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                              {vBusy ? (
                                <iconify-icon icon="solar:spinner-linear" width="14" class="animate-spin text-yellow-400" />
                              ) : (
                                <>
                                  <button
                                    title="Renomear versão"
                                    onClick={e => { e.stopPropagation(); setEditingVersaoNome({ ambId: amb.id, id: v.id, nome: v.nome }); }}
                                    className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors rounded"
                                  >
                                    <iconify-icon icon="solar:pen-linear" width="13" />
                                  </button>
                                  <button
                                    title="Mudar material desta versão"
                                    onClick={e => { e.stopPropagation(); setEditingMaterial({ ambId: amb.id, versaoId: v.id, material: v.pecas?.[0]?.material || '' }); }}
                                    className="p-1.5 text-zinc-500 hover:text-violet-400 hover:bg-violet-400/10 transition-colors rounded"
                                  >
                                    <iconify-icon icon="solar:paint-roller-linear" width="13" />
                                  </button>
                                  <button
                                    title="Duplicar versão"
                                    onClick={e => duplicarVersao(e, amb.id, v.id)}
                                    className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors rounded"
                                  >
                                    <iconify-icon icon="solar:copy-linear" width="13" />
                                  </button>
                                  <button
                                    title="Excluir versão"
                                    onClick={e => excluirVersao(e, amb.id, v.id)}
                                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors rounded"
                                  >
                                    <iconify-icon icon="solar:trash-bin-trash-linear" width="13" />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Valor total */}
                            <span className={`font-mono text-sm font-semibold ${isChecked ? 'text-yellow-400' : 'text-white'}`}>
                              {fmt(v.valor_total)}
                            </span>

                            {/* Chevron */}
                            <iconify-icon
                              icon={isExpandido ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                              width="13"
                              class={`transition-colors ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}
                            />
                          </div>
                        </div>

                        {/* Tabela de peças (expandida) */}
                        {isExpandido && (
                          <div className="px-5 pb-4 flex flex-col gap-2 bg-black/20">
                            {v.pecas.length === 0 ? (
                              <div className="text-center py-6 border border-dashed border-zinc-800">
                                <p className="font-mono text-[10px] uppercase text-zinc-700">Nenhuma peça nesta versão</p>
                              </div>
                            ) : (
                              v.pecas.map(p => (
                                <div
                                  key={p.id}
                                  className="flex flex-col md:flex-row md:items-center justify-between p-3 border border-zinc-800 bg-black gap-3 hover:border-zinc-700 transition-colors"
                                >
                                  {/* Info da peça */}
                                  <div className="flex items-start md:items-center gap-4">
                                    <div className="w-1.5 h-8 bg-zinc-800 rounded-full shrink-0" />
                                    <div className="flex flex-col gap-1">
                                      <div className="text-xs text-white font-medium tracking-wide">{p.nome}</div>
                                      <div className="flex flex-wrap items-center gap-y-1 gap-x-2 font-mono text-[10px] text-zinc-500">
                                        <span className="flex items-center gap-1">
                                          <iconify-icon icon="solar:box-linear" width="10" />
                                          {p.material}
                                        </span>
                                        {p.espessura && p.espessura !== '—' && (
                                          <>
                                            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                                            <span className="flex items-center gap-1">
                                              <iconify-icon icon="solar:ruler-linear" width="10" />
                                              {p.espessura}
                                            </span>
                                          </>
                                        )}
                                        {p.area && p.area !== '—' && (
                                          <>
                                            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                                            <span className="flex items-center gap-1">
                                              <iconify-icon icon="solar:ruler-cross-pen-linear" width="10" />
                                              {p.area}
                                            </span>
                                          </>
                                        )}
                                        {p.acabamento && p.acabamento !== '—' && (
                                          <>
                                            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                                            <span className="text-zinc-400">{p.acabamento}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Valor da peça */}
                                  <span className="font-mono text-xs text-zinc-300 md:ml-auto md:mr-4">
                                    {fmt(p.valor)}
                                  </span>
                                </div>
                              ))
                            )}

                            {/* Total da versão */}
                            <div className="flex items-center justify-between pt-1 px-1">
                              <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{v.pecas.length} peça{v.pecas.length !== 1 ? 's' : ''}</span>
                              <span className="font-mono text-sm font-bold text-white">{fmt(v.valor_total)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Rodapé fixo — Total selecionado + ações ──────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505] border-t border-zinc-800 p-4 flex items-center justify-between z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-4">
          <div>
            <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Total selecionado ({selectedIds.length} {selectedIds.length === 1 ? 'versão' : 'versões'})
            </div>
            <div className="text-lg font-mono font-bold text-yellow-400">{fmt(totalSelecionado)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-2 border border-zinc-700 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <iconify-icon icon="solar:printer-linear" width="13" />
            Imprimir
          </button>
          <button
            disabled={selectedIds.length === 0}
            className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <iconify-icon icon="solar:chat-line-linear" width="13" />
            Enviar WhatsApp
          </button>
        </div>
      </div>

      {/* ══ Modal: Renomear Ambiente ══════════════════════════════════════ */}
      {editingAmbNome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Renomear Ambiente</span>
              <button onClick={() => setEditingAmbNome(null)} className="text-zinc-500 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-linear" width="16" />
              </button>
            </div>
            <div className="p-5">
              <input
                autoFocus
                value={editingAmbNome.nome}
                onChange={e => setEditingAmbNome(p => ({ ...p, nome: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') salvarNomeAmbiente(); }}
                className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                placeholder="Nome do ambiente"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEditingAmbNome(null)} className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">Cancelar</button>
                <button onClick={salvarNomeAmbiente} className="flex-1 bg-yellow-400 text-black font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-yellow-300">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Renomear Versão ════════════════════════════════════════ */}
      {editingVersaoNome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Renomear Versão</span>
              <button onClick={() => setEditingVersaoNome(null)} className="text-zinc-500 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-linear" width="16" />
              </button>
            </div>
            <div className="p-5">
              <input
                autoFocus
                value={editingVersaoNome.nome}
                onChange={e => setEditingVersaoNome(p => ({ ...p, nome: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') salvarNomeVersao(); }}
                className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                placeholder="Nome da versão"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEditingVersaoNome(null)} className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">Cancelar</button>
                <button onClick={salvarNomeVersao} className="flex-1 bg-yellow-400 text-black font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-yellow-300">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Mudar Material em Massa ════════════════════════════════ */}
      {editingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Mudar Material da Versão</span>
              <button onClick={() => setEditingMaterial(null)} className="text-zinc-500 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-linear" width="16" />
              </button>
            </div>
            <div className="p-5">
              <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest mb-3">
                Substitui o material de todas as peças desta versão.
              </p>
              <input
                autoFocus
                value={editingMaterial.material}
                onChange={e => setEditingMaterial(p => ({ ...p, material: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') aplicarMaterial(); }}
                className="w-full bg-black border border-zinc-800 focus:border-yellow-400 outline-none text-white text-sm font-mono px-3 py-2"
                placeholder="Ex: Calacata Gold, Branco Siena..."
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEditingMaterial(null)} className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors">Cancelar</button>
                <button onClick={aplicarMaterial} className="flex-1 bg-yellow-400 text-black font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-yellow-300">Aplicar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
