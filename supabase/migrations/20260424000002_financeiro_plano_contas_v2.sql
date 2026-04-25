-- ============================================================
-- Migration: 20260424000002_financeiro_plano_contas_v2.sql
--
-- Escopo: Plano de contas completo para marmorarias (versao 2).
-- Substitui a seed simplificada (v1) por estrutura com 3 niveis,
-- novos tipos (tributo, custo_variavel, custo_fixo, financeiro),
-- subtipo para agrupar subsecoes na DRE, impacto_dre e ordem.
--
-- Idempotencia: usa ON CONFLICT (empresa_id, codigo) DO UPDATE.
-- Registros existentes com mesmo codigo sao ATUALIZADOS.
-- Novos codigos sao INSERIDOS.
--
-- ATENCAO: codigo '3.03' (RT sobre Vendas) preserva o mesmo codigo
-- que antes ('3.03' RT Arquitetos) para compatibilidade com o trigger
-- de RT automatico que busca por codigo '3.03'.
--
-- Estrutura (~84 registros por empresa):
--   RECEITA         1, 1.01-1.03            (4 nos)
--   TRIBUTOS        2, 2.01-2.05            (6 nos)
--   CUSTO VARIAVEL  3, 3.01-3.09            (11 nos)
--   CUSTO FIXO      4, 4.01-4.07 + filhos   (37 nos)
--   DESP. FINANC.   5, 5.01-5.03            (4 nos)
--   NAO-DRE         6, 6.01-6.04            (5 nos)
-- ============================================================


