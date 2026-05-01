-- Adiciona suporte a preço por material individual (prioridade sobre categoria)
-- Torna categoria nullable: quando material_id estiver preenchido, categoria fica NULL

ALTER TABLE acabamento_precos_material ALTER COLUMN categoria DROP NOT NULL;

ALTER TABLE acabamento_precos_material
  ADD COLUMN material_id uuid REFERENCES materiais(id) ON DELETE CASCADE;

-- Garante que ao menos um dos dois está preenchido
ALTER TABLE acabamento_precos_material
  ADD CONSTRAINT check_cat_or_mat
    CHECK (categoria IS NOT NULL OR material_id IS NOT NULL);

-- Remove constraint de unicidade antiga (que assumia categoria NOT NULL)
ALTER TABLE acabamento_precos_material
  DROP CONSTRAINT IF EXISTS acabamento_precos_material_empresa_id_ml_id_cat_key;

-- Unicidade para linhas por categoria
CREATE UNIQUE INDEX apm_uniq_cat
  ON acabamento_precos_material (empresa_id, material_linear_id, categoria)
  WHERE categoria IS NOT NULL AND material_id IS NULL;

-- Unicidade para linhas por material específico
CREATE UNIQUE INDEX apm_uniq_mat
  ON acabamento_precos_material (empresa_id, material_linear_id, material_id)
  WHERE material_id IS NOT NULL;
