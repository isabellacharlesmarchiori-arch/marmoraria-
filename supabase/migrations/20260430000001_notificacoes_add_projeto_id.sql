-- Migration: 20260430000001_notificacoes_add_projeto_id.sql
--
-- Adiciona coluna projeto_id à tabela notificacoes.
-- Necessário para que notificações possam linkar ao projeto de origem
-- e permitir navegação direta ao clicar em uma notificação no frontend.
--
-- ON DELETE SET NULL: se o projeto for deletado, a notificação permanece
-- mas sem o link de navegação (não perde histórico de notificações).

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS projeto_id uuid
    REFERENCES public.projetos(id)
    ON DELETE SET NULL;
