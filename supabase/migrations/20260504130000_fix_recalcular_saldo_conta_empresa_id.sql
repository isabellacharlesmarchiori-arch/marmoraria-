-- Corrige CVE interno [S-001]: recalcular_saldo_conta era SECURITY DEFINER sem
-- validação de empresa_id, permitindo que qualquer usuário autenticado lesse e
-- sobrescrevesse o saldo de contas de outras empresas via RPC.
-- Solução: verificar que a conta pertence à empresa do usuário chamador antes de operar.

CREATE OR REPLACE FUNCTION public.recalcular_saldo_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo_inicial  numeric(14,2);
  v_saldo_novo     numeric(14,2);
  v_empresa_caller uuid;
  v_empresa_conta  uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_caller
  FROM usuarios
  WHERE id = auth.uid();

  IF v_empresa_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa associada';
  END IF;

  SELECT empresa_id, saldo_inicial
  INTO v_empresa_conta, v_saldo_inicial
  FROM financeiro_contas
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada: %', p_conta_id;
  END IF;

  IF v_empresa_conta <> v_empresa_caller THEN
    RAISE EXCEPTION 'Acesso negado: conta não pertence à empresa do usuário';
  END IF;

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
