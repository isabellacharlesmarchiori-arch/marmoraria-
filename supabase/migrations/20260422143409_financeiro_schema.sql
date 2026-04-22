-- ============================================================
-- Migration: 20260422143409_financeiro_schema.sql
--
-- Escopo: DDL base do módulo financeiro — apenas estrutura.
-- Cria as 5 tabelas centrais (financeiro_contas, financeiro_plano_contas,
-- parceiros, financeiro_lancamentos, financeiro_cheques), seus índices,
-- constraints e a função/triggers genéricos de updated_at.
--
-- O que NÃO está aqui (próximas migrations):
--   • Policies RLS                      → financeiro_rls.sql
--   • Saldo automático de contas        → financeiro_triggers.sql
--   • Geração automática de RT/comissão → financeiro_triggers.sql
--   • Endosso/repasse de cheques        → financeiro_triggers.sql
--   • Seeds (plano de contas padrão)    → financeiro_seed.sql
--
-- Trade-offs relevantes:
--   • Enums via CHECK (não CREATE TYPE) — mais fácil de evoluir sem migration de tipo
--   • financeiro_lancamentos unifica pagar e receber — diferenciados por `tipo`
--   • parceiro_id / arquiteto_id / cliente_id são mutuamente exclusivos via CHECK,
--     não via tabela polimórfica, para manter FKs reais e queries simples
--   • valor_liquido é coluna gerada (STORED) — evita dessincronismo app/banco
-- ============================================================


-- ─── Função genérica updated_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─── 1. financeiro_contas ────────────────────────────────────────────────────

CREATE TABLE financeiro_contas (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid          NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome          text          NOT NULL,
  tipo          text          NOT NULL
                                CHECK (tipo IN ('corrente','poupanca','aplicacao','fisico','cartao')),
  banco         text,
  agencia       text,
  conta         text,
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  saldo_atual   numeric(14,2) NOT NULL DEFAULT 0,
  ativo         boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT financeiro_contas_empresa_nome_uq UNIQUE (empresa_id, nome)
);

COMMENT ON TABLE financeiro_contas IS
  'Contas bancárias e caixas físicos da empresa.';

COMMENT ON COLUMN financeiro_contas.saldo_atual IS
  'Derivado via trigger (migration financeiro_triggers.sql). '
  'O app nunca deve gravar diretamente nesta coluna — '
  'toda alteração de saldo é consequência de um lançamento liquidado.';

CREATE TRIGGER trg_financeiro_contas_updated_at
  BEFORE UPDATE ON financeiro_contas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. financeiro_plano_contas ──────────────────────────────────────────────

CREATE TABLE financeiro_plano_contas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  codigo            text,
  nome              text        NOT NULL,
  tipo              text        NOT NULL CHECK (tipo IN ('receita','despesa')),
  natureza          text        CHECK (natureza IN ('fixa','variavel','imposto','investimento','outra')),
  pai_id            uuid        REFERENCES financeiro_plano_contas(id) ON DELETE RESTRICT,
  aceita_lancamento boolean     NOT NULL DEFAULT true,
  ativo             boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fpc_pai_nao_eh_self CHECK (pai_id IS NULL OR pai_id <> id)

  -- TODO (financeiro_triggers.sql): trigger que valida pai_id aponta para conta
  -- da mesma empresa_id e do mesmo tipo (receita/despesa).
);

COMMENT ON TABLE financeiro_plano_contas IS
  'Plano de contas hierárquico (DRE). '
  'Nós-folha têm aceita_lancamento=true; '
  'categorias-pai podem ter aceita_lancamento=false para forçar classificação granular.';

-- Unique parcial: codigo é único por empresa somente quando não nulo
CREATE UNIQUE INDEX financeiro_plano_contas_empresa_codigo_uidx
  ON financeiro_plano_contas (empresa_id, codigo)
  WHERE codigo IS NOT NULL;

-- Índice para listar filhos de um nó rápido
CREATE INDEX financeiro_plano_contas_empresa_pai_idx
  ON financeiro_plano_contas (empresa_id, pai_id);

