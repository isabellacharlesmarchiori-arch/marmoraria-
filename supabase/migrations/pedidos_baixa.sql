-- Campo para rastrear se o pedido já foi baixado no financeiro
ALTER TABLE pedidos_fechados
  ADD COLUMN IF NOT EXISTS baixado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS baixado_por    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS lancamento_ids uuid[];
