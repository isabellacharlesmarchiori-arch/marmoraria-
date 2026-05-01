-- ============================================================
-- Migration: 20260430000008_fix_rls_ambientes_pecas_orcamentos.sql
--
-- Problema 1 (ERRO 1 — ambMapping vazio no save de orçamento):
--   ambientes e pecas usavam o inline subquery
--     (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
--   que é o mesmo padrão que causou "zero linhas retornadas" em medicoes
--   (corrigido em 20260429134554_fix_medicoes_rls_policies.sql).
--   Com RLS ativo em `usuarios`, o PostgREST retorna data:[] sem error
--   quando a policy bloqueia — então `garantirAmbientesNoBanco` recebe
--   um array vazio, tenta criar o ambiente mas o INSERT também falha
--   pela mesma policy, e o map fica {}.
--
-- Problema 2 (ERRO 2 — row-level security policy para orcamentos):
--   A tabela orcamentos teve RLS habilitado em 20260427095252 mas as
--   policies originais foram criadas via Dashboard (provavelmente usando
--   a tabela `perfis` inexistente ou sem cobertura de INSERT),
--   bloqueando qualquer INSERT de row.
--
-- Solução: substituir todos os inline subqueries por get_my_empresa_id()
-- (SECURITY DEFINER, já existe desde 20260427100500) e garantir que
-- orcamentos tenha policy FOR ALL com USING + WITH CHECK explícito.
--
-- Trade-offs:
--   • get_my_empresa_id() é STABLE, então é cacheada dentro de uma query
--     (mais eficiente que o inline subquery avaliado por linha)
--   • Nenhuma lógica de negócio muda — isolamento por empresa continua igual
--   • DO $$ bloco para orcamentos evita depender de nomes de policies
--     criados via Dashboard (nomes imprevisíveis)
-- ============================================================

-- ─── 1. ambientes ─────────────────────────────────────────────────────────────
-- Inline subquery substituído por get_my_empresa_id(); WITH CHECK adicionado
-- explicitamente para cobrir INSERT (antes dependia do default = USING).

DROP POLICY IF EXISTS "empresa_isolamento" ON public.ambientes;

CREATE POLICY "empresa_isolamento" ON public.ambientes
  FOR ALL
  USING      (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());


-- ─── 2. pecas ─────────────────────────────────────────────────────────────────
-- Mesmo problema e mesma correção que ambientes.
-- A garantirPecasNoBanco faz SELECT + INSERT em pecas; ambos precisam funcionar.

DROP POLICY IF EXISTS "empresa_isolamento" ON public.pecas;

CREATE POLICY "empresa_isolamento" ON public.pecas
  FOR ALL
  USING      (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());


-- ─── 3. orcamentos ────────────────────────────────────────────────────────────
-- Remove TODAS as policies existentes (nomes criados via Dashboard são
-- imprevisíveis) e recria uma única policy abrangente.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'orcamentos'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orcamentos', r.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "orcamentos_empresa" ON public.orcamentos
  FOR ALL
  USING      (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());
