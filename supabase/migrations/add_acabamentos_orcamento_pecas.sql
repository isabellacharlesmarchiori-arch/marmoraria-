-- Adiciona coluna de acabamentos lineares em orcamento_pecas
-- Armazena as linhas de acabamento (meia_esquadria, reto_simples) vinculadas a cada peça

ALTER TABLE orcamento_pecas
  ADD COLUMN IF NOT EXISTS acabamentos       jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS valor_acabamentos numeric  DEFAULT 0;
