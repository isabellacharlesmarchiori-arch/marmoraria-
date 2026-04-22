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

// ── Mappers (Supabase → estrutura interna) ────────────────────────────────────
function mapVersao(orc, pecasRows) {
  if (!orc) return null;

  // Peças vindas da tabela orcamento_pecas (orçamento automático)
  const pecasDB = (pecasRows || []).map((op, idx) => ({
    id:          op.id,
    material_id: op.material_id ?? null,
    nome:        `Peça ${idx + 1}`,
    material:    '—',
    espessura:   '—',
    area:        '—',
    acabamento:  '—',
    valor:       op.valor_total ?? 0,
  }));

  // Itens vindos do JSONB itens_manuais (orçamento manual)
  const itensJSON = Array.isArray(orc.itens_manuais) ? orc.itens_manuais : [];
  const pecasJSON = itensJSON.map((item, idx) => ({
    id:          `manual-${orc.id}-${idx}`,
    material_id: item.material_id ?? null,
    nome:        item.nome_peca?.trim() || `Item ${idx + 1}`,
    material:    '—',
    espessura:   item.espessura  || '—',
    area:        '—',
    acabamento:  item.acabamento || '—',
    valor:       item.total ?? item.preco_unitario ?? 0,
  }));

  // Usa pecasDB se disponíveis; caso contrário, usa itens_manuais
  const pecas = pecasDB.length > 0 ? pecasDB : pecasJSON;

  return {
    id:          orc.id,
    nome:        orc.nome_versao || 'Versão',
    valor_total: orc.valor_total ?? pecas.reduce((s, p) => s + p.valor, 0),
    pecas,
  };
}
function agruparAmbientesPorMedicao(lista) {
  const grupos = {};
  lista.forEach(amb => {
    const key = amb.medicao_id || '__sem_medicao__';
    if (!grupos[key]) {
      grupos[key] = {
        medicao_id: amb.medicao_id || null,
        data_medicao: amb.medicao_data || null,
        ambientes: [],
      };
    }
    grupos[key].ambientes.push(amb);
  });
  return grupos;
}

