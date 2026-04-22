-- ============================================================
-- Migration: 20260422180816_financeiro_seed_plano_contas.sql
--
-- Escopo: Seed do plano de contas padrão para marmorarias.
-- Cria a função seed_plano_contas_padrao(uuid) e a aplica para
-- todas as empresas existentes no banco no momento da execução.
--
-- Dependências:
--   • financeiro_plano_contas (20260422143409_financeiro_schema.sql)
--   • Unique index parcial financeiro_plano_contas_empresa_codigo_uidx
--
-- ATENÇÃO — categoria crítica:
--   Código '3.03' (RT Arquitetos) será referenciado por código pelo
--   trigger de RT automático na próxima migration (financeiro_triggers.sql).
--   NÃO renomeie nem altere o código desta categoria.
--
-- Idempotência:
--   Re-rodar a migration não cria duplicatas.
--   Cada INSERT usa ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING.
--   O id do pai é resolvido via SELECT após o INSERT, garantindo que tanto
--   a primeira execução quanto re-execuções usem o id correto.
--
-- Estrutura: 31 categorias por empresa em 5 grupos
--   1. Receitas (8 nós)
--   2. Despesas Fixas (8 nós)
--   3. Despesas Variáveis (7 nós)
--   4. Impostos (4 nós)
--   5. Tarifas Bancárias e Financeiras (4 nós)
-- ============================================================


-- ─── Função seed_plano_contas_padrao ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_plano_contas_padrao(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_1    uuid;  -- Receitas
  v_1_1  uuid;  -- Receita de Vendas
  v_1_2  uuid;  -- Outras Receitas
  v_2    uuid;  -- Despesas Fixas
  v_3    uuid;  -- Despesas Variáveis
  v_4    uuid;  -- Impostos
  v_5    uuid;  -- Tarifas Bancárias e Financeiras
BEGIN

  -- ── 1. RECEITAS ────────────────────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, aceita_lancamento)
  VALUES
    (p_empresa_id, '1', 'Receitas', 'receita', false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_1
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '1';

  -- 1.1 Receita de Vendas
  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '1.1', 'Receita de Vendas', 'receita', v_1, false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_1_1
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '1.1';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '1.1.01', 'Venda de Pedras',           'receita', v_1_1, true),
    (p_empresa_id, '1.1.02', 'Venda de Produtos Avulsos', 'receita', v_1_1, true),
    (p_empresa_id, '1.1.03', 'Serviços de Instalação',    'receita', v_1_1, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  -- 1.2 Outras Receitas
  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '1.2', 'Outras Receitas', 'receita', v_1, false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_1_2
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '1.2';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '1.2.01', 'Receitas Financeiras', 'receita', v_1_2, true),
    (p_empresa_id, '1.2.02', 'Outras Receitas',      'receita', v_1_2, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  -- ── 2. DESPESAS FIXAS ──────────────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, aceita_lancamento)
  VALUES
    (p_empresa_id, '2', 'Despesas Fixas', 'despesa', 'fixa', false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_2
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '2';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '2.01', 'Aluguel',             'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.02', 'Energia Elétrica',    'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.03', 'Água',                'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.04', 'Internet e Telefone', 'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.05', 'Salários',            'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.06', 'Encargos Sociais',    'despesa', 'fixa', v_2, true),
    (p_empresa_id, '2.07', 'Contabilidade',       'despesa', 'fixa', v_2, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  -- ── 3. DESPESAS VARIÁVEIS ──────────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, aceita_lancamento)
  VALUES
    (p_empresa_id, '3', 'Despesas Variáveis', 'despesa', 'variavel', false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_3
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '3';

  -- ATENÇÃO: código '3.03' é referenciado pelo trigger de RT automático
  -- (financeiro_triggers.sql). NÃO altere este código.
  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '3.01', 'Matéria-Prima (Chapas)',      'despesa', 'variavel', v_3, true),
    (p_empresa_id, '3.02', 'Frete e Transporte',          'despesa', 'variavel', v_3, true),
    (p_empresa_id, '3.03', 'RT Arquitetos',               'despesa', 'variavel', v_3, true),
    (p_empresa_id, '3.04', 'Comissão Vendedores',         'despesa', 'variavel', v_3, true),
    (p_empresa_id, '3.05', 'Produtos Consumíveis',        'despesa', 'variavel', v_3, true),
    (p_empresa_id, '3.06', 'Manutenção de Equipamentos',  'despesa', 'variavel', v_3, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  -- ── 4. IMPOSTOS ────────────────────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, aceita_lancamento)
  VALUES
    (p_empresa_id, '4', 'Impostos', 'despesa', 'imposto', false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_4
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '4.01', 'Simples Nacional', 'despesa', 'imposto', v_4, true),
    (p_empresa_id, '4.02', 'ISS',              'despesa', 'imposto', v_4, true),
    (p_empresa_id, '4.03', 'Outros Impostos',  'despesa', 'imposto', v_4, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  -- ── 5. TARIFAS BANCÁRIAS E FINANCEIRAS ────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, aceita_lancamento)
  VALUES
    (p_empresa_id, '5', 'Tarifas Bancárias e Financeiras', 'despesa', 'variavel', false)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

  SELECT id INTO v_5
  FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '5';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, natureza, pai_id, aceita_lancamento)
  VALUES
    (p_empresa_id, '5.01', 'Tarifas Bancárias', 'despesa', 'variavel', v_5, true),
    (p_empresa_id, '5.02', 'Taxas de Cartão',   'despesa', 'variavel', v_5, true),
    (p_empresa_id, '5.03', 'Juros e Multas',    'despesa', 'variavel', v_5, true)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO NOTHING;

END;
$$;

COMMENT ON FUNCTION public.seed_plano_contas_padrao(uuid) IS
  'Popula financeiro_plano_contas com o plano de contas padrão (31 categorias em 5 grupos) '
  'para a empresa informada. Idempotente: re-executar não cria duplicatas. '
  'Deve ser chamada ao cadastrar empresa nova. '
  'ATENÇÃO: categoria 3.03 (RT Arquitetos) é referenciada por código '
  'pelo trigger de RT automático (financeiro_triggers.sql).';


-- ─── Aplicar para todas as empresas existentes ───────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, nome FROM empresas ORDER BY created_at LOOP
    PERFORM public.seed_plano_contas_padrao(r.id);
    RAISE NOTICE 'Plano de contas populado: % (%)', r.nome, r.id;
  END LOOP;
END;
$$;


-- ─── Verificação (descomentar para checar após aplicar) ──────────────────────

-- SELECT e.nome AS empresa, COUNT(fpc.id) AS total_categorias
-- FROM empresas e
-- LEFT JOIN financeiro_plano_contas fpc ON fpc.empresa_id = e.id
-- GROUP BY e.id, e.nome
-- ORDER BY e.nome;
-- Esperado: 31 categorias por empresa


-- ─── Próxima migration esperada ──────────────────────────────────────────────
-- financeiro_triggers.sql
--   • Trigger de saldo_atual em financeiro_contas (soma de lançamentos liquidados)
--   • Trigger auto_rt: ao liquidar lançamento de entrada de projeto, busca
--     categoria com codigo='3.03' da empresa e gera lançamento de saída
--     para o arquiteto vinculado via projetos.rt_padrao_percentual
--   • Trigger bloqueio de RT/comissão (bloqueado_ate_pagamento_projeto)
--   • Trigger de endosso/repasse de cheques
