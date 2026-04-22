-- Migration: adicionar colunas ausentes na tabela medicoes
-- Execute no Supabase Dashboard > SQL Editor

ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS observacoes_acesso text;
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS notas_tecnicas      text;
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS medidas             jsonb DEFAULT '[]';

-- Verifica o resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'medicoes'
  AND column_name IN ('observacoes_acesso', 'notas_tecnicas', 'medidas')
ORDER BY column_name;

-- Adiciona coluna para itens de orçamentos manuais
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS itens_manuais jsonb DEFAULT '[]';
