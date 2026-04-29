-- ============================================================
-- Migration: 20260428203238_fix_notificacoes_rls.sql
--
-- Fix: notificacoes RLS bloqueando INSERT do trigger fn_notificar_medicao_enviada
-- Causa: função foi criada sem SECURITY DEFINER no banco real, apesar da migration declarar.
--        Resultado: trigger rodava como o caller (medidor autenticado), que sem policy
--        de INSERT é bloqueado por RLS — erro "new row violates row-level security policy".
-- Solução: recriar a função como SECURITY DEFINER + criar policies SELECT/INSERT/UPDATE.
--
-- Escopo intencional:
--   • Apenas fn_notificar_medicao_enviada é recriada — é a única confirmada no banco.
--   • As demais funções de trigger (fn_notificar_admin_*, fn_processar_medicao) não
--     existem no banco; serão investigadas em sessão futura.
--
-- Reversão de emergência:
--   ALTER FUNCTION public.fn_notificar_medicao_enviada() SECURITY INVOKER;
--   DROP POLICY IF EXISTS "notificacoes_select_proprio"     ON public.notificacoes;
--   DROP POLICY IF EXISTS "notificacoes_insert_same_empresa" ON public.notificacoes;
--   DROP POLICY IF EXISTS "notificacoes_update_proprio"     ON public.notificacoes;
--   DROP FUNCTION IF EXISTS public.get_empresa_id_of_user(uuid);
-- ============================================================


-- ─── 1. Recriar fn_notificar_medicao_enviada como SECURITY DEFINER ───────────
--
-- SET search_path = public, pg_temp: previne search_path injection
-- (padrão de segurança do projeto, igual às funções get_my_empresa_id/get_my_perfil).

CREATE OR REPLACE FUNCTION public.fn_notificar_medicao_enviada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendedor_id  uuid;
  v_empresa_id   uuid;
  v_projeto_nome text;
BEGIN
  IF NEW.status <> 'enviada' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'enviada' THEN
    RETURN NEW;
  END IF;

  SELECT p.vendedor_id, p.empresa_id, p.nome
    INTO v_vendedor_id, v_empresa_id, v_projeto_nome
    FROM projetos p
   WHERE p.id = NEW.projeto_id;

  IF v_vendedor_id IS NOT NULL THEN
    INSERT INTO notificacoes (
      id, empresa_id, usuario_id, projeto_id,
      tipo, titulo, descricao, lida, created_at
    ) VALUES (
      gen_random_uuid(),
      v_empresa_id,
      v_vendedor_id,
      NEW.projeto_id,
      'medicao_processada',
      'Medição enviada pelo app',
      'O medidor enviou os dados pelo SmartStone para o projeto "' ||
        COALESCE(v_projeto_nome, 'sem nome') ||
        '". Acesse o projeto para visualizar e iniciar o orçamento.',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- O trigger já existe no banco; recriar a função basta (o trigger aponta para ela por nome).
-- DROP/CREATE do trigger seria desnecessário e causaria downtime momentâneo.


-- ─── 2. Helper: empresa_id de um usuário arbitrário ──────────────────────────
--
-- Necessário na policy de INSERT: precisamos verificar se o destinatário (usuario_id)
-- pertence à mesma empresa do autor, sem passar pelo RLS de usuarios (que bloqueia
-- leituras cruzadas para perfis não-admin).
--
-- Mesmo padrão de get_my_empresa_id() e get_my_perfil() já existentes no projeto.

CREATE OR REPLACE FUNCTION public.get_empresa_id_of_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = p_user_id
$$;

COMMENT ON FUNCTION public.get_empresa_id_of_user(uuid) IS
  'Retorna empresa_id de qualquer usuário pelo id, bypassando RLS. '
  'Usada na policy de INSERT de notificacoes para garantir isolamento multi-tenant '
  'sem depender da visibilidade restrita que não-admins têm na tabela usuarios.';

GRANT EXECUTE ON FUNCTION public.get_empresa_id_of_user(uuid) TO authenticated;


-- ─── 3. Policies de notificacoes ─────────────────────────────────────────────
--
-- RLS já está ativo (habilitado em 20260427095252_enable_rls_critical_tables.sql).
-- Não havia nenhuma policy — default DENY bloqueava tudo.

-- SELECT: cada usuário vê apenas notificações endereçadas a ele.
DROP POLICY IF EXISTS "notificacoes_select_proprio" ON public.notificacoes;
CREATE POLICY "notificacoes_select_proprio" ON public.notificacoes
  FOR SELECT
  USING (usuario_id = auth.uid());

-- INSERT: qualquer autenticado pode criar notificação, desde que:
--   (a) empresa_id da linha = empresa do autor (isolamento de tenant)
--   (b) destinatário (usuario_id) pertence à mesma empresa
-- Isso impede enviar notificações "cross-tenant" mesmo que o autor tente forçar
-- um usuario_id de outra empresa com o empresa_id correto.
DROP POLICY IF EXISTS "notificacoes_insert_same_empresa" ON public.notificacoes;
CREATE POLICY "notificacoes_insert_same_empresa" ON public.notificacoes
  FOR INSERT
  WITH CHECK (
    empresa_id = get_my_empresa_id()
    AND get_empresa_id_of_user(usuario_id) = get_my_empresa_id()
  );

-- UPDATE: apenas o destinatário atualiza (caso de uso: marcar como lida).
-- WITH CHECK idêntico ao USING: não permite mover a notificação para outro usuário.
DROP POLICY IF EXISTS "notificacoes_update_proprio" ON public.notificacoes;
CREATE POLICY "notificacoes_update_proprio" ON public.notificacoes
  FOR UPDATE
  USING  (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());
