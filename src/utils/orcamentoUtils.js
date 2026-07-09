// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
export function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export const ACABAMENTO_LABEL = {
  meia_esquadria: 'Meia-Esquadria',
  reto_simples:   'Reto Simples',
  boleado:        'Boleado',
  boleado_duplo:  'Boleado Duplo',
  reto_duplo:     'Reto Duplo',
  chanfrado:      'Chanfrado',
};

// Nome exato do acabamento conforme banco (materiais_lineares.nome)
export const ACAB_TIPO_NOME = {
  meia_esquadria: 'Meia Esquadria',
  reto_simples:   'Reto Simples',
  boleado:        'Boleado',
  boleado_duplo:  'Boleado Duplo',
  reto_duplo:     'Reto Duplo',
  chanfrado:      'Chanfrado',
};

// Calcula o preço de um acabamento linear
export function precoAcabamento(ml, matLinearId, matLineares, precoMlOverride = null) {
  if (!ml) return 0;
  const rate = precoMlOverride != null
    ? precoMlOverride
    : (matLinearId ? Number(matLineares.find(x => x.id === matLinearId)?.preco_ml ?? 0) : 0);
  return Number(ml) * rate;
}

// Gera as linhas de acabamento derivadas de uma peça de pedra
export function criarAcabamentosParaPeca(p, stoneUid, acabamentosUnitarios = []) {
  const rows = [];
  if ((p.meia_esquadria_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-me-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'meia_esquadria',
      nome:            'Meia Esquadria',
      ml:              p.meia_esquadria_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.reto_simples_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-rs-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'reto_simples',
      nome:            'Reto Simples',
      ml:              p.reto_simples_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.boleado_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-bo-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'boleado',
      nome:            'Boleado',
      ml:              p.boleado_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.boleado_duplo_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-bd-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'boleado_duplo',
      nome:            'Boleado Duplo',
      ml:              p.boleado_duplo_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.reto_duplo_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-rd-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'reto_duplo',
      nome:            'Reto Duplo',
      ml:              p.reto_duplo_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.chanfrado_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-cf-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'chanfrado',
      nome:            'Chanfrado',
      ml:              p.chanfrado_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  (p.recortes ?? []).forEach(rc => {
    const acabUnit = acabamentosUnitarios.find(
      a => a.nome.toLowerCase() === (rc.funcao_label ?? '').toLowerCase()
    );
    rows.push({
      uid:           `rc-${stoneUid}-${Math.random()}`,
      idBase:        p.id,
      idPedraUid:    stoneUid,
      tipo:          'recorte',
      nome:          rc.funcao_label ?? rc.funcao ?? 'Recorte',
      formato:       rc.formato ?? null,
      precoUnit:     acabUnit ? parseFloat(acabUnit.preco_unitario) : 0,
      ambiente_nome: p.ambiente_nome ?? null,
      item_nome:     p.item_nome ?? null,
    });
  });
  return rows;
}

// Palavras-chave de busca por tipoAcabamento no nome do material linear
export const ACABAMENTO_KEYWORDS = {
  meia_esquadria: ['meia esquadria', 'meia-esquadria', 'meia'],
  reto_simples:   ['reto simples', 'reto-simples'],
  boleado:        ['boleado'],
  boleado_duplo:  ['boleado duplo', 'boleado-duplo'],
  reto_duplo:     ['reto duplo', 'reto-duplo'],
  chanfrado:      ['chanfrado'],
};

export function autoMatchLinear(tipoAcabamento, pedraMatId, todosM, matLineares) {
  const keywords = ACABAMENTO_KEYWORDS[tipoAcabamento] ?? [];
  if (keywords.length === 0 || matLineares.length === 0) return null;

  const candidatos = matLineares.filter(m => {
    const n = m.nome.toLowerCase();
    return keywords.some(kw => n.includes(kw));
  });

  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0].id;

  if (pedraMatId) {
    const mat = todosM.find(m => m.id === pedraMatId);
    if (mat) {
      const categoria = (mat.categoria ?? mat.cor ?? '').toLowerCase();
      const nomeMat   = mat.nome.toLowerCase();
      const byCategoria = candidatos.find(c => categoria && c.nome.toLowerCase().includes(categoria));
      if (byCategoria) return byCategoria.id;
      const primeiraPalavra = nomeMat.split(' ')[0];
      const byNome = candidatos.find(c => primeiraPalavra && c.nome.toLowerCase().includes(primeiraPalavra));
      if (byNome) return byNome.id;
    }
  }

  return candidatos[0].id;
}

export function aplicarAutoMatchNaLista(pecasList, todosM, matLineares, precosCatMaterial = []) {
  if (matLineares.length === 0) return pecasList;
  let changed = false;
  const nova = pecasList.map(pw => {
    if (pw.tipo !== 'acabamento') return pw;
    let updated = pw;

    if (updated.matLinearId === null) {
      const match = matLineares.find(m => m.nome.toLowerCase() === updated.nome.toLowerCase());
      if (match) { updated = { ...updated, matLinearId: match.id }; changed = true; }
    }

    if (updated.matLinearId && updated.idPedraUid && precosCatMaterial.length > 0) {
      const parentStone = pecasList.find(s => s.uid === updated.idPedraUid && s.tipo === 'pedra');
      const parentMatId = parentStone?.matId ?? null;
      const categoria = parentMatId
        ? (todosM.find(m => m.id === parentMatId)?.categoria ?? null)
        : null;

      const overrideMat = parentMatId
        ? precosCatMaterial.find(p => p.material_linear_id === updated.matLinearId && p.material_id === parentMatId)
        : null;
      const overrideCat = categoria && !overrideMat
        ? precosCatMaterial.find(p => p.material_linear_id === updated.matLinearId && p.categoria === categoria && !p.material_id)
        : null;

      const novoOverride = overrideMat ? Number(overrideMat.preco_ml)
        : overrideCat ? Number(overrideCat.preco_ml)
        : null;
      if (updated.precoMlOverride !== novoOverride) {
        updated = { ...updated, precoMlOverride: novoOverride };
        changed = true;
      }
    }

    return updated;
  });
  return changed ? nova : pecasList;
}

export function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Identifica se uma peça é uma faixa. Faixas de medição chegam com type: 'faixa'
// (preservado no mapeamento) e nome default "Faixa"; o match por nome (/faixa/i)
// cobre também faixas manuais/renomeadas ("Faixa 1", "Faixa cuba", etc.).
// Aceita tanto peça bruta (`type`) quanto linha de pedra da TelaVersoes (`type` copiado).
export function isFaixa(p) {
  if (!p) return false;
  return p.type === 'faixa' || /faixa/i.test(p.nome ?? '');
}

export function precoPeca(peca, materialId, todosM, acabamentoSel = null) {
  if (!peca || !materialId) return 0;
  const m = (todosM || []).find(x => x.id === materialId);
  if (!m) return 0;
  const espessura = Number(peca.espessura ?? 2);
  const areaLiq   = Number(peca.area_liq   ?? 0);
  const vars      = m.variacoes_precos ?? [];
  const parseEsp  = s => parseInt(s) || 0;

  let v = acabamentoSel
    ? vars.find(x => parseEsp(x.espessura) === espessura && x.acabamento === acabamentoSel)
    : null;
  if (!v) v = vars.find(x => parseEsp(x.espessura) === espessura);
  if (!v) v = vars[0] ?? null;

  return areaLiq * (v?.preco_venda ?? 0);
}