CREATE OR REPLACE FUNCTION public.seed_plano_contas_v2(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_1    uuid;
  v_2    uuid;
  v_3    uuid;
  v_4    uuid;
  v_401  uuid;
  v_402  uuid;
  v_403  uuid;
  v_404  uuid;
  v_405  uuid;
  v_406  uuid;
  v_5    uuid;
  v_6    uuid;
BEGIN

  -- ==========================================================================
  -- 1. RECEITA BRUTA
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '1', 'Receita Bruta', 'receita', NULL, 'positivo', false, 100)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_1 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '1';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '1.01', 'Receita de Vendas',   'receita', NULL, 'positivo', v_1, true, 110),
    (p_empresa_id, '1.02', 'Receita de Servicos', 'receita', NULL, 'positivo', v_1, true, 120),
    (p_empresa_id, '1.03', 'Outras Receitas',     'receita', NULL, 'positivo', v_1, true, 130)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;


  -- ==========================================================================
  -- 2. DEDUCOES DE VENDAS (Tributos)
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '2', 'Deducoes de Vendas', 'tributo', NULL, 'negativo', false, 200)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_2 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '2';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '2.01', 'DAS Simples Nacional',        'tributo', NULL, 'negativo', v_2, true, 210),
    (p_empresa_id, '2.02', 'ICMS',                        'tributo', NULL, 'negativo', v_2, true, 220),
    (p_empresa_id, '2.03', 'ISS',                         'tributo', NULL, 'negativo', v_2, true, 230),
    (p_empresa_id, '2.04', 'Outros Impostos sobre Vendas','tributo', NULL, 'negativo', v_2, true, 240),
    (p_empresa_id, '2.05', 'Devolucoes',                  'tributo', NULL, 'negativo', v_2, true, 250)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;


  -- ==========================================================================
  -- 3. CUSTOS VARIAVEIS DIRETOS
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '3', 'Custos Variaveis Diretos', 'custo_variavel', NULL, 'negativo', false, 300)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_3 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '3';

  -- ATENCAO: codigo 3.03 preservado para compatibilidade com trigger de RT automatico.
  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '3.01', 'Materia-Prima',             'custo_variavel', NULL,       'negativo', v_3, true, 310),
    (p_empresa_id, '3.02', 'Insumos para Producao',     'custo_variavel', NULL,       'negativo', v_3, true, 320),
    (p_empresa_id, '3.03', 'RT sobre Vendas',           'custo_variavel', 'rt',       'negativo', v_3, true, 330),
    (p_empresa_id, '3.04', 'MDO Direta',                'custo_variavel', 'mdo',      'negativo', v_3, true, 340),
    (p_empresa_id, '3.05', 'Fretes',                    'custo_variavel', NULL,       'negativo', v_3, true, 350),
    (p_empresa_id, '3.06', 'Premiacao de Producao',     'custo_variavel', NULL,       'negativo', v_3, true, 360),
    (p_empresa_id, '3.07', 'Outros Servicos Prestados', 'custo_variavel', NULL,       'negativo', v_3, true, 370),
    (p_empresa_id, '3.08', 'Comissoes sobre Vendas',    'custo_variavel', 'comissao', 'negativo', v_3, true, 380),
    (p_empresa_id, '3.09', 'Produtos de Revenda',       'custo_variavel', NULL,       'negativo', v_3, true, 390)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;


  -- ==========================================================================
  -- 4. CUSTOS FIXOS
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4', 'Custos Fixos', 'custo_fixo', NULL, 'negativo', false, 400)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_4 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4';

  -- ── 4.01 Despesas de Pessoal ───────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.01', 'Despesas de Pessoal', 'custo_fixo', 'pessoal', 'negativo', v_4, false, 410)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_401 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.01';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.01.01', 'Salarios',            'custo_fixo', 'pessoal', 'negativo', v_401, true, 411),
    (p_empresa_id, '4.01.02', 'INSS',                'custo_fixo', 'pessoal', 'negativo', v_401, true, 412),
    (p_empresa_id, '4.01.03', 'FGTS',                'custo_fixo', 'pessoal', 'negativo', v_401, true, 413),
    (p_empresa_id, '4.01.04', 'Ferias',              'custo_fixo', 'pessoal', 'negativo', v_401, true, 414),
    (p_empresa_id, '4.01.05', '13 Salario',          'custo_fixo', 'pessoal', 'negativo', v_401, true, 415),
    (p_empresa_id, '4.01.06', 'Vale Transporte',     'custo_fixo', 'pessoal', 'negativo', v_401, true, 416),
    (p_empresa_id, '4.01.07', 'Vale Alimentacao',    'custo_fixo', 'pessoal', 'negativo', v_401, true, 417),
    (p_empresa_id, '4.01.08', 'Cesta Basica',        'custo_fixo', 'pessoal', 'negativo', v_401, true, 418),
    (p_empresa_id, '4.01.09', 'Plano de Saude',      'custo_fixo', 'pessoal', 'negativo', v_401, true, 419),
    (p_empresa_id, '4.01.10', 'Seguro de Vida',      'custo_fixo', 'pessoal', 'negativo', v_401, true, 420),
    (p_empresa_id, '4.01.11', 'EPI',                 'custo_fixo', 'pessoal', 'negativo', v_401, true, 421),
    (p_empresa_id, '4.01.12', 'PLR',                 'custo_fixo', 'pessoal', 'negativo', v_401, true, 422),
    (p_empresa_id, '4.01.13', 'Rescisao e Admissao', 'custo_fixo', 'pessoal', 'negativo', v_401, true, 423),
    (p_empresa_id, '4.01.14', 'Sindicato',           'custo_fixo', 'pessoal', 'negativo', v_401, true, 424)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.02 Despesas Administrativas ─────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.02', 'Despesas Administrativas', 'custo_fixo', 'administrativo', 'negativo', v_4, false, 430)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_402 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.02';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.02.01', 'Assessoria Contabil',   'custo_fixo', 'administrativo', 'negativo', v_402, true, 431),
    (p_empresa_id, '4.02.02', 'Consultoria',            'custo_fixo', 'administrativo', 'negativo', v_402, true, 432),
    (p_empresa_id, '4.02.03', 'Suporte TI',             'custo_fixo', 'administrativo', 'negativo', v_402, true, 433),
    (p_empresa_id, '4.02.04', 'Informatica',            'custo_fixo', 'administrativo', 'negativo', v_402, true, 434),
    (p_empresa_id, '4.02.05', 'Material de Escritorio', 'custo_fixo', 'administrativo', 'negativo', v_402, true, 435),
    (p_empresa_id, '4.02.06', 'Material de Consumo',    'custo_fixo', 'administrativo', 'negativo', v_402, true, 436),
    (p_empresa_id, '4.02.07', 'Produtos de Limpeza',    'custo_fixo', 'administrativo', 'negativo', v_402, true, 437),
    (p_empresa_id, '4.02.08', 'Faxina e Limpeza',       'custo_fixo', 'administrativo', 'negativo', v_402, true, 438),
    (p_empresa_id, '4.02.09', 'Cursos e Treinamentos',  'custo_fixo', 'administrativo', 'negativo', v_402, true, 439),
    (p_empresa_id, '4.02.10', 'Despesas Comerciais',    'custo_fixo', 'administrativo', 'negativo', v_402, true, 440),
    (p_empresa_id, '4.02.11', 'Outras Despesas',        'custo_fixo', 'administrativo', 'negativo', v_402, true, 441)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.03 Despesas de Ocupacao ──────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.03', 'Despesas de Ocupacao', 'custo_fixo', 'ocupacao', 'negativo', v_4, false, 450)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_403 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.03';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.03.01', 'Aluguel',            'custo_fixo', 'ocupacao', 'negativo', v_403, true, 451),
    (p_empresa_id, '4.03.02', 'Energia Eletrica',   'custo_fixo', 'ocupacao', 'negativo', v_403, true, 452),
    (p_empresa_id, '4.03.03', 'Agua e Esgoto',      'custo_fixo', 'ocupacao', 'negativo', v_403, true, 453),
    (p_empresa_id, '4.03.04', 'Telefonia Internet', 'custo_fixo', 'ocupacao', 'negativo', v_403, true, 454),
    (p_empresa_id, '4.03.05', 'Seguro Predial',     'custo_fixo', 'ocupacao', 'negativo', v_403, true, 455),
    (p_empresa_id, '4.03.06', 'IPTU',               'custo_fixo', 'ocupacao', 'negativo', v_403, true, 456),
    (p_empresa_id, '4.03.07', 'Manutencao Predial', 'custo_fixo', 'ocupacao', 'negativo', v_403, true, 457)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.04 Despesas Veiculares ───────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.04', 'Despesas Veiculares', 'custo_fixo', 'veicular', 'negativo', v_4, false, 460)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_404 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.04';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.04.01', 'Combustivel',            'custo_fixo', 'veicular', 'negativo', v_404, true, 461),
    (p_empresa_id, '4.04.02', 'Manutencao de Veiculos', 'custo_fixo', 'veicular', 'negativo', v_404, true, 462),
    (p_empresa_id, '4.04.03', 'Seguro Frota',           'custo_fixo', 'veicular', 'negativo', v_404, true, 463),
    (p_empresa_id, '4.04.04', 'Pedagio',                'custo_fixo', 'veicular', 'negativo', v_404, true, 464),
    (p_empresa_id, '4.04.05', 'Estacionamento',         'custo_fixo', 'veicular', 'negativo', v_404, true, 465)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.05 Despesas de Marketing ─────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.05', 'Despesas de Marketing', 'custo_fixo', 'marketing', 'negativo', v_4, false, 470)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_405 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.05';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.05.01', 'Marketing',         'custo_fixo', 'marketing', 'negativo', v_405, true, 471),
    (p_empresa_id, '4.05.02', 'Anuncios Trafego',  'custo_fixo', 'marketing', 'negativo', v_405, true, 472),
    (p_empresa_id, '4.05.03', 'Impressos',         'custo_fixo', 'marketing', 'negativo', v_405, true, 473)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.06 Despesas Financeiras Operacionais ─────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.06', 'Despesas Financeiras Operacionais', 'custo_fixo', 'fin_operacional', 'negativo', v_4, false, 480)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_406 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '4.06';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.06.01', 'Tarifas Bancarias',   'custo_fixo', 'fin_operacional', 'negativo', v_406, true, 481),
    (p_empresa_id, '4.06.02', 'Taxa de Antecipacao', 'custo_fixo', 'fin_operacional', 'negativo', v_406, true, 482),
    (p_empresa_id, '4.06.03', 'IOF Operacional',     'custo_fixo', 'fin_operacional', 'negativo', v_406, true, 483)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

  -- ── 4.07 Pro-Labore ────────────────────────────────────────────────────────

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '4.07', 'Pro-Labore', 'custo_fixo', 'pro_labore', 'negativo', v_4, true, 490)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;


  -- ==========================================================================
  -- 5. DESPESAS FINANCEIRAS (abaixo do EBITDA)
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '5', 'Despesas Financeiras', 'financeiro', NULL, 'negativo', false, 500)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_5 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '5';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '5.01', 'Juros de Emprestimos',        'financeiro', NULL, 'negativo', v_5, true, 510),
    (p_empresa_id, '5.02', 'IOF sobre Emprestimos',       'financeiro', NULL, 'negativo', v_5, true, 520),
    (p_empresa_id, '5.03', 'Juros de Desconto Recebiveis','financeiro', NULL, 'negativo', v_5, true, 530)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;


  -- ==========================================================================
  -- 6. NAO ENTRA NA DRE (movimentos de balanco - apenas DFC)
  -- ==========================================================================

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '6', 'Movimentos Nao-DRE', 'financeiro', 'nao_dre', NULL, false, 600)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        ordem         = EXCLUDED.ordem;

  SELECT id INTO v_6 FROM financeiro_plano_contas
  WHERE empresa_id = p_empresa_id AND codigo = '6';

  INSERT INTO financeiro_plano_contas
    (empresa_id, codigo, nome, tipo, subtipo, impacto_dre, pai_id, aceita_lancamento, ordem)
  VALUES
    (p_empresa_id, '6.01', 'Emprestimos Captados',  'financeiro', 'nao_dre', NULL, v_6, true, 610),
    (p_empresa_id, '6.02', 'Pagamento de Parcelas', 'financeiro', 'nao_dre', NULL, v_6, true, 620),
    (p_empresa_id, '6.03', 'Aplicacao Financeira',  'financeiro', 'nao_dre', NULL, v_6, true, 630),
    (p_empresa_id, '6.04', 'Resgate de Aplicacao',  'financeiro', 'nao_dre', NULL, v_6, true, 640)
  ON CONFLICT (empresa_id, codigo) WHERE codigo IS NOT NULL DO UPDATE
    SET nome          = EXCLUDED.nome,
        tipo          = EXCLUDED.tipo,
        subtipo       = EXCLUDED.subtipo,
        impacto_dre   = EXCLUDED.impacto_dre,
        pai_id        = EXCLUDED.pai_id,
        ordem         = EXCLUDED.ordem;

END;
$$;


-- ── Aplicar para todas as empresas existentes ────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, nome FROM empresas ORDER BY created_at LOOP
    PERFORM public.seed_plano_contas_v2(r.id);
    RAISE NOTICE 'Plano de contas v2 aplicado: % (%)', r.nome, r.id;
  END LOOP;
END;
$$;


-- ── Verificacao (rode separado apos o script acima) ──────────────────────────

-- SELECT tipo, COUNT(*) AS total
-- FROM financeiro_plano_contas
-- GROUP BY tipo ORDER BY tipo;
-- Esperado: custo_fixo~37, custo_variavel~11, financeiro~9, receita~4, tributo~6
