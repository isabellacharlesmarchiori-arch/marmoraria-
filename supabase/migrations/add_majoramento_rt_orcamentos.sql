-- Adiciona colunas de Majoramento e RT (Retorno Técnico) à tabela orcamentos

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS majoramento_percentual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rt_percentual          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rt_arquiteto_nome      text;
