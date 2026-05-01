-- ============================================================
-- Migration: 20260430000007_fix_fn_processar_medicao_flutter_v2.sql
--
-- Problema: Flutter V2 mudou o formato dos dados de medição.
--
--   Formato ANTIGO (medidas[]): campos planos por peça
--     [{altura, largura, qtd, acabamento, espessura}]
--
--   Formato NOVO (json_medicao): estrutura completa com segmentos e recortes
--     json_medicao.ambientes[0].pecas[]
--       [{nome, tipo, area_m2, espessura_cm, segmentos[], recortes[]}]
--
-- O ambiente era criado corretamente em ambos os fluxos, mas as peças
-- não eram inseridas em `pecas` porque o loop ainda lia de medidas[],
-- que no formato novo não carrega os campos altura/largura/qtd.
--
-- Trade-offs de design:
--   • Condição WHEN do trigger ampliada: dispara quando json_medicao já
--     chegou preenchido com ambientes (Flutter V2) OU quando medidas[] está
--     preenchido (formato antigo). São caminhos mutuamente exclusivos na prática.
--   • `AND NEW.status IS DISTINCT FROM 'processada'` no ramo novo evita
--     re-trigger infinito: após UPDATE interno que seta status, o trigger
--     reavalia a condição e não dispara (status já é 'processada').
--   • json_medicao NÃO é sobrescrito no caminho novo — Flutter V2 já enviou
--     a estrutura correta; apenas status e registros em `pecas` são escritos.
--   • No caminho antigo, comportamento 100% idêntico ao anterior.
--   • Notificação corrigida: descricao → corpo, adicionado projeto_id.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_processar_medicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medida       jsonb;
  v_peca         jsonb;
  v_ambiente_id  uuid;
  v_peca_id      uuid;
  v_vendedor_id  uuid;

  -- campos por medida (formato antigo)
  v_nome_peca    text;
  v_acabamento   text;
  v_altura       numeric;
  v_largura      numeric;
  v_qtd          numeric;
  v_area         numeric;
  v_espessura_cm int;
  v_esp_str      text;

  -- acumuladores (formato antigo)
  v_resumo       jsonb   := '[]'::jsonb;
  v_total_area   numeric := 0;

  v_formato_novo boolean := false;
