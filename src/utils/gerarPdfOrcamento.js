import { jsPDF } from 'jspdf';

// ── Formatadores ──────────────────────────────────────────────────────────────
const fmtBRL = v =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = d => {
  try {
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return '—'; }
};

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  black:    [10,  10,  10],
  dark:     [35,  35,  35],
  mid:      [88,  88,  88],
  light:    [142, 142, 142],
  ghost:    [210, 210, 213],
  white:    [255, 255, 255],
  bg1:      [248, 248, 249],   // zebra par
  bg2:      [240, 240, 243],   // bloco info / header item
  bgAcab:   [252, 249, 238],   // fundo linha de acabamento (âmbar claríssimo)
  bgHdr:    [22,  22,  28],    // header escuro do ambiente
  yellow:   [250, 204,  21],   // amarelo da marca
  amber:    [180, 130,  20],   // âmbar para texto de acabamento
  amberBg:  [120,  90,   5],   // âmbar escuro (barra lateral acabamento)
  green:    [20,  130,  55],
  red:      [175,  30,  30],
};

// ── Labels de acabamento ──────────────────────────────────────────────────────
const ACAB_LABEL = {
  meia_esquadria: 'Meia-Esquadria',
  reto_simples:   'Reto Simples',
  ME:             'Meia-Esquadria',
  RS:             'Reto Simples',
};

// ── Primitivas de desenho ─────────────────────────────────────────────────────
const fillRect = (doc, x, y, w, h, rgb) => {
  doc.setFillColor(...rgb);
  doc.rect(x, y, w, h, 'F');
};

const hLine = (doc, y, x1, x2, rgb = C.ghost, lw = 0.2) => {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
};

const txt = (doc, text, x, y, size, rgb, style = 'normal', opts = {}, cs = 0) => {
  if (cs) doc.setCharSpace(cs);
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...rgb);
  doc.text(String(text ?? ''), x, y, opts);
  if (cs) doc.setCharSpace(0);
};

// ── Carregamento de logo (dupla estratégia) ───────────────────────────────────
async function loadLogoBase64(url) {
  if (!url) return null;
  console.log('[PDF] carregando logo:', url);

  // Estratégia 1: fetch → FileReader → Image (dimensões)
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { w, h } = await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 200, h: 100 });
      img.src = dataUrl;
    });
    const fmt = blob.type.includes('png') ? 'PNG' : 'JPEG';
    console.log('[PDF] logo OK (fetch) — dimensões:', w, '×', h, fmt);
    return { data: dataUrl, format: fmt, aspectRatio: w / h };
  } catch (e1) {
    console.warn('[PDF] fetch falhou:', e1.message, '→ tentando canvas…');
  }

  // Estratégia 2: Canvas com crossOrigin
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const isPng = url.toLowerCase().includes('.png');
        const mime  = isPng ? 'image/png' : 'image/jpeg';
        const data  = canvas.toDataURL(mime, 0.92);
        console.log('[PDF] logo OK (canvas)');
        resolve({
          data,
          format:      isPng ? 'PNG' : 'JPEG',
          aspectRatio: img.naturalWidth / img.naturalHeight,
        });
      } catch (e) {
        console.warn('[PDF] canvas draw falhou:', e.message);
        resolve(null);
      }
    };
    img.onerror = e => { console.warn('[PDF] canvas img.onerror:', url); resolve(null); };
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  });
}

