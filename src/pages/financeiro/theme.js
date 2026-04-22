// Paleta semântica do módulo financeiro.
// Cores usadas em valores, status e gráficos.
export const financeiroTheme = {
  entrada: {
    text:   'text-emerald-400',
    bg:     'bg-emerald-900/20',
    border: 'border-emerald-800',
    hex:    '#10B981',
  },
  saida: {
    text:   'text-red-400',
    bg:     'bg-red-900/20',
    border: 'border-red-800',
    hex:    '#EF4444',
  },
  pendente: {
    text:   'text-amber-400',
    bg:     'bg-amber-900/20',
    border: 'border-amber-800',
    hex:    '#F59E0B',
  },
  atrasado: {
    text:   'text-red-300',
    bg:     'bg-red-950/30',
    border: 'border-red-900',
    hex:    '#DC2626',
  },
  pago: {
    text:   'text-emerald-400',
    bg:     'bg-emerald-900/20',
    border: 'border-emerald-800',
    hex:    '#10B981',
  },
  cancelado: {
    text:   'text-zinc-500',
    bg:     'bg-zinc-900/50',
    border: 'border-zinc-800',
    hex:    '#6B7280',
  },
};

export function corPorStatus(status) {
  return financeiroTheme[status] || financeiroTheme.pendente;
}

export function corPorTipo(tipo) {
  return tipo === 'entrada' ? financeiroTheme.entrada : financeiroTheme.saida;
}
