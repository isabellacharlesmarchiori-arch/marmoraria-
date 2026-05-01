import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ThemeToggle from './ThemeToggle';

const AppShell = ({ notifCount: notifCountProp = 0 }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const profile = auth?.profile ?? null;
  const session = auth?.session ?? null;
  const perfil = profile?.role || profile?.perfil || 'vendedor';

  const perfilBase = perfil === 'admin_medidor'    ? 'admin'
                   : perfil === 'vendedor_medidor' ? 'vendedor'
                   : perfil;

  const temMedidor  = perfil === 'medidor' || perfil === 'admin_medidor' || perfil === 'vendedor_medidor';
  const isCombinado = perfil === 'admin_medidor'  || perfil === 'vendedor_medidor';
  const notifPath   = isCombinado             ? '/notificacoes'
                    : perfilBase === 'admin'  ? '/admin/notificacoes'
                    : perfilBase === 'medidor'? '/medidor/notificacoes'
                    : '/notificacoes';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(notifCountProp);
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Math.random();
    setToasts(prev => [...prev, { id, ...toast }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    async function fetchCount() {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('lida', false);
      setNotifCount(count ?? 0);
    }

    fetchCount();

    const channel = supabase
      .channel('notif-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `usuario_id=eq.${userId}`,
      }, (payload) => {
        fetchCount();
        const n = payload.new;
        addToast({
          tipo: n?.tipo ?? '',
          titulo: n?.titulo ?? 'Nova notificação',
          corpo: n?.corpo ?? '',
          projeto_id: n?.projeto_id ?? null,
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notificacoes',
        filter: `usuario_id=eq.${userId}`,
      }, () => { fetchCount(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    const handleLida      = () => setNotifCount(c => Math.max(0, c - 1));
    const handleTodasLidas = () => setNotifCount(0);
    window.addEventListener('notif-lida',       handleLida);
    window.addEventListener('notif-todas-lidas', handleTodasLidas);
    return () => {
      window.removeEventListener('notif-lida',       handleLida);
      window.removeEventListener('notif-todas-lidas', handleTodasLidas);
    };
  }, []);

  const menuVendedor = [
    { path: '/dashboard', label: 'Início', icon: 'solar:home-linear', subtitle: 'Dashboard pessoal' },
    { path: '/projetos', label: 'Projetos', icon: 'solar:layers-linear', subtitle: 'Gerenciamento de projetos' },
    { path: '/clientes', label: 'Clientes', icon: 'solar:users-group-two-rounded-linear', subtitle: 'Base de clientes' },
    { path: '/notificacoes', label: 'Notificações', icon: 'solar:bell-linear', subtitle: 'Avisos do sistema', badge: true }
  ];

  const menuAdmin = [
    { path: '/admin', label: 'Início', icon: 'solar:home-linear', subtitle: 'Visão geral' },
    { path: '/admin/projetos', label: 'Projetos', icon: 'solar:layers-linear', subtitle: 'Visão global de projetos' },
    { path: '/admin/clientes', label: 'Clientes', icon: 'solar:users-group-two-rounded-linear', subtitle: 'Base de clientes geral' },
    { path: '/admin/financeiro', label: 'Financeiro', icon: 'solar:wallet-money-linear', subtitle: 'Controle financeiro' },
    { path: '/admin/configuracoes', label: 'Configurações', icon: 'solar:settings-linear',  subtitle: 'Ajustes do sistema' },
    { path: '/admin/mensagens',    label: 'Mensagens',     icon: 'solar:chat-line-linear', subtitle: 'Enviar avisos ao time' },
    { path: notifPath, label: 'Notificações',  icon: 'solar:bell-linear',      subtitle: 'Avisos do sistema', badge: true }
  ];

  const menuMedidor = [
    { path: '/medidor/agenda',        label: 'Agenda',        icon: 'solar:calendar-linear', subtitle: 'Medições agendadas'  },
    { path: '/medidor/notificacoes',  label: 'Notificações',  icon: 'solar:bell-linear',     subtitle: 'Meus avisos', badge: true },
    { path: '/medidor/historico',     label: 'Histórico',     icon: 'solar:history-linear',  subtitle: 'Medições concluídas' },
  ];

  const menuBase = perfilBase === 'admin'   ? menuAdmin
                 : perfilBase === 'medidor' ? menuMedidor
                 : menuVendedor;

  const itensMedidor = [
    { path: '/medidor/agenda',       label: 'Minha Agenda', icon: 'solar:calendar-linear', subtitle: 'Medições agendadas'  },
    { path: '/medidor/historico',    label: 'Histórico',    icon: 'solar:history-linear',  subtitle: 'Medições concluídas' },
  ];

  const currentMenu = (temMedidor && perfilBase !== 'medidor')
    ? [...menuBase, { path: '__divider__', label: 'Medidor', icon: '', subtitle: '', divider: true }, ...itensMedidor]
    : menuBase;

  const activeItem = currentMenu.filter(i => !i.divider).find(item =>
    item.path === '/admin' || item.path === '/dashboard' || item.path === '/medidor/agenda'
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path)
  ) || currentMenu.filter(i => !i.divider)[0];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const badgeColor = perfilBase === 'vendedor' ? 'bg-yellow-400 text-black'
                   : perfilBase === 'admin'    ? 'bg-gray-900 text-white dark:bg-gray-50 dark:text-black'
                   : 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-white';

  const perfilLabel = perfil === 'admin'           ? 'Administrador'
                    : perfil === 'vendedor'         ? 'Vendedor'
                    : perfil === 'medidor'          ? 'Medidor'
                    : perfil === 'admin_medidor'    ? 'Admin + Medidor'
                    : perfil === 'vendedor_medidor' ? 'Vendedor + Medidor'
                    : 'Usuário';
  const userName = profile?.nome ?? 'Usuário';
  const userInitials = userName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 dark:bg-[#050505] text-gray-900 dark:text-white font-sans selection:bg-gray-900 selection:text-white dark:selection:bg-gray-50 dark:selection:text-black">
      {/* Background patterns — only visible in dark mode */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[220px] bg-white dark:bg-[#080808] border-r border-gray-300 dark:border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* 1. Logo */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-gray-300 dark:border-zinc-800 shrink-0">
          <div className="w-2 h-2 bg-yellow-400 shadow-[0_0_6px_rgba(37,99,235,0.5)] dark:shadow-[0_0_6px_rgba(250,204,21,0.5)]"></div>
          <span className="font-mono font-bold uppercase tracking-widest text-[11px] text-gray-900 dark:text-white">SmartStone</span>
          <span className="ml-auto font-mono text-[8px] text-gray-400 dark:text-zinc-600 uppercase">v1.0</span>
        </div>

        {/* 2. Badge de perfil */}
        <div className="px-4 py-3 border-b border-gray-300 dark:border-zinc-800 shrink-0">
          <div className="font-mono text-[8px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">Perfil ativo</div>
          <div className={`inline-block font-mono text-[8px] uppercase font-bold px-2 py-1 ${badgeColor}`}>
            {perfil}
          </div>
        </div>

        {/* 3. Navegação */}
        <nav className="flex-1 overflow-y-auto py-2">
          {currentMenu.map((item) => {
            if (item.divider) return (
              <div key={item.path} className="px-4 py-2 font-mono text-[8px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 border-t border-gray-300 dark:border-zinc-800 mt-1 pt-3">
                Medidor
              </div>
            );

            const isActive = item.path === '/admin' || item.path === '/dashboard' || item.path === '/medidor/agenda'
              ? location.pathname === item.path
              : location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-[10px] px-4 py-[10px] font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer border-l-2 transition-all group ${
                  isActive
                    ? 'border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/5'
                    : 'border-transparent text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-zinc-700'
                }`}
              >
                <iconify-icon icon={item.icon} width="15"></iconify-icon>
                {item.label}
                {item.badge && notifCount > 0 && (
                  <span className="ml-auto w-4 h-4 bg-yellow-400 text-black text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                    {notifCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* 4. Rodapé Usuário */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-300 dark:border-zinc-800 shrink-0">
          <div className="w-7 h-7 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 flex items-center justify-center font-mono text-[10px] text-yellow-600 dark:text-yellow-400 font-bold shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-900 dark:text-white font-medium truncate">{userName}</div>
            <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-600 uppercase truncate">{perfilLabel}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 flex items-center justify-center"
            title="Sair da conta"
          >
            <iconify-icon icon="solar:logout-2-linear" width="14"></iconify-icon>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 w-full overflow-hidden">

        {/* Topbar */}
        <header className="h-12 bg-white dark:bg-[#050505] border-b border-gray-300 dark:border-zinc-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-gray-700 dark:text-white flex items-center"
              onClick={() => setMobileMenuOpen(true)}
            >
              <iconify-icon icon="solar:hamburger-menu-linear" width="20"></iconify-icon>
            </button>
            <span className="font-mono text-[11px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">
              {activeItem?.label || 'Início'}
            </span>
            <span className="text-gray-300 dark:text-zinc-800 text-[10px]">—</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 truncate max-w-[120px] sm:max-w-none">
              {activeItem?.subtitle || 'SmartStone App'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Input busca */}
            <div className="relative hidden md:flex items-center">
              <span className="absolute left-2 text-gray-400 dark:text-zinc-600 pointer-events-none flex items-center justify-center text-[12px]">
                <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
              </span>
              <input
                placeholder="Buscar..."
                className="bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono pl-7 pr-3 h-8 w-48 rounded-none outline-none focus:border-yellow-500 dark:focus:border-yellow-400 dark:focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] placeholder:text-gray-400 dark:placeholder:text-zinc-700 transition-all"
              />
            </div>

            <ThemeToggle />

            <button
              onClick={() => navigate(notifPath)}
              className="text-gray-400 dark:text-zinc-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors relative flex items-center"
            >
              <iconify-icon icon="solar:bell-linear" width="18"></iconify-icon>
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-none shadow-[0_0_6px_rgba(37,99,235,0.5)] dark:shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
              )}
            </button>

            <span className="text-gray-200 dark:text-zinc-800 hidden sm:inline">|</span>

            <div className="w-7 h-7 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 hidden sm:flex items-center justify-center font-mono text-[10px] text-yellow-600 dark:text-yellow-400 font-bold shrink-0">
              {userInitials}
            </div>
          </div>
        </header>

        {/* Content Slot */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* ── Toast Stack ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
          {toasts.map(t => {
            const isMedicao = t.tipo === 'medicao_concluida';
            return (
              <div
                key={t.id}
                className={`flex items-start gap-3 p-4 border shadow-2xl pointer-events-auto backdrop-blur-sm ${
                  isMedicao
                    ? 'bg-white dark:bg-[#0a0a0a] border-green-300 dark:border-green-500/40 border-l-2 border-l-green-500 dark:border-l-green-400'
                    : 'bg-white dark:bg-[#0a0a0a] border-gray-300 dark:border-zinc-700'
                }`}
                style={{ animation: 'slideIn 0.3s ease' }}
              >
                <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${isMedicao ? 'bg-green-100 dark:bg-green-400/10 text-green-600 dark:text-green-400' : 'bg-yellow-50 dark:bg-yellow-400/10 text-yellow-600 dark:text-yellow-400'}`}>
                  <iconify-icon icon={isMedicao ? 'solar:check-square-linear' : 'solar:bell-linear'} width="16"></iconify-icon>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 dark:text-white text-xs font-semibold mb-0.5">{t.titulo}</div>
                  {t.corpo && <div className="text-gray-500 dark:text-zinc-500 text-[10px] font-mono leading-snug">{t.corpo}</div>}
                  {t.projeto_id && (
                    <button
                      onClick={() => { navigate(`/projetos/${t.projeto_id}`); dismissToast(t.id); }}
                      className="mt-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-600 dark:text-yellow-400 hover:underline"
                    >
                      Ver projeto →
                    </button>
                  )}
                </div>
                <button onClick={() => dismissToast(t.id)} className="text-gray-400 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors shrink-0 mt-0.5">
                  <iconify-icon icon="solar:close-linear" width="13"></iconify-icon>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `@keyframes slideIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }`}} />
    </div>
  );
};

export default AppShell;
