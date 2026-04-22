-- ============================================================
-- Migration: 20260422183001_financeiro_triggers.sql
--
-- Escopo: Automações de lógica de negócio do módulo financeiro.
-- Quatro blocos implementados nesta ordem:
--   1. Saldo automático de conta (trigger incremental + função full-recompute)
--   2. RT automático ao inserir fechamento
--   3. Trava de pagamento de RT/comissão até projeto quitado
--   4. Função RPC de repasse de cheque
--
-- Dependências:
--   • 20260422143409_financeiro_schema.sql — tabelas + coluna gerada valor_liquido
--   • 20260422151242_financeiro_rls.sql    — policies
--   • 20260422180816_financeiro_seed_plano_contas.sql — categoria '3.03 RT Arquitetos'
--
-- Fatos do banco confirmados via reconhecimento (22/04/2026):
--   • arquitetos NÃO tem coluna percentual_rt — source of truth: projetos.rt_padrao_percentual
--   • fechamentos.data_fechamento é date (não timestamptz)
--   • fechamentos NÃO tem updated_at
-- ============================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — SALDO AUTOMÁTICO DE CONTA
--
-- Estratégia híbrida:
--   • Trigger incremental (delta): aplica diferença de efeito financeiro a cada
--     INSERT/UPDATE/DELETE em financeiro_lancamentos — rápido, sem ler o saldo.
--   • Função full-recompute (auditoria): recalcula saldo do zero; usada em
--     conciliações mensais ou quando admin suspeita de drift acumulado.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1a. Função de recálculo completo ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalcular_saldo_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo_inicial numeric(14,2);
  v_saldo_novo    numeric(14,2);
BEGIN
  SELECT saldo_inicial INTO v_saldo_inicial
  FROM financeiro_contas
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada: %', p_conta_id;
  END IF;

  -- valor_liquido é coluna GENERATED ALWAYS AS:
  --   valor_pago - (valor_pago * taxa_percentual / 100)
  -- Já desconta taxa de cartão — é o valor que efetivamente impacta o saldo.
  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN tipo = 'entrada' THEN  valor_liquido
      WHEN tipo = 'saida'   THEN -valor_liquido
      ELSE 0
    END
  ), 0)
  INTO v_saldo_novo
  FROM financeiro_lancamentos
  WHERE conta_id = p_conta_id
    AND status IN ('pago', 'parcial');

  UPDATE financeiro_contas
  SET saldo_atual = v_saldo_novo
  WHERE id = p_conta_id;

  RETURN v_saldo_novo;
END;
$$;

COMMENT ON FUNCTION public.recalcular_saldo_conta(uuid) IS
  'Full recompute de saldo_atual: saldo_inicial + soma de valor_liquido dos lançamentos liquidados. '
  'Rede de segurança caso o trigger incremental acumule drift. Chamar via RPC em conciliações mensais.';


-- ─── 1b. Trigger incremental de saldo ────────────────────────────────────────
--
-- efeito(linha):
--   0                    — status não é 'pago'/'parcial' OU conta_id é NULL
--   +valor_liquido       — tipo = 'entrada'
--   -valor_liquido       — tipo = 'saida'
--
-- Por que UPDATE SET saldo = saldo + delta (e não SET saldo = <valor calculado>)?
-- Sob carga concorrente, duas sessões podem ler o mesmo saldo_atual e ambas
-- escreverem o valor "calculado" — a segunda sobrescreve a primeira, perdendo
-- o efeito da primeira transação. Com a expressão incremental, o banco serializa
-- atomicamente e nenhuma atualização é perdida.

CREATE OR REPLACE FUNCTION public.fn_trg_financeiro_lancamentos_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_efeito_old numeric(14,2) := 0;
  v_efeito_new numeric(14,2) := 0;
