-- Adiciona item_nome em orcamento_pecas para preservar a hierarquia
-- Ambiente → Item → Peça no PDF e no app
ALTER TABLE orcamento_pecas
  ADD COLUMN IF NOT EXISTS item_nome text DEFAULT NULL;

-- Índice para facilitar agrupamentos
CREATE INDEX IF NOT EXISTS idx_orcamento_pecas_item_nome
  ON orcamento_pecas (orcamento_id, item_nome);
