-- Migration: 20260430000002_fix_admin_triggers_descricao_to_corpo.sql
--
-- Corrige as 3 funções de trigger de notificação de admin.
-- Coluna "descricao" não existe na tabela notificacoes — o nome correto é "corpo".
-- Todos os triggers e lógica de guarda permanecem idênticos; só o nome da coluna muda.
--
-- Pré-requisito: migration 20260430000001 (ADD COLUMN projeto_id) já aplicada,
-- pois esses INSERTs também referenciam projeto_id.

-- ── TRIGGER 1: Novo orçamento criado ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_notificar_admin_novo_orcamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id   uuid;
  v_empresa_id uuid;
  v_proj_nome  text;
BEGIN
  SELECT p.empresa_id, p.nome INTO v_empresa_id, v_proj_nome
    FROM ambientes a JOIN projetos p ON p.id = a.projeto_id
   WHERE a.id = NEW.ambiente_id;

  v_admin_id := fn_get_admin_id(v_empresa_id);
  IF v_admin_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
  SELECT gen_random_uuid(), v_empresa_id, v_admin_id, p.id,
         'novo_orcamento',
         'Novo orçamento criado',
         'Um orçamento foi criado para o projeto "' || COALESCE(v_proj_nome,'') || '".',
         false, NOW()
    FROM ambientes a JOIN projetos p ON p.id = a.projeto_id
   WHERE a.id = NEW.ambiente_id;

  RETURN NEW;
END;
$$;

-- ── TRIGGER 2: Pedido fechado (status_pedido = 'FECHADO') ───────────────────
CREATE OR REPLACE FUNCTION fn_notificar_admin_pedido_fechado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NEW.status_pedido = 'FECHADO' AND (OLD.status_pedido IS DISTINCT FROM 'FECHADO') THEN
    v_admin_id := fn_get_admin_id(NEW.empresa_id);
    IF v_admin_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
    VALUES(gen_random_uuid(), NEW.empresa_id, v_admin_id, NEW.id,
           'pedido_fechado',
           'Pedido fechado',
           'O pedido do projeto "' || COALESCE(NEW.nome,'') || '" foi fechado.',
           false, NOW());
  END IF;
  RETURN NEW;
END;
$$;

-- ── TRIGGER 3: Produção iniciada (status = 'produzindo') ───────────────────
CREATE OR REPLACE FUNCTION fn_notificar_admin_producao_iniciada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NEW.status = 'produzindo' AND (OLD.status IS DISTINCT FROM 'produzindo') THEN
    v_admin_id := fn_get_admin_id(NEW.empresa_id);
    IF v_admin_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, corpo, lida, created_at)
    VALUES(gen_random_uuid(), NEW.empresa_id, v_admin_id, NEW.id,
           'producao_iniciada',
           'Produção iniciada',
           'O projeto "' || COALESCE(NEW.nome,'') || '" entrou em produção.',
           false, NOW());
  END IF;
  RETURN NEW;
END;
$$;
