-- RLS para tabelas sem proteção de isolamento por empresa
-- Todas as políticas usam o padrão inline do projeto (sem função helper)
-- Triggers com SECURITY DEFINER continuam funcionando normalmente com RLS ativo

-- projetos
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON projetos;
CREATE POLICY "empresa_isolamento" ON projetos FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- medicoes
ALTER TABLE medicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON medicoes;
CREATE POLICY "empresa_isolamento" ON medicoes FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- ambientes
ALTER TABLE ambientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON ambientes;
CREATE POLICY "empresa_isolamento" ON ambientes FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- pecas
ALTER TABLE pecas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON pecas;
CREATE POLICY "empresa_isolamento" ON pecas FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- materiais
ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON materiais;
CREATE POLICY "empresa_isolamento" ON materiais FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- materiais_lineares
ALTER TABLE materiais_lineares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON materiais_lineares;
CREATE POLICY "empresa_isolamento" ON materiais_lineares FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- produtos_avulsos
ALTER TABLE produtos_avulsos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON produtos_avulsos;
CREATE POLICY "empresa_isolamento" ON produtos_avulsos FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));

-- convites
ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolamento" ON convites;
CREATE POLICY "empresa_isolamento" ON convites FOR ALL
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));
