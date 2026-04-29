-- ============================================================
-- Migration: 20260428204135_fix_fn_notificar_medicao_enviada_columns.sql
--
-- Motivo: ao testar o envio de medição pelo app Flutter após a migration
-- 20260428203238_fix_notificacoes_rls.sql, o trigger explodiu com:
--   ERROR: column "projeto_id" of relation "notificacoes" does not exist
--
-- Schema real da tabela notificacoes (verificado direto no banco):
--   id, empresa_id, usuario_id, tipo, titulo, corpo, lida, created_at
--
-- O que estava errado na função anterior:
--   (a) projeto_id estava na lista de colunas e no VALUES — coluna inexistente
--   (b) descricao estava sendo usado — coluna inexistente, o nome correto é corpo
--
-- Esta migration corrige os dois erros mantendo todo o resto idêntico:
--   SECURITY DEFINER, SET search_path, mesma lógica de guarda de status.
-- ============================================================

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
      id, empresa_id, usuario_id,
      tipo, titulo, corpo, lida, created_at
    ) VALUES (
      gen_random_uuid(),
      v_empresa_id,
      v_vendedor_id,
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
