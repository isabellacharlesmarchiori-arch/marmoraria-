import { jsPDF } from 'jspdf';

// ── Paleta (mesma de gerarPdfOrcamento.js) ───────────────────────────────────
const C = {
    ink:    [17,  17,  17],
    body:   [63,  63,  70],
    muted:  [113, 113, 122],
    rule:   [228, 228, 231],
    panel:  [244, 244, 245],
    paper:  [255, 255, 255],
    accent: [29,  158, 117],
    green:  [21,  128,  61],
    red:    [185,  28,  28],
    greenBg:[240, 253, 244],
    redBg:  [254, 242, 242],
};

const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v, d = 4) => v == null ? '—' : Number(v).toFixed(d).replace('.', ',');

const txt = (doc, text, x, y, size, rgb, style = 'normal', opts = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...rgb);
    doc.text(String(text ?? ''), x, y, opts);
};

const hLine = (doc, y, x1, x2, rgb = C.rule, lw = 0.2) => {
    doc.setDrawColor(...rgb);
    doc.setLineWidth(lw);
    doc.line(x1, y, x2, y);
};

const fillRect = (doc, x, y, w, h, rgb) => {
    doc.setFillColor(...rgb);
    doc.rect(x, y, w, h, 'F');
};

const truncar = (doc, text, maxMm) => {
    if (doc.getTextWidth(String(text)) <= maxMm) return String(text);
    let t = String(text);
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxMm) t = t.slice(0, -1);
    return t + '…';
};

// Colunas da tabela (total = 186mm = CW com ML=MR=12)
const COLS = [
    { label: 'Ambiente',  w: 25, align: 'left'  },
    { label: 'Peça',      w: 37, align: 'left'  },
    { label: 'Material',  w: 30, align: 'left'  },
    { label: 'm² Ped.',   w: 18, align: 'right' },
    { label: 'm² Real',   w: 18, align: 'right' },
    { label: 'Diferença', w: 18, align: 'right' },
    { label: 'R$/m²',     w: 20, align: 'right' },
    { label: 'Impacto',   w: 20, align: 'right' },
];

// Posições x acumuladas de cada coluna
const COL_X = COLS.reduce((acc, col) => {
    acc.push((acc[acc.length - 1] ?? 0) + (acc.length > 0 ? COLS[acc.length - 1].w : 0));
    return acc;
}, []);

