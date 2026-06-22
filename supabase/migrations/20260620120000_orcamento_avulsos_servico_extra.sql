-- Serviço Extra: avulso de texto livre, sem vínculo a produtos_avulsos.
-- Trade-off: reusamos a tabela orcamento_avulsos em vez de criar tabela nova,
-- já que serviço extra é estruturalmente igual a um avulso (nome + valor + qtd),
-- diferindo apenas por não ter produto de catálogo (produto_id NULL).
--
-- 1. produto_id passa a aceitar NULL (serviço extra não tem produto de catálogo).
--    Corrige também bug latente: o app já tentava inserir produto_id=NULL para
--    avulsos manuais, o que falhava silenciosamente (tabela estava vazia).
-- 2. nova coluna nome: rótulo livre quando não há produto de catálogo vinculado.
-- 3. CHECK garante que todo registro tem rótulo (produto vinculado OU nome livre).

ALTER TABLE orcamento_avulsos
  ALTER COLUMN produto_id DROP NOT NULL;

ALTER TABLE orcamento_avulsos
  ADD COLUMN IF NOT EXISTS nome text;

ALTER TABLE orcamento_avulsos
  ADD CONSTRAINT orcamento_avulsos_nome_ou_produto
  CHECK (produto_id IS NOT NULL OR nome IS NOT NULL);
