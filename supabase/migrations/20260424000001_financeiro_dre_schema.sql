-- ============================================================
-- Migration: 20260424000001_financeiro_dre_schema.sql
--
-- Escopo: Ajustes de schema para DRE dinâmica por plano de contas.
--   1. Adiciona subtipo, impacto_dre, ordem em financeiro_plano_contas
--   2. Expande tipo CHECK de 'receita'/'despesa' para 5 valores
--   3. Migra registros existentes tipo='despesa' → novos valores
--   4. Adiciona subtipo_dfc em financeiro_lancamentos (classificação DFC)
--   5. Cria financeiro_mdo_direta (custo MDO por funcionário/mês)
--   6. Cria financeiro_emprestimos (para KPI de cobertura de dívida)
--
-- Trade-offs:
--   • Mapeamento tipo='despesa' usa natureza como guia: fixa→custo_fixo,
--     variavel→custo_variavel, imposto→tributo. Código '5%' → financeiro.
--   • custo_total/custo_hora em financeiro_mdo_direta são GENERATED ALWAYS AS —
--     não referenciam outras colunas geradas (limitação do PG), por isso a
--     fórmula é expandida manualmente nas duas colunas.
--   • ICCD = EBITDA / SUM(parcela_mensal) dos empréstimos ativos — calculado
--     no app, não no banco.
-- ============================================================


-- ─── 1. Novos campos em financeiro_plano_contas ───────────────────────────────

ALTER TABLE financeiro_plano_contas
  ADD COLUMN IF NOT EXISTS subtipo     text,
  ADD COLUMN IF NOT EXISTS impacto_dre text,
  ADD COLUMN IF NOT EXISTS ordem       int  NOT NULL DEFAULT 0;


-- ─── 2. Migrar tipo='despesa' para novos valores ANTES de alterar o CHECK ─────

-- Tarifas bancárias e financeiras (código '5.x') → financeiro (operacional)
UPDATE financeiro_plano_contas
  SET tipo        = 'financeiro',
      impacto_dre = 'negativo'
  WHERE tipo = 'despesa'
    AND (
      codigo LIKE '5%'
      OR nome IN ('Tarifas Bancárias e Financeiras')
    );

-- Impostos → tributo
UPDATE financeiro_plano_contas
  SET tipo = 'tributo'
  WHERE tipo = 'despesa' AND natureza = 'imposto';

-- Despesas fixas → custo_fixo
UPDATE financeiro_plano_contas
  SET tipo = 'custo_fixo'
  WHERE tipo = 'despesa' AND natureza = 'fixa';

-- Despesas variáveis → custo_variavel
UPDATE financeiro_plano_contas
  SET tipo = 'custo_variavel'
  WHERE tipo = 'despesa' AND natureza = 'variavel';

-- Grupo pai sem natureza específica que sobrou → custo_fixo (melhor fit semântico)
UPDATE financeiro_plano_contas
  SET tipo = 'custo_fixo'
  WHERE tipo = 'despesa';

-- Verificação de segurança: nenhum registro deve ter tipo fora do novo conjunto
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
  FROM financeiro_plano_contas
  WHERE tipo NOT IN ('receita', 'tributo', 'custo_variavel', 'custo_fixo', 'financeiro');
  IF n > 0 THEN
    RAISE EXCEPTION
      'Ainda existem % registros com tipo inválido — verifique a migration antes de prosseguir.', n;
  END IF;
END;
$$;


-- ─── 3. Substituir CHECK constraint de tipo ───────────────────────────────────

ALTER TABLE financeiro_plano_contas
  DROP CONSTRAINT IF EXISTS financeiro_plano_contas_tipo_check;

ALTER TABLE financeiro_plano_contas
  ADD CONSTRAINT financeiro_plano_contas_tipo_check
  CHECK (tipo IN ('receita', 'tributo', 'custo_variavel', 'custo_fixo', 'financeiro'));

