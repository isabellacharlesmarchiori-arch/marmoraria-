-- Adiciona % RT Padrão ao projeto (sugerido automaticamente ao criar orçamento)
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS rt_padrao_percentual numeric DEFAULT 0;

-- Adiciona Frete ao orçamento (valor fixo que soma no total final e aparece no PDF)
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS valor_frete numeric DEFAULT 0;