BEGIN

  -- ── DELETE: reverter efeito da linha removida ────────────────────────────
  IF TG_OP = 'DELETE' THEN
    IF OLD.conta_id IS NOT NULL AND OLD.status IN ('pago', 'parcial') THEN
      v_efeito_old := CASE
        WHEN OLD.tipo = 'entrada' THEN  OLD.valor_liquido
        WHEN OLD.tipo = 'saida'   THEN -OLD.valor_liquido
        ELSE 0
      END;
      UPDATE financeiro_contas
      SET saldo_atual = saldo_atual - v_efeito_old
      WHERE id = OLD.conta_id;
    END IF;
    RETURN OLD;
  END IF;

  -- ── INSERT: aplicar efeito da nova linha ─────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.conta_id IS NOT NULL AND NEW.status IN ('pago', 'parcial') THEN
      v_efeito_new := CASE
        WHEN NEW.tipo = 'entrada' THEN  NEW.valor_liquido
        WHEN NEW.tipo = 'saida'   THEN -NEW.valor_liquido
        ELSE 0
      END;
      UPDATE financeiro_contas
      SET saldo_atual = saldo_atual + v_efeito_new
      WHERE id = NEW.conta_id;
    END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE: calcular efeito OLD e NEW, aplicar diferença ─────────────────
  IF OLD.conta_id IS NOT NULL AND OLD.status IN ('pago', 'parcial') THEN
    v_efeito_old := CASE
      WHEN OLD.tipo = 'entrada' THEN  OLD.valor_liquido
      WHEN OLD.tipo = 'saida'   THEN -OLD.valor_liquido
      ELSE 0
    END;
  END IF;

  IF NEW.conta_id IS NOT NULL AND NEW.status IN ('pago', 'parcial') THEN
    v_efeito_new := CASE
      WHEN NEW.tipo = 'entrada' THEN  NEW.valor_liquido
      WHEN NEW.tipo = 'saida'   THEN -NEW.valor_liquido
      ELSE 0
    END;
  END IF;

  IF OLD.conta_id IS NOT DISTINCT FROM NEW.conta_id THEN
    -- Mesma conta (inclui ambas NULL): aplica delta numa operação só
    IF NEW.conta_id IS NOT NULL THEN
      UPDATE financeiro_contas
      SET saldo_atual = saldo_atual + (v_efeito_new - v_efeito_old)
      WHERE id = NEW.conta_id;
    END IF;
  ELSE
    -- Conta mudou: reverter da conta antiga, aplicar na nova
    IF OLD.conta_id IS NOT NULL THEN
      UPDATE financeiro_contas
      SET saldo_atual = saldo_atual - v_efeito_old
      WHERE id = OLD.conta_id;
    END IF;
    IF NEW.conta_id IS NOT NULL THEN
      UPDATE financeiro_contas
      SET saldo_atual = saldo_atual + v_efeito_new
      WHERE id = NEW.conta_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_financeiro_lancamentos_saldo
  AFTER INSERT OR UPDATE OR DELETE ON financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_financeiro_lancamentos_saldo();


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — RT AUTOMÁTICO AO INSERIR FECHAMENTO
--
-- AFTER INSERT em fechamentos: se projeto tem arquiteto e rt_padrao_percentual > 0,
-- cria lançamento de saída (origem='auto_rt') com bloqueado_ate_pagamento_projeto=true.
--
-- Falhas não bloqueiam o fechamento: usa RAISE WARNING (não EXCEPTION) caso a
-- categoria '3.03' não seja encontrada — o fechamento é aceito, RT fica pendente.
--
-- Fonte do %RT: projetos.rt_padrao_percentual (arquitetos NÃO tem essa coluna).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_fechamentos_gerar_rt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_projeto      record;
  v_categoria_id uuid;
  v_valor_rt     numeric(14,2);
  v_descricao    text;
