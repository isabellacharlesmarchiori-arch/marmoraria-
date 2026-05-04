-- ============================================================
-- Migration: 20260504000001_superadmin.sql
--
-- Objetivo: Adicionar perfil 'superadmin' — usuário de plataforma
-- sem vínculo com empresa específica.
--
-- Decisões de schema:
--   • empresa_id em usuarios torna-se nullable: superadmin não pertence
--     a nenhuma empresa (NULL), sem impacto nos demais perfis.
--   • empresa_id em materiais/materiais_lineares torna-se nullable:
--     empresa_id IS NULL = catálogo global do sistema; empresa_id != NULL
--     = comportamento atual por tenant.
--   • RLS de materiais/materiais_lineares é recriado para suportar
--     leitura do catálogo global por qualquer usuário autenticado.
--   • Policies de leitura cross-tenant adicionadas em empresas, usuarios
--     e projetos para o painel de administração do superadmin.
--   • Todas as policies usam get_my_perfil() (SECURITY DEFINER, já existe)
--     para evitar recursão em usuarios e para consistência com o projeto.
-- ============================================================


-- ─── 1. Estende CHECK constraint de perfil ───────────────────────────────────

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil IN ('vendedor', 'admin', 'medidor', 'admin_medidor', 'vendedor_medidor', 'superadmin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_perfil_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_perfil_check
  CHECK (perfil IN ('vendedor', 'admin', 'medidor', 'admin_medidor', 'vendedor_medidor', 'superadmin'));


-- ─── 2. empresa_id nullable em usuarios ──────────────────────────────────────
-- superadmin é de plataforma: não pertence a nenhuma empresa.

ALTER TABLE public.usuarios ALTER COLUMN empresa_id DROP NOT NULL;


-- ─── 3. Tabela templates_globais ─────────────────────────────────────────────
-- Catálogo cross-tenant: materiais e acabamentos padrão para todo o sistema.
-- SEM empresa_id por design — são globais.

CREATE TABLE IF NOT EXISTS public.templates_globais (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       text        NOT NULL
               CHECK (tipo IN ('material', 'acabamento', 'forma_pagamento')),
  nome       text        NOT NULL,
  dados      jsonb       NOT NULL DEFAULT '{}',
  ativo      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.templates_globais ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler templates globais
CREATE POLICY "templates_globais_leitura" ON public.templates_globais
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Apenas superadmin pode criar, atualizar e excluir
CREATE POLICY "templates_globais_superadmin" ON public.templates_globais
  FOR ALL
  USING (get_my_perfil() = 'superadmin')
  WITH CHECK (get_my_perfil() = 'superadmin');


-- ─── 4. empresa_id nullable em materiais / materiais_lineares ────────────────
-- empresa_id IS NULL  → material do catálogo global
-- empresa_id NOT NULL → material da empresa (comportamento atual)

ALTER TABLE public.materiais ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE public.materiais_lineares ALTER COLUMN empresa_id DROP NOT NULL;


-- ─── 5. Recria RLS de materiais com suporte ao catálogo global ───────────────

DROP POLICY IF EXISTS "empresa_isolamento" ON public.materiais;

-- Leitura: própria empresa OU catálogo global
CREATE POLICY "materiais_leitura" ON public.materiais
  FOR SELECT
  USING (
    empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

-- Escrita por empresa: apenas registros da própria empresa
CREATE POLICY "materiais_insert_empresa" ON public.materiais
  FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "materiais_update_empresa" ON public.materiais
  FOR UPDATE
  USING  (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "materiais_delete_empresa" ON public.materiais
  FOR DELETE
  USING (empresa_id = get_my_empresa_id());

-- Superadmin: acesso total (incluindo empresa_id IS NULL)
CREATE POLICY "materiais_superadmin" ON public.materiais
  FOR ALL
  USING (get_my_perfil() = 'superadmin')
  WITH CHECK (get_my_perfil() = 'superadmin');


-- ─── 6. Recria RLS de materiais_lineares com suporte ao catálogo global ──────

DROP POLICY IF EXISTS "empresa_isolamento" ON public.materiais_lineares;

CREATE POLICY "materiais_lineares_leitura" ON public.materiais_lineares
  FOR SELECT
  USING (
    empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

CREATE POLICY "materiais_lineares_insert_empresa" ON public.materiais_lineares
  FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "materiais_lineares_update_empresa" ON public.materiais_lineares
  FOR UPDATE
  USING  (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "materiais_lineares_delete_empresa" ON public.materiais_lineares
  FOR DELETE
  USING (empresa_id = get_my_empresa_id());

CREATE POLICY "materiais_lineares_superadmin" ON public.materiais_lineares
  FOR ALL
  USING (get_my_perfil() = 'superadmin')
  WITH CHECK (get_my_perfil() = 'superadmin');


-- ─── 7. Policies cross-tenant para o painel superadmin ───────────────────────
-- Necessário para listar empresas, contar usuários e projetos no painel.

-- empresas: superadmin lê todas
CREATE POLICY "empresas_superadmin_leitura" ON public.empresas
  FOR SELECT
  USING (get_my_perfil() = 'superadmin');

-- usuarios: superadmin lê todos (policy separada para não afetar as demais)
CREATE POLICY "usuarios_superadmin_leitura" ON public.usuarios
  FOR SELECT
  USING (get_my_perfil() = 'superadmin');

-- projetos: superadmin lê todos (para estatísticas do painel)
CREATE POLICY "projetos_superadmin_leitura" ON public.projetos
  FOR SELECT
  USING (get_my_perfil() = 'superadmin');
