-- Fix: adicionar ON DELETE CASCADE na FK medicao_id de ambientes
-- Ao deletar uma medição, todos os ambientes vinculados são deletados automaticamente.
--
-- Execute no Supabase Dashboard → SQL Editor

-- 1. Descobrir o nome atual da constraint (varia por instância)
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'ambientes'::regclass AND confrelid = 'medicoes'::regclass;

-- 2. Recriar a constraint com CASCADE
--    Substitua 'ambientes_medicao_id_fkey' pelo nome real se for diferente.
ALTER TABLE ambientes
  DROP CONSTRAINT IF EXISTS ambientes_medicao_id_fkey;

ALTER TABLE ambientes
  ADD CONSTRAINT ambientes_medicao_id_fkey
  FOREIGN KEY (medicao_id)
  REFERENCES medicoes(id)
  ON DELETE CASCADE;
