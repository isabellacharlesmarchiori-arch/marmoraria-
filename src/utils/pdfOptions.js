// Defaults usados quando não há template no banco nem opções salvas no localStorage.
// Fonte única compartilhada entre PdfOptionsModal e Configuracoes.
export const TEMPLATE_DEFAULTS = {
  orcamento: {
    tipo: 'orcamento', cor_primaria: '#1D9E75', nivel_detalhe: 'tudo',
    mostrar_materiais: true, mostrar_medidas: true, mostrar_acabamentos: true,
    mostrar_vendedor: true, mostrar_validade: true, mostrar_prazo_entrega: true,
    mostrar_valores_pecas: true, observacoes: '',
    termos: 'Orçamento válido por 7 dias. Valores sujeitos a alteração após o prazo de validade. Este documento não possui valor fiscal.',
  },
  pedido: {
    tipo: 'pedido', cor_primaria: '#1D9E75', nivel_detalhe: 'tudo',
    mostrar_materiais: true, mostrar_medidas: true, mostrar_acabamentos: true,
    mostrar_vendedor: true, mostrar_validade: false, mostrar_prazo_entrega: true,
    mostrar_cronograma: true, mostrar_dados_bancarios: true, mostrar_assinaturas: true,
    mostrar_valores_pecas: true, observacoes: '',
    termos: 'Pedido confirmado mediante assinatura e pagamento do sinal acordado.',
  },
  contrato: {
    tipo: 'contrato', cor_primaria: '#1D9E75', nivel_detalhe: 'tudo',
    mostrar_materiais: true, mostrar_medidas: true, mostrar_acabamentos: true,
    mostrar_vendedor: true, mostrar_validade: false, mostrar_prazo_entrega: false,
    mostrar_valores_pecas: true, contrato_texto: '', observacoes: '',
    termos: 'Contrato de fornecimento de materiais e serviços de marmoraria. Sujeito às condições acordadas entre as partes.',
  },
};

const LS_KEY = tipo => `pdf_opts_${tipo}`;

// Retorna opts mescladas: localStorage → dbTemplate → TEMPLATE_DEFAULTS[tipo]
export function loadPdfOpts(tipo, dbTemplate = null) {
  const base = { ...TEMPLATE_DEFAULTS[tipo], ...(dbTemplate ?? {}) };
  try {
    const raw = localStorage.getItem(LS_KEY(tipo));
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* localStorage indisponível ou JSON inválido */ }
  return base;
}

// Persiste as opts no localStorage do vendedor
export function savePdfOpts(tipo, opts) {
  try {
    localStorage.setItem(LS_KEY(tipo), JSON.stringify(opts));
  } catch { /* quota exceeded ou modo privado sem storage */ }
}
