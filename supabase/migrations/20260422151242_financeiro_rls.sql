-- ============================================================
-- Migration: 20260422151242_financeiro_rls.sql
--
-- Escopo: Row Level Security do módulo financeiro.
-- Zero alteração de schema — apenas ENABLE ROW LEVEL SECURITY,
-- 20 policies (SELECT/INSERT/UPDATE/DELETE) e view parceiros_publicos.
--
-- Decisões de design documentadas:
--
-- 1. parceiros_publicos usa security_invoker=false (definer):
--    A tabela base `parceiros` tem RLS restrita a admin.
--    A view precisa bypassar essa RLS para ser acessível a não-admin.
--    O filtro WHERE empresa_id na view garante isolamento multi-tenant.
--    GRANT SELECT na view (não na tabela) controla quem lê campos públicos.
--    Opção B (duas policies na tabela) foi descartada porque abriria
--    dados_bancarios para vendedor que consultasse a tabela diretamente.
--
-- 2. Policy do vendedor em financeiro_lancamentos usa subquery via
--    parceiros_publicos (não via tabela base): se a subquery apontasse
--    direto para `parceiros`, o vendedor (sem policy SELECT nessa tabela)
--    veria 0 linhas e nunca passaria pela condição. A view definer
--    bypassa esse bloqueio corretamente. Ordem no arquivo importa:
--    a view é criada antes das policies que a referenciam.
--
-- 3. DELETE: financeiro_lancamentos não tem policy de DELETE por design
--    (soft delete via status='cancelado' — nenhum lançamento é removido fisicamente).
--    As demais 4 tabelas (financeiro_contas, financeiro_plano_contas, parceiros,
--    financeiro_cheques) têm policy de DELETE restrita a admin da mesma empresa.
--
-- 4. WITH CHECK em INSERT e UPDATE impede que admin de empresa A
--    crie ou mova registros para empresa B (defesa em profundidade).
-- ============================================================


-- ─── 1. financeiro_contas ────────────────────────────────────────────────────

ALTER TABLE financeiro_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro_contas_select_admin" ON financeiro_contas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_contas_insert_admin" ON financeiro_contas
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- WITH CHECK impede que admin mova uma conta para outra empresa via UPDATE
CREATE POLICY "financeiro_contas_update_admin" ON financeiro_contas
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_contas_delete_admin" ON financeiro_contas
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );


-- ─── 2. financeiro_plano_contas ──────────────────────────────────────────────

ALTER TABLE financeiro_plano_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro_plano_contas_select_admin" ON financeiro_plano_contas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_plano_contas_insert_admin" ON financeiro_plano_contas
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_plano_contas_update_admin" ON financeiro_plano_contas
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_plano_contas_delete_admin" ON financeiro_plano_contas
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );


-- ─── 3. parceiros + view parceiros_publicos ──────────────────────────────────
--
-- Ordem importa: RLS e policies na tabela base primeiro,
-- depois a view — que é referenciada pela policy do vendedor
-- em financeiro_lancamentos (seção 4).

ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;

-- Apenas admin acessa a tabela base (contém dados_bancarios sensíveis)
CREATE POLICY "parceiros_select_admin" ON parceiros
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "parceiros_insert_admin" ON parceiros
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "parceiros_update_admin" ON parceiros
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "parceiros_delete_admin" ON parceiros
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- View sem dados_bancarios acessível a qualquer usuário autenticado da empresa.
-- security_invoker=false (definer): roda como o dono da view (postgres),
-- bypassa a RLS da tabela base intencionalmente — é a única forma de expor
-- campos não-sensíveis sem abrir a tabela base para não-admin.
-- O WHERE empresa_id garante isolamento multi-tenant dentro da view.
CREATE VIEW parceiros_publicos
WITH (security_invoker = false)
AS
SELECT
  id,
  empresa_id,
  tipos,
  nome,
  documento,
  telefone,
  email,
  endereco,
  usuario_id,
  percentual_comissao_padrao,
  observacoes,
  ativo,
  created_at,
  updated_at
FROM parceiros
WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid());

-- Grant na view, não na tabela — authenticated lê apenas os campos públicos
GRANT SELECT ON parceiros_publicos TO authenticated;


-- ─── 4. financeiro_lancamentos ───────────────────────────────────────────────

ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

-- Admin vê todos os lançamentos da empresa
CREATE POLICY "financeiro_lancamentos_select_admin" ON financeiro_lancamentos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- Vendedor vê apenas suas comissões automáticas.
-- Subquery via parceiros_publicos (definer) em vez da tabela base:
-- o vendedor não tem policy SELECT em `parceiros`, então uma subquery
-- direta retornaria 0 linhas e a condição nunca passaria.
-- A view definer bypassa o bloqueio e filtra corretamente por usuario_id.
CREATE POLICY "financeiro_lancamentos_select_vendedor_comissao" ON financeiro_lancamentos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'vendedor'
    AND origem = 'auto_comissao'
    AND parceiro_id IN (
      SELECT id FROM parceiros_publicos
      WHERE usuario_id = auth.uid()
        AND ativo = true
    )
  );

-- Medidor: nenhuma policy de SELECT → vê 0 linhas (RLS nega por omissão)

CREATE POLICY "financeiro_lancamentos_insert_admin" ON financeiro_lancamentos
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_lancamentos_update_admin" ON financeiro_lancamentos
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );


-- ─── 5. financeiro_cheques ───────────────────────────────────────────────────

ALTER TABLE financeiro_cheques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro_cheques_select_admin" ON financeiro_cheques
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_cheques_insert_admin" ON financeiro_cheques
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_cheques_update_admin" ON financeiro_cheques
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "financeiro_cheques_delete_admin" ON financeiro_cheques
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );


