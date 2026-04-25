CREATE TABLE IF NOT EXISTS acabamentos_unitarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  nome        text NOT NULL,
  unidade     text NOT NULL DEFAULT 'un' CHECK (unidade IN ('un', 'm²', 'ml')),
  preco       numeric(10,2) NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE acabamentos_unitarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acabamentos_unitarios_empresa" ON acabamentos_unitarios
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
