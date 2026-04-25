-- Garante que o tipo 'contrato' já existe no check
ALTER TABLE pdf_templates DROP CONSTRAINT IF EXISTS pdf_templates_tipo_check;
ALTER TABLE pdf_templates ADD CONSTRAINT pdf_templates_tipo_check
  CHECK (tipo IN ('orcamento', 'pedido', 'contrato'));

-- Campo para o texto completo do contrato (o admin pode substituir o template padrão)
ALTER TABLE pdf_templates
  ADD COLUMN IF NOT EXISTS contrato_texto text;