/*
════════════════════════════════════════════════════════════════
  TESTES MANUAIS — descomentar e rodar no SQL Editor do Supabase.

  Como simular um usuário autenticado no SQL Editor:
    SET LOCAL role = authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
  Para resetar entre cenários: feche e reabra o editor, ou use
    RESET role;

  Substitua UUID_ADMIN, UUID_VENDEDOR, UUID_MEDIDOR, UUID_ADMIN_EMPRESA_A
  pelos auth.uid() reais dos usuários de teste.
════════════════════════════════════════════════════════════════

-- ── Cenário 1: Admin vê financeiro_contas ─────────────────────────────────
-- Esperado: linhas da empresa (ou 0 se tabela vazia, mas sem erro de permissão)

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_ADMIN","role":"authenticated"}';
  SELECT * FROM financeiro_contas;


-- ── Cenário 2: Vendedor NÃO vê financeiro_contas ──────────────────────────
-- Esperado: 0 linhas (RLS bloqueia por ausência de policy para vendedor)

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_VENDEDOR","role":"authenticated"}';
  SELECT * FROM financeiro_contas;


-- ── Cenário 3: Medidor NÃO vê financeiro_lancamentos ─────────────────────
-- Esperado: 0 linhas

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_MEDIDOR","role":"authenticated"}';
  SELECT * FROM financeiro_lancamentos;


-- ── Cenário 4: Vendedor vê própria comissão ───────────────────────────────
-- Pré-requisito:
--   • parceiros: registro com usuario_id = UUID_VENDEDOR
--   • financeiro_lancamentos: registro com origem='auto_comissao'
--     e parceiro_id apontando para esse parceiro
-- Esperado: retorna o lançamento de comissão

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_VENDEDOR","role":"authenticated"}';
  SELECT id, descricao, origem, valor_previsto FROM financeiro_lancamentos;


-- ── Cenário 5: Vendedor NÃO vê lançamento com origem diferente ───────────
-- Pré-requisito: lançamento com origem='manual' no banco
-- Esperado: 0 linhas (policy exige origem='auto_comissao')

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_VENDEDOR","role":"authenticated"}';
  SELECT * FROM financeiro_lancamentos WHERE origem = 'manual';


-- ── Cenário 6: DELETE bloqueado para todos (incluindo admin) ─────────────
-- Esperado: 0 linhas deletadas (ausência de policy DELETE = negado)
-- Verificar depois com SELECT que a linha ainda existe.

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_ADMIN","role":"authenticated"}';
  DELETE FROM financeiro_lancamentos WHERE id = 'UUID_LANCAMENTO_QUALQUER';
  -- Após o DELETE, confirmar que a linha permanece:
  SELECT id FROM financeiro_lancamentos WHERE id = 'UUID_LANCAMENTO_QUALQUER';


-- ── Cenário 7: Vendedor lê parceiros_publicos sem dados_bancarios ─────────
-- Esperado: retorna linhas da empresa; coluna dados_bancarios ausente

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_VENDEDOR","role":"authenticated"}';
  SELECT * FROM parceiros_publicos;
  -- Confirmar que dados_bancarios não aparece nas colunas retornadas.
  -- Tentar explicitamente:
  SELECT dados_bancarios FROM parceiros_publicos;
  -- Deve retornar: ERROR: column "dados_bancarios" does not exist


-- ── Cenário 8: Vendedor NÃO acessa tabela base parceiros ─────────────────
-- Esperado: 0 linhas (RLS bloqueia; apenas admin tem policy SELECT)

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_VENDEDOR","role":"authenticated"}';
  SELECT * FROM parceiros;


-- ── Cenário 9: Isolamento multi-tenant ───────────────────────────────────
-- Pré-requisito: admin de empresa A e registros de empresa B no banco
-- Esperado: admin A vê somente empresa_id da empresa A

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_ADMIN_EMPRESA_A","role":"authenticated"}';
  SELECT DISTINCT empresa_id FROM financeiro_lancamentos;
  -- Deve retornar exatamente 1 linha com o empresa_id da empresa A


-- ── Cenário 10: DELETE permitido pra admin em tabelas auxiliares ──────────
-- Esperado: admin consegue DELETE em financeiro_contas (linha removida).
-- E mesmo admin NÃO consegue DELETE em financeiro_lancamentos (linha permanece).

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"UUID_ADMIN","role":"authenticated"}';

  -- Parte A: DELETE permitido em financeiro_contas
  DELETE FROM financeiro_contas WHERE id = 'UUID_CONTA_TESTE';
  SELECT id FROM financeiro_contas WHERE id = 'UUID_CONTA_TESTE';
  -- Deve retornar 0 linhas (conta deletada)

  -- Parte B: DELETE bloqueado em financeiro_lancamentos (mesmo admin)
  DELETE FROM financeiro_lancamentos WHERE id = 'UUID_LANCAMENTO_TESTE';
  SELECT id FROM financeiro_lancamentos WHERE id = 'UUID_LANCAMENTO_TESTE';
  -- Deve retornar 1 linha (lançamento NÃO foi deletado)

*/


-- ─── Próxima migration esperada ──────────────────────────────────────────────
-- financeiro_triggers.sql
--   • Trigger de saldo_atual em financeiro_contas (soma de lançamentos liquidados)
--   • Trigger auto_rt: gera lançamento de saída para arquiteto ao liquidar entrada
--   • Trigger bloqueio de RT/comissão até projeto quitado
--   • Trigger de endosso/repasse de cheques
