/**
 * AuthContext — Versão Ultra-Estável
 *
 * Regras:
 *  • loading começa true e vai para false UMA ÚNICA VEZ (quando getSession resolver)
 *  • onAuthStateChange só atualiza a session, não mexe no loading
 *  • Sem timeouts, sem animações, sem efeitos colaterais extras
 *  • profileLoading rastreia separadamente a busca do perfil no banco
 *  • profile nunca fica em estado indeterminado: começa null e vai para dados ou null
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]       = useState(undefined) // undefined = ainda não resolvido
  const [profile, setProfile]       = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // ── Inicialização: getSession é a única fonte da verdade para loading ──────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null)
    }).catch(() => {
      setSession(null)
    })

    // Mantém a session sincronizada em tempo real (login/logout em outra aba, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Busca o profile sempre que a session mudar ────────────────────────────
  useEffect(() => {
    if (!session) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    // Sinaliza que o perfil está sendo buscado
    setProfileLoading(true)

    supabase
      .from('usuarios')
      .select('nome, perfil, empresa_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data ?? null))
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false))
  }, [session])

  // loading é true enquanto session for undefined (antes do getSession responder)
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
