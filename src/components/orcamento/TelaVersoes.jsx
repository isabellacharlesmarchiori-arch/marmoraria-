import React, { useState, useEffect, useMemo } from 'react';
import PainelMaterial from './PainelMaterial';
import PainelMaterialLinear from './PainelMaterialLinear';
import ModalProdutoAvulso from './ModalProdutoAvulso';
import { fmt, precoPeca, precoAcabamento, ACAB_TIPO_NOME, aplicarAutoMatchNaLista } from '../../utils/orcamentoUtils';

export default function TelaVersoes({ versoes: initialVersoes, pecas, produtos, produtosCatalogo, onSalvar, onVoltar, todosM, matLineares = [], precosCatMaterial = [], acabamentosUnitarios = [], salvando = false, grupoExtras = {} }) {

  // ── Lista de ambientes (mutável: suporta rename/delete/duplicate) ─
  const [listaAmbientes, setListaAmbientes] = useState(() => {
    const ambs = [];
    const seen = new Set();
    pecas.filter(p => p.incluida).forEach(p => {
      const amb = p.ambiente_nome ?? '';
      if (!seen.has(amb)) { seen.add(amb); ambs.push(amb); }
    });
    return ambs;
  });

  // ── Ambientes ativos no cenário (checkbox por ambiente) ───────────
  const [ambientesAtivos, setAmbientesAtivos] = useState(() => {
    const result = {};
    pecas.filter(p => p.incluida).forEach(p => { result[p.ambiente_nome ?? ''] = true; });
    return result;
  });

  // ── Edição de nome de ambiente ────────────────────────────────────
  const [editandoNomeAmb, setEditandoNomeAmb] = useState(null); // { amb, novo }

  // ── Estado principal: versões independentes por ambiente ─────────
  // ambiVersoes: { [amb]: { id, nome, pecasList, avulsos }[] }
  const [ambiVersoes, setAmbiVersoes] = useState(() => {
    const result = {};
    listaAmbientes.forEach(amb => {
      const pecasAmb = pecas.filter(p => p.incluida && (p.ambiente_nome ?? '') === amb);

      // Deduplicate global cartesian versions: keep only entries with a unique material
      // signature for THIS ambient's pieces (avoids N×M versions when only N are distinct here)
      const seenSig = new Set();
      const uniqVersoes = initialVersoes.filter(v => {
        const sig = pecasAmb.map(p => v.mats[p.id] ?? '').join('\0');
        if (seenSig.has(sig)) return false;
        seenSig.add(sig);
        return true;
      });

      result[amb] = uniqVersoes.map((v, vIdx) => {
        // Per-ambient version name: dominant material by area (not the global combo name)
        const areaByNome = {};
        pecasAmb.forEach(p => {
          const mid = v.mats[p.id];
          if (!mid) return;
          const nome = todosM?.find(m => m.id === mid)?.nome;
          if (nome) areaByNome[nome] = (areaByNome[nome] ?? 0) + (p.area_liq ?? 1);
        });
        const vNome = Object.entries(areaByNome).sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Versão ${vIdx + 1}`;

        // Agrupa peças do ambiente por grupo_nome (fallback: item_nome)
        const gMap = new Map();
        const gOrder = [];
        pecasAmb.forEach(p => {
          const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
          if (!gMap.has(k)) { gMap.set(k, []); gOrder.push(k); }
          gMap.get(k).push(p);
        });
        const pecasList = [];
        gOrder.forEach(gKey => {
          const pcsGroup = gMap.get(gKey);
          const grupoNomeVal = gKey === '__sem_grupo__' ? null : gKey;
          let firstStoneUid = null;
          pcsGroup.forEach((p, idx) => {
            const stoneUid = `${p.id}-${Math.random()}`;
            if (idx === 0) firstStoneUid = stoneUid;
            pecasList.push({
              uid: stoneUid,
              idBase: p.id,
              tipo: 'pedra',
              nome: p.nome,
              ambiente_nome: p.ambiente_nome ?? null,
              item_nome: grupoNomeVal,
              matId: v.mats[p.id] ?? null,
              matAcabamento: v.acabamentos?.[p.id] ?? null,
              area_liq: p.area_liq ?? 0,
              grupo_quantidade: p.grupo_quantidade ?? 1,
              espessura: p.espessura ?? 2,
              meia_esquadria_ml: p.meia_esquadria_ml ?? 0,
              reto_simples_ml:   p.reto_simples_ml   ?? 0,
              boleado_ml:        p.boleado_ml        ?? 0,
              boleado_duplo_ml:  p.boleado_duplo_ml  ?? 0,
              reto_duplo_ml:     p.reto_duplo_ml     ?? 0,
              chanfrado_ml:      p.chanfrado_ml      ?? 0,
              cortes: p.cortes ?? 0,
            });
          });
          // Acabamentos e furos do grupo (de grupoExtras ou agregado das peças)
          const geKey = `${amb}::${gKey}`;
          const ge = grupoExtras[geKey];
          if (ge) {
            (ge.acabamentos ?? []).forEach(ac => {
              const nomeAcab = ACAB_TIPO_NOME[ac.tipo] ?? ac.tipo;
              pecasList.push({
                uid: `ac-g-${ac.tipo}-${firstStoneUid}-${Math.random()}`,
                idBase: pcsGroup[0]?.id ?? null,
                idPedraUid: firstStoneUid,
                tipo: 'acabamento',
                tipoAcabamento: ac.tipo,
                nome: nomeAcab,
                ml: ac.ml,
                matLinearId: null,
                ambiente_nome: amb,
                item_nome: grupoNomeVal,
                precoManual: ac.precoManual ?? null,
              });
            });
            (ge.furos ?? []).forEach(fu => {
              const acabUnit = acabamentosUnitarios.find(a => a.nome.toLowerCase() === fu.tipo.toLowerCase());
              const fuPreco = fu.precoManual != null ? fu.precoManual : (acabUnit ? parseFloat(acabUnit.preco_unitario) : 0);
              pecasList.push({
                uid: `rc-g-${firstStoneUid}-${Math.random()}`,
                idBase: pcsGroup[0]?.id ?? null,
                idPedraUid: firstStoneUid,
                tipo: 'recorte',
                nome: fu.tipo,
                formato: fu.formato ?? null,
                precoUnit: fuPreco,
                ambiente_nome: amb,
                item_nome: grupoNomeVal,
              });
            });
          } else {
            // Fallback: agrega das peças (sem grupoExtras) — todos os 6 tipos
            const ac6 = [
              ['meia_esquadria', pcsGroup.reduce((s, p) => s + (p.meia_esquadria_ml ?? 0), 0)],
              ['reto_simples',   pcsGroup.reduce((s, p) => s + (p.reto_simples_ml   ?? 0), 0)],
              ['boleado',        pcsGroup.reduce((s, p) => s + (p.boleado_ml        ?? 0), 0)],
              ['boleado_duplo',  pcsGroup.reduce((s, p) => s + (p.boleado_duplo_ml  ?? 0), 0)],
              ['reto_duplo',     pcsGroup.reduce((s, p) => s + (p.reto_duplo_ml     ?? 0), 0)],
              ['chanfrado',      pcsGroup.reduce((s, p) => s + (p.chanfrado_ml      ?? 0), 0)],
            ];
            ac6.forEach(([tipo, total]) => {
              if (total > 0) pecasList.push({ uid: `ac-${tipo}-g-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'acabamento', tipoAcabamento: tipo, nome: ACAB_TIPO_NOME[tipo], ml: total, matLinearId: null, ambiente_nome: amb, item_nome: grupoNomeVal });
            });
            pcsGroup.flatMap(p => p.recortes ?? []).forEach(rc => {
              const acabUnit = acabamentosUnitarios.find(a => a.nome.toLowerCase() === (rc.funcao_label ?? '').toLowerCase());
              pecasList.push({ uid: `rc-g-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'recorte', nome: rc.funcao_label ?? rc.funcao ?? 'Recorte', formato: rc.formato ?? null, precoUnit: acabUnit ? parseFloat(acabUnit.preco_unitario) : 0, ambiente_nome: amb, item_nome: grupoNomeVal });
            });
          }
        });
        return {
          id: `v-${amb}-${Date.now()}-${vIdx}`,
          nome: vNome,
          pecasList: aplicarAutoMatchNaLista(pecasList, todosM, matLineares, precosCatMaterial),
          avulsos: [],
        };
      });
    });
    return result;
  });

  // ── Seleção (radio): qual versão está selecionada por ambiente ───
  const [selecoes, setSelecoes] = useState({});

  // Inicializa selecoes com os IDs reais de ambiVersoes (IDs gerados no useState acima)
  useEffect(() => {
    setSelecoes(prev => {
      const next = { ...prev };
      listaAmbientes.forEach(amb => {
        const lista = ambiVersoes[amb] ?? [];
        if (lista.length > 0 && !lista.find(v => v.id === next[amb])) {
          next[amb] = lista[0].id;
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-match: quando matLineares carrega, preenche matLinearId nos acabamentos ─
  // Busca por palavras-chave no nome do material linear; desambigua pelo material da pedra mãe.
  useEffect(() => {
    if (matLineares.length === 0) return;
    setAmbiVersoes(prev => {
      let anyChanged = false;
      const next = {};
      Object.keys(prev).forEach(amb => {
        next[amb] = prev[amb].map(v => {
          const novaLista = aplicarAutoMatchNaLista(v.pecasList, todosM, matLineares, precosCatMaterial);
          if (novaLista !== v.pecasList) anyChanged = true;
          return novaLista !== v.pecasList ? { ...v, pecasList: novaLista } : v;
        });
      });
      return anyChanged ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matLineares]);

  // ── Cenários ─────────────────────────────────────────────────────
  const [cenarios, setCenarios] = useState([]);
  const [editandoNomeCenario, setEditandoNomeCenario] = useState(null); // id do cenário

  // ── UI State ─────────────────────────────────────────────────────
  const [expandido, setExpandido] = useState(null);              // { amb, vId }
  const [editandoNomeVersao, setEditandoNomeVersao] = useState(null); // { amb, vId }
  const [modalAvulsoKey, setModalAvulsoKey] = useState(null);   // { amb, vId }
  const [editandoAvulso, setEditandoAvulso] = useState(null);   // { amb, vId, uid }
  const [editandoNomeItem, setEditandoNomeItem] = useState(null); // { amb, vId, itemKey, novo }
  const [editandoNomePeca, setEditandoNomePeca] = useState(null); // { amb, vId, uid, novo }
  const [painelMatVersao, setPainelMatVersao] = useState(null);  // { amb, vId, uid|null, itemKey|null, atual: matId|null, label }
  const [painelLinearVersao, setPainelLinearVersao] = useState(null); // { amb, vId, uid }
  const [editandoPrecoManual, setEditandoPrecoManual] = useState(null); // { uid }
  function confirmarMatVersao(_, selecionados, acabamento = null) {
    const matId = selecionados[0] ?? '';
    if (!painelMatVersao) return;
    if (painelMatVersao.itemKey !== null) {
      editarItemMat(painelMatVersao.amb, painelMatVersao.vId, painelMatVersao.itemKey, matId, acabamento);
    } else {
      editarPecaMat(painelMatVersao.amb, painelMatVersao.vId, painelMatVersao.uid, matId, acabamento);
    }
    setPainelMatVersao(null);
  }

  // ── Helpers de peça (dentro de uma versão) ────────────────────────
  function editarNomePeca(amb, vId, uid, novoNome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, nome: novoNome || pw.nome } : pw),
      }),
    }));
  }

  function excluirPecaDaVersao(amb, vId, uid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : (() => {
        const stone = v.pecasList.find(p => p.uid === uid);
        const withoutStone = v.pecasList.filter(p => p.uid !== uid);
        if (!stone || stone.tipo !== 'pedra' || !stone.item_nome) {
          // Sem grupo: remove stone + filhos por idPedraUid (comportamento legado)
          return { ...v, pecasList: withoutStone.filter(p => p.idPedraUid !== uid) };
        }
        // Stone em grupo: verifica se ainda há outras pedras no grupo
        const groupAcabamentos = withoutStone.filter(p => p.idPedraUid === uid);
        if (groupAcabamentos.length === 0) return { ...v, pecasList: withoutStone };
        const nextStone = withoutStone.find(p => p.tipo === 'pedra' && p.item_nome === stone.item_nome);
        if (!nextStone) {
          // Última pedra do grupo: remove grupo também
          return { ...v, pecasList: withoutStone.filter(p => p.idPedraUid !== uid) };
        }
        // Re-atribui idPedraUid dos acabamentos do grupo para a próxima pedra
        return { ...v, pecasList: withoutStone.map(p => p.idPedraUid === uid ? { ...p, idPedraUid: nextStone.uid } : p) };
      })()),
    }));
  }

  function duplicarPecaDaVersao(amb, vId, uid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : (() => {
        const idx = v.pecasList.findIndex(pw => pw.uid === uid);
        if (idx === -1) return v;
        const stone = v.pecasList[idx];
        const newStoneUid = `dup-${uid}-${Math.random()}`;
        const newIdBase   = crypto.randomUUID();
        const clone = { ...stone, uid: newStoneUid, idBase: newIdBase };
        // Pedra de grupo: não clona os acabamentos do grupo (são compartilhados)
        const acabamentosFilhos = (stone.tipo === 'pedra' && stone.item_nome)
          ? []
          : v.pecasList
              .filter(pw => pw.idPedraUid === uid)
              .map(ac => ({ ...ac, uid: `ac-dup-${Math.random()}`, idBase: newIdBase, idPedraUid: newStoneUid }));
        const lastChildIdx = (stone.tipo === 'pedra' && stone.item_nome)
          ? idx
          : v.pecasList.reduce((last, pw, i) => pw.idPedraUid === uid ? i : last, idx);
        const nova = [...v.pecasList];
        nova.splice(lastChildIdx + 1, 0, clone, ...acabamentosFilhos);
        return { ...v, pecasList: nova };
      })()),
    }));
  }

  // ── Helpers de item ───────────────────────────────────────────────
  function editarItemMat(amb, vId, itemKey, matId, acabamento = null) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => {
        if (v.id !== vId) return v;
        // Atualiza matId das pedras do item; zera matLinearId dos acabamentos filhos para re-match
        const comNovoMat = v.pecasList.map(pw => {
          if ((pw.item_nome ?? '__sem_item__') !== itemKey) return pw;
          if (pw.tipo === 'pedra')     return { ...pw, matId, matAcabamento: acabamento };
          if (pw.tipo === 'acabamento') return { ...pw, matLinearId: null };
          return pw;
        });
        return { ...v, pecasList: aplicarAutoMatchNaLista(comNovoMat, todosM, matLineares, precosCatMaterial) };
      }),
    }));
  }

  function editarAcabamentoMl(amb, vId, uid, novoMl) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, ml: novoMl } : pw),
      }),
    }));
  }

  function editarAcabamentoMat(amb, vId, uid, matLinearId) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, matLinearId } : pw),
      }),
    }));
  }

  function editarRecortePreco(amb, vId, uid, precoUnit) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, precoUnit } : pw),
      }),
    }));
  }

  function editarRecorteTipoPreco(amb, vId, nome, precoUnit) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.tipo === 'recorte' && pw.nome === nome ? { ...pw, precoUnit } : pw),
      }),
    }));
  }

  function excluirRecorteTipo(amb, vId, nome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.filter(pw => !(pw.tipo === 'recorte' && pw.nome === nome)),
      }),
    }));
  }

  function editarNomeItem(amb, vId, oldKey, novoNome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => (pw.item_nome ?? '__sem_item__') === oldKey ? { ...pw, item_nome: novoNome || oldKey } : pw),
      }),
    }));
  }

  function excluirItem(amb, vId, itemKey) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.filter(pw => (pw.item_nome ?? '__sem_item__') !== itemKey),
      }),
    }));
  }

  function duplicarItem(amb, vId, itemKey) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: [
          ...v.pecasList,
          ...v.pecasList
            .filter(pw => (pw.item_nome ?? '__sem_item__') === itemKey)
            .map(pw => ({ ...pw, uid: `${pw.idBase}-dup-${Math.random()}`, idBase: crypto.randomUUID() })),
        ],
      }),
    }));
  }

  // ── IntersectionObserver ─────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────
  function totalAmbiVersao(amb, vId) {
    const v = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
    if (!v) return 0;
    const tPecas = v.pecasList.reduce((s, pw) => {
      if (pw.tipo === 'acabamento') {
        const gQtd = v.pecasList.find(p => p.uid === pw.idPedraUid)?.grupo_quantidade ?? 1;
        return s + gQtd * (pw.precoManual != null ? pw.precoManual : precoAcabamento(pw.ml, pw.matLinearId, matLineares, pw.precoMlOverride ?? null));
      }
      if (pw.tipo === 'recorte')    return s + (pw.precoUnit ?? 0);
      const pOrig = pecas.find(p => p.id === pw.idBase);
      return s + (pw.precoManual != null ? pw.precoManual : precoPeca(pOrig, pw.matId, todosM, pw.matAcabamento));
    }, 0);
    const tAvulsos = (v.avulsos ?? []).reduce((s, a) => s + a.valorUnit * a.qty, 0);
    return tPecas + tAvulsos;
  }

  function matsResumoAmbi(amb, vId) {
    const v = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
    if (!v) return [];
    const ids = [...new Set(v.pecasList.filter(pw => pw.matId && pw.tipo === 'pedra').map(pw => pw.matId))];
    return ids.map(id => todosM.find(m => m.id === id)?.nome).filter(Boolean);
  }

  function subtotalCenario(cen) {
    return Object.keys(cen.selecoes).reduce((s, amb) => s + totalAmbiVersao(amb, cen.selecoes[amb]), 0);
  }

  function descontoCenario(cen) {
    const subtotal = subtotalCenario(cen);
    const val = parseFloat(String(cen.descontoValor ?? '').replace(',', '.')) || 0;
    if (val <= 0) return 0;
    return cen.descontoTipo === '%'
      ? Math.min(subtotal * val / 100, subtotal)
      : Math.min(val, subtotal);
  }

  function totalCenario(cen) {
    return Math.max(0, subtotalCenario(cen) - descontoCenario(cen));
  }

  // ── CRUD versões por ambiente ─────────────────────────────────────
  function adicionarVersao(amb) {
    const existentes = ambiVersoes[amb] ?? [];
    const pecasAmb = pecas.filter(p => p.incluida && (p.ambiente_nome ?? '') === amb);
    const gMap = new Map();
    const gOrder = [];
    pecasAmb.forEach(p => {
      const k = p.grupo_nome ?? p.item_nome ?? '__sem_grupo__';
      if (!gMap.has(k)) { gMap.set(k, []); gOrder.push(k); }
      gMap.get(k).push(p);
    });
    const pecasListRaw = [];
    gOrder.forEach(gKey => {
      const pcsGroup = gMap.get(gKey);
      const grupoNomeVal = gKey === '__sem_grupo__' ? null : gKey;
      let firstStoneUid = null;
      pcsGroup.forEach((p, idx) => {
        const stoneUid = `${p.id}-${Math.random()}`;
        if (idx === 0) firstStoneUid = stoneUid;
        pecasListRaw.push({ uid: stoneUid, idBase: p.id, tipo: 'pedra', nome: p.nome, ambiente_nome: p.ambiente_nome ?? null, item_nome: grupoNomeVal, matId: null, matAcabamento: null, area_liq: p.area_liq ?? 0, grupo_quantidade: p.grupo_quantidade ?? 1, espessura: p.espessura ?? 2, meia_esquadria_ml: p.meia_esquadria_ml ?? 0, reto_simples_ml: p.reto_simples_ml ?? 0, boleado_ml: p.boleado_ml ?? 0, boleado_duplo_ml: p.boleado_duplo_ml ?? 0, reto_duplo_ml: p.reto_duplo_ml ?? 0, chanfrado_ml: p.chanfrado_ml ?? 0, cortes: p.cortes ?? 0 });
      });
      const geKey = `${amb}::${gKey}`;
      const ge = grupoExtras[geKey];
      if (ge) {
        (ge.acabamentos ?? []).forEach(ac => { const nomeAcab = ACAB_TIPO_NOME[ac.tipo] ?? ac.tipo; pecasListRaw.push({ uid: `ac-g-${ac.tipo}-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'acabamento', tipoAcabamento: ac.tipo, nome: nomeAcab, ml: ac.ml, matLinearId: null, ambiente_nome: amb, item_nome: grupoNomeVal, precoManual: ac.precoManual ?? null }); });
        (ge.furos ?? []).forEach(fu => { const acabUnit = acabamentosUnitarios.find(a => a.nome.toLowerCase() === fu.tipo.toLowerCase()); const fuPreco = fu.precoManual != null ? fu.precoManual : (acabUnit ? parseFloat(acabUnit.preco_unitario) : 0); pecasListRaw.push({ uid: `rc-g-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'recorte', nome: fu.tipo, formato: fu.formato ?? null, precoUnit: fuPreco, ambiente_nome: amb, item_nome: grupoNomeVal }); });
      } else {
        // Fallback: agrega das peças — todos os 6 tipos
        const ac6 = [
          ['meia_esquadria', pcsGroup.reduce((s, p) => s + (p.meia_esquadria_ml ?? 0), 0)],
          ['reto_simples',   pcsGroup.reduce((s, p) => s + (p.reto_simples_ml   ?? 0), 0)],
          ['boleado',        pcsGroup.reduce((s, p) => s + (p.boleado_ml        ?? 0), 0)],
          ['boleado_duplo',  pcsGroup.reduce((s, p) => s + (p.boleado_duplo_ml  ?? 0), 0)],
          ['reto_duplo',     pcsGroup.reduce((s, p) => s + (p.reto_duplo_ml     ?? 0), 0)],
          ['chanfrado',      pcsGroup.reduce((s, p) => s + (p.chanfrado_ml      ?? 0), 0)],
        ];
        ac6.forEach(([tipo, total]) => {
          if (total > 0) pecasListRaw.push({ uid: `ac-${tipo}-g-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'acabamento', tipoAcabamento: tipo, nome: ACAB_TIPO_NOME[tipo], ml: total, matLinearId: null, ambiente_nome: amb, item_nome: grupoNomeVal });
        });
        pcsGroup.flatMap(p => p.recortes ?? []).forEach(rc => { const acabUnit = acabamentosUnitarios.find(a => a.nome.toLowerCase() === (rc.funcao_label ?? '').toLowerCase()); pecasListRaw.push({ uid: `rc-g-${firstStoneUid}-${Math.random()}`, idBase: pcsGroup[0]?.id ?? null, idPedraUid: firstStoneUid, tipo: 'recorte', nome: rc.funcao_label ?? rc.funcao ?? 'Recorte', formato: rc.formato ?? null, precoUnit: acabUnit ? parseFloat(acabUnit.preco_unitario) : 0, ambiente_nome: amb, item_nome: grupoNomeVal }); });
      }
    });
    const nova = { id: `v-${amb}-${Date.now()}`, nome: `Versão ${existentes.length + 1}`, pecasList: aplicarAutoMatchNaLista(pecasListRaw, todosM, matLineares, precosCatMaterial), avulsos: [] };
    setAmbiVersoes(prev => ({ ...prev, [amb]: [...(prev[amb] ?? []), nova] }));
  }

  function duplicarVersao(amb, vId) {
    setAmbiVersoes(prev => {
      const lista = prev[amb] ?? [];
      const idx = lista.findIndex(v => v.id === vId);
      if (idx === -1) return prev;
      const clone = JSON.parse(JSON.stringify(lista[idx]));
      clone.id = `v-${amb}-${Date.now()}`;
      clone.nome = `${clone.nome} (Cópia)`;
      // Remapeia UIDs e mantém relação idPedraUid entre pedras e seus acabamentos
      const uidMap = {};
      clone.pecasList = clone.pecasList.map(p => {
        const novoUid = `${p.idBase}-${Math.random()}`;
        uidMap[p.uid] = novoUid;
        return { ...p, uid: novoUid };
      }).map(p => (p.tipo === 'acabamento' || p.tipo === 'recorte') && p.idPedraUid
        ? { ...p, idPedraUid: uidMap[p.idPedraUid] ?? p.idPedraUid }
        : p
      );
      // Preenche acabamentos sem match (caso a fonte tivesse nulls)
      clone.pecasList = aplicarAutoMatchNaLista(clone.pecasList, todosM, matLineares, precosCatMaterial);
      clone.avulsos = (clone.avulsos ?? []).map(a => ({ ...a, uid: `av-${Math.random()}` }));
      const novaLista = [...lista];
      novaLista.splice(idx + 1, 0, clone);
      return { ...prev, [amb]: novaLista };
    });
  }

  function removerVersao(amb, vId) {
    setAmbiVersoes(prev => {
      const lista = prev[amb] ?? [];
      if (lista.length <= 1) return prev;
      const novaLista = lista.filter(v => v.id !== vId);
      setSelecoes(sel => sel[amb] === vId ? { ...sel, [amb]: novaLista[0]?.id ?? null } : sel);
      return { ...prev, [amb]: novaLista };
    });
  }

  function renomearVersao(amb, vId, nome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id === vId ? { ...v, nome } : v),
    }));
  }

  // ── CRUD ambientes ────────────────────────────────────────────────
  function toggleAmbienteAtivo(amb) {
    setAmbientesAtivos(prev => ({ ...prev, [amb]: !prev[amb] }));
  }

  function confirmarRenomearAmb() {
    if (!editandoNomeAmb) return;
    const { amb, novo } = editandoNomeAmb;
    const novoNome = novo.trim() || amb;
    if (novoNome === amb) { setEditandoNomeAmb(null); return; }
    setListaAmbientes(prev => prev.map(a => a === amb ? novoNome : a));
    setAmbiVersoes(prev => {
      const novoObj = { ...prev };
      novoObj[novoNome] = novoObj[amb];
      delete novoObj[amb];
      return novoObj;
    });
    setSelecoes(prev => {
      const novoSel = { ...prev };
      novoSel[novoNome] = novoSel[amb];
      delete novoSel[amb];
      return novoSel;
    });
    setAmbientesAtivos(prev => {
      const novo2 = { ...prev };
      novo2[novoNome] = novo2[amb];
      delete novo2[amb];
      return novo2;
    });
    setEditandoNomeAmb(null);
  }

  function excluirAmbiente(amb) {
    setListaAmbientes(prev => prev.filter(a => a !== amb));
    setAmbiVersoes(prev => { const n = { ...prev }; delete n[amb]; return n; });
    setSelecoes(prev => { const n = { ...prev }; delete n[amb]; return n; });
    setAmbientesAtivos(prev => { const n = { ...prev }; delete n[amb]; return n; });
  }

  function duplicarAmbiente(amb) {
    const novoNome = `${amb} (Cópia)`;
    const versoesSrc = ambiVersoes[amb] ?? [];
    const novasVersoes = versoesSrc.map(v => {
      const clone = JSON.parse(JSON.stringify(v));
      clone.id = `v-${novoNome}-${Date.now()}-${Math.random()}`;
      clone.pecasList = clone.pecasList.map(p => ({ ...p, uid: `${p.idBase}-${Math.random()}` }));
      clone.avulsos = (clone.avulsos ?? []).map(a => ({ ...a, uid: `av-${Math.random()}` }));
      return clone;
    });
    setListaAmbientes(prev => {
      const idx = prev.indexOf(amb);
      const nova = [...prev];
      nova.splice(idx + 1, 0, novoNome);
      return nova;
    });
    setAmbiVersoes(prev => ({ ...prev, [novoNome]: novasVersoes }));
    setSelecoes(prev => ({ ...prev, [novoNome]: novasVersoes[0]?.id ?? null }));
    setAmbientesAtivos(prev => ({ ...prev, [novoNome]: true }));
  }

  function editarPecaMat(amb, vId, pUid, matId, acabamento = null) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => {
        if (v.id !== vId) return v;
        // Atualiza matId da pedra; em seguida re-aplica auto-match nos acabamentos filhos
        const comNovoMat = v.pecasList.map(p => p.uid === pUid ? { ...p, matId, matAcabamento: acabamento } : p);
        // Re-match apenas dos filhos desta pedra (zera para forçar re-match)
        const comReMatch = comNovoMat.map(p =>
          p.tipo === 'acabamento' && p.idPedraUid === pUid ? { ...p, matLinearId: null } : p
        );
        return { ...v, pecasList: aplicarAutoMatchNaLista(comReMatch, todosM, matLineares, precosCatMaterial) };
      }),
    }));
  }

  function editarPrecoManual(amb, vId, uid, precoManual) {
    const val = precoManual !== '' && precoManual != null ? Number(precoManual) : null;
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, precoManual: val } : pw),
      }),
    }));
  }
  function editarRecorteTipo(amb, vId, uid, novoTipo, novoPreco) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, nome: novoTipo, precoUnit: novoPreco } : pw),
      }),
    }));
  }

  // ── Avulsos ───────────────────────────────────────────────────────
  function adicionarAvulso(amb, vId, prod) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: [...(v.avulsos ?? []), {
            uid: `av-${Math.random()}`,
            produtoId: prod.id,
            nome: prod.nome,
            subcategoria: prod.subcategoria ?? '',
            qty: prod.qty ?? 1,
            valorUnit: prod.preco ?? 0,
          }],
        }
      ),
    }));
    setModalAvulsoKey(null);
  }

  function removerAvulso(amb, vId, aUid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : { ...v, avulsos: (v.avulsos ?? []).filter(a => a.uid !== aUid) }
      ),
    }));
  }

  function editarAvulsoQty(amb, vId, aUid, qty) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, qty: Math.max(1, parseInt(qty) || 1) } : a),
        }
      ),
    }));
  }

  function editarAvulsoValor(amb, vId, aUid, valor) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, valorUnit: parseFloat(valor.replace(',', '.')) || 0 } : a),
        }
      ),
    }));
  }

  // ── Cenários ─────────────────────────────────────────────────────
  function gerarNomeCenario(selAtivos) {
    const ambsAtivos = listaAmbientes.filter(amb => ambientesAtivos[amb] && selAtivos[amb]);
    if (ambsAtivos.length === 0) return 'Novo Cenário';

    function matPrincipal(amb) {
      const versao = (ambiVersoes[amb] ?? []).find(v => v.id === selAtivos[amb]);
      const areaByNome = {};
      (versao?.pecasList ?? []).forEach(pw => {
        if (pw.tipo === 'pedra' && pw.matId) {
          const nome = todosM.find(m => m.id === pw.matId)?.nome;
          if (nome) areaByNome[nome] = (areaByNome[nome] ?? 0) + (pw.area_liq ?? 0);
        }
      });
      return Object.entries(areaByNome).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }

    const partes = ambsAtivos.slice(0, 2).map(amb => {
      const mat = matPrincipal(amb);
      return mat ? `${amb}: ${mat}` : amb;
    });

    if (ambsAtivos.length > 2) {
      const outros = ambsAtivos.length - 2;
      partes.push(`${outros} outro${outros > 1 ? 's' : ''}`);
    }

    return partes.join(' + ');
  }

  function criarCenario() {
    const id = `cen-${Date.now()}`;
    // Inclui apenas ambientes ativos nas selecoes do cenário
    const selAtivos = {};
    listaAmbientes.forEach(amb => {
      if (ambientesAtivos[amb]) selAtivos[amb] = selecoes[amb];
    });
    setCenarios(prev => [...prev, {
      id,
      nome: gerarNomeCenario(selAtivos),
      selecoes: selAtivos,
      descontoValor: '',
      descontoTipo: '%',
    }]);
  }

  function renomearCenario(id, nome) {
    setCenarios(prev => prev.map(c => c.id === id ? { ...c, nome } : c));
  }

  function atualizarDescontoCenario(id, field, value) {
    setCenarios(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  function duplicarCenario(id) {
    setCenarios(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      const clone = {
        ...JSON.parse(JSON.stringify(prev[idx])),
        id: `cen-${Date.now()}`,
        nome: `${prev[idx].nome} (Cópia)`,
      };
      const nova = [...prev];
      nova.splice(idx + 1, 0, clone);
      return nova;
    });
  }

  function removerCenario(id) {
    setCenarios(prev => prev.filter(c => c.id !== id));
  }

  // ── Salvar ───────────────────────────────────────────────────────
  function handleSalvar() {
    // Cenários existem → salva um orcamento por cenário
    // Sem cenários → salva usando seleção atual (só ambientes ativos) como único orçamento
    const selAtivos = {};
    listaAmbientes.forEach(amb => { if (ambientesAtivos[amb]) selAtivos[amb] = selecoes[amb]; });

    const base = cenarios.length > 0
      ? cenarios
      : [{ id: 'auto', nome: 'Orçamento', selecoes: selAtivos }];

    const versoesFinais = base.map(cen => ({
      nome: cen.nome,
      descontoValor: parseFloat(String(cen.descontoValor ?? '').replace(',', '.')) || 0,
      descontoTipo:  cen.descontoTipo ?? '%',
      pecasList: Object.entries(cen.selecoes).flatMap(([amb, vId]) =>
        (ambiVersoes[amb] ?? []).find(v => v.id === vId)?.pecasList ?? []
      ),
      avulsos: Object.entries(cen.selecoes).flatMap(([amb, vId]) =>
        (ambiVersoes[amb] ?? []).find(v => v.id === vId)?.avulsos ?? []
      ),
    }));

    onSalvar(versoesFinais);
  }

  // ── Render ───────────────────────────────────────────────────────
  const totalSelecaoAtual = useMemo(
    () => listaAmbientes
      .filter(amb => ambientesAtivos[amb])
      .reduce((s, amb) => s + totalAmbiVersao(amb, selecoes[amb]), 0),
    [listaAmbientes, ambientesAtivos, selecoes, ambiVersoes, matLineares]
  );
  const totalVersoes = useMemo(
    () => listaAmbientes.reduce((s, amb) => s + (ambiVersoes[amb]?.length ?? 0), 0),
    [listaAmbientes, ambiVersoes]
  );

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full max-w-[1200px] mx-auto px-4 md:px-8 pt-12 pb-80">

        {/* ── Header ──────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-3">
                  10 // Versões do Orçamento
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">
                  Versões por ambiente
                </h1>
                <p className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 mt-1">
                  Selecione uma versão por ambiente e adicione cenários combinados
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={onVoltar}
                  className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
                >
                  <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* Seleção por ambiente + cenários na mesma tela             */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-100 flex flex-col gap-8">
          {listaAmbientes.map(amb => {
            const lista = ambiVersoes[amb] ?? [];
            const isAtivo = !!ambientesAtivos[amb];
            const isEditandoAmb = editandoNomeAmb?.amb === amb;
            return (
              <div key={amb} className={!isAtivo ? 'opacity-50' : ''}>
                {/* Cabeçalho do ambiente */}
                <div className="flex items-center gap-1.5 mb-3">
                  {/* Barra colorida */}
                  <div className={`w-1 h-6 shrink-0 transition-colors ${isAtivo ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-zinc-700'}`}></div>

                  {/* Checkbox incluir no cenário */}
                  <button
                    onClick={() => toggleAmbienteAtivo(amb)}
                    title={isAtivo ? 'Excluir do cenário' : 'Incluir no cenário'}
                    className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${isAtivo ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-700 hover:border-zinc-500'}`}
                  >
                    {isAtivo && <iconify-icon icon="solar:check-read-linear" width="8"></iconify-icon>}
                  </button>

                  {/* Nome do ambiente (clica para editar) */}
                  {isEditandoAmb ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={editandoNomeAmb.novo}
                        onChange={e => setEditandoNomeAmb(prev => ({ ...prev, novo: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') confirmarRenomearAmb(); if (e.key === 'Escape') setEditandoNomeAmb(null); }}
                        className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm font-bold outline-none px-1 min-w-0"
                      />
                      <button onClick={confirmarRenomearAmb} className="text-yellow-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-yellow-400/40 hover:bg-yellow-400/10 transition-colors shrink-0">OK</button>
                      <button onClick={() => setEditandoNomeAmb(null)} className="text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-gray-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors shrink-0">✕</button>
                    </div>
                  ) : (
                    <h2
                      className="text-sm font-bold text-gray-900 dark:text-white tracking-tight uppercase cursor-pointer hover:text-yellow-400/80 transition-colors"
                      onClick={() => setEditandoNomeAmb({ amb, novo: amb })}
                      title="Renomear ambiente"
                    >
                      {amb || 'Ambiente'}
                    </h2>
                  )}

                  <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800"></div>

                  {/* Botões de ação do ambiente */}
                  {!isEditandoAmb && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Editar nome */}
                      <button
                        onClick={() => setEditandoNomeAmb({ amb, novo: amb })}
                        title="Renomear ambiente"
                        className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      >
                        <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                      </button>
                      {/* Duplicar ambiente */}
                      <button
                        onClick={() => duplicarAmbiente(amb)}
                        title="Duplicar ambiente (com todas as versões)"
                        className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      >
                        <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                      </button>
                      {/* Excluir ambiente */}
                      {listaAmbientes.length > 1 && (
                        <button
                          onClick={() => excluirAmbiente(amb)}
                          title="Excluir ambiente"
                          className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                        </button>
                      )}
                      {/* Separador */}
                      <div className="w-px h-4 bg-gray-200 dark:bg-zinc-800 mx-0.5"></div>
                      {/* Nova versão */}
                      <button
                        onClick={() => adicionarVersao(amb)}
                        title="Adicionar nova versão para este ambiente"
                        className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors"
                      >
                        <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                        Versão
                      </button>
                    </div>
                  )}
                </div>

                {/* Cards de versão */}
                <div className="flex flex-col gap-2">
                  {lista.map((v, vIdx) => {
                    const isSelected  = selecoes[amb] === v.id;
                    const isExp       = expandido?.amb === amb && expandido?.vId === v.id;
                    const isNomeEdit  = editandoNomeVersao?.amb === amb && editandoNomeVersao?.vId === v.id;
                    const subtotal    = totalAmbiVersao(amb, v.id);
                    const nomesMats   = matsResumoAmbi(amb, v.id);
                    const qtdAvulsos  = (v.avulsos ?? []).length;

                    return (
                      <div
                        key={v.id}
                        className={`bg-gray-50 dark:bg-[#0a0a0a] border transition-colors ${isSelected ? 'border-yellow-400/40' : 'border-gray-300 dark:border-zinc-800'}`}
                      >
                        {/* Cabeçalho do card */}
                        <div className="flex items-center gap-1.5 px-4 py-3">

                          {/* Radio / tick de seleção */}
                          <button
                            onClick={() => setSelecoes(prev => ({ ...prev, [amb]: v.id }))}
                            title="Selecionar esta versão"
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700 hover:border-zinc-500'}`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
                          </button>

                          {/* Badge V */}
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 px-2 py-0.5 shrink-0">V{vIdx + 1}</span>

                          {/* Nome (clica para editar) */}
                          {isNomeEdit ? (
                            <input
                              autoFocus
                              value={v.nome}
                              onChange={e => renomearVersao(amb, v.id, e.target.value)}
                              onBlur={() => setEditandoNomeVersao(null)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNomeVersao(null); }}
                              className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm outline-none px-1 min-w-0"
                            />
                          ) : (
                            <button
                              onClick={() => setEditandoNomeVersao({ amb, vId: v.id })}
                              title="Renomear versão"
                              className={`flex-1 text-left text-sm font-medium transition-colors truncate min-w-0 ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                              {v.nome}
                            </button>
                          )}

                          {/* Badges de material */}
                          {nomesMats.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[180px] overflow-hidden">
                              {nomesMats.slice(0, 2).map(n => (
                                <span key={n} className="font-mono text-[9px] text-gray-500 dark:text-zinc-400 border border-gray-300 dark:border-zinc-700 px-1.5 py-0.5 truncate max-w-[85px]">{n}</span>
                              ))}
                              {nomesMats.length > 2 && <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">+{nomesMats.length - 2}</span>}
                            </div>
                          )}

                          {/* Badge avulsos */}
                          {qtdAvulsos > 0 && (
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-800 px-1.5 py-0.5 shrink-0">
                              +{qtdAvulsos} produto{qtdAvulsos !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* Subtotal */}
                          <span className={`font-mono text-sm shrink-0 ${isSelected ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-400'}`}>{fmt(subtotal)}</span>

                          {/* Ações */}
                          <div className="flex items-center gap-0.5 border-l border-gray-300 dark:border-zinc-800 pl-3 shrink-0">
                            <button
                              onClick={() => setExpandido(isExp ? null : { amb, vId: v.id })}
                              title={isExp ? 'Fechar' : 'Editar peças e produtos'}
                              className={`p-1.5 rounded transition-colors ${isExp ? 'text-yellow-400 bg-yellow-400/10' : 'text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                            >
                              <iconify-icon icon={isExp ? 'solar:close-circle-linear' : 'solar:pen-linear'} width="13"></iconify-icon>
                            </button>
                            <button
                              onClick={() => duplicarVersao(amb, v.id)}
                              title="Duplicar versão"
                              className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                            >
                              <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                            </button>
                            {lista.length > 1 && (
                              <button
                                onClick={() => removerVersao(amb, v.id)}
                                title="Remover versão"
                                className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              >
                                <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Área expandida: peças agrupadas por item + avulsos */}
                        {isExp && (
                          <div className="border-t border-gray-300 dark:border-zinc-800">
                            {/* Peças — agrupadas por item_nome quando existir */}
                            {(() => {
                              // Helper: renderiza uma linha de acabamento linear
                              const renderAcabamento = (pw, indent = false) => {
                                const gQtd = v.pecasList.find(p => p.uid === pw.idPedraUid)?.grupo_quantidade ?? 1;
                                const subAcComputed = precoAcabamento(pw.ml, pw.matLinearId, matLineares, pw.precoMlOverride ?? null);
                                const subAc = (pw.precoManual != null ? pw.precoManual : subAcComputed) * gQtd;
                                const isEditingPM = editandoPrecoManual?.uid === pw.uid;
                                return (
                                  <div key={pw.uid} className={`flex items-center gap-2 py-2 border-b border-amber-200 dark:border-amber-900/20 last:border-b-0 bg-amber-50 dark:bg-amber-950/20 group ${indent ? 'pl-10 pr-4' : 'pl-6 pr-4'}`}>
                                    {/* Conector visual "filho da peça acima" */}
                                    <div className="flex flex-col items-center shrink-0 self-stretch justify-center gap-0.5">
                                      <div className="w-px h-2 bg-amber-600/30"></div>
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-600/50"></div>
                                    </div>
                                    <iconify-icon icon="solar:ruler-angular-linear" width="12" className="text-amber-600 dark:text-amber-500/70 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400/80 min-w-[100px] shrink-0 uppercase tracking-wide">{pw.nome}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input
                                        type="number" min="0" step="0.01"
                                        value={pw.ml}
                                        onChange={e => editarAcabamentoMl(amb, v.id, pw.uid, parseFloat(e.target.value) || 0)}
                                        className="w-14 bg-gray-50 dark:bg-black border border-amber-400 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px] px-1.5 py-0.5 outline-none focus:border-amber-500/60 text-right"
                                      />
                                      {gQtd > 1 ? (
                                        <div className="flex flex-col items-start shrink-0">
                                          <span className="font-mono text-[8px] text-amber-700/60">ml/un.</span>
                                          <span className="font-mono text-[8px] text-yellow-400/70">{(pw.ml * gQtd).toFixed(2)} ml ({gQtd}×)</span>
                                        </div>
                                      ) : (
                                        <span className="font-mono text-[10px] text-amber-700">ml</span>
                                      )}
                                    </div>
                                    {pw.matLinearId
                                      ? <button onClick={() => setPainelLinearVersao({ amb, vId: v.id, uid: pw.uid })} className="font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 border border-amber-500 dark:border-amber-600/40 text-amber-700 dark:text-amber-400 shrink-0 flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-400/10 transition-colors">
                                          <iconify-icon icon="solar:ruler-angular-linear" width="9"></iconify-icon>
                                          {matLineares.find(m => m.id === pw.matLinearId)?.nome ?? 'Linear'}
                                        </button>
                                      : <button onClick={() => setPainelLinearVersao({ amb, vId: v.id, uid: pw.uid })} className="font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 border border-red-500 dark:border-red-600/50 text-red-700 dark:text-red-400 shrink-0 flex items-center gap-1 hover:bg-red-100 dark:hover:bg-red-400/10 transition-colors">
                                          <iconify-icon icon="solar:danger-triangle-linear" width="9"></iconify-icon>
                                          não cadastrado
                                        </button>
                                    }
                                    <span className="flex-1"></span>
                                    {isEditingPM ? (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <input
                                          type="number" autoFocus min="0" step="0.01"
                                          value={editandoPrecoManual.precoMl}
                                          onChange={e => {
                                            const ml = parseFloat(e.target.value) || 0;
                                            setEditandoPrecoManual(prev => ({ ...prev, precoMl: e.target.value, total: (ml * pw.ml).toFixed(2) }));
                                          }}
                                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarPrecoManual(amb, v.id, pw.uid, parseFloat(editandoPrecoManual.total) || 0); setEditandoPrecoManual(null); } }}
                                          placeholder="R$/ml"
                                          className="w-14 bg-gray-50 dark:bg-black border border-amber-500/60 text-amber-200 font-mono text-[10px] px-1.5 py-0.5 outline-none text-right shrink-0"
                                        />
                                        <span className="font-mono text-[8px] text-amber-800">/ml</span>
                                        <input
                                          type="number" min="0" step="0.01"
                                          value={editandoPrecoManual.total}
                                          onChange={e => {
                                            const tot = parseFloat(e.target.value) || 0;
                                            setEditandoPrecoManual(prev => ({ ...prev, total: e.target.value, precoMl: pw.ml > 0 ? (tot / pw.ml).toFixed(2) : '0' }));
                                          }}
                                          onBlur={() => { editarPrecoManual(amb, v.id, pw.uid, parseFloat(editandoPrecoManual.total) || 0); setEditandoPrecoManual(null); }}
                                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarPrecoManual(amb, v.id, pw.uid, parseFloat(editandoPrecoManual.total) || 0); setEditandoPrecoManual(null); } }}
                                          className="w-16 bg-gray-50 dark:bg-black border border-amber-500 dark:border-amber-500/60 text-amber-800 dark:text-amber-300 font-mono text-[10px] px-1.5 py-0.5 outline-none text-right shrink-0"
                                        />
                                      </div>
                                    ) : (
                                      <span className={`font-mono text-[11px] shrink-0 w-20 text-right font-semibold ${pw.precoManual != null ? 'text-yellow-400' : 'text-amber-400'}`}>
                                        {subAc > 0 ? fmt(subAc) : '—'}{pw.precoManual != null ? ' *' : ''}
                                      </span>
                                    )}
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0 gap-0.5">
                                      {!isEditingPM && (
                                        <button onClick={() => {
                                          const currentTotal = pw.precoManual ?? subAcComputed;
                                          const currentMl = pw.ml > 0 ? currentTotal / pw.ml : 0;
                                          setEditandoPrecoManual({ uid: pw.uid, precoMl: currentMl.toFixed(2), total: currentTotal.toFixed(2) });
                                        }} title="Alterar preço" className="p-2 text-gray-400 dark:text-zinc-700 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                                        </button>
                                      )}
                                      <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Remover acabamento" className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors">
                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                      </button>
                                    </div>
                                  </div>
                                );
                              };

                              // Helper: renderiza uma linha de recorte/furo
                              const renderRecorte = (pw, indent = false) => (
                                <div key={pw.uid} className={`flex items-center gap-2 py-2 border-b border-teal-200 dark:border-teal-900/20 last:border-b-0 bg-teal-50 dark:bg-teal-950/10 group ${indent ? 'pl-10 pr-4' : 'pl-6 pr-4'}`}>
                                  <div className="flex flex-col items-center shrink-0 self-stretch justify-center gap-0.5">
                                    <div className="w-px h-2 bg-teal-600/30"></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-600/50"></div>
                                  </div>
                                  <iconify-icon icon="solar:scissors-linear" width="12" className="text-teal-500/70 shrink-0"></iconify-icon>
                                  {acabamentosUnitarios.length > 0 ? (
                                    <select
                                      value={pw.nome}
                                      onChange={e => { const sel = acabamentosUnitarios.find(a => a.nome === e.target.value); editarRecorteTipo(amb, v.id, pw.uid, e.target.value, sel?.preco_unitario ?? pw.precoUnit); }}
                                      className="font-mono text-[10px] text-teal-700 dark:text-teal-400/80 min-w-[90px] uppercase tracking-wide bg-transparent border border-teal-400 dark:border-teal-900/40 px-1 py-0.5 outline-none focus:border-teal-600 dark:focus:border-teal-500/60 shrink-0"
                                    >
                                      {acabamentosUnitarios.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
                                      {!acabamentosUnitarios.find(a => a.nome === pw.nome) && <option value={pw.nome}>{pw.nome}</option>}
                                    </select>
                                  ) : (
                                    <span className="font-mono text-[10px] text-teal-700 dark:text-teal-400/80 min-w-[90px] shrink-0 uppercase tracking-wide">{pw.nome}</span>
                                  )}
                                  {pw.formato && <span className="font-mono text-[9px] text-teal-700 shrink-0">{pw.formato}</span>}
                                  <span className="flex-1"></span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="font-mono text-[10px] text-teal-700">R$</span>
                                    <input
                                      type="number" min="0" step="0.01"
                                      value={pw.precoUnit}
                                      onChange={e => editarRecortePreco(amb, v.id, pw.uid, parseFloat(e.target.value) || 0)}
                                      className="w-20 bg-gray-50 dark:bg-black border border-teal-400 dark:border-teal-900/40 text-teal-800 dark:text-teal-300 font-mono text-[10px] px-1.5 py-0.5 outline-none focus:border-teal-500/60 text-right"
                                    />
                                  </div>
                                  <span className="font-mono text-[11px] text-teal-400 shrink-0 w-20 text-right font-semibold">{pw.precoUnit > 0 ? fmt(pw.precoUnit) : '—'}</span>
                                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Remover recorte" className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors">
                                      <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                    </button>
                                  </div>
                                </div>
                              );

                              const renderRecortesGrupados = (recortes, indent = false) => {
                                const tiposMap = new Map();
                                recortes.forEach(pw => {
                                  if (!tiposMap.has(pw.nome)) tiposMap.set(pw.nome, []);
                                  tiposMap.get(pw.nome).push(pw);
                                });
                                return Array.from(tiposMap.entries()).map(([nome, group]) => {
                                  const count = group.length;
                                  const firstPw = group[0];
                                  const precoUnit = firstPw?.precoUnit ?? 0;
                                  const total = precoUnit * count;
                                  return (
                                    <div key={`rc-g-${nome}`} className={`flex items-center gap-2 py-2 border-b border-teal-200 dark:border-teal-900/20 last:border-b-0 bg-teal-50 dark:bg-teal-950/10 group ${indent ? 'pl-10 pr-4' : 'pl-6 pr-4'}`}>
                                      <div className="flex flex-col items-center shrink-0 self-stretch justify-center gap-0.5">
                                        <div className="w-px h-2 bg-teal-600/30"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-teal-600/50"></div>
                                      </div>
                                      <iconify-icon icon="solar:scissors-linear" width="12" className="text-teal-500/70 shrink-0"></iconify-icon>
                                      <span className="font-mono text-[10px] text-teal-700 dark:text-teal-400/80 min-w-[100px] shrink-0 uppercase tracking-wide">{nome}</span>
                                      {firstPw?.formato && <span className="font-mono text-[9px] text-teal-700 shrink-0">{firstPw.formato}</span>}
                                      <span className="font-mono text-[10px] text-teal-600 shrink-0">×{count}</span>
                                      <span className="flex-1"></span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="font-mono text-[10px] text-teal-700">R$</span>
                                        <input
                                          type="number" min="0" step="0.01"
                                          value={precoUnit}
                                          onChange={e => editarRecorteTipoPreco(amb, v.id, nome, parseFloat(e.target.value) || 0)}
                                          className="w-16 bg-gray-50 dark:bg-black border border-teal-400 dark:border-teal-900/40 text-teal-800 dark:text-teal-300 font-mono text-[10px] px-1.5 py-0.5 outline-none focus:border-teal-500/60 text-right"
                                        />
                                      </div>
                                      <span className="font-mono text-[11px] text-teal-400 shrink-0 w-20 text-right font-semibold">{total > 0 ? fmt(total) : '—'}</span>
                                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => excluirRecorteTipo(amb, v.id, nome)} title="Remover furo" className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors">
                                          <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                });
                              };

                              const temItens = v.pecasList.some(pw => pw.item_nome && pw.tipo !== 'acabamento');
                              if (!temItens) {
                                // Sem itens: lista plana
                                const recortesFlat = v.pecasList.filter(pw => pw.tipo === 'recorte');
                                return [
                                  ...v.pecasList.filter(pw => pw.tipo !== 'recorte').map(pw => {
                                  if (pw.tipo === 'acabamento') return renderAcabamento(pw, false);
                                  const pOrig = pecas.find(p => p.id === pw.idBase);
                                  if (!pOrig) {
                                    return null;
                                  }
                                  const subComputed = precoPeca(pOrig, pw.matId, todosM, pw.matAcabamento);
                                  const sub = pw.precoManual != null ? pw.precoManual : subComputed;
                                  const isNomePecaEdit = editandoNomePeca?.amb === amb && editandoNomePeca?.vId === v.id && editandoNomePeca?.uid === pw.uid;
                                  const isEditingPMPedra = editandoPrecoManual?.uid === pw.uid;
                                  return (
                                    <div key={pw.uid} className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors group">
                                      <div className="w-1 h-4 bg-gray-300 dark:bg-zinc-700 shrink-0"></div>
                                      {isNomePecaEdit ? (
                                        <input
                                          autoFocus
                                          value={editandoNomePeca.novo}
                                          onChange={e => setEditandoNomePeca(prev => ({ ...prev, novo: e.target.value }))}
                                          onBlur={() => { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }}
                                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); } }}
                                          className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                        />
                                      ) : (
                                        <span className="text-xs text-gray-600 dark:text-zinc-300 flex-1 min-w-0 truncate">{(pw.grupo_quantidade ?? 1) > 1 ? `${pw.grupo_quantidade}× ${pw.nome}` : pw.nome}</span>
                                      )}
                                      {(() => {
                                        const qtdF = pw.grupo_quantidade ?? 1;
                                        const areaT = pOrig.area_liq;
                                        if (qtdF > 1) {
                                          const areaU = Math.round(areaT / qtdF * 10000) / 10000;
                                          return (
                                            <div className="flex flex-col items-end shrink-0">
                                              <span className="font-mono text-[8px] text-gray-500 dark:text-zinc-600">{areaU.toFixed(2)} m²/un.</span>
                                              <span className="font-mono text-[9px] text-yellow-400/70">{areaT.toFixed(2)} m² ({qtdF}×)</span>
                                            </div>
                                          );
                                        }
                                        return <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{areaT.toFixed(2)} m²</span>;
                                      })()}
                                      <button
                                        onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: pw.uid, itemKey: null, atual: pw.matId ?? null, label: pw.nome })}
                                        className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-colors flex items-center gap-1 shrink-0 ${
                                          pw.matId
                                            ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                            : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                        }`}
                                      >
                                        <iconify-icon icon="solar:layers-linear" width="10"></iconify-icon>
                                        {pw.matId ? (todosM.find(m => m.id === pw.matId)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                      </button>
                                      {isEditingPMPedra ? (
                                        <input
                                          type="number" autoFocus min="0" step="0.01"
                                          defaultValue={pw.precoManual ?? subComputed}
                                          onBlur={e => { editarPrecoManual(amb, v.id, pw.uid, e.target.value); setEditandoPrecoManual(null); }}
                                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarPrecoManual(amb, v.id, pw.uid, e.target.value); setEditandoPrecoManual(null); } }}
                                          className="w-16 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white font-mono text-[10px] px-1.5 py-0.5 outline-none text-right shrink-0"
                                        />
                                      ) : (() => {
                                        const qtdF = pw.grupo_quantidade ?? 1;
                                        if (qtdF > 1 && sub > 0 && pw.precoManual == null) {
                                          return (
                                            <div className="flex flex-col items-end shrink-0">
                                              <span className="font-mono text-[8px] text-gray-500 dark:text-zinc-500">{fmt(sub / qtdF)}/un.</span>
                                              <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400">{fmt(sub)}</span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <span className={`font-mono text-[10px] shrink-0 w-16 text-right ${pw.precoManual != null ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-400'}`}>
                                            {sub > 0 ? fmt(sub) : '—'}{pw.precoManual != null ? ' *' : ''}
                                          </span>
                                        );
                                      })()}
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => setEditandoNomePeca({ amb, vId: v.id, uid: pw.uid, novo: pw.nome })} title="Renomear peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                        </button>
                                        <button onClick={() => setEditandoPrecoManual({ uid: pw.uid })} title="Alterar preço" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:dollar-minimalistic-linear" width="11"></iconify-icon>
                                        </button>
                                        <button onClick={() => duplicarPecaDaVersao(amb, v.id, pw.uid)} title="Duplicar peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                        </button>
                                        <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Excluir peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                          <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                  }),
                                  ...renderRecortesGrupados(recortesFlat, false),
                                ];
                              }
                              // Com itens: agrupar por item_nome
                              const itMap = new Map();
                              const itOrdem = [];
                              v.pecasList.forEach(pw => {
                                const k = pw.item_nome ?? '__sem_item__';
                                if (!itMap.has(k)) { itMap.set(k, []); itOrdem.push(k); }
                                itMap.get(k).push(pw);
                              });
                              return itOrdem.map(itemKey => {
                                const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                                const pwsItem  = itMap.get(itemKey);
                                // matId do item: considera apenas pedras
                                const matIdItem = pwsItem.find(pw => pw.tipo === 'pedra')?.matId ?? '';
                                // Subtotal inclui pedras + acabamentos + recortes
                                const subtotalItem = pwsItem.reduce((s, pw) => {
                                  if (pw.tipo === 'acabamento') {
                                    const gQtd = pwsItem.find(p => p.uid === pw.idPedraUid)?.grupo_quantidade ?? 1;
                                    return s + gQtd * (pw.precoManual != null ? pw.precoManual : precoAcabamento(pw.ml, pw.matLinearId, matLineares, pw.precoMlOverride ?? null));
                                  }
                                  if (pw.tipo === 'recorte')    return s + (pw.precoUnit ?? 0);
                                  const pOrig = pecas.find(p => p.id === pw.idBase);
                                  return s + (pw.precoManual != null ? pw.precoManual : precoPeca(pOrig, pw.matId, todosM, pw.matAcabamento));
                                }, 0);
                                const isNomeItemEdit = editandoNomeItem?.amb === amb && editandoNomeItem?.vId === v.id && editandoNomeItem?.itemKey === itemKey;
                                return (
                                  <div key={itemKey}>
                                    {/* Cabeçalho do item */}
                                    {nomeItem !== null && (
                                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-200/30 dark:bg-zinc-900/30 border-b border-gray-300 dark:border-zinc-800/50 group">
                                        <div className="w-0.5 h-4 bg-yellow-400/30 shrink-0"></div>
                                        {isNomeItemEdit ? (
                                          <input
                                            autoFocus
                                            value={editandoNomeItem.novo}
                                            onChange={e => setEditandoNomeItem(prev => ({ ...prev, novo: e.target.value }))}
                                            onBlur={() => { editarNomeItem(amb, v.id, itemKey, editandoNomeItem.novo); setEditandoNomeItem(null); }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') { editarNomeItem(amb, v.id, itemKey, editandoNomeItem.novo); setEditandoNomeItem(null); }
                                              if (e.key === 'Escape') setEditandoNomeItem(null);
                                            }}
                                            className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-400 truncate">{nomeItem}</span>
                                            {(() => { const qtd = pwsItem.find(pw => pw.tipo === 'pedra')?.grupo_quantidade ?? 1; return qtd > 1 ? <span className="font-mono text-[9px] px-1 py-0.5 border border-zinc-600/50 text-zinc-400 bg-zinc-800/60 shrink-0">x{qtd}</span> : null; })()}
                                          </div>
                                        )}
                                        {/* Material selecionado por item */}
                                        <button
                                          onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: null, itemKey, atual: matIdItem || null, label: nomeItem })}
                                          className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 shrink-0 ${
                                            matIdItem
                                              ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                              : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                          }`}
                                        >
                                          <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
                                          {matIdItem ? (todosM.find(m => m.id === matIdItem)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                        </button>
                                        <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 shrink-0 w-20 text-right">{subtotalItem > 0 ? fmt(subtotalItem) : '—'}</span>
                                        {/* Ações do item */}
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          <button onClick={() => setEditandoNomeItem({ amb, vId: v.id, itemKey, novo: nomeItem })} title="Renomear item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                            <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                          </button>
                                          <button onClick={() => duplicarItem(amb, v.id, itemKey)} title="Duplicar item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                            <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                          </button>
                                          <button onClick={() => excluirItem(amb, v.id, itemKey)} title="Excluir item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    {/* Peças do item */}
                                    {pwsItem.filter(pw => pw.tipo !== 'recorte').map(pw => {
                                      if (pw.tipo === 'acabamento') return renderAcabamento(pw, true);
                                      const pOrig = pecas.find(p => p.id === pw.idBase);
                                      if (!pOrig) {
                                        return null;
                                      }
                                      const subComputedItem = precoPeca(pOrig, pw.matId, todosM, pw.matAcabamento);
                                      const sub = pw.precoManual != null ? pw.precoManual : subComputedItem;
                                      const isNomePecaEditItem = editandoNomePeca?.amb === amb && editandoNomePeca?.vId === v.id && editandoNomePeca?.uid === pw.uid;
                                      const isEditingPMItem = editandoPrecoManual?.uid === pw.uid;
                                      return (
                                        <div key={pw.uid} className={`flex items-center gap-2 py-2 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors group ${nomeItem ? 'px-7' : 'px-4'}`}>
                                          <div className="w-1 h-4 bg-gray-300 dark:bg-zinc-700 shrink-0"></div>
                                          {isNomePecaEditItem ? (
                                            <input
                                              autoFocus
                                              value={editandoNomePeca.novo}
                                              onChange={e => setEditandoNomePeca(prev => ({ ...prev, novo: e.target.value }))}
                                              onBlur={() => { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }}
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }
                                                if (e.key === 'Escape') setEditandoNomePeca(null);
                                              }}
                                              className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                            />
                                          ) : (
                                            <span className="text-xs text-gray-600 dark:text-zinc-300 flex-1 min-w-0 truncate">{pw.nome}</span>
                                          )}
                                          {(() => {
                                            const qtdI = pw.grupo_quantidade ?? 1;
                                            const areaT = pOrig.area_liq;
                                            if (qtdI > 1) {
                                              const areaU = Math.round(areaT / qtdI * 10000) / 10000;
                                              return (
                                                <div className="flex flex-col items-end shrink-0">
                                                  <span className="font-mono text-[8px] text-gray-500 dark:text-zinc-600">{areaU.toFixed(2)} m²/un.</span>
                                                  <span className="font-mono text-[9px] text-yellow-400/70">{areaT.toFixed(2)} m² ({qtdI}×)</span>
                                                </div>
                                              );
                                            }
                                            return <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{areaT.toFixed(2)} m²</span>;
                                          })()}
                                          <button
                                            onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: pw.uid, itemKey: null, atual: pw.matId ?? null, label: pw.nome })}
                                            className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-colors flex items-center gap-1 shrink-0 ${
                                              pw.matId
                                                ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                                : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                            }`}
                                          >
                                            <iconify-icon icon="solar:layers-linear" width="10"></iconify-icon>
                                            {pw.matId ? (todosM.find(m => m.id === pw.matId)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                          </button>
                                          {isEditingPMItem ? (
                                            <input
                                              type="number" autoFocus min="0" step="0.01"
                                              defaultValue={pw.precoManual ?? subComputedItem}
                                              onBlur={e => { editarPrecoManual(amb, v.id, pw.uid, e.target.value); setEditandoPrecoManual(null); }}
                                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarPrecoManual(amb, v.id, pw.uid, e.target.value); setEditandoPrecoManual(null); } }}
                                              className="w-16 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white font-mono text-[10px] px-1.5 py-0.5 outline-none text-right shrink-0"
                                            />
                                          ) : (() => {
                                            const qtdI = pw.grupo_quantidade ?? 1;
                                            if (qtdI > 1 && sub > 0 && pw.precoManual == null) {
                                              return (
                                                <div className="flex flex-col items-end shrink-0">
                                                  <span className="font-mono text-[8px] text-gray-500 dark:text-zinc-500">{fmt(sub / qtdI)}/un.</span>
                                                  <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400">{fmt(sub)}</span>
                                                </div>
                                              );
                                            }
                                            return (
                                              <span className={`font-mono text-[10px] shrink-0 w-16 text-right ${pw.precoManual != null ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-400'}`}>
                                                {sub > 0 ? fmt(sub) : '—'}{pw.precoManual != null ? ' *' : ''}
                                              </span>
                                            );
                                          })()}
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button onClick={() => setEditandoNomePeca({ amb, vId: v.id, uid: pw.uid, novo: pw.nome })} title="Renomear peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                              <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                            </button>
                                            <button onClick={() => setEditandoPrecoManual({ uid: pw.uid })} title="Alterar preço" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                              <iconify-icon icon="solar:dollar-minimalistic-linear" width="11"></iconify-icon>
                                            </button>
                                            <button onClick={() => duplicarPecaDaVersao(amb, v.id, pw.uid)} title="Duplicar peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                              <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                            </button>
                                            <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Excluir peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                              <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {renderRecortesGrupados(pwsItem.filter(pw => pw.tipo === 'recorte'), true)}
                                  </div>
                                );
                              });
                            })()}

                            {/* Avulsos desta versão */}
                            <div className="border-t border-gray-300 dark:border-zinc-800/50">
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-200/40 dark:bg-zinc-950/40">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Produtos avulsos</span>
                                <button
                                  onClick={() => setModalAvulsoKey({ amb, vId: v.id })}
                                  className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 text-[9px] font-mono uppercase tracking-widest hover:text-yellow-400 transition-colors"
                                >
                                  <iconify-icon icon="solar:add-circle-linear" width="10"></iconify-icon>
                                  Adicionar
                                </button>
                              </div>
                              {(v.avulsos ?? []).length === 0 ? (
                                <div className="px-4 py-2.5 text-center">
                                  <span className="font-mono text-[9px] text-zinc-800 italic">Nenhum produto adicionado</span>
                                </div>
                              ) : (
                                (v.avulsos ?? []).map(a => (
                                  <div key={a.uid} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-zinc-900/60 last:border-b-0 group bg-gray-200/20 dark:bg-zinc-950/20">
                                    <div className="w-1 h-3 bg-gray-200 dark:bg-zinc-800 shrink-0"></div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{a.nome}</div>
                                      <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{a.subcategoria}</div>
                                    </div>
                                    {editandoAvulso?.amb === amb && editandoAvulso?.vId === v.id && editandoAvulso?.uid === a.uid ? (
                                      <div className="flex items-center gap-1.5">
                                        <input type="number" min="1" value={a.qty} onChange={e => editarAvulsoQty(amb, v.id, a.uid, e.target.value)} className="w-12 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400 text-center" />
                                        <input value={String(a.valorUnit).replace('.', ',')} onChange={e => editarAvulsoValor(amb, v.id, a.uid, e.target.value)} className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400" />
                                        <button onClick={() => setEditandoAvulso(null)} className="text-yellow-400 p-1 hover:bg-yellow-400/10 transition-colors">
                                          <iconify-icon icon="solar:check-circle-linear" width="13"></iconify-icon>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">{a.qty}x {fmt(a.valorUnit)}</span>
                                        <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(a.qty * a.valorUnit)}</span>
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => setEditandoAvulso({ amb, vId: v.id, uid: a.uid })} className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors"><iconify-icon icon="solar:pen-linear" width="12"></iconify-icon></button>
                                          <button onClick={() => removerAvulso(amb, v.id, a.uid)} className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors"><iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon></button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── Botão: Adicionar Cenário ──────────────────────────── */}
          <button
            onClick={criarCenario}
            className="w-full border border-dashed border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-4 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors flex items-center justify-center gap-2"
          >
            <iconify-icon icon="solar:add-circle-linear" width="13"></iconify-icon>
            + Adicionar Cenário
          </button>

          {/* ── Lista de cenários ─────────────────────────────────── */}
          {cenarios.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="text-[9px] font-mono font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                  Cenários criados
                </div>
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-900"></div>
                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">
                  {cenarios.length} cenário{cenarios.length !== 1 ? 's' : ''} — cada um vira um orçamento separado
                </span>
              </div>

              {cenarios.map((cen, cIdx) => {
                const totalCen = totalCenario(cen);
                const isNomeEdit = editandoNomeCenario === cen.id;
                // Resumo: "Cozinha V1 + Banheiro V2"
                const resumo = Object.entries(cen.selecoes)
                  .map(([amb, vId]) => {
                    const lista = ambiVersoes[amb] ?? [];
                    const vIdx = lista.findIndex(x => x.id === vId);
                    return vIdx >= 0 ? `${amb || 'Amb'} V${vIdx + 1}` : null;
                  })
                  .filter(Boolean)
                  .join(' + ');

                return (
                  <div key={cen.id} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                    {/* Cabeçalho */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-zinc-900">
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 px-2 py-0.5 shrink-0">
                        C{cIdx + 1}
                      </span>

                      {isNomeEdit ? (
                        <input
                          autoFocus
                          value={cen.nome}
                          onChange={e => renomearCenario(cen.id, e.target.value)}
                          onBlur={() => setEditandoNomeCenario(null)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNomeCenario(null); }}
                          className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm font-bold outline-none px-1 min-w-0"
                        />
                      ) : (
                        <button
                          onClick={() => setEditandoNomeCenario(cen.id)}
                          title="Renomear cenário"
                          className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-white hover:text-yellow-400/80 transition-colors truncate min-w-0"
                        >
                          {cen.nome}
                        </button>
                      )}

                      <span className="font-mono text-sm text-yellow-400 font-bold shrink-0">{fmt(totalCen)}</span>

                      <div className="flex items-center gap-1 border-l border-gray-300 dark:border-zinc-800 pl-3 shrink-0">
                        <button onClick={() => setEditandoNomeCenario(cen.id)} title="Editar nome" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                          <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                        </button>
                        <button onClick={() => duplicarCenario(cen.id)} title="Duplicar cenário" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                          <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                        </button>
                        <button onClick={() => removerCenario(cen.id)} title="Excluir cenário" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                        </button>
                      </div>
                    </div>

                    {/* Resumo de ambientes */}
                    <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 truncate">{resumo || '—'}</span>
                      <div className="divide-x divide-gray-200 dark:divide-zinc-900 flex shrink-0 flex-wrap">
                        {Object.entries(cen.selecoes).map(([amb, vId]) => {
                          const sub = vId ? totalAmbiVersao(amb, vId) : 0;
                          const v   = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
                          return (
                            <div key={amb} className="flex items-center gap-2 px-3 first:pl-0">
                              <span className="text-[10px] text-gray-500 dark:text-zinc-600 uppercase tracking-wide">{amb || 'Amb'}</span>
                              <span className="text-[10px] text-gray-500 dark:text-zinc-400">{v?.nome ?? '—'}</span>
                              <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(sub)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desconto */}
                    <div className="px-5 py-3 border-t border-gray-200 dark:border-zinc-900/60 flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 shrink-0">Desconto</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" step="0.01"
                          value={cen.descontoValor ?? ''}
                          onChange={e => atualizarDescontoCenario(cen.id, 'descontoValor', e.target.value)}
                          placeholder="0"
                          className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                        />
                        <button
                          onClick={() => atualizarDescontoCenario(cen.id, 'descontoTipo', (cen.descontoTipo ?? '%') === '%' ? 'R$' : '%')}
                          className="font-mono text-[10px] border border-gray-300 dark:border-zinc-700 px-2 py-1 hover:border-yellow-400 hover:text-yellow-400 text-gray-500 dark:text-zinc-400 transition-colors shrink-0 w-8 text-center"
                        >
                          {cen.descontoTipo ?? '%'}
                        </button>
                      </div>
                      {descontoCenario(cen) > 0 && (
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">Subtotal: {fmt(subtotalCenario(cen))}</span>
                          <span className="font-mono text-[9px] text-red-400/70">− {fmt(descontoCenario(cen))}</span>
                          <span className="font-mono text-[10px] font-bold text-yellow-400">{fmt(totalCenario(cen))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-20">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
            {cenarios.length > 0
              ? `${cenarios.length} cenário${cenarios.length !== 1 ? 's' : ''} — ${fmt(cenarios.reduce((s, c) => s + totalCenario(c), 0))}`
              : `${totalVersoes} versão${totalVersoes !== 1 ? 'ões' : ''} — ${fmt(totalSelecaoAtual)}`
            }
          </div>
          <div className="text-xs text-gray-500 dark:text-zinc-400">
            {cenarios.length > 0 ? 'Cada cenário vira um orçamento separado' : 'Adicione cenários ou salve a seleção atual'}
          </div>
        </div>
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {salvando ? (
            <>
              <iconify-icon icon="solar:spinner-linear" width="14" class="animate-spin"></iconify-icon>
              Salvando...
            </>
          ) : (
            <>
              <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
              Salvar e Enviar
            </>
          )}
        </button>
      </div>

      {/* Modal: adicionar produto avulso */}
      {modalAvulsoKey && (
        <ModalProdutoAvulso
          produtosCatalogo={produtosCatalogo}
          onConfirmar={prod => adicionarAvulso(modalAvulsoKey.amb, modalAvulsoKey.vId, prod)}
          onFechar={() => setModalAvulsoKey(null)}
        />
      )}

      {/* Painel lateral: selecionar material (versões) */}
      {painelMatVersao && (
        <PainelMaterial
          key={`pm-versao-${painelMatVersao.uid ?? painelMatVersao.itemKey ?? 'v'}`}
          pecaId={painelMatVersao.uid ?? painelMatVersao.itemKey ?? 'versao'}
          pecaNome={painelMatVersao.label ?? 'Selecionar material'}
          selecionados={painelMatVersao.atual ? [painelMatVersao.atual] : []}
          onConfirmar={confirmarMatVersao}
          onFechar={() => setPainelMatVersao(null)}
          todosM={todosM}
          single
        />
      )}

      {/* Painel lateral: selecionar material linear para acabamento (versões) */}
      {painelLinearVersao && (
        <PainelMaterialLinear
          label={(() => {
            const v = (ambiVersoes[painelLinearVersao.amb] ?? []).find(x => x.id === painelLinearVersao.vId);
            const pw = v?.pecasList.find(p => p.uid === painelLinearVersao.uid);
            return pw?.nome ?? 'Acabamento';
          })()}
          selecionado={(() => {
            const v = (ambiVersoes[painelLinearVersao.amb] ?? []).find(x => x.id === painelLinearVersao.vId);
            return v?.pecasList.find(p => p.uid === painelLinearVersao.uid)?.matLinearId ?? null;
          })()}
          onConfirmar={sel => { editarAcabamentoMat(painelLinearVersao.amb, painelLinearVersao.vId, painelLinearVersao.uid, sel); setPainelLinearVersao(null); }}
          onFechar={() => setPainelLinearVersao(null)}
          matLineares={matLineares}
        />
      )}

    </div>
  );
}