BEGIN
  -- 1. Buscar projeto
  SELECT * INTO v_projeto
  FROM projetos
  WHERE id = NEW.projeto_id;

  -- 2. Sem arquiteto → sem RT (silencioso)
  IF v_projeto.arquiteto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Sem % RT ou zero → sem RT (silencioso)
  IF COALESCE(v_projeto.rt_padrao_percentual, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- 4. Calcular valor do RT
  v_valor_rt := ROUND(NEW.valor_fechado * v_projeto.rt_padrao_percentual / 100, 2);
  IF v_valor_rt <= 0 THEN
    RETURN NEW;
  END IF;

  -- 5. Buscar categoria '3.03 RT Arquitetos' da empresa
  SELECT id INTO v_categoria_id
  FROM financeiro_plano_contas
  WHERE empresa_id = NEW.empresa_id
    AND codigo     = '3.03'
    AND ativo      = true
  LIMIT 1;

  IF v_categoria_id IS NULL THEN
    -- RAISE WARNING: não bloqueia o fechamento, admin deve criar RT manualmente
    RAISE WARNING
      'Fechamento %: categoria "3.03 RT Arquitetos" não encontrada ou inativa na empresa %. '
      'Lançamento de RT não foi gerado automaticamente. '
      'Ação recomendada: reativar a categoria (ou criar se não existir, '
      'chamando seed_plano_contas_padrao) e gerar o lançamento de RT manualmente via dashboard.',
      NEW.id, NEW.empresa_id;
    RETURN NEW;
  END IF;

  -- 6. Idempotência: não duplicar se trigger disparar mais de uma vez
  IF EXISTS (
    SELECT 1 FROM financeiro_lancamentos
    WHERE fechamento_id = NEW.id AND origem = 'auto_rt'
  ) THEN
    RETURN NEW;
  END IF;

  -- 7. Montar descrição com fallback caso projeto não tenha nome
  v_descricao := 'RT - Projeto ' || COALESCE(v_projeto.nome, NEW.projeto_id::text);

  -- 8. Inserir lançamento de RT
  -- competencia = mês do data_fechamento (regime de competência: venda fechada
  --   em março paga em abril tem competencia = 2026-03-01)
  -- vencimento  = 30 dias após data_fechamento (prazo padrão de pagamento de RT)
  INSERT INTO financeiro_lancamentos (
    empresa_id,
    tipo,
    status,
    descricao,
    valor_previsto,
    data_emissao,
    data_vencimento,
    competencia,
    categoria_id,
    arquiteto_id,
    projeto_id,
    fechamento_id,
    origem,
    bloqueado_ate_pagamento_projeto,
    created_by
  ) VALUES (
    NEW.empresa_id,
    'saida',
    'pendente',
    v_descricao,
    v_valor_rt,
    CURRENT_DATE,
    NEW.data_fechamento + INTERVAL '30 days',
    date_trunc('month', NEW.data_fechamento)::date,
    v_categoria_id,
    v_projeto.arquiteto_id,
    v_projeto.id,
    NEW.id,
    'auto_rt',
    true,
    NEW.vendedor_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fechamentos_gerar_rt
  AFTER INSERT ON fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_fechamentos_gerar_rt();


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — TRAVA DE PAGAMENTO DE RT/COMISSÃO
--
-- BEFORE UPDATE em financeiro_lancamentos: impede marcar como pago/parcial
-- qualquer lançamento com bloqueado_ate_pagamento_projeto=true enquanto o
-- projeto associado não estiver totalmente quitado pelo cliente.
--
-- Critério de quitação: SUM(valor_pago das entradas do projeto) >= SUM(valor_fechado).
-- Mensagem de erro em PT-BR com valores monetários para diagnóstico pelo admin.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_financeiro_lancamentos_trava_rt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valor_fechado_total numeric(14,2);
  v_total_pago          numeric(14,2);
BEGIN
  -- Atua apenas na transição: bloqueado + status pendente/atrasado → pago/parcial
  IF NOT (
    OLD.bloqueado_ate_pagamento_projeto = true
    AND NEW.status IN ('pago', 'parcial')
    AND OLD.status NOT IN ('pago', 'parcial')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.projeto_id IS NULL THEN
    RAISE EXCEPTION
      'Lançamento bloqueado (id: %) não tem projeto vinculado. '
      'Vincule um projeto antes de liquidar.', NEW.id;
  END IF;

  -- Valor total do fechamento do projeto (o que o cliente deve pagar)
  SELECT COALESCE(SUM(valor_fechado), 0)
  INTO v_valor_fechado_total
  FROM fechamentos
  WHERE projeto_id = NEW.projeto_id;

  IF v_valor_fechado_total = 0 THEN
    RAISE EXCEPTION
      'Projeto (id: %) não possui fechamento registrado. '
      'RT/comissão só pode ser pago após fechamento do projeto.', NEW.projeto_id;
  END IF;

  -- Total já pago pelo cliente (entradas liquidadas do projeto)
  SELECT COALESCE(SUM(valor_pago), 0)
  INTO v_total_pago
  FROM financeiro_lancamentos
  WHERE projeto_id = NEW.projeto_id
    AND tipo       = 'entrada'
    AND status     IN ('pago', 'parcial');

  IF v_total_pago < v_valor_fechado_total THEN
    RAISE EXCEPTION
      'Não é possível pagar RT/comissão: projeto ainda não quitado. '
      'Total pago pelo cliente: R$ %. Total do fechamento: R$ %. '
      'Diferença pendente: R$ %.',
      v_total_pago,
      v_valor_fechado_total,
      (v_valor_fechado_total - v_total_pago);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_financeiro_lancamentos_trava_rt
  BEFORE UPDATE ON financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_financeiro_lancamentos_trava_rt();


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — RPC: REPASSE DE CHEQUE
--
-- Encapsula o repasse em uma única transação atômica:
--   1. Valida cheque (existe, em_maos, mesma empresa, perfil admin)
--   2. Cria lançamento de saída (status='pago')
--   3. Atualiza cheque → 'repassado'
--   4. Liquida lançamento de entrada original (status='pago')
--   5. Cria duplo vínculo lancamento_vinculado_id entre entrada e saída
--
-- Decisão sobre conta_id na entrada liquidada:
--   O constraint fl_conta_obrigatoria_quando_pago exige conta_id NOT NULL quando
--   status='pago'. A entrada recebe p_conta_id (mesma conta da saída).
--   O trigger de saldo aplica +cheque.valor (entrada) e −cheque.valor (saída)
--   na mesma conta → efeito líquido = zero. Esse é o comportamento contábil
--   correto: o dinheiro transitou pelo caixa e foi imediatamente repassado.
--
-- SECURITY DEFINER: bypassa RLS para executar updates entre tabelas.
--   Compensado por verificações explícitas de empresa_id e perfil='admin'.
--
-- EFEITO COLATERAL IMPORTANTE:
--   Ao repassar, o lançamento de entrada original é marcado como 'pago' com
--   valor_pago = valor_previsto. Se esse lançamento pertence a um projeto
--   e quita o saldo devido, a trava de RT (Bloco 3) passa a considerar o
--   projeto como totalmente pago — liberando pagamento de RT/comissão
--   mesmo que o dinheiro tenha sido repassado diretamente ao fornecedor.
--   Isso está correto contabilmente: cliente cumpriu sua obrigação entregando
--   o título, independentemente do que a marmoraria fez com ele depois.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.repassar_cheque(
  p_cheque_id              uuid,
  p_parceiro_fornecedor_id uuid,
  p_categoria_id           uuid,
  p_conta_id               uuid,
  p_data_pagamento         date DEFAULT CURRENT_DATE,
  p_descricao              text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cheque             record;
  v_lancamento_entrada record;
  v_saida_id           uuid;
  v_usuario_empresa_id uuid;
  v_usuario_perfil     text;
BEGIN
  -- Validação de autenticação, perfil e empresa
  SELECT empresa_id, perfil
  INTO v_usuario_empresa_id, v_usuario_perfil
  FROM usuarios
  WHERE id = auth.uid();

  IF v_usuario_perfil IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Apenas admin pode repassar cheques.';
  END IF;

  -- 1. Buscar e validar cheque
  SELECT * INTO v_cheque
  FROM financeiro_cheques
  WHERE id = p_cheque_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cheque não encontrado: %', p_cheque_id;
  END IF;

  IF v_cheque.empresa_id != v_usuario_empresa_id THEN
    RAISE EXCEPTION 'Cheque pertence a outra empresa.';
  END IF;

  IF v_cheque.status != 'em_maos' THEN
    RAISE EXCEPTION
      'Cheque não está em mãos (status atual: %). '
      'Somente cheques com status "em_maos" podem ser repassados.',
      v_cheque.status;
  END IF;

  -- 2. Buscar e validar lançamento de entrada original
  SELECT * INTO v_lancamento_entrada
  FROM financeiro_lancamentos
  WHERE id = v_cheque.lancamento_id;

  IF v_lancamento_entrada.tipo != 'entrada' THEN
    RAISE EXCEPTION 'Lançamento vinculado ao cheque não é do tipo "entrada".';
  END IF;

  IF v_lancamento_entrada.status NOT IN ('pendente', 'parcial') THEN
    RAISE EXCEPTION
      'Lançamento de entrada original já está liquidado (status: %). Repasse não permitido.',
      v_lancamento_entrada.status;
  END IF;

  -- 3. Criar lançamento de saída (o repasse)
  INSERT INTO financeiro_lancamentos (
    empresa_id,
    tipo,
    status,
    descricao,
    valor_previsto,
    valor_pago,
    data_emissao,
    data_vencimento,
    data_pagamento,
    competencia,
    categoria_id,
    parceiro_id,
    conta_id,
    forma_pagamento,
    origem,
    observacoes,
    created_by
  ) VALUES (
    v_cheque.empresa_id,
    'saida',
    'pago',
    COALESCE(p_descricao, 'Repasse cheque nº ' || v_cheque.numero_cheque),
    v_cheque.valor,
    v_cheque.valor,
    CURRENT_DATE,
    p_data_pagamento,
    p_data_pagamento,
    date_trunc('month', p_data_pagamento)::date,
    p_categoria_id,
    p_parceiro_fornecedor_id,
    p_conta_id,
    'cheque',
    'repasse_cheque',
    'Repasse do cheque ' || v_cheque.numero_cheque
      || ' (titular: ' || v_cheque.titular || ')',
    auth.uid()
  )
  RETURNING id INTO v_saida_id;

  -- 4. Atualizar cheque para 'repassado'
  UPDATE financeiro_cheques SET
    status                = 'repassado',
    lancamento_repasse_id = v_saida_id,
    updated_at            = now()
  WHERE id = p_cheque_id;

  -- 5. Liquidar lançamento de entrada original e vincular à saída
  -- conta_id = p_conta_id: exigido por fl_conta_obrigatoria_quando_pago.
  -- Efeito no saldo: trigger soma +valor (entrada) − valor (saída) = 0.
  UPDATE financeiro_lancamentos SET
    status                  = 'pago',
    valor_pago              = valor_previsto,
    data_pagamento          = p_data_pagamento,
    conta_id                = p_conta_id,
    lancamento_vinculado_id = v_saida_id
  WHERE id = v_cheque.lancamento_id;

  -- 6. Duplo vínculo: saída aponta de volta para a entrada
  UPDATE financeiro_lancamentos SET
    lancamento_vinculado_id = v_cheque.lancamento_id
  WHERE id = v_saida_id;

  RETURN v_saida_id;
END;
$$;

COMMENT ON FUNCTION public.repassar_cheque(uuid, uuid, uuid, uuid, date, text) IS
  'Repassa cheque em mãos para fornecedor em transação atômica: '
  'cria saída, liquida entrada, marca cheque como repassado, cria duplo vínculo. '
  'Efeito líquido no saldo = zero (entrada e saída se cancelam na mesma conta). '
  'SECURITY DEFINER — requer perfil admin.';


-- ─── Grants para funções RPC ──────────────────────────────────────────────────
-- Funções de trigger (fn_trg_*) são internas — não precisam de GRANT.

GRANT EXECUTE ON FUNCTION public.recalcular_saldo_conta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repassar_cheque(uuid, uuid, uuid, uuid, date, text) TO authenticated;


/*
════════════════════════════════════════════════════════════════
  TESTES MANUAIS — rodar no SQL Editor do Supabase.
  Substitua os UUIDs pelos valores reais do banco.
  Rode um cenário por vez e verifique o resultado antes do próximo.

  UUIDs necessários:
    UUID_EMPRESA, UUID_CONTA, UUID_PROJETO (com arquiteto + rt_padrao_percentual=10),
    UUID_PROJETO_SEM_ARQUITETO, UUID_ARQUITETO, UUID_VENDEDOR, UUID_CLIENTE,
    UUID_CATEGORIA_RT (codigo='3.03'), UUID_CATEGORIA_ENTRADA, UUID_CATEGORIA_SAIDA,
    UUID_PARCEIRO_FORNECEDOR, UUID_FORMA_PAGAMENTO
════════════════════════════════════════════════════════════════

-- ── Cenário 1: Lançamento pago de entrada sobe saldo ─────────────────────
-- Pré: conta com saldo_inicial=1000.

  INSERT INTO financeiro_lancamentos (
    empresa_id, tipo, status, descricao, valor_previsto, valor_pago,
    data_vencimento, competencia, categoria_id, conta_id, data_pagamento
  ) VALUES (
    'UUID_EMPRESA', 'entrada', 'pago', 'Teste entrada 500', 500, 500,
    CURRENT_DATE, date_trunc('month', CURRENT_DATE)::date,
    'UUID_CATEGORIA_ENTRADA', 'UUID_CONTA', CURRENT_DATE
  );
  SELECT saldo_atual FROM financeiro_contas WHERE id = 'UUID_CONTA';
  -- Esperado: 1500.00


-- ── Cenário 2: Cancelar lançamento devolve saldo ──────────────────────────
-- (use UUID do lançamento criado no cenário 1)

  UPDATE financeiro_lancamentos
  SET status = 'cancelado'
  WHERE id = 'UUID_LANCAMENTO_CENARIO_1';
  SELECT saldo_atual FROM financeiro_contas WHERE id = 'UUID_CONTA';
  -- Esperado: 1000.00


-- ── Cenário 3: recalcular_saldo_conta retorna mesmo valor do trigger ──────

  SELECT public.recalcular_saldo_conta('UUID_CONTA');
  -- Esperado: 1000.00


-- ── Cenário 4: Fechamento com arquiteto gera RT automático ───────────────
-- Pré: UUID_PROJETO com arquiteto_id e rt_padrao_percentual=10.

  INSERT INTO fechamentos (
    empresa_id, projeto_id, vendedor_id, data_fechamento,
    valor_fechado, forma_pagamento_id, dados_pagamento
  ) VALUES (
    'UUID_EMPRESA', 'UUID_PROJETO', 'UUID_VENDEDOR',
    CURRENT_DATE, 10000, 'UUID_FORMA_PAGAMENTO', '{}'
  );
  SELECT id, descricao, valor_previsto, origem, bloqueado_ate_pagamento_projeto
  FROM financeiro_lancamentos
  WHERE origem = 'auto_rt' AND projeto_id = 'UUID_PROJETO';
  -- Esperado: 1 linha, valor_previsto=1000.00, bloqueado=true


-- ── Cenário 5: Fechamento sem arquiteto não gera RT (silencioso) ──────────

  INSERT INTO fechamentos (
    empresa_id, projeto_id, vendedor_id, data_fechamento,
    valor_fechado, forma_pagamento_id, dados_pagamento
  ) VALUES (
    'UUID_EMPRESA', 'UUID_PROJETO_SEM_ARQUITETO', 'UUID_VENDEDOR',
    CURRENT_DATE, 10000, 'UUID_FORMA_PAGAMENTO', '{}'
  );
  SELECT COUNT(*) FROM financeiro_lancamentos
  WHERE origem = 'auto_rt' AND projeto_id = 'UUID_PROJETO_SEM_ARQUITETO';
  -- Esperado: 0


-- ── Cenário 6: Trava impede pagar RT com projeto não quitado ─────────────
-- (use o lançamento auto_rt do cenário 4 — projeto ainda sem entradas pagas)

  UPDATE financeiro_lancamentos
  SET status = 'pago', conta_id = 'UUID_CONTA',
      data_pagamento = CURRENT_DATE, valor_pago = valor_previsto
  WHERE origem = 'auto_rt' AND projeto_id = 'UUID_PROJETO';
  -- Esperado: ERROR — "Não é possível pagar RT/comissão: projeto ainda não quitado..."


-- ── Cenário 7: Após quitar projeto, pagar RT funciona ────────────────────

  INSERT INTO financeiro_lancamentos (
    empresa_id, tipo, status, descricao, valor_previsto, valor_pago,
    data_vencimento, competencia, categoria_id, conta_id, data_pagamento,
    projeto_id, cliente_id
  ) VALUES (
    'UUID_EMPRESA', 'entrada', 'pago', 'Pagamento cliente', 10000, 10000,
    CURRENT_DATE, date_trunc('month', CURRENT_DATE)::date,
    'UUID_CATEGORIA_ENTRADA', 'UUID_CONTA', CURRENT_DATE,
    'UUID_PROJETO', 'UUID_CLIENTE'
  );
  UPDATE financeiro_lancamentos
  SET status = 'pago', conta_id = 'UUID_CONTA',
      data_pagamento = CURRENT_DATE, valor_pago = valor_previsto
  WHERE origem = 'auto_rt' AND projeto_id = 'UUID_PROJETO';
  -- Esperado: UPDATE bem-sucedido (sem erro)


-- ── Cenário 8: Repasse de cheque ─────────────────────────────────────────
-- Pré: cheque com status='em_maos' vinculado a lançamento 'pendente'.

  SELECT public.repassar_cheque(
    'UUID_CHEQUE',
    'UUID_PARCEIRO_FORNECEDOR',
    'UUID_CATEGORIA_SAIDA',
    'UUID_CONTA',
    CURRENT_DATE,
    NULL
  );
  SELECT status FROM financeiro_cheques WHERE id = 'UUID_CHEQUE';
  -- Esperado: 'repassado'
  SELECT status, conta_id FROM financeiro_lancamentos
  WHERE id = 'UUID_LANCAMENTO_ENTRADA_DO_CHEQUE';
  -- Esperado: status='pago', conta_id=UUID_CONTA
  SELECT saldo_atual FROM financeiro_contas WHERE id = 'UUID_CONTA';
  -- Esperado: saldo inalterado (efeito líquido = zero)


-- ── Cenário 9: Tentar repassar cheque já repassado retorna erro ───────────

  SELECT public.repassar_cheque(
    'UUID_CHEQUE',
    'UUID_PARCEIRO_FORNECEDOR',
    'UUID_CATEGORIA_SAIDA',
    'UUID_CONTA',
    CURRENT_DATE,
    NULL
  );
  -- Esperado: ERROR — 'Cheque não está em mãos (status atual: repassado)...'

*/


-- ─── Próxima migration esperada ──────────────────────────────────────────────
-- Não há próxima migration obrigatória definida para o módulo financeiro.
-- Possíveis evoluções futuras:
--   • Job pg_cron para marcar lançamentos como 'atrasado' (data_vencimento < today)
--   • Trigger de notificação ao arquiteto quando RT for liberado para pagamento
--   • Trigger de atualização de projetos.status baseada em lançamentos liquidados
