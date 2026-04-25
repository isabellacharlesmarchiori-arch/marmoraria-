ALTER TABLE pdf_templates
  ADD COLUMN IF NOT EXISTS nivel_detalhe text NOT NULL DEFAULT 'tudo'
    CHECK (nivel_detalhe IN ('so_ambientes', 'ambientes_e_itens', 'tudo')),
  ADD COLUMN IF NOT EXISTS mostrar_prazo_entrega boolean NOT NULL DEFAULT true;

-- remove colunas antigas que foram substituídas por nivel_detalhe
ALTER TABLE pdf_templates
  DROP COLUMN IF EXISTS mostrar_materiais,
  DROP COLUMN IF EXISTS mostrar_medidas,
  DROP COLUMN IF EXISTS mostrar_acabamentos,
  DROP COLUMN IF EXISTS mostrar_vendedor,
  DROP COLUMN IF EXISTS mostrar_validade;

ALTER TABLE pdf_templates
  ADD COLUMN IF NOT EXISTS mostrar_materiais   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_medidas     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_acabamentos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_vendedor    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_validade    boolean NOT NULL DEFAULT true;
