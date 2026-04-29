-- Migration: fix_medicoes_rls_policies
-- Corrige policies de medicoes que referenciavam tabela 'perfis' inexistente.
-- RLS estava ativo mas sem policy válida = zero linhas retornadas para qualquer usuário.
-- Execute no Supabase Dashboard > SQL Editor

DROP POLICY IF EXISTS "medicoes_select_empresa" ON public.medicoes;
DROP POLICY IF EXISTS "medicoes_insert_empresa" ON public.medicoes;
DROP POLICY IF EXISTS "medicoes_update_empresa" ON public.medicoes;
DROP POLICY IF EXISTS "medicoes_delete_empresa" ON public.medicoes;

CREATE POLICY "medicoes_select_empresa" ON public.medicoes
  FOR SELECT USING (empresa_id = get_my_empresa_id());

CREATE POLICY "medicoes_insert_empresa" ON public.medicoes
  FOR INSERT WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "medicoes_update_empresa" ON public.medicoes
  FOR UPDATE USING (empresa_id = get_my_empresa_id());

CREATE POLICY "medicoes_delete_empresa" ON public.medicoes
  FOR DELETE USING (empresa_id = get_my_empresa_id());
