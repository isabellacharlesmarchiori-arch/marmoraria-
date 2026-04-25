CREATE TABLE IF NOT EXISTS pdf_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('orcamento', 'pedido', 'contrato')),
  cor_primaria text NOT NULL DEFAULT '#facc15',
  mostrar_materiais    boolean NOT NULL DEFAULT true,
  mostrar_medidas      boolean NOT NULL DEFAULT true,
  mostrar_acabamentos  boolean NOT NULL DEFAULT true,
  mostrar_vendedor     boolean NOT NULL DEFAULT true,
  mostrar_validade     boolean NOT NULL DEFAULT true,
  observacoes          text,
  termos               text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(empresa_id, tipo)
);

ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdf_templates_empresa" ON pdf_templates
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
