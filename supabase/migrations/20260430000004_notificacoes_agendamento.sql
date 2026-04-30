-- Migration: 20260430000004_notificacoes_agendamento.sql
--
-- Adiciona suporte a agendamento de mensagens manuais do admin.
-- scheduled_at: quando NULL, a notificação é imediata (comportamento atual).
-- status_envio: 'enviada' (visível) ou 'agendada' (aguarda worker/cron).
--
-- Nenhuma notificação existente é afetada: scheduled_at fica NULL e
-- status_envio recebe o DEFAULT 'enviada' via backfill automático do Postgres.

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS scheduled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS status_envio  text NOT NULL DEFAULT 'enviada'
    CHECK (status_envio IN ('enviada', 'agendada'));
