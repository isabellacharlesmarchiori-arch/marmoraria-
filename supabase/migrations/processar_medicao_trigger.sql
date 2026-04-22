-- ============================================================
-- TRIGGER: processar_medicao
-- Dispara APÓS INSERT ou UPDATE em `medicoes` quando:
--   • o campo `medidas` (jsonb) está preenchido
--   • `json_medicao` ainda é NULL (evita reprocessamento)
--
-- O que faz:
--   1. Valida e converte cada linha de `medidas` para numeric
--   2. Cria um registro em `ambientes` vinculado à medição
--   3. Cria registros em `pecas` com área calculada (altura × largura × qtd)
--   4. Constrói e salva `json_medicao` no formato esperado pelo app
--   5. Muda status → 'processada'
--   6. Insere notificação para o vendedor do projeto
-- ============================================================

-- ─── 1. Função ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_processar_medicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medida       jsonb;
  v_ambiente_id  uuid;
  v_peca_id      uuid;
  v_vendedor_id  uuid;

  -- campos por medida
  v_nome_peca    text;
  v_acabamento   text;
  v_altura       numeric;
  v_largura      numeric;
  v_qtd          numeric;
  v_area         numeric;
  v_espessura_cm int;
  v_esp_str      text;

  -- acumuladores
  v_resumo       jsonb    := '[]'::jsonb;
  v_total_area   numeric  := 0;
