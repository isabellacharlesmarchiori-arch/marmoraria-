-- Adiciona grupo_quantidade em orcamento_pecas para preservar a multiplicidade
-- de grupos de medição (quando o mesmo grupo se repete N vezes no canvas Flutter).
-- Valor 1 = sem multiplicação (padrão / retrocompatível).
ALTER TABLE orcamento_pecas
  ADD COLUMN IF NOT EXISTS grupo_quantidade integer NOT NULL DEFAULT 1
    CHECK (grupo_quantidade >= 1);

COMMENT ON COLUMN orcamento_pecas.grupo_quantidade IS
  'Número de repetições do grupo de medição (Flutter). '
  'area e valor já estão multiplicados por esta quantidade. '
  'Use para exibir área/preço unitário (÷ grupo_quantidade).';
