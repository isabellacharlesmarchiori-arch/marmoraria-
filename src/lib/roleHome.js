// Mapa perfil → rota "home" de cada tipo de usuário.
// Compartilhado entre o redirect pós-login (Login.jsx) e os guards de rota
// (App.jsx), para que um perfil barrado por um guard volte pro SEU home —
// não sempre /dashboard.
export const ROLE_HOME = {
  vendedor:          '/dashboard',
  admin:             '/admin',
  medidor:           '/agenda',
  superadmin:        '/superadmin',
  admin_medidor:     '/admin',
  vendedor_medidor:  '/dashboard',
};

// Destino seguro para um perfil; cai em /dashboard quando o perfil é
// desconhecido ou ainda não carregou.
export function homeFor(perfil) {
  return ROLE_HOME[perfil] ?? '/dashboard';
}
