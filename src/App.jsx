import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'

// Layout
import AppShell from './components/AppShell'

// Páginas públicas — carregadas imediatamente (rota de entrada)
import Login           from './pages/Login'
import CadastroEmpresa from './pages/CadastroEmpresa'
import AceiteConvite   from './pages/AceiteConvite'

// Páginas protegidas — carregadas sob demanda (code splitting)
const Dashboard            = lazy(() => import('./pages/Dashboard'))
const ProjetosAdminV2      = lazy(() => import('./pages/ProjetosAdminV2'))
const TelaProjeto          = lazy(() => import('./pages/TelaProjeto'))        // carrega jsPDF só ao abrir projeto
const Clientes             = lazy(() => import('./pages/Clientes'))
const Agenda               = lazy(() => import('./pages/Agenda'))
const CriarOrcamento       = lazy(() => import('./pages/CriarOrcamento'))
const Carrinho             = lazy(() => import('./pages/Carrinho'))
const Financeiro             = lazy(() => import('./pages/Financeiro'))
const FinanceiroVisaoGeral   = lazy(() => import('./pages/financeiro/FinanceiroVisaoGeral'))
const FinanceiroDashboard    = lazy(() => import('./pages/financeiro/FinanceiroDashboard'))
const FinanceiroLancamentos  = lazy(() => import('./pages/financeiro/FinanceiroLancamentos'))
const FinanceiroContas       = lazy(() => import('./pages/financeiro/FinanceiroContas'))
const FinanceiroCheques      = lazy(() => import('./pages/financeiro/FinanceiroCheques'))
const FinanceiroRelatorios   = lazy(() => import('./pages/financeiro/FinanceiroRelatorios'))
const Configuracoes        = lazy(() => import('./pages/Configuracoes'))
const Admin                = lazy(() => import('./pages/Admin'))
const Notificacoes         = lazy(() => import('./pages/Notificacoes'))
const PainelMedidor        = lazy(() => import('./pages/PainelMedidor'))
const MedidorAgenda        = lazy(() => import('./pages/MedidorAgenda'))
const MedidorHistorico     = lazy(() => import('./pages/MedidorHistorico'))
const MedidorNotificacoes  = lazy(() => import('./pages/MedidorNotificacoes'))

// Fallback de Suspense — fundo escuro sem piscar
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 24, height: 24,
        border: '2px solid #27272a',
        borderTopColor: '#facc15',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

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

        {/* ── Rotas protegidas (auth + shell + code splitting) ── */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<Suspense fallback={<PageLoader />}><Outlet /></Suspense>}>
              <Route path="/dashboard"                   element={<Dashboard />} />
              <Route path="/projetos"                    element={<ProjetosAdminV2 />} />
              <Route path="/projetos/:id"                element={<TelaProjeto />} />
              <Route path="/clientes"                    element={<Clientes />} />
              <Route path="/notificacoes"                element={<Notificacoes />} />
              <Route path="/projetos/:id/orcamento/novo" element={<CriarOrcamento />} />
              <Route path="/projetos/:id/carrinho"       element={<Carrinho />} />
              <Route path="/admin"                       element={<Admin />} />
              <Route path="/admin/projetos"              element={<ProjetosAdminV2 />} />
              <Route path="/admin/clientes"              element={<Clientes />} />
              <Route path="/admin/financeiro" element={<Financeiro />}>
                <Route index                    element={<FinanceiroVisaoGeral />} />
                <Route path="dashboard"         element={<FinanceiroDashboard />} />
                <Route path="lancamentos"       element={<FinanceiroLancamentos />} />
                <Route path="contas"            element={<FinanceiroContas />} />
                <Route path="cheques"           element={<FinanceiroCheques />} />
                <Route path="relatorios"        element={<FinanceiroRelatorios />} />
              </Route>
              <Route path="/admin/configuracoes"         element={<Configuracoes />} />
              <Route path="/agenda"                      element={<Agenda />} />
              {/* ── Rotas do Medidor ── */}
              <Route path="/medidor"                     element={<PainelMedidor />} />
              <Route path="/medidor/agenda"              element={<MedidorAgenda />} />
              <Route path="/medidor/historico"           element={<MedidorHistorico />} />
              <Route path="/medidor/notificacoes"        element={<MedidorNotificacoes />} />
            </Route>
          </Route>
        </Route>

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
