/**
 * App.jsx — Versão Estável
 *
 * Regras:
 *  • Imports diretos (sem React.lazy)
 *  • AppShell mantido mas isolado: se quebrar, apenas as rotas protegidas falham
 *  • RequireAuth simples: loading → spinner inline, sem session → /login
 *  • Sem animações no nível do router
 */
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'

// Layout
import AppShell from './components/AppShell'

// Páginas públicas
import Login           from './pages/Login'
import CadastroEmpresa from './pages/CadastroEmpresa'
import AceiteConvite   from './pages/AceiteConvite'

// Páginas protegidas
import Dashboard    from './pages/Dashboard'
import Projetos     from './pages/Projetos'
import TelaProjeto  from './pages/TelaProjeto'
import Clientes     from './pages/Clientes'
import Agenda       from './pages/Agenda'
import CriarOrcamento from './pages/CriarOrcamento'
import Carrinho     from './pages/Carrinho'
import Financeiro   from './pages/Financeiro'
import Configuracoes from './pages/Configuracoes'
import Admin        from './pages/Admin'

// ── Guard de autenticação ───────────────────────────────────────────────────

function RequireAuth() {
  const { session, loading } = useAuth()

  // Enquanto session === undefined (getSession ainda não respondeu)
  if (loading) {
    return (
      <div style={{
        background: '#050505',
        color: '#52525b',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
      }}>
        Validando sessão...
      </div>
    )
  }

  // Sem sessão → login
  if (!session) return <Navigate to="/login" replace />

  // Com sessão → renderiza a rota filha
  return <Outlet />
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Rotas públicas ── */}
        <Route path="/login"    element={<Login />} />
        <Route path="/cadastro" element={<CadastroEmpresa />} />
        <Route path="/convite"  element={<AceiteConvite />} />

        {/* ── Rotas protegidas (auth + shell) ── */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard"                   element={<Dashboard />} />
            <Route path="/projetos"                    element={<Projetos />} />
            <Route path="/projetos/:id"                element={<TelaProjeto />} />
            <Route path="/clientes"                    element={<Clientes />} />
            <Route path="/projetos/:id/orcamento/novo" element={<CriarOrcamento />} />
            <Route path="/projetos/:id/carrinho"       element={<Carrinho />} />
            <Route path="/admin"                       element={<Admin />} />
            <Route path="/admin/financeiro"            element={<Financeiro />} />
            <Route path="/admin/configuracoes"         element={<Configuracoes />} />
            <Route path="/agenda"                      element={<Agenda />} />
          </Route>
        </Route>

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