CREATE TRIGGER trg_financeiro_plano_contas_updated_at
  BEFORE UPDATE ON financeiro_plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 3. parceiros ────────────────────────────────────────────────────────────

CREATE TABLE parceiros (
  id                         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                 uuid          NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  tipos                      text[]        NOT NULL
                                             CHECK (
                                               tipos <@ ARRAY['fornecedor','funcionario','terceiro']::text[]
                                               AND array_length(tipos, 1) >= 1
                                             ),
  nome                       text          NOT NULL,
  documento                  text,
  telefone                   text,
  email                      text,
  endereco                   text,
  usuario_id                 uuid          REFERENCES usuarios(id) ON DELETE SET NULL,
  percentual_comissao_padrao numeric(5,2)
                                             CHECK (
                                               percentual_comissao_padrao IS NULL
                                               OR (percentual_comissao_padrao >= 0
                                                   AND percentual_comissao_padrao <= 100)
                                             ),
  dados_bancarios            jsonb,
  observacoes                text,
  ativo                      boolean       NOT NULL DEFAULT true,
  created_at                 timestamptz   NOT NULL DEFAULT now(),
  updated_at                 timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE parceiros IS
  'Fornecedores e funcionários — quem a marmoraria paga que NÃO é arquiteto nem cliente. '
  'Arquitetos continuam na tabela arquitetos; clientes continuam na tabela clientes.';

COMMENT ON COLUMN parceiros.usuario_id IS
  'Preenchido quando o parceiro é um funcionário que também é usuário do sistema '
  '(ex: vendedor que recebe comissão).';

COMMENT ON COLUMN parceiros.dados_bancarios IS
  'Estrutura esperada: {banco, agencia, conta, tipo_conta, pix_tipo, pix_chave, titular}. '
  'Validação apenas no app. '
  'RLS (migration financeiro_rls.sql) restringe leitura desta coluna a perfil admin.';

-- Listagens filtradas por empresa + ativo
CREATE INDEX parceiros_empresa_ativo_idx
  ON parceiros (empresa_id, ativo);

-- Filtro por tipo: WHERE tipos @> ARRAY['fornecedor']
CREATE INDEX parceiros_tipos_gin_idx
  ON parceiros USING gin (tipos);

CREATE TRIGGER trg_parceiros_updated_at
  BEFORE UPDATE ON parceiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 4. financeiro_lancamentos ───────────────────────────────────────────────

CREATE TABLE financeiro_lancamentos (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid          NOT NULL REFERENCES empresas(id)               ON DELETE RESTRICT,
  tipo          text          NOT NULL CHECK (tipo IN ('entrada','saida')),
  status        text          NOT NULL DEFAULT 'pendente'
                                CHECK (status IN ('pendente','pago','parcial','atrasado','cancelado')),
  descricao     text          NOT NULL,
  valor_previsto numeric(14,2) NOT NULL CHECK (valor_previsto > 0),
  valor_pago    numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  data_emissao  date          NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date        NOT NULL,
  data_pagamento  date,
  competencia   date          NOT NULL,
  categoria_id  uuid          NOT NULL REFERENCES financeiro_plano_contas(id) ON DELETE RESTRICT,

  -- FKs de parceiro: mutuamente exclusivas — no máximo uma preenchida por lançamento
  parceiro_id   uuid          REFERENCES parceiros(id)                       ON DELETE RESTRICT,
  arquiteto_id  uuid          REFERENCES arquitetos(id)                      ON DELETE RESTRICT,
  cliente_id    uuid          REFERENCES clientes(id)                        ON DELETE RESTRICT,

  conta_id      uuid          REFERENCES financeiro_contas(id)               ON DELETE RESTRICT,
  projeto_id    uuid          REFERENCES projetos(id)                        ON DELETE SET NULL,
  fechamento_id uuid          REFERENCES fechamentos(id)                     ON DELETE SET NULL,

  -- Forma de pagamento e parcelamento
  forma_pagamento       text  CHECK (forma_pagamento IN (
                                'pix','boleto','cartao_credito','cartao_debito',
                                'dinheiro','cheque','transferencia','outro')),
  parcela_num           int,
  parcela_total         int,
  grupo_parcelamento_id uuid,  -- UUID livre, sem FK; agrupa linhas do mesmo parcelamento

  -- Taxa de cartão e valor líquido derivado
  taxa_percentual numeric(5,2) NOT NULL DEFAULT 0
                                CHECK (taxa_percentual >= 0 AND taxa_percentual <= 100),
  valor_liquido   numeric(14,2) GENERATED ALWAYS AS (
                    valor_pago - (valor_pago * taxa_percentual / 100)
                  ) STORED,

  -- Origem e bloqueio de pagamento
  origem        text          NOT NULL DEFAULT 'manual'
                                CHECK (origem IN (
                                  'manual','auto_rt','auto_comissao',
                                  'repasse_cheque','transferencia','adiantamento')),
  bloqueado_ate_pagamento_projeto boolean NOT NULL DEFAULT false,

  -- Vínculo entre lançamentos correlatos
  lancamento_vinculado_id uuid REFERENCES financeiro_lancamentos(id)        ON DELETE SET NULL,

  observacoes   text,
  created_by    uuid          REFERENCES usuarios(id)                        ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  -- ── CHECKs globais ──────────────────────────────────────────────────────────

  -- Não permite pagar mais que o previsto
  CONSTRAINT fl_valor_pago_lte_previsto
    CHECK (valor_pago <= valor_previsto),

  -- parceiro_id, arquiteto_id e cliente_id são mutuamente exclusivos
  CONSTRAINT fl_parceiro_exclusivo
    CHECK (
      (CASE WHEN parceiro_id   IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN arquiteto_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN cliente_id   IS NOT NULL THEN 1 ELSE 0 END) <= 1
    ),

  -- conta_id e data_pagamento obrigatórios quando status = pago ou parcial
  CONSTRAINT fl_conta_obrigatoria_quando_pago
    CHECK (
      (status IN ('pago','parcial')
        AND conta_id IS NOT NULL
        AND data_pagamento IS NOT NULL)
      OR status NOT IN ('pago','parcial')
    ),

  -- Parcelamento: ambas presentes ou ambas nulas, com valores válidos
  CONSTRAINT fl_parcela_consistente
    CHECK (
      (parcela_num IS NULL AND parcela_total IS NULL)
      OR (parcela_num IS NOT NULL
          AND parcela_total IS NOT NULL
          AND parcela_num >= 1
          AND parcela_num <= parcela_total)
    )
);

COMMENT ON TABLE financeiro_lancamentos IS
  'Tabela central do módulo financeiro: contas a pagar (saida) e a receber (entrada) no mesmo lugar, '
  'diferenciadas pela coluna tipo.';

COMMENT ON COLUMN financeiro_lancamentos.competencia IS
  'Primeiro dia do mês ao qual o lançamento pertence no DRE. '
  'Pode diferir de data_vencimento e data_pagamento: ex., venda fechada em março '
  'e paga em abril tem competencia = 2026-03-01. '
  'Usado para agrupamento no DRE por regime de competência.';

COMMENT ON COLUMN financeiro_lancamentos.bloqueado_ate_pagamento_projeto IS
  'Quando true, o pagamento de RT ou comissão só é liberado após o projeto associado '
  'estar totalmente quitado (soma de valor_pago das entradas >= fechamentos.valor_fechado). '
  'Reforçado por trigger em financeiro_triggers.sql.';

COMMENT ON COLUMN financeiro_lancamentos.lancamento_vinculado_id IS
  'Liga dois lançamentos relacionados: '
  '(1) cheque recebido → lançamento de saída gerado no repasse ao fornecedor; '
  '(2) transferência entre contas → dois lançamentos espelhados (entrada + saída).';

COMMENT ON COLUMN financeiro_lancamentos.parceiro_id IS
  'FK para fornecedor ou funcionário (tabela parceiros). '
  'Mutuamente exclusiva com arquiteto_id e cliente_id: '
  'no máximo uma das três pode estar preenchida por lançamento. '
  'Todas podem ser NULL (ex: tarifa bancária sem parceiro identificado).';

-- Índices operacionais
CREATE INDEX fl_empresa_vencimento_idx
  ON financeiro_lancamentos (empresa_id, data_vencimento);

CREATE INDEX fl_empresa_status_idx
  ON financeiro_lancamentos (empresa_id, status);

CREATE INDEX fl_empresa_projeto_idx
  ON financeiro_lancamentos (empresa_id, projeto_id);

CREATE INDEX fl_empresa_parceiro_idx
  ON financeiro_lancamentos (empresa_id, parceiro_id);

CREATE INDEX fl_empresa_arquiteto_idx
  ON financeiro_lancamentos (empresa_id, arquiteto_id);

CREATE INDEX fl_empresa_competencia_idx
  ON financeiro_lancamentos (empresa_id, competencia);

-- Índice composto para o dashboard principal (vencimentos por tipo/status)
CREATE INDEX fl_empresa_tipo_status_venc_idx
  ON financeiro_lancamentos (empresa_id, tipo, status, data_vencimento);

-- Índice parcial para edição/agrupamento de parcelamentos
CREATE INDEX fl_empresa_grupo_parcelamento_idx
  ON financeiro_lancamentos (empresa_id, grupo_parcelamento_id)
  WHERE grupo_parcelamento_id IS NOT NULL;

CREATE TRIGGER trg_financeiro_lancamentos_updated_at
  BEFORE UPDATE ON financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 5. financeiro_cheques ───────────────────────────────────────────────────

CREATE TABLE financeiro_cheques (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid          NOT NULL REFERENCES empresas(id)                ON DELETE RESTRICT,
  lancamento_id         uuid          NOT NULL REFERENCES financeiro_lancamentos(id)  ON DELETE CASCADE,
  numero_cheque         text          NOT NULL,
  banco_emissor         text          NOT NULL,
  agencia_emissora      text,
  conta_emissora        text,
  titular               text          NOT NULL,
  documento_titular     text,
  valor                 numeric(14,2) NOT NULL CHECK (valor > 0),
  data_emissao          date,
  data_bom_para         date          NOT NULL,
  status                text          NOT NULL DEFAULT 'em_maos'
                                        CHECK (status IN (
                                          'em_maos','depositado','compensado',
                                          'repassado','devolvido','cancelado')),
  conta_deposito_id     uuid          REFERENCES financeiro_contas(id)               ON DELETE RESTRICT,
  lancamento_repasse_id uuid          REFERENCES financeiro_lancamentos(id)          ON DELETE SET NULL,
  observacoes           text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE financeiro_cheques IS
  'Rastreio de cheques físicos recebidos de clientes ou repassados a fornecedores. '
  'Todo cheque está vinculado a um lançamento via lancamento_id. '
  'ON DELETE CASCADE: cheque sem lançamento não tem existência independente.';

-- Dashboard de cheques a vencer
CREATE INDEX fc_empresa_bom_para_idx
  ON financeiro_cheques (empresa_id, data_bom_para);

CREATE INDEX fc_empresa_status_idx
  ON financeiro_cheques (empresa_id, status);

CREATE TRIGGER trg_financeiro_cheques_updated_at
  BEFORE UPDATE ON financeiro_cheques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Próxima migration esperada ──────────────────────────────────────────────
-- financeiro_rls.sql
--   • ALTER TABLE ... ENABLE ROW LEVEL SECURITY nas 5 tabelas
--   • Policies SELECT/INSERT/UPDATE por empresa_id (padrão inline do projeto)
--   • Policy restrita a admin para leitura de parceiros.dados_bancarios
-- Depois: financeiro_triggers.sql
--   • Trigger de saldo_atual em financeiro_contas (soma de lançamentos liquidados)
--   • Trigger auto_rt: gera lançamento de saída para arquiteto ao liquidar entrada
--   • Trigger bloqueio de RT/comissão até projeto quitado
--   • Trigger de endosso/repasse de cheques
