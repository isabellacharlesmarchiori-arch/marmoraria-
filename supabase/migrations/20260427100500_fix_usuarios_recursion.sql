-- ============================================================
-- Migration: 20260427100500_fix_usuarios_recursion.sql
--
-- Problema: "infinite recursion detected in policy for relation usuarios"
-- após habilitar RLS na tabela usuarios (migration 20260427095252).
--
-- Causa raiz: as policies de usuarios continham subqueries que liam a
-- própria tabela usuarios, criando recursão infinita:
--
--   USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()))
--                                             ^^^^^^^^
--   Para avaliar essa policy, o banco consulta usuarios.
--   Para consultar usuarios, o banco avalia a policy novamente. Loop.
--
-- Por que apenas usuarios quebrou (e não clientes, projetos etc.)?
-- As tabelas configuradas via Dashboard usam a tabela `profiles`
-- (gerenciada pelo Supabase Auth, com policy simples USING auth.uid() = id),
-- não `usuarios`. Portanto não há recursão nelas.
--
-- Solução: duas funções SECURITY DEFINER que leem usuarios bypassando
-- o RLS — é exatamente o ponto. Sem o bypass, o loop não é quebrado.
-- As policies passam a chamar as funções no lugar das subqueries.
--
-- Reversão de emergência:
--   DROP FUNCTION IF EXISTS public.get_my_empresa_id();
--   DROP FUNCTION IF EXISTS public.get_my_perfil();
--   (recriar as 4 policies originais com as subqueries antigas)
-- ============================================================


-- ─── 1. Funções helper SECURITY DEFINER ──────────────────────────────────────

-- Retorna o empresa_id do usuário autenticado, bypassando RLS.
-- STABLE: o banco pode cachear o resultado dentro de uma mesma query
-- (performance: evita N lookups em tabela com N policies sendo avaliadas).
CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_empresa_id() IS
  'Retorna empresa_id do usuário autenticado bypassando RLS. '
  'Usada em policies de usuarios para evitar recursão infinita.';

-- Retorna o perfil ('admin', 'vendedor', 'medidor') do usuário autenticado,
-- bypassando RLS. Mesmas garantias de STABLE + SECURITY DEFINER acima.
CREATE OR REPLACE FUNCTION public.get_my_perfil()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT perfil FROM public.usuarios WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_perfil() IS
  'Retorna perfil do usuário autenticado bypassando RLS. '
  'Usada em policies de usuarios para evitar recursão infinita.';

-- Grant: authenticated precisa de EXECUTE para chamar as funções dentro
-- das policies (a policy é avaliada no contexto do role chamante).
GRANT EXECUTE ON FUNCTION public.get_my_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_perfil()     TO authenticated;


-- ─── 2. DROP das policies problemáticas ──────────────────────────────────────

DROP POLICY IF EXISTS "usuarios_select"       ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update"       ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin" ON public.usuarios;


-- ─── 3. Recriar policies usando as funções (sem subquery recursiva) ───────────

-- SELECT: admin vê todos os usuários da empresa; outros vêem apenas a si mesmos.
CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT
  USING (
    empresa_id = get_my_empresa_id()
    AND (get_my_perfil() = 'admin' OR id = auth.uid())
  );

-- INSERT: apenas admin pode criar novos usuários na empresa.
-- WITH CHECK garante que o novo registro pertença à mesma empresa do admin.
CREATE POLICY "usuarios_insert_admin" ON public.usuarios
  FOR INSERT
  WITH CHECK (
    empresa_id = get_my_empresa_id()
    AND get_my_perfil() = 'admin'
  );

-- UPDATE: admin atualiza qualquer usuário da empresa; outros atualizam
-- apenas o próprio registro. WITH CHECK impede mover usuário para outra empresa.
CREATE POLICY "usuarios_update" ON public.usuarios
  FOR UPDATE
  USING (
    empresa_id = get_my_empresa_id()
    AND (get_my_perfil() = 'admin' OR id = auth.uid())
  )
  WITH CHECK (
    empresa_id = get_my_empresa_id()
  );

-- DELETE: apenas admin pode remover usuários da empresa.
CREATE POLICY "usuarios_delete_admin" ON public.usuarios
  FOR DELETE
  USING (
    empresa_id = get_my_empresa_id()
    AND get_my_perfil() = 'admin'
  );
