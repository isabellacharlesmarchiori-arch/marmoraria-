-- Módulo de Estoque: chapas, pedaceiras, produtos avulsos e insumos
--
-- Trade-offs de design:
--   • estoque_pedaceiras não tem quantidade — cada pedaço é único, diferente das chapas que chegam em lote
--   • campos de defeito (tem_trinca, tem_mula) como booleanos em vez de array de enums:
--     simples de indexar e exibir como badges, sem custo de JOIN
--   • produtos_avulsos e insumos são catálogos simples sem FK para materiais
--     (materiais como cuba, torneira etc. não são pedras)
--   • foto_url armazena o path no bucket 'estoque-fotos' (não a URL completa)
--   • RLS: SELECT liberado para todos os perfis da empresa; escrita apenas para admin

-- ── Chapas ────────────────────────────────────────────────────────────────────

CREATE TABLE estoque_chapas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  material_id  uuid        NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  categoria    text        NOT NULL CHECK (categoria IN ('granito','marmore','quartzito','quartzo','lamina','nanoglass')),
  largura_cm   numeric(8,2) NOT NULL CHECK (largura_cm > 0),
  altura_cm    numeric(8,2) NOT NULL CHECK (altura_cm > 0),
  espessura_cm numeric(5,2) NOT NULL DEFAULT 2 CHECK (espessura_cm > 0),
  quantidade   integer     NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  tem_trinca   boolean     NOT NULL DEFAULT false,
  tem_mula     boolean     NOT NULL DEFAULT false,
  observacoes  text,
  foto_url     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER estoque_chapas_updated_at
  BEFORE UPDATE ON estoque_chapas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE estoque_chapas ENABLE ROW LEVEL SECURITY;

-- Leitura para todos os perfis autenticados da empresa
CREATE POLICY "estoque_chapas_leitura" ON estoque_chapas
  FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- Escrita somente para admin
CREATE POLICY "estoque_chapas_escrita_admin" ON estoque_chapas
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- ── Pedaceiras ───────────────────────────────────────────────────────────────

CREATE TABLE estoque_pedaceiras (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  material_id       uuid        NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  categoria         text        NOT NULL CHECK (categoria IN ('granito','marmore','quartzito','quartzo','lamina','nanoglass')),
  largura_cm        numeric(8,2) NOT NULL CHECK (largura_cm > 0),
  altura_cm         numeric(8,2) NOT NULL CHECK (altura_cm > 0),
  espessura_cm      numeric(5,2) NOT NULL DEFAULT 2 CHECK (espessura_cm > 0),
  tem_trinca        boolean     NOT NULL DEFAULT false,
  tem_mula          boolean     NOT NULL DEFAULT false,
  observacoes       text,
  foto_url          text,
  -- NULL quando o pedaço foi adquirido avulso (não sobrou de projeto)
  origem_projeto_id uuid        REFERENCES projetos(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER estoque_pedaceiras_updated_at
  BEFORE UPDATE ON estoque_pedaceiras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE estoque_pedaceiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_pedaceiras_leitura" ON estoque_pedaceiras
  FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "estoque_pedaceiras_escrita_admin" ON estoque_pedaceiras
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- ── Produtos Avulsos ─────────────────────────────────────────────────────────

CREATE TABLE estoque_produtos_avulsos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome        text        NOT NULL,
  categoria   text,
  quantidade  integer     NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  unidade     text,
  observacoes text,
  foto_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER estoque_produtos_avulsos_updated_at
  BEFORE UPDATE ON estoque_produtos_avulsos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE estoque_produtos_avulsos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_produtos_avulsos_leitura" ON estoque_produtos_avulsos
  FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "estoque_produtos_avulsos_escrita_admin" ON estoque_produtos_avulsos
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- ── Insumos ──────────────────────────────────────────────────────────────────

CREATE TABLE estoque_insumos (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid          NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome        text          NOT NULL,
  categoria   text,
  quantidade  numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  unidade     text,          -- ex: 'unidade', 'rolo', 'litro', 'kg'
  observacoes text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER estoque_insumos_updated_at
  BEFORE UPDATE ON estoque_insumos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE estoque_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_insumos_leitura" ON estoque_insumos
  FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "estoque_insumos_escrita_admin" ON estoque_insumos
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
    AND (SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
  );

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Criar via dashboard: Storage > New Bucket > "estoque-fotos" > Public
-- A policy abaixo garante que autenticados da empresa possam fazer upload
-- e qualquer um possa fazer download (bucket público).
-- Execute no SQL Editor após criar o bucket:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('estoque-fotos', 'estoque-fotos', true)
-- ON CONFLICT (id) DO NOTHING;
