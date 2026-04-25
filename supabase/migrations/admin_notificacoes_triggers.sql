-- Função auxiliar: busca o usuario_id do admin da empresa
CREATE OR REPLACE FUNCTION fn_get_admin_id(p_empresa_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM usuarios WHERE empresa_id = p_empresa_id AND perfil = 'admin' LIMIT 1;
$$;

-- ── TRIGGER 1: Novo orçamento criado ─────────────────────────────────────────
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

  INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, descricao, lida, created_at)
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

DROP TRIGGER IF EXISTS tg_admin_novo_orcamento ON orcamentos;
CREATE TRIGGER tg_admin_novo_orcamento
  AFTER INSERT ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_admin_novo_orcamento();

-- ── TRIGGER 2: Pedido fechado (status_pedido = 'FECHADO') ────────────────────
CREATE OR REPLACE FUNCTION fn_notificar_admin_pedido_fechado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NEW.status_pedido = 'FECHADO' AND (OLD.status_pedido IS DISTINCT FROM 'FECHADO') THEN
    v_admin_id := fn_get_admin_id(NEW.empresa_id);
    IF v_admin_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, descricao, lida, created_at)
    VALUES(gen_random_uuid(), NEW.empresa_id, v_admin_id, NEW.id,
           'pedido_fechado',
           'Pedido fechado',
           'O pedido do projeto "' || COALESCE(NEW.nome,'') || '" foi fechado.',
           false, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_pedido_fechado ON projetos;
CREATE TRIGGER tg_admin_pedido_fechado
  AFTER UPDATE OF status_pedido ON projetos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_admin_pedido_fechado();

-- ── TRIGGER 3: Produção iniciada (status = 'produzindo') ────────────────────
CREATE OR REPLACE FUNCTION fn_notificar_admin_producao_iniciada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NEW.status = 'produzindo' AND (OLD.status IS DISTINCT FROM 'produzindo') THEN
    v_admin_id := fn_get_admin_id(NEW.empresa_id);
    IF v_admin_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO notificacoes(id, empresa_id, usuario_id, projeto_id, tipo, titulo, descricao, lida, created_at)
    VALUES(gen_random_uuid(), NEW.empresa_id, v_admin_id, NEW.id,
           'producao_iniciada',
           'Produção iniciada',
           'O projeto "' || COALESCE(NEW.nome,'') || '" entrou em produção.',
           false, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_producao_iniciada ON projetos;
CREATE TRIGGER tg_admin_producao_iniciada
  AFTER UPDATE OF status ON projetos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_admin_producao_iniciada();
