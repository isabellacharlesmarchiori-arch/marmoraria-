-- ============================================================
-- Migration: 20260427095252_enable_rls_critical_tables.sql
--
-- Objetivo: Corrigir vulnerabilidade V002 identificada na auditoria
-- de segurança de 27/04/2026 — 8 tabelas principais tinham policies
-- corretas mas RLS desabilitado (policies inativas = sem efeito).
--
-- Também corrige V002-sub: policy aberta "Permitir tudo para usuários
-- autenticados na tabela empresas" (USING (true)) que coexistia com a
-- policy correta "empresas_own". Com RLS desabilitado era inócua;
-- com RLS ativo ela abriria a tabela para qualquer usuário autenticado
-- ler dados de TODAS as empresas. Deve ser removida antes de ativar RLS.
--
-- Ordem importa:
--   1. DROP da policy aberta (antes de ativar RLS — evita janela de risco)
--   2. ENABLE ROW LEVEL SECURITY (ativa as policies existentes)
--
-- Reversão de emergência (se algo quebrar em produção):
--   ALTER TABLE public.usuarios  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.empresas  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.clientes  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.projetos  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.orcamentos DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.fechamentos DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.formas_pagamento DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.notificacoes DISABLE ROW LEVEL SECURITY;
-- ============================================================


-- ─── 1. Remover policy aberta na tabela empresas ─────────────────────────────
-- Esta policy tem USING (true) — com RLS ativo permitiria qualquer usuário
-- autenticado ler dados de todas as empresas. A policy "empresas_own" ao
-- lado já cobre o caso de uso correto (owner vê apenas sua própria empresa).

DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados na tabela empresas"
  ON public.empresas;


-- ─── 2. Habilitar RLS (ativa as policies existentes) ─────────────────────────

ALTER TABLE public.usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes     ENABLE ROW LEVEL SECURITY;


-- TODO: SEGURANÇA — Adicionar FORCE ROW LEVEL SECURITY em sessão
-- futura, após auditar triggers e functions que possam depender
-- do bypass de owner.
