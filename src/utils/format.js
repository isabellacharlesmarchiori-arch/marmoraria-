// Formata número como moeda BRL: 1500 → "R$ 1.500,00"
export function formatBRL(valor) {
  if (valor == null || isNaN(valor)) return '';
  return 'R$ ' + Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Formata date string ISO ou objeto Date para "DD/MM/YYYY"
export function formatDate(data) {
  if (!data) return '';
  const s = typeof data === 'string' ? data.split('T')[0] : data.toISOString().split('T')[0];
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

// Formata competência (date) para "MMM/YYYY" em PT-BR: "mar/2026"
export function formatCompetencia(data) {
  if (!data) return '';
  const s = typeof data === 'string' ? data.split('T')[0] : data.toISOString().split('T')[0];
  const [y, m] = s.split('-');
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${meses[parseInt(m, 10) - 1]}/${y}`;
}

// Retorna número de dias entre hoje e uma data (negativo se já passou)
export function diasAteVencimento(dataVencimento) {
  if (!dataVencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + 'T00:00:00');
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24));
}
