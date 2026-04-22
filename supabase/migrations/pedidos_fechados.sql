-- ── Recriar tabela com tipos corretos (UUIDs) ────────────────────────────────
DROP TABLE IF EXISTS pedidos_fechados CASCADE;

CREATE TABLE pedidos_fechados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      UUID NOT NULL,
  cenario_ids     UUID[] NOT NULL DEFAULT '{}',
  forma_pagamento VARCHAR(50) NOT NULL,
  parcelas        INTEGER,
  prazo_entrega   DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'FECHADO',  -- FECHADO | REVERTIDO
  vendedor_id     UUID NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pedidos_fechados_projeto ON pedidos_fechados(projeto_id);
CREATE INDEX idx_pedidos_fechados_status  ON pedidos_fechados(status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE pedidos_fechados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acessa_pedidos" ON pedidos_fechados
  FOR ALL USING (
    projeto_id IN (
      SELECT id FROM projetos WHERE empresa_id = (
        SELECT empresa_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── Campo status no projeto ───────────────────────────────────────────────────
ALTER TABLE projetos ADD COLUMN IF NOT EXISTS status_pedido VARCHAR(20) DEFAULT 'ORCAMENTO';
-- Valores: ORCAMENTO | FECHADO

-- ── Soft delete em orcamentos ────────────────────────────────────────────────
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS descartado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orcamentos_descartado
  ON orcamentos(descartado_em)
  WHERE descartado_em IS NOT NULL;

-- ── Job de limpeza: deletar cenários descartados há +7 dias ──────────────────
-- Habilitar pg_cron: Supabase Dashboard → Database → Extensions → pg_cron
-- Então executar:
-- SELECT cron.schedule(
--   'limpar-cenarios-descartados',
--   '0 3 * * *',
--   $$ DELETE FROM orcamentos
--      WHERE descartado_em IS NOT NULL
--        AND descartado_em < NOW() - INTERVAL '7 days' $$
-- );