-- CHECK em impacto_dre (idempotente via bloco anônimo)
DO $$
BEGIN
  ALTER TABLE financeiro_plano_contas
    ADD CONSTRAINT fpc_impacto_dre_check
    CHECK (impacto_dre IS NULL OR impacto_dre IN ('positivo', 'negativo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;


-- ─── 4. subtipo_dfc em financeiro_lancamentos ─────────────────────────────────

ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS subtipo_dfc text;

DO $$
BEGIN
  ALTER TABLE financeiro_lancamentos
    ADD CONSTRAINT fl_subtipo_dfc_check
    CHECK (subtipo_dfc IS NULL OR subtipo_dfc IN ('operacional', 'investimento', 'financiamento'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN financeiro_lancamentos.subtipo_dfc IS
  'Classifica o lançamento para o DFC em 3 blocos (CPC 03): '
  'operacional (default quando NULL), investimento, financiamento.';


-- ─── 5. financeiro_mdo_direta ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financeiro_mdo_direta (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid          NOT NULL REFERENCES empresas(id)  ON DELETE RESTRICT,
  parceiro_id              uuid          REFERENCES parceiros(id)           ON DELETE RESTRICT,
  nome_funcionario         text          NOT NULL,
  competencia              date          NOT NULL,

  salario_base             numeric(14,2) NOT NULL CHECK (salario_base >= 0),
  horas_mes                int           NOT NULL DEFAULT 220 CHECK (horas_mes > 0),

  -- Encargos calculados a partir de salario_base
  inss_patronal            numeric(14,2) GENERATED ALWAYS AS (ROUND(salario_base * 0.20, 2))          STORED,
  fgts                     numeric(14,2) GENERATED ALWAYS AS (ROUND(salario_base * 0.08, 2))          STORED,
  ferias_provisao          numeric(14,2) GENERATED ALWAYS AS (ROUND(salario_base / 12.0, 2))          STORED,
  decimo_terceiro_provisao numeric(14,2) GENERATED ALWAYS AS (ROUND(salario_base / 12.0, 2))          STORED,
  fgts_encargos            numeric(14,2) GENERATED ALWAYS AS (
                             ROUND((salario_base / 12.0 + salario_base / 12.0) * 0.08, 2)
                           ) STORED,

  -- custo_total = soma de todos os componentes acima
  custo_total              numeric(14,2) GENERATED ALWAYS AS (
                             ROUND(
                               salario_base
                               + salario_base * 0.20
                               + salario_base * 0.08
                               + salario_base / 12.0
                               + salario_base / 12.0
                               + (salario_base / 12.0 + salario_base / 12.0) * 0.08
                             , 2)
                           ) STORED,

  -- custo_hora = custo_total / horas_mes (fórmula expandida — PG não permite ref. a generated)
  custo_hora               numeric(14,4) GENERATED ALWAYS AS (
                             ROUND(
                               (
                                 salario_base
                                 + salario_base * 0.20
                                 + salario_base * 0.08
                                 + salario_base / 12.0
                                 + salario_base / 12.0
                                 + (salario_base / 12.0 + salario_base / 12.0) * 0.08
                               ) / NULLIF(horas_mes::numeric, 0)
                             , 4)
                           ) STORED,

  observacoes              text,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT fmdo_competencia_funcionario_uq UNIQUE (empresa_id, competencia, nome_funcionario)
);

COMMENT ON TABLE financeiro_mdo_direta IS
  'Custo real de MDO direta por funcionário/mês. '
  'custo_total alimenta o item "MDO Direta" na DRE via query SUM(custo_total) '
  'filtrado por competência. Encargos calculados automaticamente.';

CREATE INDEX IF NOT EXISTS fmdo_empresa_competencia_idx
  ON financeiro_mdo_direta (empresa_id, competencia);

CREATE TRIGGER trg_financeiro_mdo_direta_updated_at
  BEFORE UPDATE ON financeiro_mdo_direta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 6. financeiro_emprestimos ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financeiro_emprestimos (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid          NOT NULL REFERENCES empresas(id)         ON DELETE RESTRICT,
  credor          text          NOT NULL,
  descricao       text,
  valor_total     numeric(14,2) NOT NULL CHECK (valor_total > 0),
  valor_aberto    numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_aberto >= 0),
  parcela_mensal  numeric(14,2) NOT NULL CHECK (parcela_mensal > 0),
  taxa_juros      numeric(7,4),
  data_inicio     date          NOT NULL,
  data_vencimento date,
  status          text          NOT NULL DEFAULT 'ativo'
                                  CHECK (status IN ('ativo', 'quitado', 'renegociado')),
  conta_id        uuid          REFERENCES financeiro_contas(id)         ON DELETE RESTRICT,
  observacoes     text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT femp_taxa_juros_range
    CHECK (taxa_juros IS NULL OR (taxa_juros >= 0 AND taxa_juros <= 100))
);

COMMENT ON TABLE financeiro_emprestimos IS
  'Empréstimos e financiamentos ativos. '
  'SUM(parcela_mensal) WHERE status=''ativo'' é o denominador do ICCD '
  '(Índice de Cobertura da Dívida = EBITDA mensal / parcelas mensais totais).';

CREATE INDEX IF NOT EXISTS femp_empresa_status_idx
  ON financeiro_emprestimos (empresa_id, status);

CREATE TRIGGER trg_financeiro_emprestimos_updated_at
  BEFORE UPDATE ON financeiro_emprestimos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
