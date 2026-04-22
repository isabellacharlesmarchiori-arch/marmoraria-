-- ============================================================
-- Migration: fix_medicoes_rls_and_notify_enviada
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── 1. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE medicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medicoes_select_by_medidor" ON medicoes;
DROP POLICY IF EXISTS "medicoes_select_empresa"    ON medicoes;
DROP POLICY IF EXISTS "medicoes_insert_empresa"    ON medicoes;
DROP POLICY IF EXISTS "medicoes_update_empresa"    ON medicoes;
DROP POLICY IF EXISTS "medicoes_delete_empresa"    ON medicoes;

CREATE POLICY "medicoes_select_empresa"
  ON medicoes FOR SELECT
  USING (
    empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
  );

CREATE POLICY "medicoes_insert_empresa"
  ON medicoes FOR INSERT
  WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
  );

CREATE POLICY "medicoes_update_empresa"
  ON medicoes FOR UPDATE
  USING (
    empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
  );

CREATE POLICY "medicoes_delete_empresa"
  ON medicoes FOR DELETE
  USING (
    empresa_id IN (SELECT empresa_id FROM perfis WHERE id = auth.uid())
  );

-- ─── 2. Função + Trigger: notificar vendedor em status='enviada' ──────────────

CREATE OR REPLACE FUNCTION fn_notificar_medicao_enviada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS tg_notificar_medicao_enviada ON medicoes;

CREATE TRIGGER tg_notificar_medicao_enviada
  AFTER INSERT OR UPDATE OF status ON medicoes
  FOR EACH ROW
  EXECUTE FUNCTION fn_notificar_medicao_enviada();

-- ─── Verificação ──────────────────────────────────────────────────────────────
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE tablename = 'medicoes'
 ORDER BY cmd;
