-- Troca material_id (FK para materiais individuais) por categoria (text)
-- O preço diferenciado é por CATEGORIA (Granito, Mármore, etc.), não por pedra específica
ALTER TABLE acabamento_precos_material
  DROP COLUMN material_id,
  ADD COLUMN categoria text NOT NULL DEFAULT '';

-- Remove default temporário (foi necessário para o ALTER sem dados)
ALTER TABLE acabamento_precos_material ALTER COLUMN categoria DROP DEFAULT;

-- Recria constraint de unicidade com a nova coluna
ALTER TABLE acabamento_precos_material
  DROP CONSTRAINT IF EXISTS acabamento_precos_material_empresa_id_material_linear_id_mate,
  ADD CONSTRAINT acabamento_precos_material_empresa_id_ml_id_cat_key
    UNIQUE (empresa_id, material_linear_id, categoria);
