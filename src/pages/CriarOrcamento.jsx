import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { normalizarJsonMedicao } from '../utils/projetoUtils';
import {
  isValidUUID,
  ACABAMENTO_LABEL,
  ACAB_TIPO_NOME,
  precoAcabamento,
  criarAcabamentosParaPeca,
  ACABAMENTO_KEYWORDS,
  autoMatchLinear,
  aplicarAutoMatchNaLista,
  fmt,
  precoPeca,
} from '../utils/orcamentoUtils';
import PecaRow from '../components/orcamento/PecaRow';
import PainelMaterial from '../components/orcamento/PainelMaterial';
import PainelMaterialLinear from '../components/orcamento/PainelMaterialLinear';
import ModalProdutoAvulso from '../components/orcamento/ModalProdutoAvulso';
import TelaVersoes from '../components/orcamento/TelaVersoes';



// ── Sub-components ────────────────────────────────────────────────────────────

export default function CriarOrcamento() {
  const navigate = useNavigate();
  const { id: projetoId } = useParams();
  const [searchParams] = useSearchParams();
  const { profile, session } = useAuth();

  const [pecas, setPecas] = useState([]);
  const [loadingPecas, setLoadingPecas] = useState(true);
  const [materiais, setMateriais] = useState([]);
  const [matLineares, setMatLineares] = useState([]);
  const [precosCatMaterial, setPrecosCatMaterial] = useState([]);
  const [acabamentosUnitarios, setAcabamentosUnitarios] = useState([]);
  const [produtos, setProdutos] = useState([]);     // itens avulsos adicionados pelo usuário no passo 1
  const [produtosCatalogo, setProdutosCatalogo] = useState([]); // catálogo bruto do Supabase
  const [bulkMaterialId, setBulkMaterialId] = useState('');     // bulk action: material único
  const [processedMedicaoId, setProcessedMedicaoId] = useState(null);

  // ── Fluxo manual (sem medição) ────────────────────────────────────────────
  const modoManual = searchParams.get('modo') === 'manual';

  const novaPecaManual = (tipo = 'retangulo') => {
    const base = { id: crypto.randomUUID(), nome: '', tipo };
    if (tipo === 'faixa')    return { ...base, largura: '', comprimento: '', espessura: '2' };
    if (tipo === 'poligono') return { ...base, lados: [{ id: crypto.randomUUID(), comprimento: '' }], area_manual: '' };
    return { ...base, largura: '', comprimento: '' }; // retangulo
  };

  const novoAmbienteManual = (idx) => ({
    id: crypto.randomUUID(),
    nome: `Ambiente ${idx}`,
    pecasManual: [novaPecaManual()],
    avulsosManual: [],
    acabamentosManual: [],
  });

  const [ambientesManual, setAmbientesManual] = useState(() => [novoAmbienteManual(1)]);
  const [manualAmbMapping, setManualAmbMapping] = useState({});
  const [avulsoSelectorAmbId, setAvulsoSelectorAmbId] = useState(null);
  const [buscaAvulso, setBuscaAvulso] = useState('');

  function addAmbienteManual() {
    setAmbientesManual(prev => [...prev, novoAmbienteManual(prev.length + 1)]);
  }
  function removeAmbienteManual(ambId) {
    setAmbientesManual(prev => prev.filter(a => a.id !== ambId));
  }
  function duplicarAmbienteManual(ambId) {
    setAmbientesManual(prev => {
      const src = prev.find(a => a.id === ambId);
      if (!src) return prev;
      const clone = {
        ...src,
        id: crypto.randomUUID(),
        nome: `${src.nome} (Cópia)`,
        pecasManual: src.pecasManual.map(p => ({
          ...p, id: crypto.randomUUID(),
          lados: p.lados?.map(l => ({ ...l, id: crypto.randomUUID() })),
        })),
        avulsosManual: src.avulsosManual.map(a => ({ ...a, id: crypto.randomUUID() })),
        acabamentosManual: src.acabamentosManual.map(a => ({ ...a, id: crypto.randomUUID() })),
      };
      return [...prev, clone];
    });
  }
  function updateAmbNome(ambId, nome) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? { ...a, nome } : a));
  }

  // ── Peça helpers ────────────────────────────────────────────────────────────
  function addPecaManual(ambId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId
      ? { ...a, pecasManual: [...a.pecasManual, novaPecaManual()] } : a));
  }
  function removePecaManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId
      ? { ...a, pecasManual: a.pecasManual.filter(p => p.id !== pecaId) } : a));
  }
  function duplicarPecaManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => {
      if (a.id !== ambId) return a;
      const idx = a.pecasManual.findIndex(p => p.id === pecaId);
      if (idx === -1) return a;
      const src = a.pecasManual[idx];
      const clone = { ...src, id: crypto.randomUUID(), nome: `${src.nome} (Cópia)`, lados: src.lados?.map(l => ({ ...l, id: crypto.randomUUID() })) };
      const nl = [...a.pecasManual];
      nl.splice(idx + 1, 0, clone);
      return { ...a, pecasManual: nl };
    }));
  }
  function updatePecaManual(ambId, pecaId, field, value) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => {
        if (p.id !== pecaId) return p;
        if (field === 'tipo') { const f = novaPecaManual(value); return { ...f, id: p.id, nome: p.nome }; }
        return { ...p, [field]: value };
      }),
    } : a));
  }

  // ── Lados helpers (polígono) ─────────────────────────────────────────────────
  function addLadoManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: [...(p.lados ?? []), { id: crypto.randomUUID(), comprimento: '' }] } : p),
    } : a));
  }
  function removeLadoManual(ambId, pecaId, ladoId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: p.lados.filter(l => l.id !== ladoId) } : p),
    } : a));
  }
  function updateLadoManual(ambId, pecaId, ladoId, comprimento) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: p.lados.map(l => l.id === ladoId ? { ...l, comprimento } : l) } : p),
    } : a));
  }

  // ── Acabamentos helpers (por ambiente) ───────────────────────────────────────
  function addAcabamentoManual(ambId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: [...a.acabamentosManual, { id: crypto.randomUUID(), tipo: 'meia_esquadria', ml: '' }],
    } : a));
  }
  function removeAcabamentoManual(ambId, acabId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: a.acabamentosManual.filter(ac => ac.id !== acabId),
    } : a));
  }
  function updateAcabamentoManual(ambId, acabId, field, value) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: a.acabamentosManual.map(ac => ac.id === acabId ? { ...ac, [field]: value } : ac),
    } : a));
  }

  // ── Avulsos helpers (por ambiente) ───────────────────────────────────────────
  function addAvulsoManual(ambId, produto) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: [...a.avulsosManual, {
        id: crypto.randomUUID(), produto_id: produto.id, nome: produto.nome,
        subcategoria: produto.subcategoria, preco: produto.preco ?? 0, quantidade: 1,
      }],
    } : a));
    setAvulsoSelectorAmbId(null);
    setBuscaAvulso('');
  }
  function removeAvulsoManual(ambId, avId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: a.avulsosManual.filter(av => av.id !== avId),
    } : a));
  }
  function updateAvulsoQtd(ambId, avId, quantidade) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: a.avulsosManual.map(av => av.id === avId ? { ...av, quantidade: parseInt(quantidade) || 1 } : av),
    } : a));
  }

  async function handleContinuarManual() {
    const empresaId = profile?.empresa_id;
    if (!isValidUUID(empresaId)) { alert('Empresa não encontrada.'); return; }

    const novasPecas  = [];
    const novosAvulsos = [];

    ambientesManual.forEach(amb => {
      // Peças regulares
      amb.pecasManual.forEach(pm => {
        if (pm.tipo === 'poligono') {
          const area = parseFloat(pm.area_manual) || 0;
          if (area <= 0) return;
          novasPecas.push({
            id: pm.id, nome: pm.nome || 'Peça', ambiente_nome: amb.nome,
            area_liq: area, espessura: 2,
            meia_esquadria_ml: 0, reto_simples_ml: 0, cortes: 0,
            incluida: true, materiais: [],
          });
        } else {
          const largura     = parseFloat(pm.largura)     || 0;
          const comprimento = parseFloat(pm.comprimento) || 0;
          if (largura <= 0 || comprimento <= 0) return;
          novasPecas.push({
            id: pm.id, nome: pm.nome || 'Peça', ambiente_nome: amb.nome,
            area_liq: Math.round(largura * comprimento * 10000) / 10000,
            espessura: pm.tipo === 'faixa' ? (parseFloat(pm.espessura) || 2) : 2,
            meia_esquadria_ml: 0, reto_simples_ml: 0, cortes: 0,
            incluida: true, materiais: [],
          });
        }
      });
      // Avulsos
      amb.avulsosManual.forEach(av => {
        novosAvulsos.push({ id: av.produto_id, nome: av.nome, subcategoria: av.subcategoria, preco: av.preco, qty: av.quantidade });
      });
    });

    if (novasPecas.length === 0 && novosAvulsos.length === 0) {
      alert('Adicione pelo menos uma peça com dimensões válidas ou um produto avulso.');
      return;
    }

    // Cria ambientes no banco
    const mapping = {};
    for (const amb of ambientesManual) {
      const temConteudo =
        amb.pecasManual.some(pm => pm.tipo === 'poligono' ? parseFloat(pm.area_manual) > 0 : parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0) ||
        amb.avulsosManual.length > 0 ||
        amb.acabamentosManual.some(ac => parseFloat(ac.ml) > 0);
      if (!temConteudo) continue;
      const ambId = crypto.randomUUID();
      const { error } = await supabase.from('ambientes').insert({
        id: ambId, empresa_id: empresaId, projeto_id: projetoId,
        nome: amb.nome, created_at: new Date().toISOString(),
      });
      if (!error) { mapping[amb.nome] = ambId; if (!mapping['']) mapping[''] = ambId; }
      else console.error('[manual] erro ao criar ambiente:', error.message);
    }

    setManualAmbMapping(mapping);
    if (novosAvulsos.length > 0) setProdutos(prev => [...prev, ...novosAvulsos]);
    setPecas(novasPecas);
    setVersoesCriadas([{
      nome: 'Versão 1',
      mats: Object.fromEntries(novasPecas.map(p => [p.id, ''])),
    }]);
  }

  // Busca materiais reais do Supabase onde empresa_id = profile.empresa_id e ativo = true
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    setMateriais([]);
    supabase
      .from('materiais')
      .select('id, nome, categoria, variacoes_precos(acabamento, espessura, preco_venda)')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
          return;
        }
        if (data) setMateriais(data.map(m => ({ ...m, cor: m.categoria })));
      });
  }, [session, profile?.empresa_id]);

  // Busca materiais lineares (acabamentos) do Supabase
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('materiais_lineares')
      .select('id, nome, preco_ml')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { console.error('[CriarOrcamento] matLineares ERRO:', error.message); return; }
        if (data) setMatLineares(data);
      });
  }, [session, profile?.empresa_id]);

  // Busca preços de acabamento por categoria de material
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('acabamento_precos_material')
      .select('material_linear_id, categoria, preco_ml, material_id')
      .eq('empresa_id', profile.empresa_id)
      .then(({ data }) => { if (data) setPrecosCatMaterial(data); });
  }, [session, profile?.empresa_id]);

  // Busca produtos avulsos (furos, recortes com preço fixo por unidade)
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('produtos_avulsos')
      .select('id, nome, subcategoria, preco_unitario')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .then(({ data, error }) => {
        if (error) { console.error('[CriarOrcamento] produtosAvulsos:', error.message); return; }
        if (data) setAcabamentosUnitarios(data);
      });
  }, [session, profile?.empresa_id]);

  // Busca produtos reais do Supabase
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('produtos_catalogo')
      .select('id, nome, subcategoria, preco_venda')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          console.error(`ERRO CRÍTICO SUPABASE: ${error.message}`);
          return;
        }
        // Salva catálogo bruto (para o modal de adicionar produto)
        if (data) setProdutosCatalogo(data.map(p => ({ ...p, preco: p.preco_venda })));
      });
  }, [session, profile?.empresa_id]);

  // Busca peças da medição no Supabase.
  // Caminho A (quando medicao_id vem na URL): lê json_medicao diretamente da medição —
  //   funciona tanto para medições do app Flutter (json_medicao preenchido pelo app)
  //   quanto para medições web (json_medicao preenchido pelo trigger).
  // Caminho B (fallback sem medicao_id): busca via tabela `pecas` pela medição mais
  //   recente com status='processada' (fluxo legado de medições web).
  const medicaoIdFromUrl = searchParams.get('medicao_id');

  useEffect(() => {
    setPecas([]);
    setLoadingPecas(true);
    setProcessedMedicaoId(null);

    async function fetchPecas() {
      try {
        const medicaoId = isValidUUID(medicaoIdFromUrl) ? medicaoIdFromUrl : null;

        // ── Caminho A: medicao_id veio na URL ────────────────────────────────
        if (medicaoId) {
          let qMed = supabase.from('medicoes').select('id, json_medicao').eq('id', medicaoId);
          if (profile?.empresa_id) qMed = qMed.eq('empresa_id', profile.empresa_id);
          const { data: medRow, error: medErr } = await qMed.single();

          if (medErr || !medRow) {
            setPecas([]);
            return;
          }

          setProcessedMedicaoId(medRow.id);

          const json = medRow.json_medicao;
          let resumo = [];

          const normalizado = normalizarJsonMedicao(json);
          resumo = normalizado?.resumo_por_peca ?? [];

          setPecas(resumo.map(r => ({
            id:                isValidUUID(r.peca_id) ? r.peca_id : crypto.randomUUID(),
            nome:              r.nome ?? '—',
            descricao:         r.descricao ?? null,
            ambiente_nome:     r.ambiente_nome ?? null,
            item_nome:         r.item_nome ?? null,
            grupo_nome:        r.grupo_nome ?? null,
            grupo_index:       r.grupo_index ?? null,
            area_liq:          Number(r.area_liquida_m2 ?? 0),
            espessura:         Number(r.espessura_cm    ?? 2),
            meia_esquadria_ml: Number(r.acabamentos?.meia_esquadria_ml ?? 0),
            reto_simples_ml:   Number(r.acabamentos?.reto_simples_ml   ?? 0),
            boleado_ml:        Number(r.acabamentos?.boleado_ml        ?? 0),
            boleado_duplo_ml:  Number(r.acabamentos?.boleado_duplo_ml  ?? 0),
            reto_duplo_ml:     Number(r.acabamentos?.reto_duplo_ml     ?? 0),
            chanfrado_ml:      Number(r.acabamentos?.chanfrado_ml      ?? 0),
            cortes:            Number(r.recortes_qty ?? 0),
            recortes:          r.recortes ?? [],
            incluida:          true,
            materiais:         [],
          })));
          return;
        }

        // ── Caminho B: sem medicao_id na URL — fallback via tabela `pecas` ──
        let qMedB = supabase.from('medicoes').select('id').eq('projeto_id', projetoId)
          .in('status', ['processada', 'enviada', 'concluida', 'aprovada'])
          .order('created_at', { ascending: false }).limit(1);
        if (profile?.empresa_id) qMedB = qMedB.eq('empresa_id', profile.empresa_id);
        const { data: medData, error: medError } = await qMedB.single();

        if (medError || !medData) {
          setPecas([]);
          return;
        }

        setProcessedMedicaoId(medData.id);

        let qAmb = supabase.from('ambientes').select('id').eq('medicao_id', medData.id);
        if (profile?.empresa_id) qAmb = qAmb.eq('empresa_id', profile.empresa_id);
        const { data: ambData, error: ambError } = await qAmb;

        if (ambError || !ambData?.length) {
          setPecas([]);
          return;
        }

        const ambienteIds = ambData.map(a => a.id);

        const { data: pecasData, error: pecasError } = await supabase
          .from('pecas')
          .select('id, nome_livre, area_liquida_m2, espessura_cm, dimensoes, arestas, recortes')
          .in('ambiente_id', ambienteIds)
          .eq('empresa_id', profile.empresa_id)
          .eq('incluida', true)
          .order('created_at');

        if (pecasError) {
          console.error('[CriarOrcamento] Erro ao buscar peças:', pecasError.message);
          setPecas([]);
          return;
        }

        setPecas((pecasData ?? []).map(p => {
          const dim       = p.dimensoes ?? {};
          const face      = (p.arestas ?? {}).face ?? '';
          const altura    = Number(dim.altura  ?? 0);
          const largura   = Number(dim.largura ?? 0);
          const qtd       = Number(dim.qtd     ?? 1);
          const perimetro = Math.round((altura + largura) * 2 * qtd * 100) / 100;
          return {
            id:                p.id,
            nome:              p.nome_livre ?? '—',
            area_liq:          Number(p.area_liquida_m2 ?? 0),
            espessura:         Number(p.espessura_cm    ?? 2),
            meia_esquadria_ml: /meia.esquadria/i.test(face) ? perimetro : 0,
            reto_simples_ml:   /reto.simples/i.test(face)   ? perimetro : 0,
            cortes:            Array.isArray(p.recortes) ? p.recortes.length : 0,
            recortes:          Array.isArray(p.recortes) ? p.recortes : [],
            incluida:          true,
            materiais:         [],
          };
        }));

      } catch (err) {
        console.error('[CriarOrcamento] Exceção na busca das peças:', err);
        setPecas([]);
      } finally {
        setLoadingPecas(false);
      }
    }

    if (projetoId && !modoManual) {
      fetchPecas();
    } else {
      setPecas([]);
      setLoadingPecas(false);
    }
  }, [projetoId, medicaoIdFromUrl]);

  // ── Estado de acabamentos/furos por grupo (chave: "${amb}::${grupo}") ──────
  const [grupoExtras, setGrupoExtras] = useState({});

  useEffect(() => {
    if (loadingPecas || pecas.length === 0) { setGrupoExtras({}); return; }
    const map = {};
    pecas.filter(p => p.incluida).forEach(p => {
      const gNome = p.grupo_nome ?? p.item_nome ?? null;
      const gKey  = `${p.ambiente_nome ?? ''}::${gNome ?? '__sem_grupo__'}`;
      if (!map[gKey]) map[gKey] = { amb_nome: p.ambiente_nome ?? '', grupo_nome: gNome, acabamentos: [], furos: [] };
      const g = map[gKey];
      [
        ['meia_esquadria', p.meia_esquadria_ml],
        ['reto_simples',   p.reto_simples_ml],
        ['boleado',        p.boleado_ml],
        ['boleado_duplo',  p.boleado_duplo_ml],
        ['reto_duplo',     p.reto_duplo_ml],
        ['chanfrado',      p.chanfrado_ml],
      ].forEach(([tipo, ml]) => {
        if ((ml ?? 0) <= 0) return;
        const ex = g.acabamentos.find(a => a.tipo === tipo);
        if (ex) ex.ml = Math.round((ex.ml + ml) * 100) / 100;
        else g.acabamentos.push({ id: crypto.randomUUID(), tipo, ml });
      });
      (p.recortes ?? []).forEach(rc => {
        g.furos.push({ id: crypto.randomUUID(), tipo: rc.funcao_label ?? rc.funcao ?? 'Recorte', formato: rc.formato ?? null });
      });
    });
    setGrupoExtras(map);
  }, [loadingPecas]); // re-init only when loading state changes

  const [openAmbientes, setCollapsedAmbientes] = useState(new Set());
  const [openGrupos, setCollapsedGrupos] = useState(new Set());
  const [painelMaterialPecaId, setPainelMaterialPecaId] = useState(null);
  const [modalProduto, setModalProduto] = useState(false);
  const [versoesCriadas, setVersoesCriadas] = useState(null);
  const [salvandoOrc, setSalvandoOrc] = useState(false);
  const [addFuroMenuKey, setAddFuroMenuKey] = useState(null);
  const [editandoPrecoGrupo, setEditandoPrecoGrupo] = useState(null); // { geKey, itemType: 'acab'|'furo', id?, tipo? }

  // Estado para ações por ambiente
  const [editandoAmbNome, setEditandoAmbNome] = useState(null);     // { amb: string, novo: string }
  const [painelMaterialAmbNome, setPainelMaterialAmbNome] = useState(null); // nome do ambiente aberto no PainelMaterial
  const [editandoItemNome, setEditandoItemNome] = useState(null);   // { amb: string, gKey: string, novo: string }
  const [painelMaterialGrupoKey, setPainelMaterialGrupoKey] = useState(null); // "amb::gKey" aberto no PainelMaterial

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [searchParams.get('ambiente_id'), searchParams.get('medicao_id'), versoesCriadas]);

  // ── Derived ────────────────────────────────────

  const pecasIncluidas = pecas.filter(p => p.incluida);
  const totalProdutos  = produtos.reduce((s, p) => s + p.preco * p.qty, 0);
  const pecasComMaterial = pecasIncluidas.filter(p => p.materiais.length > 0);
  const precisaVersoes  = pecasIncluidas.some(p => p.materiais.length > 1);

  const totalPecas = pecasIncluidas.reduce((s, p) => {
    if (p.materiais.length === 0) return s;
    return s + precoPeca(p, p.materiais[0], materiais, p.acabamentoSel ?? null);
  }, 0);
  const total = totalPecas + totalProdutos;

  // ── Handlers ───────────────────────────────────

  function toggleIncluida(pecaId) {
    setPecas(prev => prev.map(p => p.id === pecaId ? { ...p, incluida: !p.incluida } : p));
  }

  function duplicarPecaPrincipal(pecaId) {
    setPecas(prev => {
      const idx = prev.findIndex(p => p.id === pecaId);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: `clone-${Date.now()}`, nome: `${prev[idx].nome} (Cópia)`, materiais: [...prev[idx].materiais] };
      const newList = [...prev];
      newList.splice(idx + 1, 0, clone);
      return newList;
    });
  }

  function renomearPeca(pecaId, novoNome) {
    setPecas(prev => prev.map(p => p.id === pecaId ? { ...p, nome: novoNome } : p));
  }

  function renomearItem(amb, gKeyAntigo, novoNome) {
    const novoKey = novoNome.trim() || gKeyAntigo;
    setPecas(prev => prev.map(p => {
      const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
      if ((p.ambiente_nome ?? '') !== amb || k !== gKeyAntigo) return p;
      return p.grupo_nome != null
        ? { ...p, grupo_nome: novoKey }
        : { ...p, item_nome: novoKey };
    }));
    setEditandoItemNome(null);
  }

  function confirmarMaterial(pecaId, mats, acabamentoSel) {
    setPecas(prev => prev.map(p => p.id === pecaId ? { ...p, materiais: mats, acabamentoSel: acabamentoSel ?? null } : p));
    setPainelMaterialPecaId(null);
  }

  function toggleSecaoAmbiente(amb) {
    setCollapsedAmbientes(prev => {
      const next = new Set(prev); next.has(amb) ? next.delete(amb) : next.add(amb); return next;
    });
  }
  function toggleSecaoGrupo(geKey) {
    setCollapsedGrupos(prev => {
      const next = new Set(prev); next.has(geKey) ? next.delete(geKey) : next.add(geKey); return next;
    });
  }

  // ── Ações por ambiente ──────────────────────────────────────────
  function excluirAmbiente(amb) {
    setPecas(prev => prev.filter(p => p.ambiente_nome !== amb));
  }

  function confirmarRenomearAmbiente() {
    if (!editandoAmbNome) return;
    const { amb, novo } = editandoAmbNome;
    setPecas(prev => prev.map(p => p.ambiente_nome === amb ? { ...p, ambiente_nome: novo.trim() || amb } : p));
    setEditandoAmbNome(null);
  }

  function duplicarAmbiente(amb) {
    const pecasDoAmb = pecas.filter(p => p.ambiente_nome === amb);
    const novoNome = `${amb} (Cópia)`;
    const clones = pecasDoAmb.map(p => ({ ...p, id: crypto.randomUUID(), ambiente_nome: novoNome, materiais: [...p.materiais] }));
    setPecas(prev => [...prev, ...clones]);
  }

  function aplicarMaterialAoAmbiente(ambNome, matIds, acabamentoSel) {
    setPecas(prev => prev.map(p => p.ambiente_nome === ambNome ? { ...p, materiais: matIds, acabamentoSel: acabamentoSel ?? null } : p));
    setPainelMaterialAmbNome(null);
  }

  function aplicarMaterialAoGrupo(ambNome, gKey, matIds, acabamentoSel) {
    setPecas(prev => prev.map(p => {
      const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
      if ((p.ambiente_nome ?? '') !== ambNome || k !== gKey) return p;
      return { ...p, materiais: matIds, acabamentoSel: acabamentoSel ?? null };
    }));
    setPainelMaterialGrupoKey(null);
  }

  // ── Bulk action: aplicar material a todas as peças incluídas ───
  function aplicarMaterialATodas() {
    if (!bulkMaterialId) return;
    setPecas(prev => prev.map(p =>
      p.incluida ? { ...p, materiais: [bulkMaterialId] } : p
    ));
  }

  // ── Handlers de acabamentos/furos por grupo ──────────────────────────────
  function addGrupoAcabamento(geKey) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...(prev[geKey] ?? { acabamentos: [], furos: [] }), acabamentos: [...(prev[geKey]?.acabamentos ?? []), { id: crypto.randomUUID(), tipo: 'meia_esquadria', ml: 0 }] } }));
  }
  function removeGrupoAcabamento(geKey, acId) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], acabamentos: (prev[geKey]?.acabamentos ?? []).filter(a => a.id !== acId) } }));
  }
  function updateGrupoAcabamento(geKey, acId, field, value) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], acabamentos: (prev[geKey]?.acabamentos ?? []).map(a => a.id === acId ? { ...a, [field]: value } : a) } }));
  }
  function addGrupoFuro(geKey) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...(prev[geKey] ?? { acabamentos: [], furos: [] }), furos: [...(prev[geKey]?.furos ?? []), { id: crypto.randomUUID(), tipo: 'Recorte', formato: null }] } }));
  }
  function removeGrupoFuro(geKey, fuId) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], furos: (prev[geKey]?.furos ?? []).filter(f => f.id !== fuId) } }));
  }
  function updateGrupoFuro(geKey, fuId, field, value) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], furos: (prev[geKey]?.furos ?? []).map(f => f.id === fuId ? { ...f, [field]: value } : f) } }));
  }
  function addGrupoFuroTipo(geKey, tipo) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...(prev[geKey] ?? { acabamentos: [], furos: [] }), furos: [...(prev[geKey]?.furos ?? []), { id: crypto.randomUUID(), tipo, formato: null }] } }));
  }
  function removeGrupoFuroTipo(geKey, tipo) {
    setGrupoExtras(prev => {
      const furos = prev[geKey]?.furos ?? [];
      const idx = furos.map((f, i) => f.tipo === tipo ? i : -1).filter(i => i >= 0).pop();
      if (idx == null) return prev;
      return { ...prev, [geKey]: { ...prev[geKey], furos: furos.filter((_, i) => i !== idx) } };
    });
  }
  function removeGrupoFuroTipoAll(geKey, tipo) {
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], furos: (prev[geKey]?.furos ?? []).filter(f => f.tipo !== tipo) } }));
  }
  function updateGrupoFuroPrecoManual(geKey, tipo, precoManual) {
    const val = precoManual !== '' && precoManual != null ? Number(precoManual) : null;
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], furos: (prev[geKey]?.furos ?? []).map(f => f.tipo === tipo ? { ...f, precoManual: val } : f) } }));
  }
  function updateGrupoAcabamentoPrecoManual(geKey, acId, precoManual) {
    const val = precoManual !== '' && precoManual != null ? Number(precoManual) : null;
    setGrupoExtras(prev => ({ ...prev, [geKey]: { ...prev[geKey], acabamentos: (prev[geKey]?.acabamentos ?? []).map(a => a.id === acId ? { ...a, precoManual: val } : a) } }));
  }

  function removerProduto(idx) {
    setProdutos(prev => prev.filter((_, i) => i !== idx));
  }

  function adicionarProduto(prod) {
    setProdutos(prev => [...prev, prod]);
    setModalProduto(false);
  }

  function handleContinuar() {
    if (precisaVersoes) {
      const pecasComMat = pecasIncluidas.filter(p => p.materiais.length > 0);

      // Group pieces by (ambiente_nome, sorted deduplicated material set)
      const dimsMap = new Map();
      pecasComMat.forEach(p => {
        const uniqMats = [...new Set(p.materiais)];
        const key = `${p.ambiente_nome ?? ''}__${[...uniqMats].sort().join(',')}`;
        if (!dimsMap.has(key)) {
          dimsMap.set(key, { ambNome: p.ambiente_nome ?? '', materiais: uniqMats, pieceIds: [] });
        }
        dimsMap.get(key).pieceIds.push(p.id);
      });

      // Fixed: single-material dims (don't vary) — always apply their one material
      const fixedDims = [...dimsMap.values()].filter(d => d.materiais.length === 1);
      // Variable: dims with 2+ materials → each becomes a cartesian dimension
      const varDims   = [...dimsMap.values()].filter(d => d.materiais.length > 1);

      function cartesian(arr) {
        if (arr.length === 0) return [[]];
        const [first, ...rest] = arr;
        return first.materiais.flatMap(matId =>
          cartesian(rest).map(s => [{ ...first, matId }, ...s])
        );
      }
      const combos = varDims.length > 0 ? cartesian(varDims) : [[]];

      const versoes = combos.map(combo => {
        const matsObj = {};
        // Fixed materials applied to every version
        fixedDims.forEach(({ pieceIds, materiais: [matId] }) => {
          pieceIds.forEach(pid => { matsObj[pid] = matId; });
        });
        // Variable materials from this cartesian combination
        combo.forEach(({ pieceIds, matId }) => {
          pieceIds.forEach(pid => { matsObj[pid] = matId; });
        });
        // Version name built only from variable dims (fixed dims are noise in the name)
        const matByAmb = {};
        combo.forEach(({ ambNome, matId, pieceIds }) => {
          const nome = materiais.find(m => m.id === matId)?.nome;
          if (!nome) return;
          if (!matByAmb[ambNome]) matByAmb[ambNome] = {};
          matByAmb[ambNome][nome] = (matByAmb[ambNome][nome] ?? 0) + pieceIds.length;
        });
        const partes = Object.entries(matByAmb).map(([amb, mats]) => {
          const top = Object.entries(mats).sort((a, b) => b[1] - a[1])[0]?.[0];
          return top ? (amb ? `${amb}: ${top}` : top) : null;
        }).filter(Boolean);
        return {
          nome: partes.length > 0 ? partes.join(' + ') : 'Versão',
          mats: matsObj,
          acabamentos: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.acabamentoSel ?? null])),
        };
      });
      setVersoesCriadas(versoes);
    } else {
      setVersoesCriadas([{
        nome: 'Orçamento',
        mats:        Object.fromEntries(pecasIncluidas.map(p => [p.id, p.materiais[0] ?? ''])),
        acabamentos: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.acabamentoSel ?? null])),
      }]);
    }
  }

  // ── Garante que existam registros em `ambientes` para esta medição ──
  // Retorna { [ambNome]: ambId } — mapeamento de nome → UUID no banco.
  //
  // Estratégia:
  //   1. Carrega ambientes já existentes (criados pelo trigger ou salvamento anterior)
  //   2. Lê json_medicao para descobrir quais ambientes o JSON menciona
  //   3. Cria apenas os que ainda não existem no banco
  //
  // Suporta ambos os formatos Flutter:
  //   • Antigo: { ambientes: [{ ambiente, pecas }] }
  //   • Novo:   { ambientes: [{ ambiente, itens, pecas_sem_item }] }
  async function garantirAmbientesNoBanco(medicaoId, empresaId, projetoId) {
    const map = {};

    // 1. Carrega ambientes já existentes (trigger ou salvamento anterior)
    const { data: existentes } = await supabase
      .from('ambientes')
      .select('id, nome')
      .eq('medicao_id', medicaoId);

    existentes?.forEach(a => { map[a.nome] = a.id; });
    if (!map[''] && existentes?.[0]) map[''] = existentes[0].id;

    // 2. Lê json_medicao para criar os ambientes ainda ausentes no mapa
    const { data: med } = await supabase
      .from('medicoes')
      .select('json_medicao')
      .eq('id', medicaoId)
      .single();

    const json = med?.json_medicao;
    if (!json) return map;

    // Coleta nomes de ambientes do JSON (suporta formato antigo e novo)
    const nomesDoJson = new Set();
    if (Array.isArray(json.ambientes)) {
      for (const ambJson of json.ambientes) {
        const n = ambJson.ambiente ?? ambJson.nome;
        if (n) nomesDoJson.add(n);
      }
    } else if (Array.isArray(json.resumo_por_peca)) {
      nomesDoJson.add('Medição');
    }

    // Cria apenas os ambientes ausentes
    for (const ambNome of nomesDoJson) {
      if (map[ambNome]) continue;
      const ambId = crypto.randomUUID();
      const { error } = await supabase.from('ambientes').insert({
        id:         ambId,
        empresa_id: empresaId,
        projeto_id: projetoId,
        medicao_id: medicaoId,
        nome:       ambNome,
        created_at: new Date().toISOString(),
      });
      if (!error) {
        map[ambNome] = ambId;
        if (!map['']) map[''] = ambId;
      } else {
        console.error('[garantirAmbientes] Erro ao criar ambiente:', ambNome, error.message);
        // Ambiente pode ter sido criado por corrida paralela — tenta reler do banco
        const { data: recheck } = await supabase
          .from('ambientes').select('id').eq('medicao_id', medicaoId).eq('nome', ambNome).single();
        if (recheck?.id) {
          map[ambNome] = recheck.id;
          if (!map['']) map[''] = recheck.id;
        }
      }
    }

    return map;
  }

  // ── Garante que cada pWrapper de uma versão exista na tabela `pecas` ──
  //
  // Estratégia:
  //   1. Constrói linhas a inserir a partir de versao.pecasList
  //   2. Faz SELECT para descobrir quais já existem no banco
  //   3. Insere apenas as que faltam (sem upsert cego)
  //   4. Retorna Set<string> com todos os IDs confirmados no banco
  //      (existentes + recém-inseridos) para que handleSalvar nunca
  //      referencie um peca_id que não exista — prevenindo FK violation.
  //
  // Suporta nova estrutura Flutter com item_nome (salvo em dimensoes).
  async function garantirPecasNoBanco(versao, ambMapping, empresaId) {
    const fallbackAmbId = Object.values(ambMapping)[0] ?? null;

    // 1. Monta linhas a garantir (apenas peças de pedra; acabamentos/recortes não têm linha própria no banco)
    const todasRows = versao.pecasList
      .filter(pw => isValidUUID(pw.idBase) && pw.tipo === 'pedra')
      .map(pw => ({
        id:              pw.idBase,
        empresa_id:      empresaId,
        ambiente_id:     ambMapping[pw.ambiente_nome ?? ''] ?? fallbackAmbId,
        tipo:            'retangulo',
        nome_livre:      pw.nome ?? 'Peça sem nome',
        espessura_cm:    pw.espessura ?? 2,
        area_bruta_m2:   pw.area_liq  ?? 0,
        area_liquida_m2: pw.area_liq  ?? 0,
        dimensoes:       pw.item_nome ? { item_nome: pw.item_nome } : {},
        arestas: {
          meia_esquadria_ml: pw.meia_esquadria_ml ?? 0,
          reto_simples_ml:   pw.reto_simples_ml   ?? 0,
        },
        recortes:   [],
        incluida:   true,
        created_at: new Date().toISOString(),
      }));

    // Filtra peças sem ambiente_id válido (jamais podem ser inseridas)
    const rowsValidas = todasRows.filter(r => isValidUUID(r.ambiente_id));

    if (rowsValidas.length === 0) {
      console.error('[garantirPecas] Nenhuma peça com ambiente_id válido. ambMapping:', ambMapping);
      return new Set();
    }

    // 2. Descobre quais já existem no banco (via SELECT)
    const ids = rowsValidas.map(r => r.id);
    const { data: existentes } = await supabase
      .from('pecas')
      .select('id')
      .in('id', ids);

    const existentesSet = new Set(existentes?.map(p => p.id) ?? []);

    // 3. Insere apenas as que faltam
    const novas = rowsValidas.filter(r => !existentesSet.has(r.id));

    if (novas.length > 0) {
      const { error } = await supabase.from('pecas').insert(novas);
      if (error) {
        console.error('[garantirPecas] Erro ao inserir peças:', error.message, error.details);
        // Retorna só as pré-existentes; as novas podem não ter sido inseridas
        return existentesSet;
      }
    }

    // 4. Retorna todos os IDs confirmados (existentes + recém-inseridos)
    return new Set([...existentesSet, ...novas.map(r => r.id)]);
  }

  async function handleSalvar(versoesFinais) {
    let finalAmbienteId = searchParams.get('ambiente_id');
    const medicaoId  = searchParams.get('medicao_id') || processedMedicaoId;
    const vendedorId = session?.user?.id ?? null;
    const empresaId  = profile?.empresa_id ?? null;

    // ── Valida empresa e vendedor antes de qualquer operação assíncrona ──
    if (!isValidUUID(empresaId))  {
      alert("Erro Crítico: empresa_id ausente. Você precisa estar logado em uma empresa válida.");
      return;
    }
    if (!isValidUUID(vendedorId)) {
      alert("Erro Crítico: vendedor_id ausente. Sessão inválida.");
      return;
    }

    // ── Resolve mapeamento ambNome → ambId e garante ambientes no banco ──────
    let ambMapping = {};
    if (modoManual) {
      // Fluxo manual: ambientes foram criados em handleContinuarManual
      ambMapping = manualAmbMapping;
    } else if (isValidUUID(medicaoId)) {
      ambMapping = await garantirAmbientesNoBanco(medicaoId, empresaId, projetoId);
    }

    // finalAmbienteId: prioridade URL → primeiro ambiente criado/existente
    if (!isValidUUID(finalAmbienteId)) {
      const ids = Object.values(ambMapping).filter(isValidUUID);
      if (ids.length > 0) finalAmbienteId = ids[0];
    }

    if (!isValidUUID(finalAmbienteId)) {
      alert("Erro ao salvar: ambiente não encontrado. Verifique se a medição foi enviada corretamente pelo app.");
      return;
    }

    const pecasIncluidas = pecas.filter(p => p.incluida);

    setSalvandoOrc(true);
    try {
      for (const versao of versoesFinais) {
        // 0. Garante que cada peça da versão existe na tabela `pecas` antes de
        //    tentar inserir em orcamento_pecas (que tem FK → pecas.id).
        //    Retorna Set<string> com os IDs confirmados no banco.
        const pecasGarantidas = await garantirPecasNoBanco(versao, ambMapping, empresaId);

        // Agrupa acabamentos por stoneUid para lookup rápido ao montar pecasRows
        const acabamentosPorPedra = new Map();
        versao.pecasList
          .filter(pw => pw.tipo === 'acabamento')
          .forEach(pw => {
            if (!acabamentosPorPedra.has(pw.idPedraUid)) acabamentosPorPedra.set(pw.idPedraUid, []);
            acabamentosPorPedra.get(pw.idPedraUid).push(pw);
          });

        // Agrupa recortes por stoneUid para agregar valor_recortes por pedra
        const recortesPorPedra = new Map();
        versao.pecasList
          .filter(pw => pw.tipo === 'recorte')
          .forEach(pw => {
            if (!recortesPorPedra.has(pw.idPedraUid)) recortesPorPedra.set(pw.idPedraUid, []);
            recortesPorPedra.get(pw.idPedraUid).push(pw);
          });

        const valorPecas = versao.pecasList.reduce((s, pWrapper) => {
          if (pWrapper.tipo === 'acabamento') return s + (pWrapper.precoManual != null ? pWrapper.precoManual : precoAcabamento(pWrapper.ml, pWrapper.matLinearId, matLineares, pWrapper.precoMlOverride ?? null));
          if (pWrapper.tipo === 'recorte')    return s + (pWrapper.precoUnit ?? 0);
          const rawMat = pWrapper.matId;
          const matId  = rawMat && typeof rawMat === 'object' ? (rawMat.id ?? null) : (rawMat ?? null);
          const pSrc   = pecas.find(p => p.id === pWrapper.idBase) ?? pWrapper;
          return s + (pWrapper.precoManual != null ? pWrapper.precoManual : precoPeca(pSrc, matId, materiais, pWrapper.matAcabamento));
        }, 0);
        const valorAvulsos = produtos.reduce((s, p) => s + p.preco * p.qty, 0);
        const subtotal     = valorPecas + valorAvulsos;

        // Desconto passado pelo TelaVersoes
        const descVal  = versao.descontoValor ?? 0;
        const descTipo = versao.descontoTipo  ?? '%';
        const descontoAbsoluto = descTipo === '%'
          ? Math.min(subtotal * descVal / 100, subtotal)
          : Math.min(descVal, subtotal);
        const valorTotal = Math.max(0, subtotal - descontoAbsoluto);

        // 1. Insert em orcamentos — colunas em snake_case conforme SPEC
        const dadosOrcamento = {
          empresa_id:     empresaId,
          ambiente_id:    finalAmbienteId,
          vendedor_id:    vendedorId,
          nome_versao:    versao.nome,
          status:         'rascunho',
          desconto_total: descontoAbsoluto,
          valor_total:    valorTotal,
        };

        const { data: orc, error: errOrc } = await supabase
          .from('orcamentos')
          .insert(dadosOrcamento)
          .select('id')
          .single();

        if (errOrc) {
          console.error(`ERRO CRÍTICO SUPABASE: ${errOrc.message} - Detalhes: ${errOrc.details}`);
          return;
        }

        const orcamentoId = orc.id;

        // 2. Insert em orcamento_pecas — apenas peças de pedra confirmadas no banco
        //    Filtra por pecasGarantidas para nunca violar o FK peca_id → pecas.id
        const pecasRows = versao.pecasList
          .filter(pw => pw.tipo === 'pedra' && isValidUUID(pw.idBase) && pecasGarantidas.has(pw.idBase))
          .map(pWrapper => {
            const rawMat    = pWrapper.matId;
            const materialId = rawMat && typeof rawMat === 'object'
              ? (rawMat.id ?? null)
              : (typeof rawMat === 'string' ? rawMat : null);

            const pSource   = pecas.find(p => p.id === pWrapper.idBase) ?? pWrapper;
            const valorArea = pWrapper.precoManual != null ? pWrapper.precoManual : precoPeca(pSource, materialId, materiais, pWrapper.matAcabamento);

            // Agrega acabamentos vinculados a esta pedra
            const filhos = acabamentosPorPedra.get(pWrapper.uid) ?? [];
            const valorAcabamentosTotal = filhos.reduce((s, ac) =>
              s + precoAcabamento(ac.ml, ac.matLinearId, matLineares, ac.precoMlOverride ?? null), 0);
            const acabamentosJson = filhos.map(ac => ({
              tipo:         ac.tipoAcabamento,
              ml:           ac.ml,
              mat_linear_id: ac.matLinearId,
              valor:        ac.precoManual != null ? ac.precoManual : precoAcabamento(ac.ml, ac.matLinearId, matLineares, ac.precoMlOverride ?? null),
            }));

            // Agrega recortes vinculados a esta pedra
            const recortesFilhos = recortesPorPedra.get(pWrapper.uid) ?? [];
            const valorRecortesTotal = recortesFilhos.reduce((s, rc) => s + (rc.precoUnit ?? 0), 0);

            return {
              orcamento_id:      orcamentoId,
              peca_id:           pWrapper.idBase,
              material_id:       materialId,
              item_nome:         pWrapper.item_nome ?? null,
              ambiente_nome:     pWrapper.ambiente_nome ?? null,
              valor_area:        valorArea,
              valor_acabamentos: valorAcabamentosTotal,
              valor_recortes:    valorRecortesTotal,
              valor_total:       valorArea + valorAcabamentosTotal + valorRecortesTotal,
              acabamentos:       acabamentosJson,
              recortes:          pSource.recortes ?? [],
            };
          });

        if (pecasRows.length > 0) {
          const { error: errPecas } = await supabase
            .from('orcamento_pecas')
            .insert(pecasRows);

          if (errPecas) {
            console.error('[CriarOrcamento] ERRO orcamento_pecas:', errPecas.message, '| code:', errPecas.code, '| hint:', errPecas.hint);
            alert('Erro ao salvar peças: ' + errPecas.message);
          }
        }

        // 3. Insert em orcamento_avulsos
        if (produtos.length > 0) {
          const avulsosRows = produtos.map(p => ({
            orcamento_id:   orcamentoId,
            produto_id:     p.id.startsWith('pr') ? null : p.id,
            quantidade:     p.qty,
            valor_unitario: p.preco,
            valor_total:    p.preco * p.qty,
          }));
          const { error: errAvulsos } = await supabase.from('orcamento_avulsos').insert(avulsosRows);
          if (errAvulsos) console.error(`ERRO CRÍTICO SUPABASE: ${errAvulsos.message} - Detalhes: ${errAvulsos.details}`);
        }
      }
    } catch (e) {
      console.error(`ERRO CRÍTICO SUPABASE: ${e.message} - Detalhes: ${e.details ?? ''}`);
      setSalvandoOrc(false);
      return;
    }

    setSalvandoOrc(false);
    navigate(`/projetos/${projetoId ?? '1'}`);
  }

  // ── Se versões já foram criadas, mostrar tela de versões ──

  if (versoesCriadas) {
    return (
      <TelaVersoes
        versoes={versoesCriadas}
        pecas={pecas}
        produtos={produtos}
        onSalvar={handleSalvar}
        onVoltar={() => setVersoesCriadas(null)}
        todosM={materiais}
        matLineares={matLineares}
        precosCatMaterial={precosCatMaterial}
        acabamentosUnitarios={acabamentosUnitarios}
        salvando={salvandoOrc}
        grupoExtras={grupoExtras}
      />
    );
  }

  // ── Fluxo manual: formulário de entrada de peças em branco ────────────────
  if (modoManual) {
    const totalPecasValidas = ambientesManual.reduce((s, a) => s + a.pecasManual.filter(pm =>
      pm.tipo === 'poligono' ? parseFloat(pm.area_manual) > 0 : parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0
    ).length, 0);
    const totalAvulsos = ambientesManual.reduce((s, a) => s + a.avulsosManual.length, 0);

    return (
      <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">
        <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
        <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
        <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

        <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-32">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-6">
            <a href="/projetos" className="hover:text-yellow-400 transition-colors">Projetos</a>
            <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
            <a href={`/projetos/${projetoId}`} className="hover:text-yellow-400 transition-colors">Projeto</a>
            <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
            <span className="text-gray-500 dark:text-zinc-400">Orçamento manual</span>
          </div>

          {/* Header */}
          <section className="mb-8">
            <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ ORCAMENTO_MANUAL ]</div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">Orçamento manual</h1>
                  <p className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 mt-1">Adicione ambientes e peças manualmente, sem medição do app</p>
                </div>
                <button
                  onClick={() => navigate(`/projetos/${projetoId}`)}
                  className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
                >
                  <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                  Voltar
                </button>
              </div>
            </div>
          </section>

          {/* Ambientes */}
          <div className="flex flex-col gap-6">
            {ambientesManual.map((amb) => (
              <div key={amb.id} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">

                {/* Header do ambiente */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
                  <div className="w-1 h-5 bg-yellow-400/60 shrink-0"></div>
                  <input
                    value={amb.nome}
                    onChange={e => updateAmbNome(amb.id, e.target.value)}
                    placeholder="Nome do ambiente"
                    className="flex-1 bg-transparent text-gray-900 dark:text-white text-sm font-semibold outline-none border-b border-transparent focus:border-yellow-400/50 transition-colors min-w-0 pb-0.5"
                  />
                  <button
                    onClick={() => duplicarAmbienteManual(amb.id)}
                    title="Duplicar ambiente"
                    className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                  </button>
                  {ambientesManual.length > 1 && (
                    <button
                      onClick={() => removeAmbienteManual(amb.id)}
                      title="Remover ambiente"
                      className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    >
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                    </button>
                  )}
                </div>

                {/* ── Peças ─────────────────────────────────────────────── */}
                <div className="divide-y divide-gray-200 dark:divide-zinc-900/60">
                  {amb.pecasManual.map((pm) => (
                    <div key={pm.id} className="px-5 py-3">
                      {/* Row 1: Nome + Tipo + Actions */}
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={pm.nome}
                          onChange={e => updatePecaManual(amb.id, pm.id, 'nome', e.target.value)}
                          placeholder="Tampo, Saia, Peitoril..."
                          className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 outline-none focus:border-yellow-400/50 transition-colors min-w-0"
                        />
                        <select
                          value={pm.tipo}
                          onChange={e => updatePecaManual(amb.id, pm.id, 'tipo', e.target.value)}
                          className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-2 py-1.5 outline-none focus:border-gray-400 dark:border-zinc-600 shrink-0 w-28"
                        >
                          <option value="retangulo">Retângulo</option>
                          <option value="faixa">Faixa</option>
                          <option value="poligono">Polígono</option>
                        </select>
                        <button
                          onClick={() => duplicarPecaManual(amb.id, pm.id)}
                          title="Duplicar peça"
                          className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded transition-colors shrink-0"
                        >
                          <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
                        </button>
                        <button
                          onClick={() => removePecaManual(amb.id, pm.id)}
                          title="Remover peça"
                          className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors shrink-0"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                        </button>
                      </div>

                      {/* Row 2: Dimensões (conditional on tipo) */}
                      {pm.tipo === 'retangulo' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Larg.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.largura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'largura', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Comp.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.comprimento}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'comprimento', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          {parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0 && (
                            <span className="font-mono text-[9px] text-yellow-400/60">
                              = {(parseFloat(pm.largura) * parseFloat(pm.comprimento)).toFixed(4)} m²
                            </span>
                          )}
                        </div>
                      )}

                      {pm.tipo === 'faixa' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Larg.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.largura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'largura', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Comp.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.comprimento}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'comprimento', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Esp.</span>
                            <select
                              value={pm.espessura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'espessura', e.target.value)}
                              className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-1 py-1 outline-none focus:border-gray-400 dark:border-zinc-600"
                            >
                              <option value="1">1cm</option>
                              <option value="2">2cm</option>
                              <option value="3">3cm</option>
                            </select>
                          </label>
                          {parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0 && (
                            <span className="font-mono text-[9px] text-yellow-400/60">
                              = {(parseFloat(pm.largura) * parseFloat(pm.comprimento)).toFixed(4)} m²
                            </span>
                          )}
                        </div>
                      )}

                      {pm.tipo === 'poligono' && (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1.5">
                            {pm.lados?.map((lado, lIdx) => (
                              <div key={lado.id} className="flex items-center gap-2">
                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 w-12 shrink-0">Lado {lIdx + 1}</span>
                                <input
                                  type="number" step="0.1" min="0"
                                  value={lado.comprimento}
                                  onChange={e => updateLadoManual(amb.id, pm.id, lado.id, e.target.value)}
                                  placeholder="0"
                                  className="w-24 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                                />
                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">cm</span>
                                {pm.lados.length > 1 && (
                                  <button
                                    onClick={() => removeLadoManual(amb.id, pm.id, lado.id)}
                                    className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors"
                                  >
                                    <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => addLadoManual(amb.id, pm.id)}
                            className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 font-mono text-[9px] uppercase tracking-widest transition-colors w-max"
                          >
                            <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                            + Adicionar lado
                          </button>
                          <label className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Área total</span>
                            <input
                              type="number" step="0.0001" min="0"
                              value={pm.area_manual}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'area_manual', e.target.value)}
                              placeholder="0.0000"
                              className="w-28 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m²</span>
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botão + Peça */}
                <button
                  onClick={() => addPecaManual(amb.id)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest hover:text-yellow-400 hover:bg-yellow-400/5 border-t border-gray-200 dark:border-zinc-900 transition-colors"
                >
                  <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                  + Peça
                </button>

                {/* ── Produtos Avulsos ──────────────────────────────────── */}
                {amb.avulsosManual.length > 0 && (
                  <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Produtos Avulsos</div>
                    <div className="flex flex-col gap-1.5">
                      {amb.avulsosManual.map(av => (
                        <div key={av.id} className="flex items-center gap-2">
                          <span className="flex-1 text-[11px] text-gray-600 dark:text-zinc-300 font-mono min-w-0 truncate">{av.nome}</span>
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{av.subcategoria}</span>
                          <input
                            type="number" min="1"
                            value={av.quantidade}
                            onChange={e => updateAvulsoQtd(amb.id, av.id, e.target.value)}
                            className="w-14 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-0.5 outline-none focus:border-yellow-400/50 text-right"
                          />
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">un</span>
                          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 w-20 text-right shrink-0">
                            {(av.preco * av.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <button
                            onClick={() => removeAvulsoManual(amb.id, av.id)}
                            className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                          >
                            <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seletor inline de produto avulso */}
                {avulsoSelectorAmbId === amb.id ? (
                  <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3 bg-gray-50 dark:bg-zinc-950">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Selecionar produto</div>
                    <input
                      value={buscaAvulso}
                      onChange={e => setBuscaAvulso(e.target.value)}
                      placeholder="Buscar produto..."
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 outline-none focus:border-yellow-400/50 mb-2"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {produtosCatalogo
                        .filter(p => !buscaAvulso || p.nome.toLowerCase().includes(buscaAvulso.toLowerCase()) || (p.subcategoria ?? '').toLowerCase().includes(buscaAvulso.toLowerCase()))
                        .map(p => (
                          <button
                            key={p.id}
                            onClick={() => addAvulsoManual(amb.id, p)}
                            className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 text-left transition-colors"
                          >
                            <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{p.nome}</span>
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 ml-2 shrink-0">
                              {p.subcategoria} · {(p.preco ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </button>
                        ))
                      }
                      {produtosCatalogo.filter(p => !buscaAvulso || p.nome.toLowerCase().includes(buscaAvulso.toLowerCase())).length === 0 && (
                        <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 py-2 text-center">Nenhum produto encontrado</div>
                      )}
                    </div>
                    <button
                      onClick={() => { setAvulsoSelectorAmbId(null); setBuscaAvulso(''); }}
                      className="mt-2 font-mono text-[9px] text-gray-500 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAvulsoSelectorAmbId(amb.id); setBuscaAvulso(''); }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest hover:text-gray-500 dark:hover:text-zinc-400 hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 border-t border-gray-200 dark:border-zinc-900 transition-colors"
                  >
                    <iconify-icon icon="solar:bag-plus-linear" width="12"></iconify-icon>
                    + Produto Avulso
                  </button>
                )}

                {/* ── Acabamentos ───────────────────────────────────────── */}
                <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Acabamentos</div>
                  {amb.acabamentosManual.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {amb.acabamentosManual.map(ac => (
                        <div key={ac.id} className="flex items-center gap-2 flex-wrap">
                          <select
                            value={ac.tipo}
                            onChange={e => updateAcabamentoManual(amb.id, ac.id, 'tipo', e.target.value)}
                            className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-1 py-1 outline-none focus:border-gray-400 dark:border-zinc-600 w-36 shrink-0"
                          >
                            <option value="meia_esquadria">Meia-Esquadria</option>
                            <option value="reto_simples">Reto Simples</option>
                            <option value="boleado">Boleado</option>
                            <option value="boleado_duplo">Boleado Duplo</option>
                            <option value="reto_duplo">Reto Duplo</option>
                            <option value="chanfrado">Chanfrado</option>
                          </select>
                          <input
                            type="number" step="0.01" min="0"
                            value={ac.ml}
                            onChange={e => updateAcabamentoManual(amb.id, ac.id, 'ml', e.target.value)}
                            placeholder="0.00"
                            className="w-24 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                          />
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">ml</span>
                          <button
                            onClick={() => removeAcabamentoManual(amb.id, ac.id)}
                            className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors"
                          >
                            <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => addAcabamentoManual(amb.id)}
                    className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 font-mono text-[9px] uppercase tracking-widest transition-colors"
                  >
                    <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                    + Acabamento
                  </button>
                </div>
              </div>
            ))}

            {/* Botão + Ambiente */}
            <button
              onClick={addAmbienteManual}
              className="w-full border border-dashed border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 font-mono text-[10px] uppercase tracking-widest py-4 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors flex items-center justify-center gap-2"
            >
              <iconify-icon icon="solar:add-circle-linear" width="13"></iconify-icon>
              + Ambiente
            </button>
          </div>
        </main>

        {/* Footer fixo */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-20">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
              {totalPecasValidas} peça(s) · {totalAvulsos} avulso(s)
            </div>
            <div className="text-xs text-gray-500 dark:text-zinc-500">Defina materiais na próxima etapa</div>
          </div>
          <button
            onClick={handleContinuarManual}
            className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2"
          >
            Continuar
            <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
          </button>
        </div>
      </div>
    );
  }

  const pecaPainel = pecas.find(p => p.id === painelMaterialPecaId);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-6">
          <a href="/projetos" className="hover:text-yellow-400 transition-colors">Projetos</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <a href={`/projetos/${projetoId}`} className="hover:text-yellow-400 transition-colors">Projeto</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <span className="text-gray-500 dark:text-zinc-400">Novo orçamento</span>
        </div>

        {/* ── Header ─────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ CRIAR_ORCAMENTO ]</div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">Criar orçamento</h1>
              </div>
              <button
                onClick={() => navigate(`/projetos/${projetoId}`)}
                className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
              >
                <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                Voltar
              </button>
            </div>
          </div>
        </section>

        {/* ══ Peças da medição ══════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-100 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] font-mono font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
              01 // Peças da medição
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 border border-gray-200 dark:border-zinc-900 px-2 py-0.5">
              {pecasComMaterial.length}/{pecasIncluidas.length} com material
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            {loadingPecas ? (
              <div className="px-4 py-8 flex items-center justify-center gap-2 text-gray-500 dark:text-zinc-600">
                <iconify-icon icon="solar:spinner-linear" width="16" className="animate-spin"></iconify-icon>
                <span className="font-mono text-[10px] uppercase tracking-widest">Carregando peças...</span>
              </div>
            ) : pecas.length === 0 ? (
              <div className="px-4 py-12 text-center border-t border-gray-300 dark:border-zinc-800">
                <iconify-icon icon="solar:document-text-linear" width="32" className="text-gray-400 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">Nenhuma peça encontrada nesta medição</p>
                <p className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-1">Verifique se a medição foi enviada corretamente pelo app.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700"></span>
                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Peça</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Área / Esp.</span>
                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Material selecionado</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right"></span>
              </div>
              {(() => {
                // Agrupa por ambiente; peças sem ambiente ficam num grupo sem nome
                const grupos = [];
                const mapa = new Map();
                pecas.forEach(p => {
                  const amb = p.ambiente_nome ?? '';
                  if (!mapa.has(amb)) { mapa.set(amb, []); grupos.push(amb); }
                  mapa.get(amb).push(p);
                });
                const temAmbientes = grupos.some(g => g !== '');
                return grupos.map(amb => {
                  const isEditandoEsteAmb = editandoAmbNome?.amb === amb;
                  const temMaterialAmb = mapa.get(amb).some(p => p.materiais.length > 0);
                  return (
                    <div key={amb}>
                      {/* ── Cabeçalho do ambiente ── */}
                      {temAmbientes && amb && (
                        <div className="border-b border-gray-300 dark:border-zinc-800 bg-gray-200/40 dark:bg-zinc-900/40">
                          {/* Linha principal: nome + botões */}
                          <div className="flex items-center gap-2 px-4 py-2.5">
                            {isEditandoEsteAmb ? (
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  autoFocus
                                  value={editandoAmbNome.novo}
                                  onChange={e => setEditandoAmbNome(prev => ({ ...prev, novo: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') confirmarRenomearAmbiente(); if (e.key === 'Escape') setEditandoAmbNome(null); }}
                                  className="flex-1 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none min-w-0"
                                />
                                <button onClick={confirmarRenomearAmbiente} className="text-yellow-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-yellow-400/40 hover:bg-yellow-400/10 transition-colors shrink-0">OK</button>
                                <button onClick={() => setEditandoAmbNome(null)} className="text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-gray-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors shrink-0">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => toggleSecaoAmbiente(amb)} className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                                <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className={`text-gray-400 dark:text-zinc-600 shrink-0 transition-transform duration-200 ${openAmbientes.has(amb) ? '' : '-rotate-90'}`}></iconify-icon>
                                <span className="font-semibold text-gray-900 dark:text-white text-sm tracking-tight truncate">{amb}</span>
                              </button>
                            )}
                            {/* 4 botões de ação */}
                            {!isEditandoEsteAmb && (
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Selecionar material para o ambiente todo — abre o PainelMaterial real */}
                                <button
                                  onClick={() => setPainelMaterialAmbNome(amb)}
                                  title="Aplicar material a todas as peças deste ambiente"
                                  className={`flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border transition-colors ${
                                    temMaterialAmb
                                      ? 'border-yellow-400/60 text-yellow-400 bg-yellow-400/5'
                                      : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/40 hover:text-yellow-400'
                                  }`}
                                >
                                  <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
                                  Material
                                </button>
                                {/* Duplicar ambiente */}
                                <button
                                  onClick={() => duplicarAmbiente(amb)}
                                  title="Duplicar ambiente"
                                  className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent hover:border-yellow-400/20 transition-colors"
                                >
                                  <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
                                </button>
                                {/* Editar nome */}
                                <button
                                  onClick={() => setEditandoAmbNome({ amb, novo: amb })}
                                  title="Editar nome do ambiente"
                                  className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent hover:border-yellow-400/20 transition-colors"
                                >
                                  <iconify-icon icon="solar:pen-linear" width="12"></iconify-icon>
                                </button>
                                {/* Excluir ambiente */}
                                {grupos.length > 1 && (
                                  <button
                                    onClick={() => excluirAmbiente(amb)}
                                    title="Excluir ambiente"
                                    className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-colors"
                                  >
                                    <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* ── Peças do ambiente, agrupadas por grupo_nome ── */}
                      <div className={`grid transition-all duration-200 ease-in-out ${openAmbientes.has(amb) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}><div className="overflow-hidden">
                      {(() => {
                        const pecasDoAmb = mapa.get(amb);
                        const gMap = new Map();
                        const gOrdem = [];
                        pecasDoAmb.forEach(p => {
                          const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
                          if (!gMap.has(k)) { gMap.set(k, []); gOrdem.push(k); }
                          gMap.get(k).push(p);
                        });
                        const temGruposNomeados = gOrdem.some(k => k !== '__sem_grupo__');
                        return gOrdem.flatMap(gKey => {
                          const grupoNome = gKey === '__sem_grupo__' ? null : gKey;
                          const grupoLabel = grupoNome ?? (temGruposNomeados ? 'Peças avulsas' : null);
                          const geKey = `${amb}::${gKey}`;
                          const ge = grupoExtras[geKey] ?? { acabamentos: [], furos: [] };
                          const isEditandoEsteItem = editandoItemNome?.amb === amb && editandoItemNome?.gKey === gKey;
                          const temMaterialGrupo = gMap.get(gKey).some(p => p.materiais.length > 0);
                          return [
                            // Cabeçalho do grupo
                            ...(grupoLabel ? [
                              <div key={`grp-${gKey}`} className="flex items-center gap-2 px-4 py-1.5 bg-gray-200/20 dark:bg-zinc-900/20 border-b border-gray-200 dark:border-zinc-900/60">
                                <iconify-icon icon="solar:folder-linear" width="10" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                {isEditandoEsteItem ? (
                                  <>
                                    <input
                                      autoFocus
                                      value={editandoItemNome.novo}
                                      onChange={e => setEditandoItemNome(prev => ({ ...prev, novo: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') renomearItem(amb, gKey, editandoItemNome.novo); if (e.key === 'Escape') setEditandoItemNome(null); }}
                                      className="flex-1 min-w-0 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-[9px] font-mono px-1.5 py-0.5 outline-none uppercase tracking-widest"
                                    />
                                    <button onClick={() => renomearItem(amb, gKey, editandoItemNome.novo)} className="text-yellow-400 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border border-yellow-400/40 hover:bg-yellow-400/10 transition-colors shrink-0">OK</button>
                                    <button onClick={() => setEditandoItemNome(null)} className="text-gray-500 dark:text-zinc-500 text-[9px] font-mono px-1.5 py-0.5 border border-gray-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors shrink-0">✕</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => toggleSecaoGrupo(geKey)} className="flex items-center gap-1 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                                      <iconify-icon icon="solar:alt-arrow-down-linear" width="9" className={`text-gray-400 dark:text-zinc-700 shrink-0 transition-transform duration-200 ${openGrupos.has(geKey) ? '' : '-rotate-90'}`}></iconify-icon>
                                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest truncate">{grupoLabel}</span>
                                    </button>
                                    {/* Ajuste 3: botão Material por item */}
                                    <button
                                      onClick={() => setPainelMaterialGrupoKey(geKey)}
                                      title="Aplicar material a todas as peças deste item"
                                      className={`flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border transition-colors shrink-0 ${
                                        temMaterialGrupo
                                          ? 'border-yellow-400/60 text-yellow-400 bg-yellow-400/5'
                                          : 'border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-700 hover:border-yellow-400/40 hover:text-yellow-400'
                                      }`}
                                    >
                                      <iconify-icon icon="solar:layers-linear" width="10"></iconify-icon>
                                      Mat.
                                    </button>
                                    {/* Ajuste 1: renomear item */}
                                    {gKey !== '__sem_grupo__' && (
                                      <button
                                        onClick={() => setEditandoItemNome({ amb, gKey, novo: grupoLabel })}
                                        title="Renomear item"
                                        className="p-0.5 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-colors shrink-0"
                                      >
                                        <iconify-icon icon="solar:pen-linear" width="10"></iconify-icon>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ] : []),
                            <div key={`grp-content-${gKey}`} className={`grid transition-all duration-200 ease-in-out ${openGrupos.has(geKey) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                              <div className="overflow-hidden">
                                {gMap.get(gKey).map(p => (
                                  <PecaRow key={p.id} peca={p} onToggle={toggleIncluida} onAbrirMaterial={setPainelMaterialPecaId} onDuplicar={duplicarPecaPrincipal} onRenomear={renomearPeca} todosM={materiais} />
                                ))}
                                {ge.acabamentos.map(ac => (
                                  <div key={ac.id} className="flex items-center gap-2 pl-6 pr-4 py-1.5 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/20 group">
                                    <iconify-icon icon="solar:ruler-angular-linear" width="11" className="text-amber-500/70 shrink-0"></iconify-icon>
                                    <select
                                      value={ac.tipo}
                                      onChange={e => updateGrupoAcabamento(geKey, ac.id, 'tipo', e.target.value)}
                                      className="bg-transparent border border-amber-900/40 text-amber-400 font-mono text-[9px] uppercase tracking-widest px-1 py-0.5 outline-none focus:border-amber-500/60 shrink-0"
                                    >
                                      <option value="meia_esquadria">Meia Esquadria</option>
                                      <option value="reto_simples">Reto Simples</option>
                                      <option value="boleado">Boleado</option>
                                      <option value="boleado_duplo">Boleado Duplo</option>
                                      <option value="reto_duplo">Reto Duplo</option>
                                      <option value="chanfrado">Chanfrado</option>
                                    </select>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number" min="0" step="0.01"
                                        value={ac.ml}
                                        onChange={e => updateGrupoAcabamento(geKey, ac.id, 'ml', parseFloat(e.target.value) || 0)}
                                        className="w-14 bg-transparent border border-amber-900/40 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 outline-none focus:border-amber-500/60 text-right"
                                      />
                                      <span className="font-mono text-[9px] text-amber-700">ml</span>
                                    </div>
                                    <span className="flex-1"></span>
                                    <button onClick={() => removeGrupoAcabamento(geKey, ac.id)} className="p-1 text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                                      <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                    </button>
                                  </div>
                                ))}
                                {(() => {
                                  const tiposMap = new Map();
                                  ge.furos.forEach(fu => {
                                    if (!tiposMap.has(fu.tipo)) tiposMap.set(fu.tipo, []);
                                    tiposMap.get(fu.tipo).push(fu);
                                  });
                                  return Array.from(tiposMap.entries()).map(([tipo, furosTipo]) => {
                                    const count = furosTipo.length;
                                    return (
                                      <div key={`furo-tipo-${tipo}`} className="flex items-center gap-2 pl-6 pr-4 py-1.5 bg-teal-950/10 border-b border-teal-900/20 group">
                                        <iconify-icon icon="solar:scissors-linear" width="11" className="text-teal-500/70 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] text-teal-400 uppercase tracking-widest shrink-0 min-w-[80px]">{tipo}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button onClick={() => removeGrupoFuroTipo(geKey, tipo)} className="w-5 h-5 flex items-center justify-center border border-teal-900/40 text-teal-600 hover:text-teal-300 font-mono text-[11px] transition-colors">−</button>
                                          <span className="font-mono text-[10px] text-teal-300 w-5 text-center">{count}</span>
                                          <button onClick={() => addGrupoFuroTipo(geKey, tipo)} className="w-5 h-5 flex items-center justify-center border border-teal-900/40 text-teal-600 hover:text-teal-300 font-mono text-[11px] transition-colors">+</button>
                                        </div>
                                        <span className="flex-1"></span>
                                        <button onClick={() => removeGrupoFuroTipoAll(geKey, tipo)} className="p-1 text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                                          <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                        </button>
                                      </div>
                                    );
                                  });
                                })()}
                                <div className="flex flex-col gap-0">
                                  <div className="flex items-center gap-3 pl-6 pr-4 py-1 bg-zinc-950/20 border-b border-zinc-900/30">
                                    <button onClick={() => addGrupoAcabamento(geKey)} className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-amber-800 hover:text-amber-500 transition-colors">
                                      <iconify-icon icon="solar:add-circle-linear" width="9"></iconify-icon>
                                      Acabamento
                                    </button>
                                    <button onClick={() => setAddFuroMenuKey(addFuroMenuKey === geKey ? null : geKey)} className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-teal-800 hover:text-teal-500 transition-colors">
                                      <iconify-icon icon="solar:add-circle-linear" width="9"></iconify-icon>
                                      Furo
                                    </button>
                                  </div>
                                  {addFuroMenuKey === geKey && (
                                    <div className="flex items-center gap-2 pl-6 pr-4 py-1.5 bg-teal-950/20 border-b border-teal-900/20">
                                      <iconify-icon icon="solar:scissors-linear" width="10" className="text-teal-600 shrink-0"></iconify-icon>
                                      <select
                                        defaultValue=""
                                        onChange={e => { if (e.target.value) { addGrupoFuroTipo(geKey, e.target.value); setAddFuroMenuKey(null); } }}
                                        className="flex-1 bg-transparent border border-teal-900/40 text-teal-400 font-mono text-[9px] uppercase tracking-widest px-1 py-0.5 outline-none focus:border-teal-500/60"
                                      >
                                        <option value="">— Selecionar tipo de furo —</option>
                                        {acabamentosUnitarios.length > 0
                                          ? acabamentosUnitarios.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)
                                          : <option value="Recorte">Recorte</option>
                                        }
                                      </select>
                                      <button onClick={() => setAddFuroMenuKey(null)} className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors shrink-0">
                                        <iconify-icon icon="solar:close-circle-linear" width="11"></iconify-icon>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>,
                          ];
                        });
                      })()}
                      </div></div>
                    </div>
                  );
                });
              })()}
              </>
            )}
          </div>
        </div>

        {/* ══ Produtos avulsos ══════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] font-mono font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
              02 // Produtos avulsos
            </div>
            <button
              onClick={() => setModalProduto(true)}
              className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
              Adicionar produto
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            {produtos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <iconify-icon icon="solar:box-linear" width="32" className="text-gray-400 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum produto adicionado</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                  <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Produto</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-center">Qtd.</span>
                  <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Valor unit.</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Subtotal</span>
                </div>
                {produtos.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 group hover:bg-white/[0.01] transition-colors">
                    <div className="col-span-5 min-w-0 pr-2">
                      <span className="text-sm text-gray-900 dark:text-white font-medium truncate block">{p.nome}</span>
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{p.subcategoria}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{p.qty}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{fmt(p.preco)}</span>
                    </div>
                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{fmt(p.preco * p.qty)}</span>
                      <button
                        onClick={() => removerProduto(i)}
                        className="text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 p-1"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </main>

      {/* ── Footer fluxo normal ──────────────────────────────────── */}
      <div className="mt-auto w-full bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 relative z-20">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Total estimado</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">{fmt(total)}</span>
              {precisaVersoes && (
                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 border border-gray-300 dark:border-zinc-800 px-1.5 py-0.5">
                  {pecasComMaterial.length} mat. · múltiplas versões
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pecasComMaterial.length < pecasIncluidas.length && (
              <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 hidden sm:block">
                {pecasIncluidas.length - pecasComMaterial.length} peça{pecasIncluidas.length - pecasComMaterial.length !== 1 ? 's' : ''} sem material
              </span>
            )}
            <button
              onClick={handleContinuar}
              disabled={pecasComMaterial.length === 0}
              className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {precisaVersoes ? (
                <>
                  <iconify-icon icon="solar:layers-minimalistic-linear" width="14"></iconify-icon>
                  Criar versões
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
                  Continuar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Painel lateral: material por peça ───────── */}
      {painelMaterialPecaId && pecaPainel && (
        <PainelMaterial
          key={`pm-peca-${painelMaterialPecaId}`}
          pecaId={pecaPainel.id}
          pecaNome={pecaPainel.nome}
          selecionados={pecaPainel.materiais}
          acabamentoInicial={pecaPainel.acabamentoSel ?? null}
          onConfirmar={confirmarMaterial}
          onFechar={() => setPainelMaterialPecaId(null)}
          todosM={materiais}
        />
      )}

      {/* ── Painel lateral: material por ambiente ────── */}
      {painelMaterialAmbNome && (
        <PainelMaterial
          key={`pm-amb-${painelMaterialAmbNome}`}
          pecaId={painelMaterialAmbNome}
          pecaNome={`${painelMaterialAmbNome} — todas as peças`}
          selecionados={[...new Set(pecas.filter(p => p.ambiente_nome === painelMaterialAmbNome).flatMap(p => p.materiais))]}
          onConfirmar={(_, sel, acabSel) => aplicarMaterialAoAmbiente(painelMaterialAmbNome, sel, acabSel)}
          onFechar={() => setPainelMaterialAmbNome(null)}
          todosM={materiais}
        />
      )}

      {/* ── Painel lateral: material por item/grupo ──── */}
      {painelMaterialGrupoKey && (() => {
        const [ambNome, gKey] = painelMaterialGrupoKey.split('::');
        const pecasGrupo = pecas.filter(p => {
          const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
          return (p.ambiente_nome ?? '') === ambNome && k === gKey;
        });
        const labelGrupo = gKey === '__sem_grupo__' ? ambNome : `${ambNome} / ${gKey}`;
        return (
          <PainelMaterial
            key={`pm-grp-${painelMaterialGrupoKey}`}
            pecaId={painelMaterialGrupoKey}
            pecaNome={`${labelGrupo} — todas as peças`}
            selecionados={[...new Set(pecasGrupo.flatMap(p => p.materiais))]}
            onConfirmar={(_, sel, acabSel) => aplicarMaterialAoGrupo(ambNome, gKey, sel, acabSel)}
            onFechar={() => setPainelMaterialGrupoKey(null)}
            todosM={materiais}
          />
        );
      })()}

      {/* ── Modal: produto avulso ────────────────────── */}
      {modalProduto && (
        <ModalProdutoAvulso
          onConfirmar={adicionarProduto}
          onFechar={() => setModalProduto(false)}
        />
      )}

    </div>
  );
}
