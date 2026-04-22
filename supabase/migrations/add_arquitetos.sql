-- Cria tabela de arquitetos
CREATE TABLE IF NOT EXISTS arquitetos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome                 text NOT NULL,
  email                text,
  telefone             text,
  endereco             text,
  cpf                  text,
  rg                   text,
  data_nascimento      date,
  dados_pagamento_pix  text,
  created_at           timestamptz DEFAULT now()
);

-- Vincula arquiteto ao projeto
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS arquiteto_id uuid REFERENCES arquitetos(id) ON DELETE SET NULL;

-- RLS: usuários da mesma empresa veem os arquitetos
ALTER TABLE arquitetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arquitetos_empresa_select" ON arquitetos
  FOR SELECT USING (empresa_id = (SELECT empresa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "arquitetos_empresa_insert" ON arquitetos
  FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "arquitetos_empresa_update" ON arquitetos
  FOR UPDATE USING (empresa_id = (SELECT empresa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "arquitetos_empresa_delete" ON arquitetos
  FOR DELETE USING (empresa_id = (SELECT empresa_id FROM profiles WHERE id = auth.uid()));
