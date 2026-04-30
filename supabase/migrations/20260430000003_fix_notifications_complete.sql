-- Migration: 20260430000003_fix_notifications_complete.sql
--
-- Revisão completa da lógica de notificações conforme novas regras de negócio:
--
-- VENDEDOR recebe:
--   medicao_processada — medidor envia medição (Flutter ou web)
--   mensagem_admin     — admin envia mensagem manual (INSERT via frontend)
--
-- ADMIN recebe:
--   pedido_fechado     — vendedor fecha pedido (trigger já existe, mantido)
--   projeto_perdido    — vendedor marca projeto como perdido (NOVO)
--   medicao_processada — medidor do projeto envia medição (adicionado ao trigger existente)
--   mensagem_admin     — admin envia mensagem para si mesmo (raro, permitido)
--
-- MEDIDOR recebe:
--   medicao_agendada   — vendedor agenda/atribui medição a ele (INSERT via frontend)
--   mensagem_admin     — admin envia mensagem manual (INSERT via frontend)
--
-- O que muda:
--   REMOVE tg_admin_novo_orcamento    — notificação de orçamento não está nas regras
--   REMOVE tg_admin_producao_iniciada — notificação de produção não está nas regras
--   UPDATE fn_notificar_medicao_enviada — adiciona notificação para admin
--   NEW    fn_notificar_projeto_perdido + trigger

-- ─── 1. Remover triggers fora das regras ─────────────────────────────────────

DROP TRIGGER IF EXISTS tg_admin_novo_orcamento    ON orcamentos;
DROP TRIGGER IF EXISTS tg_admin_producao_iniciada ON projetos;

DROP FUNCTION IF EXISTS fn_notificar_admin_novo_orcamento();
DROP FUNCTION IF EXISTS fn_notificar_admin_producao_iniciada();

-- ─── 2. Atualizar fn_notificar_medicao_enviada (Flutter path) ────────────────
-- Adiciona notificação para o admin da empresa quando o medidor atribuído ao
-- projeto envia os dados (NEW.medidor_id IS NOT NULL).

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
  v_admin_id     uuid;
BEGIN
  IF NEW.status <> 'enviada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'enviada' THEN RETURN NEW; END IF;

  SELECT p.vendedor_id, p.empresa_id, p.nome
    INTO v_vendedor_id, v_empresa_id, v_projeto_nome
    FROM projetos p WHERE p.id = NEW.projeto_id;

  -- Notifica vendedor do projeto
  IF v_vendedor_id IS NOT NULL THEN
    INSERT INTO notificacoes (id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
    VALUES (
      gen_random_uuid(), v_empresa_id, v_vendedor_id, NEW.projeto_id,
      'medicao_processada',
      'Medição enviada pelo app',
      'O medidor enviou os dados pelo SmartStone para o projeto "' ||
        COALESCE(v_projeto_nome, 'sem nome') ||
        '". Acesse o projeto para iniciar o orçamento.',
      false, NOW()
    );
  END IF;

  -- Notifica admin somente quando a medição tinha medidor atribuído
  IF NEW.medidor_id IS NOT NULL THEN
    v_admin_id := fn_get_admin_id(v_empresa_id);
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO notificacoes (id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
      VALUES (
        gen_random_uuid(), v_empresa_id, v_admin_id, NEW.projeto_id,
        'medicao_processada',
        'Medição enviada para orçamento',
        'O medidor enviou os dados do projeto "' ||
          COALESCE(v_projeto_nome, 'sem nome') ||
          '". Aguardando orçamento do vendedor.',
        false, NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. Novo trigger: projeto marcado como perdido ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notificar_projeto_perdido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NEW.status = 'perdido' AND (OLD.status IS DISTINCT FROM 'perdido') THEN
    v_admin_id := fn_get_admin_id(NEW.empresa_id);
    IF v_admin_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO notificacoes (id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
    VALUES (
      gen_random_uuid(), NEW.empresa_id, v_admin_id, NEW.id,
      'projeto_perdido',
      'Projeto marcado como perdido',
      'O projeto "' || COALESCE(NEW.nome, '') || '" foi marcado como perdido.',
      false, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_projeto_perdido ON projetos;
CREATE TRIGGER tg_projeto_perdido
  AFTER UPDATE OF status ON projetos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_projeto_perdido();
