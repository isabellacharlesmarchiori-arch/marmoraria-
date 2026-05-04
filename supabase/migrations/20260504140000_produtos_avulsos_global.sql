-- Torna empresa_id nullable em produtos_avulsos para suportar catálogo global.
-- empresa_id IS NULL = serviço/furo do catálogo global do sistema
-- empresa_id NOT NULL = serviço/furo da empresa (comportamento atual)
-- Segue o mesmo padrão já aplicado a materiais e materiais_lineares
-- em 20260504000001_superadmin.sql.

ALTER TABLE public.produtos_avulsos ALTER COLUMN empresa_id DROP NOT NULL;


-- Recria a policy única de isolamento por uma família de policies
-- que suporta leitura do catálogo global por qualquer usuário autenticado.

DROP POLICY IF EXISTS "empresa_isolamento" ON public.produtos_avulsos;

-- Leitura: própria empresa OU catálogo global
CREATE POLICY "produtos_avulsos_leitura" ON public.produtos_avulsos
  FOR SELECT
  USING (
    empresa_id = get_my_empresa_id()
    OR empresa_id IS NULL
  );

-- Escrita por empresa: apenas registros da própria empresa
CREATE POLICY "produtos_avulsos_insert_empresa" ON public.produtos_avulsos
  FOR INSERT
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "produtos_avulsos_update_empresa" ON public.produtos_avulsos
  FOR UPDATE
  USING  (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "produtos_avulsos_delete_empresa" ON public.produtos_avulsos
  FOR DELETE
  USING (empresa_id = get_my_empresa_id());

-- Superadmin: acesso total (incluindo empresa_id IS NULL)
CREATE POLICY "produtos_avulsos_superadmin" ON public.produtos_avulsos
  FOR ALL
  USING (get_my_perfil() = 'superadmin')
  WITH CHECK (get_my_perfil() = 'superadmin');