export async function gerarPdfDiferenca({ linhas, totalImpacto, medicao, pedido, pedidoNumero, projeto, empresa }) {
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW   = 210;
    const ML   = 12;
    const MR   = 12;
    const CW   = PW - ML - MR;   // 186
    const RIGHT = PW - MR;       // 198
    const PAGE_H = 297;
    const FOOTER_RESERVE = 38;
    const ROW_H = 6.5;

    let y = 0;

    // ── Faixa de cabeçalho ───────────────────────────────────────────────────
    fillRect(doc, 0, 0, PW, 19, C.panel);
    txt(doc, 'NOTA DE AJUSTE — MEDIÇÃO DE PRODUÇÃO', ML, 8, 9, C.ink, 'bold', { charSpace: 1 });
    txt(doc, `Pedido ${pedidoNumero}`, ML, 15, 7.5, C.body);
    y = 26;

    // ── Bloco de metadados ───────────────────────────────────────────────────
    const empNome      = empresa?.nome ?? 'Empresa';
    const projNome     = projeto?.nome ?? '—';
    const clienteNome  = projeto?.cliente?.nome ?? projeto?.clientes?.nome ?? '—';
    const dataMedicao  = medicao?.data ?? (
        medicao?.data_medicao
            ? new Date(medicao.data_medicao).toLocaleDateString('pt-BR')
            : '—'
    );
    const metaItems = [
        ['Empresa', empNome],
        ['Projeto', projNome],
        ['Cliente', clienteNome],
        ['Data da medição', dataMedicao],
    ];

    fillRect(doc, ML, y - 4, CW, 18, C.panel);
    const mColW = CW / 4;
    metaItems.forEach(([label, value], i) => {
        const x = ML + i * mColW + 3;
        txt(doc, label.toUpperCase(), x, y, 5.5, C.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const maxW = mColW - 6;
        txt(doc, truncar(doc, value, maxW), x, y + 5, 7.5, C.ink, 'bold');
    });
    y += 20;

    // ── Função de cabeçalho da tabela ────────────────────────────────────────
    function renderTableHeader() {
        fillRect(doc, ML, y, CW, 7, C.panel);
        COLS.forEach((col, ci) => {
            const cx = ML + COL_X[ci];
            const tx = col.align === 'right' ? cx + col.w - 2 : cx + 2;
            txt(doc, col.label, tx, y + 4.6, 6.5, C.ink, 'bold',
                col.align === 'right' ? { align: 'right' } : {}
            );
        });
        y += 7;
    }

    renderTableHeader();

    // ── Linhas da tabela ─────────────────────────────────────────────────────
    linhas.forEach((linha, idx) => {
        if (y + ROW_H > PAGE_H - FOOTER_RESERVE) {
            doc.addPage();
            y = 14;
            renderTableHeader();
        }

        if (idx % 2 === 1) fillRect(doc, ML, y, CW, ROW_H, [249, 250, 251]);

        // Destaque colorido nas colunas Diferença e Impacto
        if (linha.diferenca !== null && linha.diferenca > 0) {
            const ciDif = 5;
            const ciImp = 7;
            fillRect(doc, ML + COL_X[ciDif], y, COLS[ciDif].w, ROW_H, C.redBg);
            fillRect(doc, ML + COL_X[ciImp], y, COLS[ciImp].w, ROW_H, C.redBg);
        }

        const diffStr = linha.diferenca !== null
            ? (linha.diferenca >= 0 ? '+' : '') + fmtNum(linha.diferenca, 4)
            : '—';
        const diffRgb = linha.diferenca != null && linha.diferenca !== 0
            ? (linha.diferenca > 0 ? C.red : C.green)
            : C.muted;
        const impRgb = linha.impacto != null && linha.impacto !== 0
            ? (linha.impacto > 0 ? C.red : C.green)
            : C.muted;

        const cells = [
            { text: linha.ambienteNome,                               ci: 0, rgb: C.body  },
            { text: linha.pecaNome,                                   ci: 1, rgb: C.ink   },
            { text: linha.materialNome,                               ci: 2, rgb: C.body  },
            { text: fmtNum(linha.areaPedido, 4),                      ci: 3, rgb: C.body  },
            { text: linha.areaReal !== null ? fmtNum(linha.areaReal, 4) : '—', ci: 4, rgb: linha.areaReal !== null ? C.body : C.muted },
            { text: diffStr,                                          ci: 5, rgb: diffRgb },
            { text: linha.precoM2 !== null ? fmtBRL(linha.precoM2) : '—', ci: 6, rgb: linha.precoM2 !== null ? C.body : C.muted },
            { text: linha.impacto !== null ? fmtBRL(linha.impacto)  : '—', ci: 7, rgb: impRgb },
        ];

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        cells.forEach(({ text, ci, rgb }) => {
            const col = COLS[ci];
            const cx  = ML + COL_X[ci];
            const maxW = col.w - 3;
            const tx = col.align === 'right' ? cx + col.w - 2 : cx + 2;
            const display = truncar(doc, text, maxW);
            txt(doc, display, tx, y + 4.5, 7, rgb, 'normal',
                col.align === 'right' ? { align: 'right' } : {}
            );
        });

        y += ROW_H;
        hLine(doc, y, ML, RIGHT, C.rule, 0.1);
    });

    y += 5;

    // ── Rodapé: total ────────────────────────────────────────────────────────
    if (y + FOOTER_RESERVE > PAGE_H) {
        doc.addPage();
        y = 14;
    }

    hLine(doc, y, ML, RIGHT, C.rule, 0.6);
    y += 7;

    const isAcrescimo = totalImpacto > 0;
    const isDesconto  = totalImpacto < 0;
    const totalLabel  = isAcrescimo ? 'ACRÉSCIMO TOTAL' : isDesconto ? 'DESCONTO TOTAL' : 'SEM AJUSTE';
    const totalRgb    = isAcrescimo ? C.red : isDesconto ? C.green : C.muted;

    txt(doc, totalLabel, ML, y + 1, 9, totalRgb, 'bold', { charSpace: 1 });
    txt(doc, fmtBRL(Math.abs(totalImpacto)), RIGHT, y + 1, 13, totalRgb, 'bold', { align: 'right' });

    y += 18;

    // Linha de assinatura
    hLine(doc, y, ML, ML + 70, C.ink, 0.3);
    txt(doc, 'Assinatura do cliente', ML, y + 5, 7, C.muted);
    txt(doc, `Emitido em ${new Date().toLocaleDateString('pt-BR')}`, RIGHT, y + 5, 7, C.muted, 'normal', { align: 'right' });

    const filename = `nota_ajuste_pedido${pedidoNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
}