BEGIN

  -- Idempotência: não reprocessar se ambientes já foram criados
  IF EXISTS (SELECT 1 FROM ambientes WHERE medicao_id = NEW.id LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- Detecta formato novo: json_medicao já veio com ambientes[0].pecas[]
  IF NEW.json_medicao IS NOT NULL
     AND (NEW.json_medicao->'ambientes') IS NOT NULL
     AND jsonb_array_length(NEW.json_medicao->'ambientes') > 0
     AND (NEW.json_medicao->'ambientes'->0->'pecas') IS NOT NULL
  THEN
    v_formato_novo := true;
  END IF;

  -- Cria o ambiente (um por medição; nome vem do json quando disponível)
  v_ambiente_id := gen_random_uuid();

  INSERT INTO ambientes (id, empresa_id, projeto_id, medicao_id, nome, created_at)
  VALUES (
    v_ambiente_id,
    NEW.empresa_id,
    NEW.projeto_id,
    NEW.id,
    CASE
      WHEN v_formato_novo
        THEN COALESCE(NEW.json_medicao->'ambientes'->0->>'nome', 'Medição')
      ELSE 'Medição'
    END,
    NOW()
  );

  -- ══════════════════════════════════════════════════════════════════════
  -- FORMATO NOVO (Flutter V2): lê peças de json_medicao.ambientes[0].pecas
  -- ══════════════════════════════════════════════════════════════════════
  IF v_formato_novo THEN

    FOR v_peca IN
      SELECT value
        FROM jsonb_array_elements(NEW.json_medicao->'ambientes'->0->'pecas')
    LOOP

      v_area := COALESCE(
        NULLIF(REPLACE(COALESCE(v_peca->>'area_m2', ''), ',', '.'), '')::numeric,
        0
      );

      v_espessura_cm := COALESCE((v_peca->>'espessura_cm')::int, 2);
      IF v_espessura_cm NOT IN (1, 2, 3) THEN
        v_espessura_cm := 2;
      END IF;

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
        gen_random_uuid(),
        NEW.empresa_id,
        v_ambiente_id,
        COALESCE(NULLIF(v_peca->>'tipo', ''), 'retangulo'),
        COALESCE(NULLIF(v_peca->>'nome', ''), 'Peça sem nome'),
        v_espessura_cm,
        v_area,
        v_area,   -- area_liquida_m2: recortes já descontados pelo app Flutter
        COALESCE(v_peca->'segmentos', '[]'::jsonb),
        '{}'::jsonb,
        COALESCE(v_peca->'recortes', '[]'::jsonb),
        true,
        NOW()
      );

    END LOOP;

    -- json_medicao já está correto (enviado pelo Flutter V2) — não sobrescrever
    UPDATE medicoes SET status = 'processada' WHERE id = NEW.id;

  -- ══════════════════════════════════════════════════════════════════════
  -- FORMATO ANTIGO (fallback): lê peças de medidas[]
  -- ══════════════════════════════════════════════════════════════════════
  ELSE

    FOR v_medida IN
      SELECT value FROM jsonb_array_elements(NEW.medidas)
    LOOP

      v_nome_peca  := NULLIF(TRIM(COALESCE(v_medida->>'peca', '')), '');
      v_acabamento := COALESCE(v_medida->>'acabamento', '');

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

      v_area := ROUND(v_altura * v_largura * v_qtd, 4);

      -- Parse espessura: "2 cm" → 2; fora de {1,2,3} → default 2
      v_esp_str := COALESCE(v_medida->>'espessura', '');
      v_espessura_cm := COALESCE(
        NULLIF(REGEXP_REPLACE(v_esp_str, '[^0-9]', '', 'g'), '')::int,
        2
      );
      IF v_espessura_cm NOT IN (1, 2, 3) THEN
        v_espessura_cm := 2;
      END IF;

      v_peca_id := gen_random_uuid();

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
        v_area,
        v_area,
        jsonb_build_object(
          'altura',  v_altura,
          'largura', v_largura,
          'qtd',     v_qtd
        ),
        CASE WHEN v_acabamento <> ''
          THEN jsonb_build_object('face', v_acabamento)
          ELSE '{}'::jsonb
        END,
        '[]'::jsonb,
        true,
        NOW()
      );

      v_resumo := v_resumo || jsonb_build_array(
        jsonb_build_object(
          'peca_id',         v_peca_id,
          'nome',            COALESCE(v_nome_peca, 'Peça sem nome'),
          'area_liquida_m2', v_area,
          'espessura_cm',    v_espessura_cm,
          'acabamentos', jsonb_build_object(
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

    -- Persiste json_medicao resumido e muda status
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

    -- Notifica vendedor (caminho antigo — Flutter V2 usa fn_notificar_medicao_enviada)
    SELECT vendedor_id INTO v_vendedor_id FROM projetos WHERE id = NEW.projeto_id;

    IF v_vendedor_id IS NOT NULL THEN
      INSERT INTO notificacoes (
        id, empresa_id, usuario_id, projeto_id,
        tipo, titulo, corpo, lida, created_at
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

  END IF;

  RETURN NEW;

END;
$$;


-- ─── Trigger ─────────────────────────────────────────────────────────────────
-- Dispara em dois cenários:
--   (a) Formato antigo: medidas[] preenchido e json_medicao ainda null
--   (b) Formato novo (Flutter V2): json_medicao chegou com ambientes[0].pecas[]
--       `AND NEW.status IS DISTINCT FROM 'processada'` evita re-trigger após
--       UPDATE interno que seta apenas o status (json_medicao fica intacto).

DROP TRIGGER IF EXISTS tg_processar_medicao ON medicoes;

CREATE TRIGGER tg_processar_medicao
AFTER INSERT OR UPDATE ON medicoes
FOR EACH ROW
WHEN (
  -- (a) Formato antigo
  (
    NEW.medidas IS NOT NULL
    AND jsonb_array_length(NEW.medidas) > 0
    AND NEW.json_medicao IS NULL
  )
  OR
  -- (b) Formato novo (Flutter V2)
  (
    NEW.json_medicao IS NOT NULL
    AND (NEW.json_medicao->'ambientes') IS NOT NULL
    AND jsonb_array_length(COALESCE(NEW.json_medicao->'ambientes', '[]'::jsonb)) > 0
    AND NEW.status IS DISTINCT FROM 'processada'
  )
)
EXECUTE FUNCTION fn_processar_medicao();
