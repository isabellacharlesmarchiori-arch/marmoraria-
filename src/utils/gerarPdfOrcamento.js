import { jsPDF } from 'jspdf';
import { CONTRATO_PADRAO, NORMAS_EXECUCAO, renderClausulas } from './contratoPadrao.js';

// ── Utilitários ───────────────────────────────────────────────────────────────
const sanitize = (str) => (str || 'sem_nome')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .toLowerCase();

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
  ink:   [17,  17,  17],      // texto principal
  body:  [63,  63,  70],      // texto secundário
  muted: [113, 113, 122],     // texto terciário
  faint: [161, 161, 170],     // labels
  rule:  [228, 228, 231],     // bordas
  zebra: [250, 250, 251],     // zebra sutil (reservado, não usado por padrão)
  panel: [244, 244, 245],     // bloco info / cards
  paper: [255, 255, 255],
  accent:[29,  158, 117],     // verde marmoraria (#1D9E75)
  amber: [120,  90,   5],     // acabamentos
  green: [16,  185, 129],
  red:   [239,  68,  68],
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

const hLine = (doc, y, x1, x2, rgb = C.rule, lw = 0.2) => {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
};

const txt = (doc, text, x, y, size, rgb, style = 'normal', opts = {}, cs = 0) => {
  doc.setCharSpace(cs);
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...rgb);
  doc.text(String(text ?? ''), x, y, opts);
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
    img.onerror = () => { console.warn('[PDF] canvas img.onerror:', url); resolve(null); };
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

