-- ============================================================
-- RESET DE DADOS DE TESTE — execute no Supabase SQL Editor
-- Apaga apenas dados de movimento; tabelas e usuários intactos
-- ============================================================

-- 1. Notificações
DELETE FROM notificacoes;

-- 2. Medições (inclui medidas jsonb)
DELETE FROM medicoes;

-- 3. Orçamentos: peças, avulsos e o orçamento em si
DELETE FROM orcamento_pecas;
DELETE FROM orcamento_avulsos;
DELETE FROM orcamentos;

-- 4. Ambientes
DELETE FROM ambientes;

-- 5. Projetos
DELETE FROM projetos;

-- 6. Clientes
DELETE FROM clientes;

-- Verificação rápida — deve retornar 0 em todas as linhas
SELECT 'clientes'     AS tabela, COUNT(*) AS total FROM clientes
UNION ALL
SELECT 'projetos',     COUNT(*) FROM projetos
UNION ALL
SELECT 'ambientes',    COUNT(*) FROM ambientes
UNION ALL
SELECT 'orcamentos',   COUNT(*) FROM orcamentos
UNION ALL
SELECT 'medicoes',     COUNT(*) FROM medicoes
UNION ALL
SELECT 'notificacoes', COUNT(*) FROM notificacoes;
