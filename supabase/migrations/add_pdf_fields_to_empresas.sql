ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS cnpj      text,
  ADD COLUMN IF NOT EXISTS telefone  text,
  ADD COLUMN IF NOT EXISTS endereco  text;
