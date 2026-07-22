-- Orçamentos avulsos: a empresa tem um único projeto-fantasma '[Avulsos]'
-- (compartilhado, sem cliente) onde qualquer vendedor cria orçamentos soltos.
-- Esta migration só garante que cliente_id aceita NULL.
--
-- Trade-off: preferimos relaxar a constraint a criar um cliente-fantasma,
-- porque cliente falso poluiria relatórios e a base de clientes.
-- ALTER ... DROP NOT NULL é no-op inofensivo se a coluna já for nullable.
--
-- APLICAR VIA DASHBOARD (SQL Editor), conforme padrão do projeto.

ALTER TABLE projetos ALTER COLUMN cliente_id DROP NOT NULL;