// Retorna array { numero, vencimento (Date), forma, valor, status } para o cronograma de pagamento.
// Caso 1: parcelas_detalhes salvas no DB (campo novo) — usa esses dados.
// Caso 2: à vista — 1 entrada com a data de fechamento.
// Caso 3: parcelado sem detalhes — N parcelas iguais, vencimentos mensais a partir do fechamento.
function resolverParcelas(orc, valorTotal) {
  const forma    = orc.forma_pagamento ?? 'a_vista';
  const dataBase = orc.data_fechamento ? new Date(orc.data_fechamento) : new Date();
  const valor    = orc.valor_fechado   ?? valorTotal;

  // Caso 1: detalhes salvos
  if (Array.isArray(orc.parcelas_detalhes) && orc.parcelas_detalhes.length > 0) {
    return orc.parcelas_detalhes.map(p => ({
      numero:     p.numero,
      vencimento: new Date(p.data_vencimento ?? p.vencimento ?? dataBase),
      forma,
      valor:      Number(p.valor ?? 0),
      status:     'pendente',
    }));
  }

  // Caso 2: à vista
  if (!orc.parcelas || orc.parcelas <= 1 || forma === 'a_vista' || forma === 'pix' ||
      forma === 'transferencia' || forma === 'dinheiro') {
    return [{ numero: 1, vencimento: dataBase, forma, valor, status: 'pendente' }];
  }

  // Caso 3: parcelado sem detalhes
  const n       = Number(orc.parcelas);
  const parcVal = valor / n;
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(dataBase);
    dt.setMonth(dt.getMonth() + i + 1);
    return { numero: i + 1, vencimento: dt, forma, valor: parcVal, status: 'pendente' };
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// BUILDER PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
async function buildOrcamentoPdf(
  { orc, projeto, ambientes, catMateriais = [], empresa = {}, vendedorNome, prazoEntrega = null, template = null },
  modo,
) {
  // ── Diagnóstico obrigatório ────────────────────────────────────────────────
  console.log('[PDF] empresa:', JSON.stringify({
    nome:      empresa.nome,
    logo_url:  empresa.logo_url,
    cnpj:      empresa.cnpj,
    telefone:  empresa.telefone,
    email_contato: empresa.email_contato,
    endereco:  empresa.endereco,
  }));
  console.log('[PDF] pecas:', (orc.pecas ?? []).length,
              '| itens_manuais:', (orc.itens_manuais ?? []).length);
  console.log('[PDF] template:', JSON.stringify({ tipo: template?.tipo, cor: template?.cor_primaria }));

  const isPedido = modo === 'pedido';
  const isColor  = modo === 'color' || isPedido;

  // Desestruturação explícita dos campos de empresa
  const {
    logo_url: empLogo = null,
    nome:     empNome = 'Empresa',
    cnpj:     empCnpj = null,
    telefone: empTel  = null,
    endereco: empEnd  = null,
  } = empresa;
  // Lê email_contato (campo novo) com fallback para email (legado) enquanto callers não forem atualizados na Fase 7
  const empEmail = empresa?.email_contato ?? empresa?.email ?? null;

  // ── Flags de template ────────────────────────────────────────────────────────
  const nivelDetalhe    = template?.nivel_detalhe       ?? 'tudo';
  const mostrarMat      = template?.mostrar_materiais   ?? true;
  const mostrarMed      = template?.mostrar_medidas     ?? true;
  const mostrarAcab     = template?.mostrar_acabamentos ?? true;
  const mostrarVend     = template?.mostrar_vendedor    ?? true;
  const mostrarValidade = template?.mostrar_validade    ?? true;
  const mostrarPrazo    = template?.mostrar_prazo_entrega ?? true;
  const corPrimaria     = template?.cor_primaria ?? null;
  const termos          = template?.termos       ?? null;
  const observacoes     = template?.observacoes  ?? null;
  const mostrarCronograma  = isPedido && (template?.mostrar_cronograma  ?? true);
  const mostrarDadosBanc   = isPedido && (template?.mostrar_dados_banc  ?? true);
  const mostrarAssinaturas = isPedido && (template?.mostrar_assinaturas ?? true);
  const mostrarValPecas    = template?.mostrar_valores_pecas ?? true;

  const COR_PRIM_RGB = corPrimaria
    ? [parseInt(corPrimaria.slice(1,3),16), parseInt(corPrimaria.slice(3,5),16), parseInt(corPrimaria.slice(5,7),16)]
    : C.accent;

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
    txt(doc, 'PEÇA',               C_DESC, y, 8, C.muted, 'bold');
    txt(doc, 'MEDIDAS / MATERIAL', C_DIM,  y, 8, C.muted, 'bold');
    if (mostrarValPecas) txt(doc, 'VALOR', C_VAL, y, 8, C.muted, 'bold', { align: 'right' });
    y += 1.5;
    hLine(doc, y, ML, RIGHT, C.muted, 0.4);
    y += 2.5;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CABEÇALHO — fundo branco, linha de acento na base
  // ═══════════════════════════════════════════════════════════════════════════
  const HDR_H = 30;
  // Fundo permanece branco — sem fillRect escuro
  if (isColor) fillRect(doc, 0, HDR_H - 0.8, PW, 0.8, COR_PRIM_RGB);
  else          fillRect(doc, 0, HDR_H - 0.3, PW, 0.3, C.rule);

  // ── Logo ──────────────────────────────────────────────────────────────────
  const LOGO_H = 18;

  let logoRendered = false;
  if (empLogo) {
    const img = await loadLogoBase64(empLogo);
    if (img && img.data) {
      const maxW  = CW * 0.42;
      const logoW = Math.min(img.aspectRatio * LOGO_H, maxW);
      doc.addImage(img.data, img.format, ML, 6, logoW, LOGO_H);
      logoRendered = true;
    }
  }

  if (!logoRendered) {
    txt(doc, empNome.toUpperCase(), ML, 18, 14, C.ink, 'bold', {}, 0.5);
  }

  // ── Bloco direito ─────────────────────────────────────────────────────────
  txt(doc, isPedido ? 'PEDIDO FECHADO' : 'ORÇAMENTO', RIGHT, 9, 6.5, C.faint, 'bold', { align: 'right' });
  txt(doc, empNome, RIGHT, 15, 9, C.ink, 'bold', { align: 'right' });
  const subInfo = [empCnpj && `CNPJ ${empCnpj}`, empTel, empEmail].filter(Boolean).join('  ·  ');
  if (subInfo) txt(doc, subInfo, RIGHT, 20, 6.5, C.faint, 'normal', { align: 'right' });
  if (empEnd)  txt(doc, empEnd,  RIGHT, 25, 6.5, C.faint, 'normal', { align: 'right' });

  y = HDR_H + 7;

  // ── Título + datas ────────────────────────────────────────────────────────
  txt(doc, orcNome, ML, y, 16, C.ink, 'bold');
  y += 5.5;
  txt(doc, `Emissão: ${dtEmiss}`, ML, y, 8.5, C.muted);
  if (mostrarValidade) txt(doc, `Válido até: ${dtValid}`, RIGHT, y, 8.5, C.muted, 'normal', { align: 'right' });
  y += 5;
  y += 3;
  hLine(doc, y, ML, RIGHT, C.rule, 0.3);
  y += 7;

  // ── Bloco cliente + responsáveis ──────────────────────────────────────────
  const formaLabel = {
    a_vista:          'À Vista',
    pix:              'PIX',
    transferencia:    'Transferência',
    dinheiro:         'Dinheiro',
    cartao:           `Cartão ${orc.parcelas}x`,
    boleto_parcelado: `Boleto ${orc.parcelas}x`,
    cheque:           'Cheque',
  };
  const respEntries = [
    mostrarVend && vendedorNome       ? { l: 'Vendedor',         v: vendedorNome                                        } : null,
    arquNome                          ? { l: 'Arquiteto',        v: arquNome                                            } : null,
    mostrarPrazo && prazoEntrega      ? { l: 'Prazo de entrega', v: fmtData(prazoEntrega)                               } : null,
    isPedido && orc?.forma_pagamento  ? { l: 'Pagamento',        v: formaLabel[orc.forma_pagamento] ?? orc.forma_pagamento } : null,
  ].filter(Boolean);

  const BLK_Y = y;
  const BLK_H = Math.max(40, 21 + respEntries.length * 10.5);
  const COL2  = ML + CW / 2 + 10;
  fillRect(doc, ML, BLK_Y, CW, BLK_H, C.panel);
  if (isColor) fillRect(doc, ML, BLK_Y + BLK_H - 0.4, CW, 0.4, COR_PRIM_RGB);

  let d1 = BLK_Y + 8;
  txt(doc, 'CLIENTE', ML + 10, d1, 6.5, C.faint, 'bold'); d1 += 5;
  txt(doc, cliNome, ML + 10, d1, 12, C.ink, 'bold'); d1 += 7;
  if (cliTel)   { txt(doc, cliTel,   ML + 10, d1, 8.5, C.muted); d1 += 4; }
  if (cliEmail) { txt(doc, cliEmail, ML + 10, d1, 8.5, C.muted); }

  let d2 = BLK_Y + 8;
  txt(doc, 'RESPONSÁVEIS', COL2, d2, 6.5, C.faint, 'bold'); d2 += 5;
  for (const r of respEntries) {
    txt(doc, r.l.toUpperCase(), COL2, d2, 6.5, C.faint, 'bold'); d2 += 3.5;
    txt(doc, r.v, COL2, d2, 9.5, C.ink); d2 += 7;
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
    const ambTotal = pecasAmb.reduce((s, p) => s + esc(p.valor ?? 0), 0);
    totalGeral += ambTotal;  // sempre acumula, independente do nivel_detalhe

    needPage(34);

    // ── NÍVEL 1: Ambiente ─────────────────────────────────────────────────
    hLine(doc, y, ML, RIGHT, C.ink, 0.4);
    y += 1;
    txt(doc, ambNome.toUpperCase(), ML, y + 7, 13, C.ink, 'bold');
    txt(doc, fmtBRL(ambTotal), RIGHT, y + 7, 13, isColor ? COR_PRIM_RGB : C.ink, 'bold', { align: 'right' });
    y += 10;
    hLine(doc, y, ML, RIGHT, C.ink, 0.4);
    y += 5;

    if (nivelDetalhe === 'so_ambientes') continue;

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
      const itemTotal = pecasItem.reduce((s, p) => s + esc(p.valor ?? 0), 0);

      // ── NÍVEL 2: Item ──────────────────────────────────────────────────
      if (nomeItem) {
        y += 6;
        needPage(22);
        const IT_H = 9;
        fillRect(doc, ML, y + 1, 1.2, 7, isColor ? COR_PRIM_RGB : C.muted);
        txt(doc, nomeItem, ML + 5, y + 6.5, 10, C.ink, 'bold');
        txt(doc, fmtBRL(itemTotal), RIGHT, y + 6.5, 10, C.muted, 'bold', { align: 'right' });
        y += IT_H + 3;
      }

      // ── NÍVEL 3: Peças e acabamentos (só se 'tudo') ───────────────────
      if (nivelDetalhe === 'tudo') {
        drawColHdr();
        for (const p of pecasItem) {
          const matNome    = resolverMaterial(p.material, p.material_id, catMateriais);
          const valorAcab  = Number(p.valor_acabamentos ?? 0);
          const valorPedra = esc((p.valor ?? 0) - valorAcab);

          // Mat+Esp: empilhado na coluna MEDIDAS (Opção A)
          const matEspParts = [
            mostrarMat && matNome ? matNome : null,
            p.espessura && p.espessura !== '—' ? `${p.espessura} cm` : null,
          ].filter(Boolean);
          const matEspStr = matEspParts.join('  ·  ');
          const PEDRA_H   = matEspStr ? 11 : 8.5;

          if (needPage(PEDRA_H + 2)) drawColHdr();

          const indent = nomeItem ? ML + 6 : ML;

          txt(doc, p.nome ?? 'Peça', indent, y + 5, 10, C.ink, 'normal',
              { maxWidth: C_DIM - indent - 4 });

          let dimStr = '';
          if (mostrarMed && p.area != null) dimStr = `${Number(p.area).toFixed(3)} m²`;
          txt(doc, dimStr || (mostrarMed ? '—' : ''), C_DIM, y + 5, 9, C.muted);

          if (matEspStr)
            txt(doc, matEspStr, C_DIM, y + 8.5, 8, C.muted, 'italic');

          if (mostrarValPecas)
            txt(doc, fmtBRL(valorPedra), C_VAL, y + 5, 10, C.ink, 'bold', { align: 'right' });

          y += PEDRA_H;
          hLine(doc, y, ML, RIGHT, C.rule, 0.15);
        }

        // Acabamentos
        if (mostrarAcab) {
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

          const indentAcab = nomeItem ? ML + 6 : ML;
          for (const [tipo, { ml, valor }] of acabByTipo) {
            const ACAB_H = 9;
            const nomeAc = ACAB_LABEL[tipo] ?? tipo ?? 'Acabamento';
            const valorAc = esc(valor);

            needPage(ACAB_H + 2);
            txt(doc, `•  ${nomeAc}`, indentAcab + 5, y + 5.8, 9, C.amber, 'italic');
            txt(doc, `${ml.toFixed(2)} ml`, C_DIM, y + 5.8, 8.5, C.muted, 'normal');
            if (mostrarValPecas)
              txt(doc, fmtBRL(valorAc), C_VAL, y + 5.8, 9, C.amber, 'bold', { align: 'right' });
            y += ACAB_H;
            hLine(doc, y, ML, RIGHT, C.rule, 0.1);
          }
        }

      }
    }

    // Total do ambiente
    needPage(16);
    y += 2;
    hLine(doc, y, ML, RIGHT, C.muted, 0.3);
    y += 4;
    txt(doc, `TOTAL — ${ambNome}`, ML + 4, y + 5, 9.5, C.muted, 'bold');
    txt(doc, fmtBRL(ambTotal), RIGHT, y + 5, 9.5, C.body, 'bold', { align: 'right' });
    y += 12;
    hLine(doc, y, ML, RIGHT, C.rule, 0.35);
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVIÇOS / PRODUTOS AVULSOS
  // ═══════════════════════════════════════════════════════════════════════════
  const itensManuais = orc.itens_manuais ?? [];
  if (itensManuais.length > 0) {
    needPage(32);
    hLine(doc, y, ML, RIGHT, C.ink, 0.4);
    y += 1;
    txt(doc, 'SERVIÇOS E PRODUTOS AVULSOS', ML, y + 7, 13, C.ink, 'bold');
    y += 10;
    hLine(doc, y, ML, RIGHT, C.ink, 0.4);
    y += 5;

    txt(doc, 'DESCRIÇÃO', C_DESC, y, 6.5, C.faint, 'bold');
    txt(doc, 'QTD',       C_DIM,  y, 6.5, C.faint, 'bold');
    txt(doc, 'VALOR',     C_VAL,  y, 6.5, C.faint, 'bold', { align: 'right' });
    y += 1.5;
    hLine(doc, y, ML, RIGHT, C.rule, 0.25);
    y += 4;

    let subtManuais = 0;
    for (const item of itensManuais) {
      needPage(11);
      const qty  = Number(item.quantidade ?? 0);
      const unit = item.tipo === 'area' ? 'm²' : (item.tipo === 'ml' ? 'ml' : 'un');
      txt(doc, item.nome_peca ?? item.nome ?? 'Item', ML, y + 6, 9, C.ink, 'normal',
          { maxWidth: C_DIM - ML - 5 });
      txt(doc, `${qty.toFixed(qty % 1 === 0 ? 0 : 2)} ${unit}`, C_DIM, y + 6, 8, C.muted);
      txt(doc, fmtBRL(esc(item.total)), C_VAL, y + 6, 9, C.ink, 'bold', { align: 'right' });
      subtManuais += esc(item.total);
      totalGeral  += esc(item.total);
      hLine(doc, y + 10, ML, RIGHT, C.rule, 0.12);
      y += 11;
    }
    y += 2;
    txt(doc, 'Subtotal — Produtos avulsos', ML + 4, y + 4.5, 7.5, C.faint, 'italic');
    txt(doc, fmtBRL(subtManuais), RIGHT, y + 4.5, 8.5, C.muted, 'bold', { align: 'right' });
    y += 11;
    hLine(doc, y, ML, RIGHT, C.rule, 0.35);
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
  needPage(nLinhas * 7 + 8 + 36);

  y += 4;
  hLine(doc, y, ML, RIGHT, C.rule, 0.4);
  y += 7;
  txt(doc, 'RESUMO DO INVESTIMENTO', ML, y, 7, C.faint, 'bold');
  y += 9;

  const linha = (label, valor, cor = C.body, negrito = false) => {
    txt(doc, label, ML + 4, y, 9, C.muted);
    txt(doc, valor, RIGHT, y, 9, cor, negrito ? 'bold' : 'normal', { align: 'right' });
    y += 7;
  };

  linha('Subtotal', fmtBRL(totalGeral));
  if (desconto > 0) linha('Desconto', `− ${fmtBRL(desconto)}`, C.red,   true);
  if (_frete   > 0) linha('Frete',    `+ ${fmtBRL(_frete)}`,   C.green, true);
  y += 4;

  // ── TOTAL GERAL — minimalista: 2 linhas finas ─────────────────────────────
  hLine(doc, y, ML, RIGHT, C.ink, 0.6);
  y += 6;
  txt(doc, 'TOTAL', ML, y, 9, C.muted, 'bold', {}, 0.3);
  txt(doc, fmtBRL(valorFinal), RIGHT, y + 8, 22, C.ink, 'bold', { align: 'right' });
  y += 14;
  hLine(doc, y, ML, RIGHT, C.ink, 0.6);
  if (mostrarValidade) {
    y += 5;
    txt(doc, `Validade: 7 dias — até ${dtValid}`, ML, y, 7, C.faint, 'italic');
  }
  y += 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // CRONOGRAMA DE PAGAMENTO (só modo pedido)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mostrarCronograma) {
    const parcelas = resolverParcelas(orc, valorFinal);

    needPage(40);
    hLine(doc, y, ML, RIGHT, C.rule, 0.2); y += 5;
    txt(doc, 'CRONOGRAMA DE PAGAMENTO', ML, y, 6, C.faint, 'bold'); y += 5;

    // Cabeçalho da tabela
    const C1 = ML,      W1 = 18;
    const C2 = ML + 20, W2 = 36;
    const C3 = ML + 58, W3 = 38;
    const C4 = ML + 98, W4 = 28;
    const C5 = ML + 128;

    fillRect(doc, ML, y, CW, 7, C.panel);
    txt(doc, 'PARCELA',    C1 + 2,      y + 5, 6.5, C.faint, 'bold');
    txt(doc, 'VENCIMENTO', C2 + 2,      y + 5, 6.5, C.faint, 'bold');
    txt(doc, 'FORMA',      C3 + 2,      y + 5, 6.5, C.faint, 'bold');
    txt(doc, 'VALOR',      C4 + 2,      y + 5, 6.5, C.faint, 'bold');
    txt(doc, 'STATUS',     C5 + 2,      y + 5, 6.5, C.faint, 'bold');
    y += 9;

    const formaLabel = {
      a_vista: 'À Vista', pix: 'PIX', transferencia: 'Transf.', dinheiro: 'Dinheiro',
      cartao: 'Cartão', boleto_parcelado: 'Boleto', cheque: 'Cheque',
    };

    for (const p of parcelas) {
      needPage(9);
      const dtStr = p.vencimento instanceof Date && !isNaN(p.vencimento)
        ? p.vencimento.toLocaleDateString('pt-BR') : '—';
      const fLabel = formaLabel[p.forma] ?? p.forma ?? '—';
      const sLabel = p.status === 'pago' ? 'Pago' : p.status === 'cancelado' ? 'Cancelado' : 'Pendente';
      const sColor = p.status === 'pago' ? C.green : p.status === 'cancelado' ? C.muted : C.amber;

      txt(doc, `${p.numero}/${parcelas.length}`, C1 + 2, y + 5.5, 8, C.body);
      txt(doc, dtStr,                            C2 + 2, y + 5.5, 8, C.body);
      txt(doc, fLabel,                           C3 + 2, y + 5.5, 8, C.body);
      txt(doc, fmtBRL(p.valor),                  C4 + 2, y + 5.5, 8, C.body, 'bold');
      txt(doc, sLabel,                           C5 + 2, y + 5.5, 8, sColor, 'bold');
      hLine(doc, y + 8, ML, RIGHT, C.rule, 0.12);
      y += 9;
    }
    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DADOS BANCÁRIOS (só modo pedido)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mostrarDadosBanc) {
    const db      = empresa?.dados_bancarios ?? {};
    const temConta = db.banco || db.agencia || db.conta;
    const temPix   = db.pix_chave;

    if (temConta || temPix) {
      needPage(36);
      hLine(doc, y, ML, RIGHT, C.rule, 0.2); y += 5;
      txt(doc, 'DADOS PARA PAGAMENTO', ML, y, 6, C.faint, 'bold'); y += 5;

      fillRect(doc, ML, y, CW, temConta && temPix ? 28 : 20, C.panel);
      const COL_L = ML + 4, COL_R = ML + CW / 2 + 4;
      let dy = y + 5;

      if (temConta) {
        txt(doc, 'TRANSFERÊNCIA / TED / DOC', COL_L, dy, 6, C.faint, 'bold'); dy += 4.5;
        if (db.banco)    { txt(doc, `Banco: ${db.banco}`,       COL_L, dy, 8, C.body); dy += 4.5; }
        if (db.agencia)  { txt(doc, `Agência: ${db.agencia}`,   COL_L, dy, 8, C.body); dy += 4.5; }
        if (db.conta)    { txt(doc, `Conta: ${db.conta}`,       COL_L, dy, 8, C.body); dy += 4.5; }
        if (db.titular)  { txt(doc, `Titular: ${db.titular}`,   COL_L, dy, 8, C.body); }
      }

      if (temPix) {
        const pixLabel = { cpf: 'CPF', cnpj: 'CNPJ', telefone: 'Telefone', email: 'E-mail', aleatoria: 'Aleatória' };
        const tipoStr  = pixLabel[db.pix_tipo] ?? db.pix_tipo ?? 'Chave';
        let px = temConta ? COL_R : COL_L;
        let py = y + 5;
        txt(doc, 'PIX', px, py, 6, C.faint, 'bold'); py += 4.5;
        txt(doc, `Tipo: ${tipoStr}`, px, py, 8, C.body); py += 4.5;
        txt(doc, `Chave: ${db.pix_chave}`, px, py, 8, C.body, 'bold');
      }

      y += temConta && temPix ? 32 : 24;
    }
  }

  // ── Observações (bloco opcional antes das condições) ─────────────────────
  if (observacoes) {
    needPage(24);
    y += 4;
    hLine(doc, y, ML, RIGHT, C.rule, 0.2); y += 5;
    txt(doc, 'OBSERVAÇÕES', ML, y, 6, C.faint, 'bold'); y += 5;
    for (const l of doc.splitTextToSize(observacoes, CW - 4)) {
      needPage(6);
      txt(doc, l, ML + 2, y, 7.5, C.muted); y += 4.5;
    }
  }

  // ── Condições comerciais ──────────────────────────────────────────────────
  needPage(26);
  hLine(doc, y, ML, RIGHT, C.rule, 0.2); y += 5;
  txt(doc, 'CONDIÇÕES COMERCIAIS', ML, y, 6, C.faint, 'bold'); y += 5;
  const termosDefault = [
    mostrarValidade ? `• Validade desta proposta: 7 dias — até ${dtValid}.` : null,
    '• Prazo de entrega mediante confirmação e aprovação do pedido.',
    '• Valores sujeitos a alteração após o prazo de validade.',
    '• Este documento não possui valor fiscal.',
  ].filter(Boolean);
  const termosLinhas = termos
    ? doc.splitTextToSize(termos, CW - 4)
    : termosDefault;
  for (const l of termosLinhas) { needPage(6); txt(doc, l, ML + 2, y, 7.5, C.faint); y += 4.5; }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSINATURAS (só modo pedido)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mostrarAssinaturas) {
    if (y > 240) { doc.addPage(); y = 14; }
    y += 10;

    const midX  = ML + CW / 2;
    const lineY = y + 14;

    hLine(doc, lineY, ML,       midX - 10, C.muted, 0.3);
    hLine(doc, lineY, midX + 10, RIGHT,    C.muted, 0.3);

    txt(doc, empNome, ML,        lineY + 5, 8, C.body);
    txt(doc, cliNome, midX + 10, lineY + 5, 8, C.body);
    txt(doc, 'EMPRESA',   ML,        lineY + 9, 6.5, C.faint, 'bold');
    txt(doc, 'CLIENTE',   midX + 10, lineY + 9, 6.5, C.faint, 'bold');

    y = lineY + 16;
    txt(doc, `Local e data: ___________________, ${fmtData(new Date())}`, ML, y, 7.5, C.faint, 'italic');
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RODAPÉ EM TODAS AS PÁGINAS
  // ═══════════════════════════════════════════════════════════════════════════
  const contatoRodape = [empTel, empEmail].filter(Boolean).join('  ·  ');
  const totalPgs = doc.getNumberOfPages();
  const rodapeBase = [empNome, contatoRodape].filter(Boolean).join('  ·  ');

  for (let i = 1; i <= totalPgs; i++) {
    doc.setPage(i);
    hLine(doc, 283, ML, RIGHT, C.rule, 0.2);
    txt(doc, `${rodapeBase}  ·  Página ${i} / ${totalPgs}`, PW / 2, 288, 6.5, C.faint, 'normal', { align: 'center' });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const suffix    = modo === 'bw' ? '_impressao' : '';
  const prefix    = isPedido ? 'pedido' : 'orcamento';
  const tituloSlug = sanitize(orc.nome ?? orc.nome_versao ?? 'orcamento');
  const projetoSlug = sanitize(projeto?.nome);
  doc.save(`${prefix}_${tituloSlug}_${projetoSlug}${suffix}.pdf`);
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * PDF colorido.
 * @param {{ orc, projeto, ambientes, catMateriais, empresa, vendedorNome, prazoEntrega, template }} params
 *   empresa: { logo_url, nome, cnpj, endereco, telefone, email }
 *   template: objeto pdf_templates do banco (opcional — usa defaults se null)
 */
export async function gerarPdfOrcamento(params) {
  return buildOrcamentoPdf(params, 'color');
}

/** PDF para impressão — preto e branco. */
export async function gerarPdfOrcamentoImpressao(params) {
  return buildOrcamentoPdf(params, 'bw');
}

/** PDF de pedido fechado — colorido, com label "PEDIDO FECHADO" e dados de pagamento. */
export async function gerarPdfPedidoFechado(params) {
  return buildOrcamentoPdf(params, 'pedido');
}

// ── Contrato ──────────────────────────────────────────────────────────────────

function extrairCidadeEstado(end) {
  if (!end) return { cidade: '____', estado: '__' };
  const m1 = end.match(/([A-Za-zÀ-ú][A-Za-zÀ-ú\s]+)\s*[-/]\s*([A-Z]{2})\s*$/);
  if (m1) return { cidade: m1[1].trim(), estado: m1[2] };
  const m2 = end.match(/,\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s]+),?\s*([A-Z]{2})/);
  if (m2) return { cidade: m2[1].trim(), estado: m2[2] };
  return { cidade: '____', estado: '__' };
}

export async function gerarPdfContrato({ pedido, projeto, empresa = {}, template = null }) {
  const corPrimaria  = template?.cor_primaria ?? '#1D9E75';
  const COR_PRIM_RGB = [
    parseInt(corPrimaria.slice(1, 3), 16),
    parseInt(corPrimaria.slice(3, 5), 16),
    parseInt(corPrimaria.slice(5, 7), 16),
  ];

  const {
    logo_url: empLogo = null,
    nome:     empNome = 'Empresa',
    cnpj:     empCnpj = null,
    telefone: empTel  = null,
    endereco: empEnd  = null,
  } = empresa;
  const empEmail = empresa?.email_contato ?? empresa?.email ?? null;

  const cliNome  = projeto?.clientes?.nome     ?? projeto?.nome ?? 'Cliente';
  const cliCpf   = projeto?.clientes?.cpf      ?? null;
  const cliEnd   = projeto?.clientes?.endereco ?? null;
  const cliTel   = projeto?.clientes?.telefone ?? null;
  const cliEmail = projeto?.clientes?.email    ?? null;

  const hoje      = new Date();
  const dtHoje    = fmtData(hoje);
  const pedidoNum = `#${(pedido?.id ?? '').slice(-8).toUpperCase()}`;

  const prazoStr = pedido?.prazo_entrega
    ? fmtData(new Date(pedido.prazo_entrega + 'T12:00:00'))
    : 'a combinar';

  const formaLabel = {
    a_vista:          'À Vista',
    pix:              'PIX',
    transferencia:    'Transferência Bancária',
    dinheiro:         'Dinheiro',
    cartao:           `Cartão de Crédito — ${pedido?.parcelas ?? ''}x`,
    boleto_parcelado: `Boleto Parcelado — ${pedido?.parcelas ?? ''}x`,
    cheque:           'Cheque',
  };
  const pagStr   = formaLabel[pedido?.forma_pagamento] ?? pedido?.forma_pagamento ?? '—';
  const valorStr = pedido?.valor_fechado != null ? fmtBRL(pedido.valor_fechado) : '____';

  const { cidade: cidadeEmpresa, estado: estadoEmpresa } = extrairCidadeEstado(empEnd);

  const textoContrato = renderClausulas(template?.contrato_texto || CONTRATO_PADRAO, {
    numeroPedido:   pedidoNum,
    valorTotal:     valorStr,
    prazoEntrega:   prazoStr,
    formaPagamento: pagStr,
    cidadeEmpresa,
    estadoEmpresa,
  });

  // ── Setup ─────────────────────────────────────────────────────────────────
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW    = 210;
  const ML    = 14;
  const MR    = 14;
  const CW    = PW - ML - MR;
  const RIGHT = PW - MR;

  let y = 0;
  const needPage = needed => {
    if (y + needed > 270) { doc.addPage(); y = 14; return true; }
    return false;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  const HDR_H = 30;
  fillRect(doc, 0, HDR_H - 0.8, PW, 0.8, COR_PRIM_RGB);

  const LOGO_H = 18;
  let logoRendered = false;
  if (empLogo) {
    const img = await loadLogoBase64(empLogo);
    if (img?.data) {
      const maxW  = CW * 0.42;
      const logoW = Math.min(img.aspectRatio * LOGO_H, maxW);
      doc.addImage(img.data, img.format, ML, 6, logoW, LOGO_H);
      logoRendered = true;
    }
  }
  if (!logoRendered) txt(doc, empNome.toUpperCase(), ML, 18, 14, C.ink, 'bold', {}, 0.5);

  txt(doc, 'CONTRATO DE FORNECIMENTO E INSTALAÇÃO', RIGHT, 9,  6.5, C.faint, 'bold', { align: 'right' });
  txt(doc, empNome,                                 RIGHT, 15, 9,   C.ink,   'bold', { align: 'right' });
  const subInfo = [empCnpj && `CNPJ ${empCnpj}`, empTel, empEmail].filter(Boolean).join('  ·  ');
  if (subInfo) txt(doc, subInfo, RIGHT, 20, 6.5, C.faint, 'normal', { align: 'right' });
  if (empEnd)  txt(doc, empEnd,  RIGHT, 25, 6.5, C.faint, 'normal', { align: 'right' });

  y = HDR_H + 7;

  // Número e data
  txt(doc, `Contrato ${pedidoNum}`, ML,    y, 16,  C.ink,   'bold');
  txt(doc, `Emitido em ${dtHoje}`,  RIGHT, y, 8.5, C.muted, 'normal', { align: 'right' });
  y += 5.5;
  hLine(doc, y, ML, RIGHT, C.rule, 0.3);
  y += 8;

  // ── Qualificação das partes (2 colunas) ──────────────────────────────────
  const COL2 = ML + CW / 2 + 4;
  const dadosEmp = [empNome, empCnpj && `CNPJ: ${empCnpj}`, empEnd, empTel, empEmail].filter(Boolean);
  const dadosCli = [cliNome, cliCpf && `CPF/CNPJ: ${cliCpf}`, cliEnd, cliTel, cliEmail].filter(Boolean);
  const QUAL_H   = 12 + Math.max(dadosEmp.length, dadosCli.length) * 5.5;

  fillRect(doc, ML, y, CW, QUAL_H, C.panel);
  fillRect(doc, ML, y + QUAL_H - 0.3, CW, 0.3, COR_PRIM_RGB);

  let d1 = y + 6;
  txt(doc, 'CONTRATADA', ML + 4, d1, 6, C.faint, 'bold'); d1 += 5;
  for (const [i, l] of dadosEmp.entries()) {
    txt(doc, l, ML + 4, d1, i === 0 ? 9.5 : 7.5, i === 0 ? C.ink : C.muted, i === 0 ? 'bold' : 'normal');
    d1 += i === 0 ? 5.5 : 4.5;
  }

  let d2 = y + 6;
  txt(doc, 'CONTRATANTE', COL2, d2, 6, C.faint, 'bold'); d2 += 5;
  for (const [i, l] of dadosCli.entries()) {
    txt(doc, l, COL2, d2, i === 0 ? 9.5 : 7.5, i === 0 ? C.ink : C.muted, i === 0 ? 'bold' : 'normal');
    d2 += i === 0 ? 5.5 : 4.5;
  }

  y += QUAL_H + 10;

  // ── Cláusulas ─────────────────────────────────────────────────────────────
  for (const bloco of textoContrato.split('\n\n')) {
    if (!bloco.trim()) continue;
    const [titulo, ...resto] = bloco.split('\n');
    const corpo      = resto.join('\n').trim();
    const corpoLinhs = corpo ? doc.splitTextToSize(corpo, CW - 8) : [];

    needPage(8 + 6 + corpoLinhs.length * 4.5 + 4);
    hLine(doc, y, ML, RIGHT, C.rule, 0.15); y += 5;
    txt(doc, titulo, ML, y, 8.5, C.ink, 'bold'); y += 6;
    for (const l of corpoLinhs) {
      needPage(6);
      txt(doc, l, ML + 4, y, 8, C.body); y += 4.5;
    }
    y += 4;
  }

  // ── Anexo I ───────────────────────────────────────────────────────────────
  doc.addPage(); y = 14;

  hLine(doc, y, ML, RIGHT, C.ink, 0.4); y += 5;
  txt(doc, 'ANEXO I — NORMAS DE EXECUÇÃO', ML, y, 11, C.ink, 'bold', {}, 0.3); y += 8;
  hLine(doc, y, ML, RIGHT, C.ink, 0.4); y += 6;
  const introLinhs = doc.splitTextToSize(
    'As normas a seguir integram o contrato e têm plena vigência salvo disposição em contrário no pedido.',
    CW,
  );
  for (const l of introLinhs) { txt(doc, l, ML, y, 7.5, C.muted, 'italic'); y += 4.5; }
  y += 5;

  for (const norma of NORMAS_EXECUCAO) {
    const sepIdx  = norma.indexOf(' — ');
    const label   = sepIdx > 0 ? norma.slice(0, sepIdx)  : norma;
    const corpo   = sepIdx > 0 ? norma.slice(sepIdx + 3) : '';
    const linhas  = corpo ? doc.splitTextToSize(corpo, CW - 8) : [];

    needPage(6 + linhas.length * 4.5 + 6);
    txt(doc, label, ML + 2, y, 7.5, C.ink, 'bold'); y += 4.5;
    for (const l of linhas) { txt(doc, l, ML + 6, y, 7.5, C.body); y += 4.5; }
    y += 2;
    hLine(doc, y, ML, RIGHT, C.rule, 0.1); y += 4;
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 14; }
  y += 10;

  hLine(doc, y, ML, RIGHT, C.rule, 0.2); y += 5;
  txt(doc, 'ASSINATURAS', ML, y, 6, C.faint, 'bold'); y += 10;

  const halfW = CW / 2 - 6;
  const COL_R = ML + CW / 2 + 4;

  const drawSig = (label, sublabel, x) => {
    hLine(doc, y, x, x + halfW, C.muted, 0.3);
    txt(doc, label,    x, y + 5,  8,   C.body);
    txt(doc, sublabel, x, y + 9,  6.5, C.faint, 'bold');
  };

  drawSig(empNome,       'CONTRATADA',                ML);
  drawSig(cliNome,       'CONTRATANTE',               COL_R);
  y += 18;
  drawSig('Testemunha 1', 'NOME / CPF / ASSINATURA',  ML);
  drawSig('Testemunha 2', 'NOME / CPF / ASSINATURA',  COL_R);
  y += 16;
  txt(doc, `${cidadeEmpresa}, ${dtHoje}`, ML, y, 7.5, C.faint, 'italic');
  y += 8;

  // ── Rodapé em todas as páginas ────────────────────────────────────────────
  const contatoRodape = [empTel, empEmail].filter(Boolean).join('  ·  ');
  const rodapeBase    = [empNome, contatoRodape].filter(Boolean).join('  ·  ');
  const totalPgs      = doc.getNumberOfPages();
  for (let i = 1; i <= totalPgs; i++) {
    doc.setPage(i);
    hLine(doc, 283, ML, RIGHT, C.rule, 0.2);
    txt(doc, `${rodapeBase}  ·  Página ${i} / ${totalPgs}`, PW / 2, 288, 6.5, C.faint, 'normal', { align: 'center' });
  }

  const slug = cliNome.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  doc.save(`contrato-${slug}-${(pedido?.id ?? '').slice(-6)}.pdf`);
}
