-- Registra uso de IA (modelo, tokens, fluxo) para monitoramento de custos.
-- Sem ON DELETE CASCADE: logs históricos devem persistir mesmo se a empresa for removida.

CREATE TABLE ai_usage_logs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid          REFERENCES empresas(id) ON DELETE SET NULL,
  fluxo           text          NOT NULL CHECK (fluxo IN ('chat_vendedor', 'analise_planta')),
  modelo          text          NOT NULL,
  tokens_entrada  integer       NOT NULL DEFAULT 0,
  tokens_saida    integer       NOT NULL DEFAULT 0,
  from_cache      boolean       NOT NULL DEFAULT false,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_logs_empresa_id_idx ON ai_usage_logs (empresa_id);
CREATE INDEX ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode inserir logs da própria empresa
CREATE POLICY "insert própria empresa"
  ON ai_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    OR empresa_id IS NULL
  );

-- Apenas admin pode ler logs
CREATE POLICY "admin lê logs da empresa"
  ON ai_usage_logs FOR SELECT
  TO authenticated
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );
