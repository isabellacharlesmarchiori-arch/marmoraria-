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
      if (keysToRemove.length) console.log('[Auth] Cache de dados limpo:', keysToRemove.length, 'chaves')
    } catch { /* ignora */ }
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

          if (perfilNormalizado.empresa_id) {
            const { data: emp, error: errEmp } = await supabase
              .from('empresas')
              .select('id, nome, cnpj, inscricao_estadual, telefone, whatsapp, email, email_contato, endereco, website, logo_url, dados_bancarios')
              .eq('id', perfilNormalizado.empresa_id)
              .single()

            if (errEmp) {
              console.warn('[Auth] Erro ao buscar empresa:', errEmp.message)
            } else {
              setEmpresa(emp ?? null)
            }
          }
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

  // loading = true enquanto getSession ainda não respondeu (session === undefined)
  // RequireAuth aguarda loading=false antes de decidir redirecionar ou não
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, empresa, loading, profileLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
