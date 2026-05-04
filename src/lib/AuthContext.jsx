/**
 * AuthContext — Sessão Persistente
 *
 * Regras:
 *  • sb-* nunca é removido do localStorage (são as chaves de sessão do Supabase)
 *  • inicializando = true enquanto getSession não responder → sem redirect prematuro
 *  • profileLoading SEMPRE vai a false no finally — sem travamento
 *  • Timeout de 3s destrava o app se o banco não responder
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,        setSession]        = useState(undefined) // undefined = ainda não sabe
  const [profile,        setProfile]        = useState(null)
  const [empresa,        setEmpresa]        = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // Impersonação: superadmin assume empresa/perfil de outro usuário para teste
  const [impersonation, setImpersonationState] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('sa_impersonate') ?? 'null') }
    catch { return null }
  })

  // ── 1. Limpa apenas cache de dados do app (NUNCA as chaves sb- do Supabase) ─
  useEffect(() => {
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        // sb-* = sessão do Supabase — jamais remover, senão perde login no F5
        if (k && (k.startsWith('dash_cache_') || k.startsWith('projetos_cache_'))) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch { /* ignora */ }
  }, [])

  const isSuperAdmin = profile?.perfil === 'superadmin'

  const enterImpersonation = useCallback((empresaId, perfilAlvo = 'admin') => {
    const val = { empresaId, perfil: perfilAlvo }
    sessionStorage.setItem('sa_impersonate', JSON.stringify(val))
    setImpersonationState(val)
  }, [])

  const exitImpersonation = useCallback(() => {
    sessionStorage.removeItem('sa_impersonate')
    setImpersonationState(null)
  }, [])

  // ── 2. Detecta sessão inicial e escuta mudanças de auth ──────────────────────
  useEffect(() => {
    // getSession lê o token do localStorage — resolve imediatamente se já logado
    supabase.auth.getSession()
      .then(({ data }) => setSession(data?.session ?? null))
      .catch(() => setSession(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── 3. Carrega perfil + empresa quando o userId muda ────────────────────────
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setEmpresa(null)
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)

    // Segurança: se o banco não responder em 3s, destrava o app
    const timeoutId = setTimeout(() => {
      console.error('[Auth] TIMEOUT 3s — forçando profileLoading=false')
      setProfileLoading(false)
    }, 3000)

    async function carregarPerfil() {
      try {
        const { data: perfil, error: errPerfil } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', userId)
          .single()

        if (errPerfil || !perfil) {
          console.warn('[Auth] Perfil não encontrado:', errPerfil?.message ?? 'sem dados')
          setProfile(null)
        } else {
          const nivelPermissao = perfil.role || perfil.perfil || perfil.nivel || perfil.acesso || 'vendedor'
          const perfilNormalizado = {
            ...perfil,
            perfil: perfil.perfil || nivelPermissao,
            role:   perfil.perfil || nivelPermissao,
          }

          setProfile(perfilNormalizado)
        }
      } catch (err) {
        console.error('[Auth] Exceção inesperada ao carregar perfil')
        setProfile(null)
        setEmpresa(null)
      } finally {
        clearTimeout(timeoutId)
        setProfileLoading(false)
      }
    }

    carregarPerfil()
  }, [userId])

  // ── 4. Carrega empresa separadamente — responde tanto a profile quanto a impersonação ──
  const empresaIdToLoad = isSuperAdmin && impersonation?.empresaId
    ? impersonation.empresaId
    : profile?.empresa_id ?? null

  useEffect(() => {
    if (!empresaIdToLoad) { setEmpresa(null); return }

    const camposBase = 'id, nome, cnpj, inscricao_estadual, telefone, whatsapp, email, email_contato, endereco, website, logo_url'
    const perfilEfetivo = impersonation?.perfil ?? profile?.perfil
    const sel = (perfilEfetivo === 'admin' || isSuperAdmin)
      ? camposBase + ', dados_bancarios'
      : camposBase

    supabase.from('empresas').select(sel).eq('id', empresaIdToLoad).single()
      .then(({ data, error }) => {
        if (error) console.warn('[Auth] Erro ao buscar empresa:', error.message)
        else setEmpresa(data ?? null)
      })
  }, [empresaIdToLoad, isSuperAdmin, impersonation?.perfil, profile?.perfil])

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', uid)
      .single()
    if (data) setProfile(prev => ({ ...prev, ...data, perfil: data.perfil, role: data.perfil }))
  }, [session?.user?.id])

  // Perfil efetivo: sobrescreve empresa_id e perfil quando superadmin está impersonando
  const effectiveProfile = isSuperAdmin && impersonation
    ? { ...profile, empresa_id: impersonation.empresaId, perfil: impersonation.perfil, role: impersonation.perfil }
    : profile

  // loading = true apenas enquanto não sabemos se existe sessão (getSession ainda não respondeu).
  // profileLoading é gerenciado separadamente por RequireAdmin/RequireMedidor com `return null`,
  // então NÃO incluímos profileLoading aqui — isso impede que RequireAuth desmonte o AppShell
  // (e junto com ele o canal Realtime) cada vez que o perfil começa/termina de carregar.
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{
      session,
      profile: effectiveProfile,
      actualProfile: profile,
      empresa,
      loading,
      profileLoading,
      refreshProfile,
      isSuperAdmin,
      impersonation,
      enterImpersonation,
      exitImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