function mapAmbiente(amb, orcamentosMap, pecasMap) {
  if (!amb) return null;
  const orcs = orcamentosMap[amb.id] || [];
  return {
    id: amb.id,
    nome: amb.nome || 'Sem nome',
    medicao_id: amb.medicao_id || null,
    medicao_data: amb.medicao_data || null,
    versoes: orcs.map(orc => mapVersao(orc, pecasMap[orc.id] || [])).filter(Boolean),
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

  // Mesclar Cenários
  const [modoMesclar, setModoMesclar] = useState(false);
  const [mesclarIds, setMesclarIds] = useState([]);
  const [modalMesclar, setModalMesclar] = useState(null); // null ou { nome: string }
  const [loadingMesclar, setLoadingMesclar] = useState(false);
  const [cenariosMesclados, setCenariosMesclados] = useState(new Set()); // ambIds de ambientes mesclados

  // Modais
  const [editingAmbNome, setEditingAmbNome] = useState(null); // { id, nome }
  const [editingVersaoNome, setEditingVersaoNome] = useState(null); // { ambId, id, nome }
  const [editingMaterial, setEditingMaterial] = useState(null); // { ambId, versaoId, material }
  const [modalUnir, setModalUnir] = useState(null); // null ou { nome: string }
  const [loadingUnir, setLoadingUnir] = useState(false);
  const [toastSucesso, setToastSucesso] = useState('');
  const [versoesUnificadas, setVersoesUnificadas] = useState(new Set());

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

        // fetch iniciado

        // 1. Busca ambientes do projeto
        const { data: ambRaw, error: e1 } = await supabase
          .from('ambientes')
          .select('id, nome, created_at, medicao_id')
          .eq('projeto_id', projetoId)
          .order('created_at', { ascending: true });
        if (e1) console.error('[Carrinho] Erro ambientes:', e1.message);

        let ambientes_lista = ambRaw || [];
        let ambIds = ambientes_lista.map(a => a.id);

        // 2. Busca orçamentos —
        //    Estratégia A: filtra por ambiente_id IN ambIds
        //    Estratégia B (fallback): quando não há ambientes com projeto_id, usa join
        let orcData, e2;

        if (ambIds.length) {
          ({ data: orcData, error: e2 } = await supabase
            .from('orcamentos')
            .select('id, nome_versao, valor_total, created_at, ambiente_id, itens_manuais')
            .in('ambiente_id', ambIds)
            .order('created_at', { ascending: true }));
          if (e2) console.error('[Carrinho] Erro orcamentos:', e2.message);
        } else {
          // Nenhum ambiente encontrado para este projeto — tenta via join direto
          console.warn('[Carrinho] Nenhum ambiente com projeto_id =', projetoId, '— tentando via join');
          ({ data: orcData, error: e2 } = await supabase
            .from('orcamentos')
            .select('id, nome_versao, valor_total, created_at, ambiente_id, itens_manuais, ambientes!inner(id, nome, projeto_id)')
            .eq('ambientes.projeto_id', projetoId)
            .order('created_at', { ascending: true }));
          if (e2) console.error('[Carrinho] Erro orcamentos (join):', e2.message);

          // Reconstrói ambientes_lista a partir dos ambientes retornados no join
          if (orcData?.length) {
            const seen = new Set();
            for (const o of orcData) {
              if (o.ambientes && !seen.has(o.ambientes.id)) {
                ambientes_lista.push({ id: o.ambientes.id, nome: o.ambientes.nome, created_at: null });
                seen.add(o.ambientes.id);
              }
            }
            ambIds = ambientes_lista.map(a => a.id);
          }
        }

        // Busca datas das medições para agrupamento no carrinho
        const uniqueMedicaoIds = [...new Set(ambientes_lista.map(a => a.medicao_id).filter(Boolean))];
        const medicaoDataMap = {};
        if (uniqueMedicaoIds.length) {
          const { data: meds } = await supabase
            .from('medicoes').select('id, data_medicao').in('id', uniqueMedicaoIds);
          (meds || []).forEach(m => { medicaoDataMap[m.id] = m.data_medicao; });
        }
        ambientes_lista = ambientes_lista.map(a => ({
          ...a,
          medicao_data: a.medicao_id ? (medicaoDataMap[a.medicao_id] ?? null) : null,
        }));

        const orcIds = (orcData || []).map(o => o.id);

        // 3. Busca peças desses orçamentos
        const { data: pecasData, error: e3 } = orcIds.length
          ? await supabase
              .from('orcamento_pecas')
              .select('id, orcamento_id, valor_total, material_id')
              .in('orcamento_id', orcIds)
          : { data: [], error: null };
        if (e3) console.error('[Carrinho] Erro orcamento_pecas:', e3.message);

        if (!mounted) return;

        // Agrupa orcamentos por ambiente_id
        const orcamentosMap = {};
        for (const o of (orcData || [])) {
          if (!orcamentosMap[o.ambiente_id]) orcamentosMap[o.ambiente_id] = [];
          orcamentosMap[o.ambiente_id].push(o);
        }

        // Agrupa peças por orcamento_id
        const pecasMap = {};
        for (const p of (pecasData || [])) {
          if (!pecasMap[p.orcamento_id]) pecasMap[p.orcamento_id] = [];
          pecasMap[p.orcamento_id].push(p);
        }

        const parsed = ambientes_lista
          .map(amb => mapAmbiente(amb, orcamentosMap, pecasMap))
          .filter(Boolean);

        carregarLista(parsed);
        const todosIds = parsed.flatMap(a => a.versoes.map(v => v.id));
        setSelectedIds(todosIds);
      } catch (err) {
        console.error('[Carrinho] Exceção:', err);
        if (mounted) carregarLista([]);
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

  // ── Agrupamento por medição ───────────────────────────────────────────────
  const gruposPorMedicao = agruparAmbientesPorMedicao(ambientes);
  const medicaoUnicas = Object.keys(gruposPorMedicao).filter(k => k !== '__sem_medicao__');
  const temMultiplasMedicoes = medicaoUnicas.length > 1;
  const numMedicoes = medicaoUnicas.length;

  // ── Gerar impressão estruturada ───────────────────────────────────────────
  function gerarPrint() {
    const ambSelecionados = ambientes.map(a => ({
      ...a,
      versoes: a.versoes.filter(v => selectedIds.includes(v.id)),
    })).filter(a => a.versoes.length > 0);

    const grupos = agruparAmbientesPorMedicao(ambSelecionados);
    const hasMultiple = Object.keys(grupos).filter(k => k !== '__sem_medicao__').length > 1;
    const totalGeral = ambSelecionados.flatMap(a => a.versoes).reduce((s, v) => s + v.valor_total, 0);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento — ${projetoNome}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:24px;font-size:13px}
    h1{font-size:22px;font-weight:bold;margin-bottom:4px}
    .meta{margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #111}
    .meta p{font-size:12px;color:#555;margin-top:3px}
    .secao{margin-bottom:28px}
    .secao-header{background:#fefce8;border-left:4px solid #eab308;padding:8px 12px;margin-bottom:12px}
    .secao-header h3{font-size:13px;font-weight:bold}
    .ambiente{margin-bottom:14px}
    .amb-nome{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#333;padding:5px 0;border-bottom:1px solid #ddd;margin-bottom:8px}
    .versao{margin-bottom:10px;padding:8px;border:1px solid #e5e5e5}
    .versao-header{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
    .versao-nome{font-weight:bold}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
    th{text-align:left;padding:4px 8px;background:#f9f9f9;border-bottom:1px solid #ddd;color:#666;font-size:10px;text-transform:uppercase}
    td{padding:4px 8px;border-bottom:1px solid #f0f0f0}
    .subtotal{text-align:right;font-size:12px;color:#555;margin-top:6px}
    .total-geral{margin-top:28px;padding:12px 16px;background:#fffbeb;border:2px solid #eab308;display:flex;justify-content:space-between;align-items:center}
    .total-geral span:first-child{font-size:14px;font-weight:bold}
    .total-geral span:last-child{font-size:18px;font-weight:bold}
    @media print{body{padding:10px}}
  </style>
</head>
<body>
  <div class="meta">
    <h1>ORÇAMENTO</h1>
    <p><strong>Projeto:</strong> ${projetoNome}</p>
    ${clienteNome ? `<p><strong>Cliente:</strong> ${clienteNome}</p>` : ''}
    <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
  </div>

  ${Object.entries(grupos).map(([key, grupo], idx) => `
    <div class="secao">
      ${hasMultiple ? `
        <div class="secao-header">
          <h3>📋 MEDIÇÃO ${idx + 1}${grupo.data_medicao ? ' — ' + new Date(grupo.data_medicao).toLocaleDateString('pt-BR') : ''}</h3>
        </div>` : ''}
      ${grupo.ambientes.map(amb => `
        <div class="ambiente">
          <div class="amb-nome">${amb.nome}</div>
          ${amb.versoes.map(v => `
            <div class="versao">
              <div class="versao-header">
                <span class="versao-nome">${v.nome}</span>
                <span>${fmt(v.valor_total)}</span>
              </div>
              ${v.pecas.length ? `
                <table>
                  <thead><tr><th>Peça</th><th>Material</th><th>Espessura</th><th>Acabamento</th><th style="text-align:right">Valor</th></tr></thead>
                  <tbody>${v.pecas.map(p => `
                    <tr>
                      <td>${p.nome}</td><td>${p.material}</td><td>${p.espessura}</td><td>${p.acabamento}</td>
                      <td style="text-align:right">${fmt(p.valor)}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>` : '<p style="font-size:11px;color:#999;margin-top:4px">Nenhuma peça cadastrada</p>'}
            </div>`).join('')}
          ${hasMultiple && idx === Object.keys(grupos).length - 1 || true ? `
            <div class="subtotal">Subtotal desta medição: <strong>${fmt(grupo.ambientes.flatMap(a => a.versoes).reduce((s, v) => s + v.valor_total, 0))}</strong></div>` : ''}
        </div>`).join('')}
    </div>`).join('')}

  <div class="total-geral">
    <span>TOTAL GERAL</span>
    <span>${fmt(totalGeral)}</span>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=860,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ── Unir Cenários ────────────────────────────────────────────────────────
  const unirCenarios = async () => {
    const nome = modalUnir?.nome?.trim() || 'Cenário Unificado';
    setLoadingUnir(true);
    try {
      const versoesSel = ambientes.flatMap(a =>
        a.versoes.filter(v => selectedIds.includes(v.id)).map(v => ({ ...v, ambId: a.id }))
      );
      if (versoesSel.length < 2) return;

      const primeiroAmbId = versoesSel[0].ambId;
      const orcIds = versoesSel.map(v => v.id).filter(id => !isMock(id));

      // Caminho mock (IDs locais ou sem empresa)
      if (!orcIds.length || !profile?.empresa_id) {
        const novaId = newId();
        const pecasMerged = versoesSel.flatMap(v => v.pecas.map(p => ({ ...p, id: newId() })));
        const novaVersao = { id: novaId, nome, valor_total: pecasMerged.reduce((s, p) => s + p.valor, 0), pecas: pecasMerged };
        setAmbientes(prev => prev.map(a => a.id !== primeiroAmbId ? a : { ...a, versoes: [...a.versoes, novaVersao] }));
        setVersoesUnificadas(prev => new Set([...prev, novaId]));
        setSelectedIds(prev => [...prev, novaId]);
        setModalUnir(null);
        setToastSucesso('Cenário unificado criado com sucesso!');
        setTimeout(() => setToastSucesso(''), 3500);
        return;
      }

      // Busca peças e itens manuais de todos os cenários selecionados
      const [{ data: pecasDB, error: ep }, { data: orcsData, error: eo }] = await Promise.all([
        supabase.from('orcamento_pecas')
          .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total')
          .in('orcamento_id', orcIds),
        supabase.from('orcamentos').select('id, itens_manuais').in('id', orcIds),
      ]);
      if (ep) throw new Error(ep.message);
      if (eo) throw new Error(eo.message);

      const itensManuaisMerged = (orcsData || []).flatMap(o => Array.isArray(o.itens_manuais) ? o.itens_manuais : []);
      const valorDB = (pecasDB || []).reduce((s, p) => s + (p.valor_total || 0), 0);
      const valorManual = itensManuaisMerged.reduce((s, p) => s + (p.total || p.preco_unitario || 0), 0);
      const valorTotal = valorDB + valorManual;

      // Cria novo orçamento unificado
      const { data: novoOrc, error: eNew } = await supabase
        .from('orcamentos')
        .insert({
          empresa_id: profile.empresa_id,
          ambiente_id: primeiroAmbId,
          vendedor_id: session.user.id,
          nome_versao: nome,
          status: 'rascunho',
          desconto_total: 0,
          valor_total: valorTotal,
          itens_manuais: itensManuaisMerged.length ? itensManuaisMerged : [],
        })
        .select('id').single();
      if (eNew) throw new Error(eNew.message);

      // Copia peças para o novo orçamento
      if (pecasDB?.length) {
        const { error: eIns } = await supabase
          .from('orcamento_pecas')
          .insert(pecasDB.map(p => ({ ...p, orcamento_id: novoOrc.id })));
        if (eIns) throw new Error(eIns.message);
      }

      // Monta versão para estado local
      const pecasLocais = (pecasDB || []).map((p, idx) => ({
        id: `merged-${novoOrc.id}-${idx}`,
        material_id: p.material_id ?? null,
        nome: `Peça ${idx + 1}`,
        material: '—', espessura: '—', area: '—', acabamento: '—',
        valor: p.valor_total ?? 0,
      }));
      const pecasManLocais = itensManuaisMerged.map((item, idx) => ({
        id: `manualmerge-${novoOrc.id}-${idx}`,
        material_id: item.material_id ?? null,
        nome: item.nome_peca?.trim() || `Item ${idx + 1}`,
        material: '—', espessura: item.espessura || '—', area: '—',
        acabamento: item.acabamento || '—',
        valor: item.total ?? item.preco_unitario ?? 0,
      }));

      const novaVersao = {
        id: novoOrc.id, nome, valor_total: valorTotal,
        pecas: [...pecasLocais, ...pecasManLocais],
      };
      setAmbientes(prev => prev.map(a => a.id !== primeiroAmbId ? a : { ...a, versoes: [...a.versoes, novaVersao] }));
      setVersoesUnificadas(prev => new Set([...prev, novoOrc.id]));
      setSelectedIds(prev => [...prev, novoOrc.id]);
      setModalUnir(null);
      setToastSucesso('Cenário unificado criado com sucesso!');
      setTimeout(() => setToastSucesso(''), 3500);

    } catch (err) { setErro(err.message); }
    finally { setLoadingUnir(false); }
  };

  // ── Mesclar Cenários ──────────────────────────────────────────────────────
  const toggleMesclarId = (e, versaoId) => {
    e.stopPropagation();
    setMesclarIds(p => p.includes(versaoId) ? p.filter(x => x !== versaoId) : [...p, versaoId]);
  };

  const cancelarMesclar = () => {
    setModoMesclar(false);
    setMesclarIds([]);
    setModalMesclar(null);
  };

  const mesclarCenarios = async () => {
    const nome = modalMesclar?.nome?.trim() || 'Mesclado';
    if (mesclarIds.length < 2) return;
    setLoadingMesclar(true);
    try {
      // Agrupa versões selecionadas por ambiente de origem
      const gruposAmb = {};
      for (const amb of ambientes) {
        const versoesDoAmb = amb.versoes.filter(v => mesclarIds.includes(v.id));
        if (versoesDoAmb.length > 0) {
          gruposAmb[amb.id] = { ambNome: amb.nome, versoes: versoesDoAmb };
        }
      }

      const idsOriginais = mesclarIds.filter(id => !isMock(id));
      const totalPecas = Object.values(gruposAmb).flatMap(g => g.versoes.flatMap(v => v.pecas));
      const valorTotalMesclado = totalPecas.reduce((s, p) => s + p.valor, 0);

      // Caminho mock
      if (!idsOriginais.length || !profile?.empresa_id) {
        const novoAmbId = newId();
        const versoesNovas = Object.values(gruposAmb).map(({ ambNome, versoes }) => {
          const pecasMerged = versoes.flatMap(v => v.pecas.map(p => ({ ...p, id: newId() })));
          return {
            id: newId(),
            nome: ambNome,
            valor_total: pecasMerged.reduce((s, p) => s + p.valor, 0),
            pecas: pecasMerged,
          };
        });
        const novoAmb = { id: novoAmbId, nome, medicao_id: null, medicao_data: null, versoes: versoesNovas };
        setAmbientes(prev => [...prev, novoAmb]);
        setCenariosMesclados(prev => new Set([...prev, novoAmbId]));
        setSelectedIds(prev => [...prev, ...versoesNovas.map(v => v.id)]);
        cancelarMesclar();
        setToastSucesso(`Cenário "${nome}" criado com ${versoesNovas.length} seção(ões)!`);
        setTimeout(() => setToastSucesso(''), 3500);
        return;
      }

      // Caminho real — Cria novo ambiente
      const { data: novoAmb, error: eAmb } = await supabase
        .from('ambientes')
        .insert({ projeto_id: projetoId, empresa_id: profile.empresa_id, nome })
        .select('id').single();
      if (eAmb) throw new Error(eAmb.message);

      // Para cada grupo de ambiente de origem, busca dados reais e cria versão mesclada
      const versoesLocais = [];
      for (const { ambNome, versoes } of Object.values(gruposAmb)) {
        const orcIdsGrupo = versoes.map(v => v.id).filter(id => !isMock(id));
        let pecasDB = [], itensManuais = [];

        if (orcIdsGrupo.length) {
          const [{ data: pDB }, { data: orcsData }] = await Promise.all([
            supabase.from('orcamento_pecas')
              .select('peca_id, material_id, incluida, valor_area, valor_acabamentos, valor_recortes, valor_total')
              .in('orcamento_id', orcIdsGrupo),
            supabase.from('orcamentos').select('id, itens_manuais').in('id', orcIdsGrupo),
          ]);
          pecasDB = pDB || [];
          itensManuais = (orcsData || []).flatMap(o => Array.isArray(o.itens_manuais) ? o.itens_manuais : []);
        }

        const valorDB = pecasDB.reduce((s, p) => s + (p.valor_total || 0), 0);
        const valorManual = itensManuais.reduce((s, p) => s + (p.total || p.preco_unitario || 0), 0);
        const valorVersao = valorDB + valorManual;

        const { data: novaVersao, error: eOrc } = await supabase
          .from('orcamentos')
          .insert({
            empresa_id: profile.empresa_id,
            ambiente_id: novoAmb.id,
            vendedor_id: session.user.id,
            nome_versao: ambNome,
            status: 'rascunho',
            desconto_total: 0,
            valor_total: valorVersao,
            itens_manuais: itensManuais.length ? itensManuais : [],
          })
          .select('id').single();
        if (eOrc) throw new Error(eOrc.message);

        if (pecasDB.length) {
          await supabase.from('orcamento_pecas')
            .insert(pecasDB.map(p => ({ ...p, orcamento_id: novaVersao.id })));
        }

        const pecasLocais = pecasDB.map((p, idx) => ({
          id: `merge-${novaVersao.id}-${idx}`, material_id: p.material_id ?? null,
          nome: `Peça ${idx + 1}`, material: '—', espessura: '—', area: '—', acabamento: '—',
          valor: p.valor_total ?? 0,
        }));
        const pecasManLocais = itensManuais.map((item, idx) => ({
          id: `mergemanual-${novaVersao.id}-${idx}`, material_id: item.material_id ?? null,
          nome: item.nome_peca?.trim() || `Item ${idx + 1}`,
          material: '—', espessura: item.espessura || '—', area: '—',
          acabamento: item.acabamento || '—',
          valor: item.total ?? item.preco_unitario ?? 0,
        }));

        versoesLocais.push({
          id: novaVersao.id, nome: ambNome, valor_total: valorVersao,
          pecas: [...pecasLocais, ...pecasManLocais],
        });
      }

      const novoAmbLocal = { id: novoAmb.id, nome, medicao_id: null, medicao_data: null, versoes: versoesLocais };
      setAmbientes(prev => [...prev, novoAmbLocal]);
      setCenariosMesclados(prev => new Set([...prev, novoAmb.id]));
      setSelectedIds(prev => [...prev, ...versoesLocais.map(v => v.id)]);
      cancelarMesclar();
      setToastSucesso(`Cenário "${nome}" criado com ${versoesLocais.length} seção(ões)!`);
      setTimeout(() => setToastSucesso(''), 3500);

    } catch (err) { setErro(err.message); }
    finally { setLoadingMesclar(false); }
  };

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

        {/* Toast sucesso */}
        {toastSucesso && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-950 border border-green-700/50 px-5 py-3 flex items-center gap-3 shadow-xl max-w-md w-full">
            <iconify-icon icon="solar:check-circle-linear" width="16" class="text-green-400 shrink-0" />
            <span className="font-mono text-[11px] text-green-300 flex-1">{toastSucesso}</span>
          </div>
        )}

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

        {/* Badge múltiplas medições */}
        {temMultiplasMedicoes && (
          <div className="bg-blue-950/40 border border-blue-700/40 px-4 py-3 mb-4 flex items-center gap-2">
            <iconify-icon icon="solar:info-circle-linear" width="14" class="text-blue-400 shrink-0" />
            <p className="font-mono text-[11px] text-blue-300">
              Este orçamento contém itens de {numMedicoes} medições diferentes
            </p>
          </div>
        )}

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
          <div className="flex flex-col gap-6">
            {Object.entries(gruposPorMedicao).map(([key, grupo]) => (
              <div key={key}>
                {temMultiplasMedicoes && (
                  <div className="flex items-center gap-3 mb-3 border-l-4 border-yellow-500 pl-4">
                    <iconify-icon icon="solar:ruler-cross-pen-linear" width="14" class="text-yellow-500 shrink-0" />
                    <h3 className="font-semibold text-sm text-white">
                      Medição {grupo.data_medicao ? new Date(grupo.data_medicao).toLocaleDateString('pt-BR') : '—'}
                    </h3>
                  </div>
                )}
                <div className="flex flex-col gap-4">
                {grupo.ambientes.map(amb => (
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
                    const isMesclarChecked = mesclarIds.includes(v.id);
                    const isExpandido = !!expandidos[v.id];
                    const vBusy = loadingVersaoId === v.id;

                    return (
                      <div
                        key={v.id}
                        className={`flex flex-col group transition-colors ${vi < amb.versoes.length - 1 ? 'border-b border-zinc-900' : ''} ${modoMesclar && isMesclarChecked ? 'bg-orange-400/5' : ''}`}
                      >
                        {/* Linha da versão */}
                        <div
                          onClick={e => modoMesclar ? toggleMesclarId(e, v.id) : toggleExpandido(e, v.id)}
                          className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.01] cursor-pointer"
                        >
                          {/* Esquerda: checkbox + ícone + nome */}
                          <div className="flex items-center gap-3">
                            {/* Checkbox de seleção (normal) ou checkbox de mesclar */}
                            {modoMesclar ? (
                              <div
                                onClick={e => toggleMesclarId(e, v.id)}
                                className={`w-4 h-4 flex items-center justify-center shrink-0 border cursor-pointer transition-colors ${isMesclarChecked ? 'border-orange-400 bg-orange-400/20' : 'border-zinc-600 hover:border-orange-400'}`}
                              >
                                {isMesclarChecked && <iconify-icon icon="solar:check-read-linear" width="10" class="text-orange-400" />}
                              </div>
                            ) : (
                              <div
                                onClick={e => toggleSelecionar(e, v.id)}
                                className={`w-4 h-4 flex items-center justify-center shrink-0 border cursor-pointer transition-colors ${isChecked ? 'border-yellow-400 bg-yellow-400/10' : 'border-zinc-700 hover:border-yellow-400'}`}
                              >
                                {isChecked && <iconify-icon icon="solar:check-read-linear" width="10" class="text-yellow-400" />}
                              </div>
                            )}

                            <iconify-icon
                              icon="solar:document-text-linear"
                              width="13"
                              class={`transition-colors shrink-0 ${modoMesclar ? (isMesclarChecked ? 'text-orange-400' : 'text-zinc-700 group-hover:text-orange-400') : (isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400')}`}
                            />

                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium transition-colors ${modoMesclar ? (isMesclarChecked ? 'text-orange-400' : 'text-white group-hover:text-orange-400') : (isChecked ? 'text-yellow-400' : 'text-white group-hover:text-yellow-400')}`}>
                                  {v.nome}
                                </span>
                                {versoesUnificadas.has(v.id) && (
                                  <span className="px-1.5 py-0.5 border border-violet-400/40 text-[8px] font-mono uppercase tracking-widest text-violet-400 bg-violet-400/5 shrink-0">
                                    Unificado
                                  </span>
                                )}
                                {cenariosMesclados.has(amb.id) && (
                                  <span className="px-1.5 py-0.5 border border-orange-400/40 text-[8px] font-mono uppercase tracking-widest text-orange-400 bg-orange-400/5 shrink-0">
                                    Mesclado
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-600">
                                {v.pecas.length} peça{v.pecas.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Direita: ações + valor + chevron */}
                          <div className="flex items-center gap-3">
                            {/* Tríade da versão (visível no hover, oculta no modo mesclar) */}
                            <div className={`flex items-center gap-1 transition-opacity mr-1 ${modoMesclar ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
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
                            <span className={`font-mono text-sm font-semibold ${modoMesclar ? (isMesclarChecked ? 'text-orange-400' : 'text-white') : (isChecked ? 'text-yellow-400' : 'text-white')}`}>
                              {fmt(v.valor_total)}
                            </span>

                            {/* Chevron (escondido no modo mesclar) */}
                            {!modoMesclar && (
                              <iconify-icon
                                icon={isExpandido ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                width="13"
                                class={`transition-colors ${isChecked ? 'text-yellow-400' : 'text-zinc-700 group-hover:text-yellow-400'}`}
                              />
                            )}
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
                {temMultiplasMedicoes && (
                  <div className="mt-3 flex items-center justify-between px-4 py-3 bg-zinc-900/50 border border-zinc-800/50">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Subtotal desta medição</span>
                    <span className="font-mono text-sm font-semibold text-white">
                      {fmt(grupo.ambientes.flatMap(a => a.versoes).filter(v => selectedIds.includes(v.id)).reduce((s, v) => s + v.valor_total, 0))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Rodapé fixo — Total selecionado + ações ──────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505] border-t border-zinc-800 p-4 flex items-center justify-between z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        {modoMesclar ? (
          /* ── Modo Mesclar Cenários ── */
          <>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
              <div>
                <div className="font-mono text-[10px] text-orange-400 uppercase tracking-widest font-bold">
                  Modo Mesclar Ativo
                </div>
                <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  {mesclarIds.length < 2
                    ? `Selecione ao menos 2 cenários (${mesclarIds.length} selecionado${mesclarIds.length !== 1 ? 's' : ''})`
                    : `${mesclarIds.length} cenário${mesclarIds.length !== 1 ? 's' : ''} selecionado${mesclarIds.length !== 1 ? 's' : ''}`
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelarMesclar}
                className="flex items-center gap-2 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors"
              >
                <iconify-icon icon="solar:close-linear" width="13" />
                Cancelar
              </button>
              <button
                onClick={() => setModalMesclar({ nome: 'Cenário Mesclado' })}
                disabled={mesclarIds.length < 2}
                className="flex items-center gap-2 bg-orange-500 text-white text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 hover:bg-orange-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <iconify-icon icon="solar:merge-linear" width="13" />
                Mesclar ({mesclarIds.length})
              </button>
            </div>
          </>
        ) : (
          /* ── Rodapé normal ── */
          <>
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
                onClick={gerarPrint}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2 border border-zinc-700 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <iconify-icon icon="solar:printer-linear" width="13" />
                Imprimir / PDF
              </button>
              <button
                onClick={() => setModalUnir({ nome: 'Cenário Unificado' })}
                disabled={selectedIds.length < 2}
                className="flex items-center gap-2 border border-violet-500/50 text-violet-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-violet-400 hover:text-violet-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <iconify-icon icon="solar:link-circle-linear" width="13" />
                Unir Cenários ({selectedIds.length})
              </button>
              <button
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <iconify-icon icon="solar:chat-line-linear" width="13" />
                Enviar WhatsApp
              </button>
            </div>
          </>
        )}
      </div>

      {/* ══ Modal: Renomear Ambiente ══════════════════════════════════════ */}
      {editingAmbNome && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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

      {/* ══ Modal: Unir Cenários ══════════════════════════════════════════ */}
      {modalUnir && (() => {
        const versoesSel = ambientes.flatMap(a =>
          a.versoes.filter(v => selectedIds.includes(v.id)).map(v => ({ ...v, ambNome: a.nome }))
        );
        return (
          <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Unir Cenários Selecionados</span>
                <button onClick={() => setModalUnir(null)} className="text-zinc-500 hover:text-white transition-colors">
                  <iconify-icon icon="solar:close-linear" width="16" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Nome do cenário unificado */}
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block mb-2">
                    Nome do Cenário Unificado
                  </label>
                  <input
                    autoFocus
                    value={modalUnir.nome}
                    onChange={e => setModalUnir(p => ({ ...p, nome: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !loadingUnir) unirCenarios(); }}
                    className="w-full bg-black border border-zinc-800 focus:border-violet-400 outline-none text-white text-sm font-mono px-3 py-2"
                    placeholder="Ex: Cenário Unificado"
                  />
                </div>

                {/* Lista de cenários que serão unidos */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-2">
                    Cenários que serão unidos ({versoesSel.length}):
                  </p>
                  <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                    {versoesSel.map(v => (
                      <li key={v.id} className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                        <iconify-icon icon="solar:link-circle-linear" width="11" class="text-violet-400 shrink-0" />
                        <span className="text-zinc-500">{v.ambNome}</span>
                        <iconify-icon icon="solar:alt-arrow-right-linear" width="10" class="text-zinc-700 shrink-0" />
                        <span>{v.nome}</span>
                        <span className="ml-auto text-zinc-600">{fmt(v.valor_total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">
                  Os cenários originais serão mantidos. Um novo cenário será criado no ambiente do primeiro cenário selecionado com todas as peças.
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setModalUnir(null)}
                    className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={unirCenarios}
                    disabled={loadingUnir || !modalUnir.nome?.trim()}
                    className="flex-1 bg-violet-600 text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loadingUnir
                      ? <><iconify-icon icon="solar:spinner-linear" width="12" class="animate-spin" /> Unindo...</>
                      : <><iconify-icon icon="solar:link-circle-linear" width="12" /> Unir Cenários</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Modal: Mesclar Cenários ══════════════════════════════════════ */}
      {modalMesclar && (() => {
        // Agrupa selecionados por ambiente
        const gruposPreview = {};
        for (const amb of ambientes) {
          const versoesDoAmb = amb.versoes.filter(v => mesclarIds.includes(v.id));
          if (versoesDoAmb.length > 0) {
            gruposPreview[amb.id] = { ambNome: amb.nome, versoes: versoesDoAmb };
          }
        }
        const totalMesclar = Object.values(gruposPreview)
          .flatMap(g => g.versoes).reduce((s, v) => s + v.valor_total, 0);
        return (
          <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0d0d0d] border border-zinc-700 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <iconify-icon icon="solar:merge-linear" width="14" class="text-orange-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white font-bold">Mesclar Cenários</span>
                </div>
                <button onClick={cancelarMesclar} className="text-zinc-500 hover:text-white transition-colors">
                  <iconify-icon icon="solar:close-linear" width="16" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Nome */}
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block mb-2">
                    Nome do Novo Cenário
                  </label>
                  <input
                    autoFocus
                    value={modalMesclar.nome}
                    onChange={e => setModalMesclar(p => ({ ...p, nome: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !loadingMesclar) mesclarCenarios(); }}
                    className="w-full bg-black border border-zinc-800 focus:border-orange-400 outline-none text-white text-sm font-mono px-3 py-2"
                    placeholder="Ex: Proposta Final, Mescla Completa..."
                  />
                </div>

                {/* Preview da hierarquia */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-3">
                    Estrutura do novo cenário:
                  </p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {Object.values(gruposPreview).map(({ ambNome, versoes }, gi) => (
                      <div key={gi} className="border border-zinc-800 bg-black/30">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50">
                          <iconify-icon icon="solar:layers-minimalistic-linear" width="11" class="text-orange-400 shrink-0" />
                          <span className="font-mono text-[10px] text-orange-300 font-semibold">{ambNome}</span>
                          <span className="ml-auto font-mono text-[9px] text-zinc-600">
                            {fmt(versoes.reduce((s, v) => s + v.valor_total, 0))}
                          </span>
                        </div>
                        <ul className="px-3 py-2 space-y-1">
                          {versoes.map(v => (
                            <li key={v.id} className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                              <iconify-icon icon="solar:document-text-linear" width="10" class="text-zinc-600 shrink-0" />
                              <span>{v.nome}</span>
                              <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
                              <span className="text-zinc-600">{v.pecas.length} peça{v.pecas.length !== 1 ? 's' : ''}</span>
                              <span className="ml-auto text-zinc-600">{fmt(v.valor_total)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800">
                    <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
                      Total do novo cenário
                    </span>
                    <span className="font-mono text-sm font-bold text-orange-400">{fmt(totalMesclar)}</span>
                  </div>
                </div>

                <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">
                  Os cenários originais são mantidos intactos. Um novo ambiente será criado com uma versão por ambiente de origem, contendo todas as peças mescladas.
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={cancelarMesclar}
                    className="flex-1 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] uppercase py-2.5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={mesclarCenarios}
                    disabled={loadingMesclar || !modalMesclar.nome?.trim()}
                    className="flex-1 bg-orange-500 text-white font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loadingMesclar
                      ? <><iconify-icon icon="solar:spinner-linear" width="12" class="animate-spin" /> Mesclando...</>
                      : <><iconify-icon icon="solar:merge-linear" width="12" /> Confirmar Mescla</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Modal: Mudar Material em Massa ════════════════════════════════ */}
      {editingMaterial && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