BEGIN

  -- ── Guarda idempotência: não reprocessar se já houver ambientes ────────────
  IF EXISTS (SELECT 1 FROM ambientes WHERE medicao_id = NEW.id LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- ── 2. Criar o ambiente (um por medição) ──────────────────────────────────
  v_ambiente_id := gen_random_uuid();

  INSERT INTO ambientes (id, empresa_id, projeto_id, medicao_id, nome, created_at)
  VALUES (
    v_ambiente_id,
    NEW.empresa_id,
    NEW.projeto_id,
    NEW.id,
    'Medição',
    NOW()
  );

  -- ── 3. Iterar sobre cada linha de medida ──────────────────────────────────
  FOR v_medida IN
    SELECT value FROM jsonb_array_elements(NEW.medidas)
  LOOP

    v_nome_peca  := NULLIF(TRIM(COALESCE(v_medida->>'peca', '')), '');
    v_acabamento := COALESCE(v_medida->>'acabamento', '');

    -- Converte strings com vírgula ou ponto → numeric
    v_altura := NULLIF(
      REPLACE(COALESCE(v_medida->>'altura', ''), ',', '.'), ''
    )::numeric;

    v_largura := NULLIF(
      REPLACE(COALESCE(v_medida->>'largura', ''), ',', '.'), ''
    )::numeric;

    v_qtd := COALESCE(
      NULLIF(REPLACE(COALESCE(v_medida->>'qtd', ''), ',', '.'), '')::numeric,
      1
    );

    -- Pular linhas sem dimensões válidas
    IF v_altura IS NULL OR v_largura IS NULL
       OR v_altura <= 0  OR v_largura <= 0
    THEN
      CONTINUE;
    END IF;

    -- Área bruta = altura × largura × qtd (arredondado em 4 casas)
    v_area := ROUND(v_altura * v_largura * v_qtd, 4);

    -- Parse espessura: "2 cm" → 2; valores fora de {1,2,3} → default 2
    v_esp_str := COALESCE(v_medida->>'espessura', '');
    v_espessura_cm := COALESCE(
      NULLIF(REGEXP_REPLACE(v_esp_str, '[^0-9]', '', 'g'), '')::int,
      2
    );
    IF v_espessura_cm NOT IN (1, 2, 3) THEN
      v_espessura_cm := 2;
    END IF;

    v_peca_id := gen_random_uuid();

    -- ── 4. Inserir peça ─────────────────────────────────────────────────────
    INSERT INTO pecas (
      id,
      empresa_id,
      ambiente_id,
      tipo,
      nome_livre,
      espessura_cm,
      area_bruta_m2,
      area_liquida_m2,
      dimensoes,
      arestas,
      recortes,
      incluida,
      created_at
    ) VALUES (
      v_peca_id,
      NEW.empresa_id,
      v_ambiente_id,
      'retangulo',
      COALESCE(v_nome_peca, 'Peça sem nome'),
      v_espessura_cm,
      v_area,                         -- area_bruta_m2
      v_area,                         -- area_liquida_m2 (sem recortes neste fluxo)
      jsonb_build_object(
        'altura',  v_altura,
        'largura', v_largura,
        'qtd',     v_qtd
      ),
      -- arestas: registra acabamento de face se informado
      CASE WHEN v_acabamento <> ''
        THEN jsonb_build_object('face', v_acabamento)
        ELSE '{}'::jsonb
      END,
      '[]'::jsonb,                    -- sem recortes
      true,
      NOW()
    );

    -- ── 5. Acumula no resumo json_medicao ───────────────────────────────────
    v_resumo := v_resumo || jsonb_build_array(
      jsonb_build_object(
        'peca_id',         v_peca_id,
        'nome',            COALESCE(v_nome_peca, 'Peça sem nome'),
        'area_liquida_m2', v_area,
        'espessura_cm',    v_espessura_cm,
        'acabamentos', jsonb_build_object(
          -- ml estimado = perímetro × qtd quando o acabamento for do tipo linear
          'meia_esquadria_ml',
            CASE WHEN v_acabamento ILIKE '%meia%esquadria%'
              THEN ROUND((v_altura + v_largura) * 2 * v_qtd, 2)
              ELSE 0
            END,
          'reto_simples_ml',
            CASE WHEN v_acabamento ILIKE '%reto%simples%'
              THEN ROUND((v_altura + v_largura) * 2 * v_qtd, 2)
              ELSE 0
            END
        ),
        'recortes_qty', 0
      )
    );

    v_total_area := v_total_area + v_area;

  END LOOP;

  -- ── 6. Persistir json_medicao e mudar status ──────────────────────────────
  UPDATE medicoes
  SET
    json_medicao = jsonb_build_object(
      'resumo_por_peca', v_resumo,
      'totais', jsonb_build_object(
        'area_total_m2',     ROUND(v_total_area, 4),
        'meia_esquadria_ml', COALESCE(
          (SELECT SUM((p->>'meia_esquadria_ml')::numeric)
             FROM jsonb_array_elements(v_resumo) AS p,
                  jsonb_to_record(p->'acabamentos') AS x("meia_esquadria_ml" numeric)),
          0
        ),
        'reto_simples_ml', COALESCE(
          (SELECT SUM((p->>'reto_simples_ml')::numeric)
             FROM jsonb_array_elements(v_resumo) AS p,
                  jsonb_to_record(p->'acabamentos') AS x("reto_simples_ml" numeric)),
          0
        )
      )
    ),
    status = 'processada'
  WHERE id = NEW.id;

  -- ── 7. Notificar vendedor do projeto ──────────────────────────────────────
  SELECT vendedor_id
    INTO v_vendedor_id
    FROM projetos
   WHERE id = NEW.projeto_id;

  IF v_vendedor_id IS NOT NULL THEN
    INSERT INTO notificacoes (
      id, empresa_id, usuario_id, projeto_id,
      tipo, titulo, descricao, lida, created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.empresa_id,
      v_vendedor_id,
      NEW.projeto_id,
      'medicao_processada',
      'Medição processada',
      'As medidas foram processadas e o projeto está pronto para orçamento.',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;

END;
$$;


-- ─── 2. Trigger ──────────────────────────────────────────────────────────────
-- AFTER para que a FK medicao_id → medicoes.id já exista na hora do INSERT em ambientes.
-- A condição WHEN evita disparos desnecessários e o loop infinito causado pelo
-- UPDATE interno que seta json_medicao (pois na 2ª passagem json_medicao não será NULL).

DROP TRIGGER IF EXISTS tg_processar_medicao ON medicoes;

CREATE TRIGGER tg_processar_medicao
AFTER INSERT OR UPDATE ON medicoes
FOR EACH ROW
WHEN (
  NEW.medidas IS NOT NULL
  AND jsonb_array_length(NEW.medidas) > 0
  AND NEW.json_medicao IS NULL
)
EXECUTE FUNCTION fn_processar_medicao();
