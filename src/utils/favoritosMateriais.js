// Favoritos de materiais — persistidos por usuário no localStorage.
// Guardamos apenas os IDs dos materiais favoritados.
// Na primeira vez (sem nada salvo) semeamos os favoritos padrão por nome.

const KEY = uid => `favoritos_materiais_${uid ?? 'anon'}`;

// Materiais que já vêm favoritados por padrão (casados por nome, case-insensitive).
const FAVORITOS_PADRAO = ['Preto São Gabriel', 'Granito Escuro'];

const norm = s => (s ?? '').toLowerCase().trim();

// Retorna o array de IDs favoritos do usuário. Se ainda não houver nada salvo,
// semeia os padrões (casando pelos nomes em `todosM`) e persiste.
export function carregarFavoritos(uid, todosM = []) {
  const key = KEY(uid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch { /* localStorage indisponível ou JSON inválido */ }

  // Semear padrões por nome
  const padroes = todosM
    .filter(m => FAVORITOS_PADRAO.some(nome => norm(m.nome) === norm(nome)))
    .map(m => m.id);
  salvarFavoritos(uid, padroes);
  return padroes;
}

export function salvarFavoritos(uid, ids) {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(ids));
  } catch { /* localStorage indisponível */ }
}
