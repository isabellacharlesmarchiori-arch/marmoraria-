-- Preços de acabamento linear diferenciados por material (pedra)
-- Ex: "Meia Esquadria" pode custar R$45/ml em Mármore e R$38/ml em Granito
-- Se não houver registro aqui, usa preco_ml base de materiais_lineares
CREATE TABLE acabamento_precos_material (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id        uuid        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  material_linear_id uuid       NOT NULL REFERENCES materiais_lineares(id) ON DELETE CASCADE,
  material_id       uuid        NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  preco_ml          numeric(14,2) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, material_linear_id, material_id)
);

ALTER TABLE acabamento_precos_material ENABLE ROW LEVEL SECURITY;

-- Isolamento por empresa
CREATE POLICY "empresa_isolamento" ON acabamento_precos_material
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
