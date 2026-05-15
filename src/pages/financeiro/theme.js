// Paleta semântica do módulo financeiro.
// Cores usadas em valores, status e gráficos.
export const financeiroTheme = {
  entrada: {
    text:   'text-emerald-700 dark:text-emerald-400',
    bg:     'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-300 dark:border-emerald-800',
    hex:    '#10B981',
  },
  saida: {
    text:   'text-red-700 dark:text-red-400',
    bg:     'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-300 dark:border-red-800',
    hex:    '#EF4444',
  },
  pendente: {
    text:   'text-amber-700 dark:text-amber-400',
    bg:     'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-300 dark:border-amber-800',
    hex:    '#F59E0B',
  },
  atrasado: {
    text:   'text-red-800 dark:text-red-300',
    bg:     'bg-red-100 dark:bg-red-950/30',
    border: 'border-red-300 dark:border-red-900',
    hex:    '#DC2626',
  },
  pago: {
    text:   'text-emerald-700 dark:text-emerald-400',
    bg:     'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-300 dark:border-emerald-800',
    hex:    '#10B981',
  },
  cancelado: {
    text:   'text-zinc-500 dark:text-zinc-500',
    bg:     'bg-zinc-100 dark:bg-zinc-900/50',
    border: 'border-zinc-300 dark:border-zinc-800',
    hex:    '#6B7280',
  },
};

export function corPorStatus(status) {
  return financeiroTheme[status] || financeiroTheme.pendente;
}

export function corPorTipo(tipo) {
  return tipo === 'entrada' ? financeiroTheme.entrada : financeiroTheme.saida;
}