// ── Helpers de negócio ────────────────────────────────────────────────────────
function resolverMaterial(material, materialId, catMateriais = []) {
  if (materialId) {
    const f = catMateriais.find(m => m.id === materialId);
    if (f?.nome) return f.nome;
  }
  if (material && material !== 'Material Padrão' && material !== '—') return material;
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// BUILDER PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
async function buildOrcamentoPdf(
  { orc, projeto, ambientes, catMateriais = [], empresa = {}, vendedorNome },
  modo,
) {
  // ── Diagnóstico obrigatório ────────────────────────────────────────────────
  console.log('[PDF] empresa:', JSON.stringify({
    nome:      empresa.nome,
    logo_url:  empresa.logo_url,
    cnpj:      empresa.cnpj,
    telefone:  empresa.telefone,
    email:     empresa.email,
    endereco:  empresa.endereco,
  }));
  console.log('[PDF] pecas:', (orc.pecas ?? []).length,
              '| itens_manuais:', (orc.itens_manuais ?? []).length);

  const isColor = modo === 'color';

  // Desestruturação explícita dos campos de empresa
  const {
    logo_url: empLogo  = null,
    nome:     empNome  = 'Empresa',
    cnpj:     empCnpj  = null,
    telefone: empTel   = null,
    email:    empEmail = null,
    endereco: empEnd   = null,
  } = empresa;

  const pecasTotal = (orc.pecas ?? []).length + (orc.itens_manuais ?? []).length;
  if (pecasTotal === 0) throw new Error('Orçamento sem peças — não é possível gerar o PDF.');

  const _maj       = Number(orc.majoramento_percentual ?? 0);
  const _rt        = Number(orc.rt_percentual          ?? 0);
  const _frete     = Number(orc.valor_frete             ?? 0);
  const fv         = (1 + _maj / 100) * (1 + _rt / 100);
  const esc        = v => (v ?? 0) * fv;

  // ── Página ─────────────────────────────────────────────────────────────────
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW    = 210;
  const ML    = 14;
  const MR    = 14;
  const CW    = PW - ML - MR;
  const RIGHT = PW - MR;

  // Colunas da tabela
  const C_DESC = ML;
  const C_DIM  = ML + 104;
  const C_VAL  = RIGHT;

  // Dados do documento
  const cliObj  = projeto?.clientes ?? null;
  const cliNome = cliObj?.nome ?? projeto?.nome_cliente ?? projeto?.nome ?? 'Cliente';
  const cliTel  = cliObj?.telefone ?? projeto?.cliente_telefone ?? null;
  const cliEmail= cliObj?.email ?? null;
  const orcNome = orc.nome ?? orc.nome_versao ?? 'Orçamento';
  const orcNum  = `#${(orc.id ?? '').slice(-8).toUpperCase()}`;
  const hoje    = new Date();
  const dtEmiss = fmtData(hoje);
  const dtValid = fmtData(new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000));
  const arquNome= orc.rt_arquiteto_nome || projeto?.arquitetos?.nome || null;

  let y = 0;

  const needPage = needed => {
    if (y + needed > 270) { doc.addPage(); y = 14; return true; }
    return false;
  };

  // ── Header de colunas ─────────────────────────────────────────────────────
  const drawColHdr = () => {
    txt(doc, 'PEÇA / MATERIAL', C_DESC, y, 6.5, C.light, 'bold', {}, 0.5);
    txt(doc, 'MEDIDAS',         C_DIM,  y, 6.5, C.light, 'bold');
    txt(doc, 'VALOR',           C_VAL,  y, 6.5, C.light, 'bold', { align: 'right' });
    y += 1.5;
    hLine(doc, y, ML, RIGHT, C.ghost, 0.25);
    y += 4;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CABEÇALHO — fundo escuro, logo + dados da empresa
  // ═══════════════════════════════════════════════════════════════════════════
  const HDR_H = 46;
  fillRect(doc, 0, 0, PW, HDR_H, isColor ? C.bgHdr : C.dark);
  if (isColor) fillRect(doc, 0, 0, PW, 3, C.yellow);

  // ── Logo ──────────────────────────────────────────────────────────────────
  const LOGO_H = 22;
  const LOGO_Y = isColor ? 8 : 7;

  let logoRendered = false;
  if (empLogo) {
    const img = await loadLogoBase64(empLogo);
    if (img && img.data) {
      const maxW  = CW * 0.42;
      const logoW = Math.min(img.aspectRatio * LOGO_H, maxW);
      doc.addImage(img.data, img.format, ML, LOGO_Y, logoW, LOGO_H);
      logoRendered = true;
    }
  }

  if (!logoRendered) {
    // Tipografia grande como fallback
    doc.setCharSpace(2);
    txt(doc, empNome.toUpperCase(), ML, LOGO_Y + 15, 20, C.white, 'bold');
    doc.setCharSpace(0);
  }

  // ── Dados da empresa (lado direito) ──────────────────────────────────────
  const empLines = [
    empNome,
    empCnpj  ? `CNPJ: ${empCnpj}` : null,
    empTel   || null,
    empEmail || null,
    empEnd   || null,
  ].filter(Boolean);

  let ey = LOGO_Y + 2;
  empLines.forEach((line, i) => {
    txt(doc, line, RIGHT, ey,
        i === 0 ? 8.5 : 7,
        i === 0 ? C.white : C.light,
        i === 0 ? 'bold' : 'normal',
        { align: 'right' });
    ey += i === 0 ? 4.5 : 3.8;
  });

  // "ORÇAMENTO" no rodapé do header
  txt(doc, 'ORÇAMENTO', RIGHT, HDR_H - 4, 7,
      isColor ? C.yellow : C.ghost, 'bold', { align: 'right' }, 2);

  y = HDR_H + 7;

  // ── Título + número ───────────────────────────────────────────────────────
  txt(doc, orcNome, ML, y, 16, C.black, 'bold');
  txt(doc, orcNum, RIGHT, y, 8.5, C.mid, 'normal', { align: 'right' });
  y += 5.5;
  txt(doc, `Emissão: ${dtEmiss}`, ML, y, 7.5, C.mid);
  txt(doc, `Válido até: ${dtValid}`, RIGHT, y, 7.5, C.mid, 'normal', { align: 'right' });
  y += 8;
  hLine(doc, y, ML, RIGHT, C.ghost, 0.3);
  y += 7;

  // ── Bloco cliente + responsáveis ──────────────────────────────────────────
  const BLK_Y = y, BLK_H = 32, COL2 = ML + CW / 2 + 6;
  fillRect(doc, ML, BLK_Y, CW, BLK_H, C.bg2);
  fillRect(doc, ML, BLK_Y, 4, BLK_H, isColor ? C.yellow : C.dark);

  let d1 = BLK_Y + 5;
  txt(doc, 'CLIENTE', ML + 7, d1, 6, C.light, 'bold', {}, 1); d1 += 5;
  txt(doc, cliNome, ML + 7, d1, 11, C.black, 'bold'); d1 += 5.5;
  if (cliTel)   { txt(doc, cliTel,   ML + 7, d1, 7.5, C.mid); d1 += 4; }
  if (cliEmail) { txt(doc, cliEmail, ML + 7, d1, 7.5, C.mid); }

  let d2 = BLK_Y + 5;
  txt(doc, 'RESPONSÁVEIS', COL2, d2, 6, C.light, 'bold', {}, 1); d2 += 5;
  for (const r of [
    vendedorNome ? { l: 'Vendedor', v: vendedorNome } : null,
    arquNome     ? { l: 'Arquiteto', v: arquNome    } : null,
  ].filter(Boolean)) {
    txt(doc, r.l.toUpperCase(), COL2, d2, 6, C.light, 'bold', {}, 0.5); d2 += 3.5;
    txt(doc, r.v, COL2, d2, 8.5, C.dark); d2 += 5;
  }

  y = BLK_Y + BLK_H + 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // CORPO — hierarquia: Ambiente → Item → Peça (+ linhas de Acabamento)
  // ═══════════════════════════════════════════════════════════════════════════
  const pecas = orc.pecas ?? [];

  // Agrupar por ambiente
  const ambMap = new Map(), ambOrdem = [];
  pecas.forEach(p => {
    const k = p.ambiente_id ?? '__sem__';
    if (!ambMap.has(k)) { ambMap.set(k, []); ambOrdem.push(k); }
    ambMap.get(k).push(p);
  });
  const grupos = ambMap.size > 0
    ? ambOrdem.map(k => [k, ambMap.get(k)])
    : [['__sem__', pecas]];

  const getNomeAmb = id =>
    (!id || id === '__sem__')
      ? (orc.ambiente_nome ?? 'Ambiente')
      : ((ambientes ?? []).find(a => a.id === id)?.nome ?? orc.ambiente_nome ?? 'Ambiente');

  let totalGeral = 0;

  for (const [ambId, pecasAmb] of grupos) {
    if (pecasAmb.length === 0) continue;

    const ambNome  = getNomeAmb(ambId);
    // totalAmb inclui pedras + acabamentos (esc(p.valor) já inclui ambos)
    const ambTotal = pecasAmb.reduce((s, p) => s + esc(p.valor ?? 0), 0);

    needPage(34);

    // ── NÍVEL 1: Ambiente ─────────────────────────────────────────────────
    const AMB_H = 13;
    fillRect(doc, ML, y, CW, AMB_H, isColor ? C.bgHdr : C.dark);
    fillRect(doc, ML, y, 5, AMB_H, isColor ? C.yellow : C.ghost);
    txt(doc, ambNome.toUpperCase(), ML + 9, y + 8.5, 10, C.white, 'bold', {}, 0.8);
    txt(doc, fmtBRL(ambTotal), RIGHT - 2, y + 8.5, 9,
        isColor ? C.yellow : C.ghost, 'bold', { align: 'right' });
    y += AMB_H + 5;

    // Agrupar por item dentro do ambiente
    const itemMap = new Map(), itemOrdem = [];
    pecasAmb.forEach(p => {
      const k = p.item_nome ?? '__sem_item__';
      if (!itemMap.has(k)) { itemMap.set(k, []); itemOrdem.push(k); }
      itemMap.get(k).push(p);
    });

    for (const itemKey of itemOrdem) {
      const nomeItem  = itemKey === '__sem_item__' ? null : itemKey;
      const pecasItem = itemMap.get(itemKey);
      // total do item = soma de todas as peças incluindo seus acabamentos
      const itemTotal = pecasItem.reduce((s, p) => s + esc(p.valor ?? 0), 0);

      // ── NÍVEL 2: Item ──────────────────────────────────────────────────
      if (nomeItem) {
        needPage(22);
        const IT_H = 9;
        fillRect(doc, ML, y, CW, IT_H, C.bg2);
        fillRect(doc, ML, y, 3, IT_H, isColor ? C.yellow : C.mid);
        txt(doc, nomeItem.toUpperCase(), ML + 6, y + 6.2, 8, C.dark, 'bold', {}, 0.4);
        txt(doc, fmtBRL(itemTotal), RIGHT - 2, y + 6.2, 8, C.mid, 'bold', { align: 'right' });
        y += IT_H + 3;
      }

      drawColHdr();

      let rowIdx = 0;

      // ── NÍVEL 3a: Peças (pedras) ──────────────────────────────────────
      for (const p of pecasItem) {
        const matNome    = resolverMaterial(p.material, p.material_id, catMateriais);
        // Valor apenas da pedra (sem acabamentos)
        const valorAcab  = Number(p.valor_acabamentos ?? 0);
        const valorPedra = esc((p.valor ?? 0) - valorAcab);

        // Altura da linha da peça
        const PEDRA_H = matNome ? 14 : 10;

        needPage(PEDRA_H + 2);

        const indent = nomeItem ? ML + 6 : ML;

        // Fundo zebra
        if (rowIdx % 2 !== 0) fillRect(doc, ML, y, CW, PEDRA_H, C.bg1);

        // — Nome da peça (bold)
        txt(doc, p.nome ?? 'Peça', indent, y + 5.5, 9, C.dark, 'bold',
            { maxWidth: C_DIM - indent - 4 });

        // — Material (italic, linha 2)
        if (matNome) {
          txt(doc, matNome, indent, y + 9.8, 6.5, C.light, 'italic',
              { maxWidth: C_DIM - indent - 4 });
        }

        // — Medidas
        let dimStr = '';
        if (p.area != null) dimStr = `${Number(p.area).toFixed(3)} m²`;
        if (p.espessura && p.espessura !== '—')
          dimStr += (dimStr ? '  ·  ' : '') + `${p.espessura} cm`;
        txt(doc, dimStr || '—', C_DIM, y + 5.5, 8, C.mid);

        // — Valor da pedra (sem acabamentos)
        txt(doc, fmtBRL(valorPedra), C_VAL, y + 5.5, 9, C.dark, 'bold',
            { align: 'right' });

        totalGeral += esc(p.valor ?? 0);   // acumula pedra + acabamentos
        y += PEDRA_H;
        hLine(doc, y, ML, RIGHT, C.ghost, 0.12);

        rowIdx++;
      }

      // ── NÍVEL 3b: Acabamentos agregados por tipo (após todas as pedras) ──
      const acabByTipo = new Map();
      pecasItem.forEach(p => {
        (Array.isArray(p.acabamentos) ? p.acabamentos : []).forEach(ac => {
          if (Number(ac.ml ?? 0) <= 0) return;
          if (!acabByTipo.has(ac.tipo)) acabByTipo.set(ac.tipo, { ml: 0, valor: 0 });
          const e = acabByTipo.get(ac.tipo);
          e.ml    += Number(ac.ml    ?? 0);
          e.valor += Number(ac.valor ?? 0);
        });
      });

      const indent = nomeItem ? ML + 6 : ML;
      for (const [tipo, { ml, valor }] of acabByTipo) {
        const ACAB_H  = 9;
        const nomeAc  = ACAB_LABEL[tipo] ?? tipo ?? 'Acabamento';
        const mlStr   = `${ml.toFixed(2)} ml`;
        const valorAc = esc(valor);

        needPage(ACAB_H + 2);

        // Fundo âmbar levíssimo
        fillRect(doc, ML, y, CW, ACAB_H, isColor ? C.bgAcab : C.bg1);

        // Barra de conexão (vertical fina âmbar)
        fillRect(doc, indent + 1, y + 1, 1.5, ACAB_H - 2,
                 isColor ? [220, 170, 50] : C.ghost);

        // "↳ nome"
        txt(doc, `↳  ${nomeAc}`, indent + 5, y + 5.8, 8, C.amber, 'italic');

        // ml
        txt(doc, mlStr, C_DIM, y + 5.8, 7.5, C.light, 'normal');

        // valor
        txt(doc, fmtBRL(valorAc), C_VAL, y + 5.8, 8, C.amber, 'bold',
            { align: 'right' });

        y += ACAB_H;
        hLine(doc, y, ML + 8, RIGHT, [230, 210, 170], 0.1);
      }

      // Subtotal do item
      needPage(11);
      y += 1;
      const subLabel = nomeItem
        ? `Subtotal — ${nomeItem}`
        : `Subtotal — ${ambNome}`;
      txt(doc, subLabel, ML + 4, y + 4.5, 7.5, C.light, 'italic');
      txt(doc, fmtBRL(itemTotal), RIGHT - 2, y + 4.5, 8, C.mid, 'bold', { align: 'right' });
      y += 9;
      hLine(doc, y, ML, RIGHT, [180, 180, 183], 0.2);
      y += 4;
    }

    // Total do ambiente
    needPage(13);
    y += 2;
    txt(doc, `TOTAL — ${ambNome}`, ML + 4, y + 5, 8.5, C.mid, 'bold', {}, 0.3);
    txt(doc, fmtBRL(ambTotal), RIGHT - 2, y + 5, 9, C.dark, 'bold', { align: 'right' });
    y += 12;
    hLine(doc, y, ML, RIGHT, [140, 140, 143], 0.35);
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVIÇOS / PRODUTOS AVULSOS
  // ═══════════════════════════════════════════════════════════════════════════
  const itensManuais = orc.itens_manuais ?? [];
  if (itensManuais.length > 0) {
    needPage(32);
    const AMB_H = 13;
    fillRect(doc, ML, y, CW, AMB_H, isColor ? C.bgHdr : C.dark);
    fillRect(doc, ML, y, 5, AMB_H, isColor ? C.yellow : C.ghost);
    txt(doc, 'SERVIÇOS E PRODUTOS AVULSOS', ML + 9, y + 8.5, 10, C.white, 'bold', {}, 0.5);
    y += AMB_H + 5;

    txt(doc, 'DESCRIÇÃO', C_DESC, y, 6.5, C.light, 'bold');
    txt(doc, 'QTD',       C_DIM,  y, 6.5, C.light, 'bold');
    txt(doc, 'VALOR',     C_VAL,  y, 6.5, C.light, 'bold', { align: 'right' });
    y += 1.5;
    hLine(doc, y, ML, RIGHT, C.ghost, 0.25);
    y += 4;

    let subtManuais = 0, rowIdx = 0;
    for (const item of itensManuais) {
      needPage(11);
      if (rowIdx % 2 !== 0) fillRect(doc, ML, y, CW, 10, C.bg1);
      const qty  = Number(item.quantidade ?? 0);
      const unit = item.tipo === 'area' ? 'm²' : (item.tipo === 'ml' ? 'ml' : 'un');
      txt(doc, item.nome_peca ?? item.nome ?? 'Item', ML, y + 6, 9, C.dark, 'normal',
          { maxWidth: C_DIM - ML - 5 });
      txt(doc, `${qty.toFixed(qty % 1 === 0 ? 0 : 2)} ${unit}`, C_DIM, y + 6, 8, C.mid);
      txt(doc, fmtBRL(esc(item.total)), C_VAL, y + 6, 9, C.dark, 'bold', { align: 'right' });
      subtManuais += esc(item.total);
      totalGeral  += esc(item.total);
      hLine(doc, y + 10, ML, RIGHT, C.ghost, 0.12);
      y += 11; rowIdx++;
    }
    y += 2;
    txt(doc, 'Subtotal — Produtos avulsos', ML + 4, y + 4.5, 7.5, C.light, 'italic');
    txt(doc, fmtBRL(subtManuais), RIGHT - 2, y + 4.5, 8.5, C.mid, 'bold', { align: 'right' });
    y += 11;
    hLine(doc, y, ML, RIGHT, [140, 140, 143], 0.35);
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMO FINANCEIRO
  // ═══════════════════════════════════════════════════════════════════════════
  const desconto   = Number(orc.desconto_total ?? 0);
  const valorFinal = totalGeral - desconto + _frete;

  let nLinhas = 1;
  if (desconto > 0) nLinhas++;
  if (_frete   > 0) nLinhas++;
  needPage(nLinhas * 7 + 8 + 24 + 20);

  y += 4;
  hLine(doc, y, ML, RIGHT, [90, 90, 90], 0.4);
  y += 7;
  txt(doc, 'RESUMO DO INVESTIMENTO', ML, y, 7, C.light, 'bold', {}, 2);
  y += 9;

  const linha = (label, valor, cor = C.dark, negrito = false) => {
    txt(doc, label, ML + 4, y, 9, C.mid);
    txt(doc, valor, RIGHT - 2, y, 9, cor, negrito ? 'bold' : 'normal', { align: 'right' });
    y += 7;
  };

  linha('Subtotal', fmtBRL(totalGeral));
  if (desconto > 0) linha('Desconto', `− ${fmtBRL(desconto)}`, C.red,   true);
  if (_frete   > 0) linha('Frete',    `+ ${fmtBRL(_frete)}`,   C.green, true);
  y += 4;

  // ── TOTAL GERAL — bloco amarelo impactante ────────────────────────────────
  const TOT_H = 22;
  fillRect(doc, ML, y, CW, TOT_H, isColor ? C.yellow : C.dark);

  txt(doc, 'TOTAL GERAL', ML + 7, y + 9, 8, isColor ? C.dark : C.white, 'bold', {}, 1.5);
  txt(doc, `Validade: 7 dias — até ${dtValid}`, ML + 7, y + 15, 7,
      isColor ? [70, 70, 70] : C.light, 'italic');
  txt(doc, fmtBRL(valorFinal), RIGHT - 4, y + 15, 17,
      isColor ? C.black : C.white, 'bold', { align: 'right' });

  y += TOT_H + 10;

  // ── Condições comerciais ──────────────────────────────────────────────────
  needPage(26);
  hLine(doc, y, ML, RIGHT, C.ghost, 0.2); y += 5;
  txt(doc, 'CONDIÇÕES COMERCIAIS', ML, y, 6, C.light, 'bold', {}, 1.5); y += 5;
  for (const l of [
    `• Validade desta proposta: 7 dias — até ${dtValid}.`,
    '• Prazo de entrega mediante confirmação e aprovação do pedido.',
    '• Valores sujeitos a alteração após o prazo de validade.',
    '• Este documento não possui valor fiscal.',
  ]) { txt(doc, l, ML + 2, y, 7.5, C.light); y += 4.5; }

  // ═══════════════════════════════════════════════════════════════════════════
  // RODAPÉ EM TODAS AS PÁGINAS
  // ═══════════════════════════════════════════════════════════════════════════
  const contatoRodape = [empTel, empEmail].filter(Boolean).join('  ·  ');
  const totalPgs = doc.getNumberOfPages();

  for (let i = 1; i <= totalPgs; i++) {
    doc.setPage(i);
    if (isColor) {
      fillRect(doc, 0, 286, PW, 11, C.yellow);
      txt(doc, empNome.toUpperCase(), ML, 292.5, 6.5, C.dark, 'bold', {}, 0.8);
      if (contatoRodape)
        txt(doc, contatoRodape,
            ML + doc.getStringUnitWidth(empNome.toUpperCase()) * 6.5 * 0.352 + 10,
            292.5, 6, [70, 70, 70]);
      txt(doc, `${i} / ${totalPgs}`, RIGHT, 292.5, 6.5, C.dark, 'normal', { align: 'right' });
    } else {
      hLine(doc, 283, ML, RIGHT, C.ghost, 0.2);
      txt(doc, `${empNome}${contatoRodape ? '  ·  ' + contatoRodape : ''}`, ML, 288, 6.5, C.light);
      txt(doc, `${i} / ${totalPgs}`, RIGHT, 288, 6.5, C.light, 'normal', { align: 'right' });
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const slug   = cliNome.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const suffix = modo === 'bw' ? '-impressao' : '';
  doc.save(`orcamento-${slug}-${(orc.id ?? '').slice(-6)}${suffix}.pdf`);
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * PDF colorido.
 * @param {{ orc, projeto, ambientes, catMateriais, empresa, vendedorNome }} params
 *   empresa deve conter: { logo_url, nome, cnpj, endereco, telefone, email }
 */
export async function gerarPdfOrcamento(params) {
  return buildOrcamentoPdf(params, 'color');
}

/** PDF para impressão — preto e branco. */
export async function gerarPdfOrcamentoImpressao(params) {
  return buildOrcamentoPdf(params, 'bw');
}
