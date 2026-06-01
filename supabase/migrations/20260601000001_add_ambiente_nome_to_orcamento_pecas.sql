-- Adiciona ambiente_nome em orcamento_pecas para suportar orçamentos multi-ambiente.
--
-- Contexto: um orçamento criado em TelaVersoes pode conter peças de múltiplos
-- ambientes (ex: "Quarto: Arabescato + Sala: Amarelo Icaraí"). O campo
-- ambiente_nome denormaliza pecas.ambiente_id → ambientes.nome por peça,
-- permitindo que calcularCoberturaProducao derive todos os ambientes cobertos
-- por um cenário sem precisar fazer join adicional no frontend.
--
-- Após aplicar esta migration, rodar o backfill:
--   node scripts/backfill-ambiente-nome.mjs --dry-run  (preview)
--   node scripts/backfill-ambiente-nome.mjs            (execução)

ALTER TABLE orcamento_pecas
    ADD COLUMN IF NOT EXISTS ambiente_nome text;

COMMENT ON COLUMN orcamento_pecas.ambiente_nome IS
    'Nome do ambiente da peça (denormalizado de pecas.ambiente_id -> ambientes.nome) para permitir orçamentos multi-ambiente.';
