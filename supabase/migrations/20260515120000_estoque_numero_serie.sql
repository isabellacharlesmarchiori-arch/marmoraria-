-- Número de série e flag de etiqueta impressa para chapas e pedaceiras
--
-- Trade-offs:
--   • Sequência gerada via tabela de contadores com INSERT ON CONFLICT + RETURNING
--     para atomicidade em batch inserts (múltiplas linhas no mesmo statement)
--   • SECURITY DEFINER para que a trigger function possa acessar estoque_serie_counters
--     independente do perfil do usuário conectado
--   • SET search_path = public evita path injection em funções SECURITY DEFINER

-- ── Tabela de contadores por prefixo/mês ─────────────────────────────────────

CREATE TABLE estoque_serie_counters (
  tabela     text    NOT NULL,
  ano_mes    text    NOT NULL,
  ultimo_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tabela, ano_mes)
);

-- ── Chapas ────────────────────────────────────────────────────────────────────

ALTER TABLE estoque_chapas
  ADD COLUMN numero_serie      text    UNIQUE,
  ADD COLUMN etiqueta_impressa boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fn_gerar_numero_serie_chapa()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ano_mes text;
  v_seq     integer;
BEGIN
  IF NEW.numero_serie IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_ano_mes := TO_CHAR(NOW(), 'YYYYMM');
  INSERT INTO estoque_serie_counters (tabela, ano_mes, ultimo_seq)
    VALUES ('chapas', v_ano_mes, 1)
  ON CONFLICT (tabela, ano_mes) DO UPDATE
    SET ultimo_seq = estoque_serie_counters.ultimo_seq + 1
  RETURNING ultimo_seq INTO v_seq;
  NEW.numero_serie := 'CH-' || v_ano_mes || '-' || LPAD(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_numero_serie_chapa
  BEFORE INSERT ON estoque_chapas
  FOR EACH ROW EXECUTE FUNCTION fn_gerar_numero_serie_chapa();

-- ── Pedaceiras ───────────────────────────────────────────────────────────────

ALTER TABLE estoque_pedaceiras
  ADD COLUMN numero_serie      text    UNIQUE,
  ADD COLUMN etiqueta_impressa boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fn_gerar_numero_serie_pedaceira()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ano_mes text;
  v_seq     integer;
BEGIN
  IF NEW.numero_serie IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_ano_mes := TO_CHAR(NOW(), 'YYYYMM');
  INSERT INTO estoque_serie_counters (tabela, ano_mes, ultimo_seq)
    VALUES ('pedaceiras', v_ano_mes, 1)
  ON CONFLICT (tabela, ano_mes) DO UPDATE
    SET ultimo_seq = estoque_serie_counters.ultimo_seq + 1
  RETURNING ultimo_seq INTO v_seq;
  NEW.numero_serie := 'PD-' || v_ano_mes || '-' || LPAD(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_numero_serie_pedaceira
  BEFORE INSERT ON estoque_pedaceiras
  FOR EACH ROW EXECUTE FUNCTION fn_gerar_numero_serie_pedaceira();
