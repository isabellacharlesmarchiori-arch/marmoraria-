-- ============================================================
-- Migration: 20260430000006_fix_medicao_notificacoes_duplicadas.sql
--
-- PROBLEMA 1 — fn_notificar_medicao_enviada pode notificar
-- o mesmo usuário duas vezes quando admin = vendedor do projeto.
-- Fix: guarda IS DISTINCT FROM antes de inserir para o admin.
--
-- PROBLEMA 2 — fn_processar_medicao (passo 7) inseria uma
-- segunda notificação ao vendedor com título diferente, causando
-- duplicação. Fix: notificação removida de fn_processar_medicao;
-- toda notificação de medição passa por fn_notificar_medicao_enviada.
--
-- Coluna incorreta: fn_processar_medicao usava "descricao" em vez
-- de "corpo" — corrigido junto com a remoção da notificação.
-- ============================================================


-- ─── PASSO 0 — Diagnóstico (execute separado se quiser ver o estado atual) ────
--
-- Triggers ativos em medicoes:
--   SELECT trigger_name, event_manipulation, action_statement
--   FROM information_schema.triggers
--   WHERE event_object_table = 'medicoes' AND trigger_schema = 'public'
--   ORDER BY trigger_name;
--
-- Últimas notificações + quem recebeu:
--   SELECT n.created_at, n.tipo, n.titulo, u.nome, u.perfil
--   FROM notificacoes n
--   JOIN usuarios u ON u.id = n.usuario_id
--   ORDER BY n.created_at DESC LIMIT 30;
--
-- Políticas SELECT em notificacoes:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'notificacoes' ORDER BY cmd;
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Corrige fn_notificar_medicao_enviada ─────────────────────────────────
-- Guard: se admin_id = vendedor_id, não envia segunda notificação para o mesmo
-- usuário (cenário: dono da empresa também é vendedor do projeto).

CREATE OR REPLACE FUNCTION public.fn_notificar_medicao_enviada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendedor_id  uuid;
  v_empresa_id   uuid;
  v_projeto_nome text;
  v_admin_id     uuid;
BEGIN
  IF NEW.status <> 'enviada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'enviada' THEN RETURN NEW; END IF;

  SELECT p.vendedor_id, p.empresa_id, p.nome
    INTO v_vendedor_id, v_empresa_id, v_projeto_nome
    FROM projetos p
   WHERE p.id = NEW.projeto_id;

  -- Notifica vendedor do projeto
  IF v_vendedor_id IS NOT NULL THEN
    INSERT INTO notificacoes (
      id, empresa_id, usuario_id, projeto_id,
      tipo, titulo, corpo, lida, created_at
    ) VALUES (
      gen_random_uuid(),
      v_empresa_id,
      v_vendedor_id,
      NEW.projeto_id,
      'medicao_processada',
      'Medição enviada pelo app',
      'O medidor enviou os dados pelo SmartStone para o projeto "' ||
        COALESCE(v_projeto_nome, 'sem nome') ||
        '". Acesse o projeto para iniciar o orçamento.',
      false,
      NOW()
    );
  END IF;

  -- Notifica admin SOMENTE se há medidor atribuído E admin é diferente do vendedor
  -- (evita duplicar notificação quando o dono da empresa também é o vendedor).
  IF NEW.medidor_id IS NOT NULL THEN
    v_admin_id := fn_get_admin_id(v_empresa_id);
    IF v_admin_id IS NOT NULL AND v_admin_id IS DISTINCT FROM v_vendedor_id THEN
      INSERT INTO notificacoes (
        id, empresa_id, usuario_id, projeto_id,
        tipo, titulo, corpo, lida, created_at
      ) VALUES (
        gen_random_uuid(),
        v_empresa_id,
        v_admin_id,
        NEW.projeto_id,
        'medicao_processada',
        'Medição enviada para orçamento',
        'O medidor enviou os dados do projeto "' ||
          COALESCE(v_projeto_nome, 'sem nome') ||
          '". Aguardando orçamento do vendedor.',
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ─── 2. Remove notificação duplicada de fn_processar_medicao ─────────────────
-- O passo 7 da função original inseria uma segunda notificação ao vendedor com
-- título "Medição processada", independente do tg_notificar_medicao_enviada.
-- Removido: toda notificação de medição agora passa exclusivamente pelo trigger
-- tg_notificar_medicao_enviada (status = 'enviada').

CREATE OR REPLACE FUNCTION public.fn_processar_medicao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medida       jsonb;
  v_ambiente_id  uuid;
  v_peca_id      uuid;

  v_nome_peca    text;
  v_acabamento   text;
  v_altura       numeric;
  v_largura      numeric;
  v_qtd          numeric;
  v_area         numeric;
  v_espessura_cm int;
  v_esp_str      text;

  v_resumo       jsonb    := '[]'::jsonb;
  v_total_area   numeric  := 0;
BEGIN

  -- Idempotência: não reprocessar se ambientes já foram criados para esta medição.
  IF EXISTS (SELECT 1 FROM ambientes WHERE medicao_id = NEW.id LIMIT 1) THEN
    RETURN NEW;
  END IF;

  -- Cria o ambiente (um por medição)
  v_ambiente_id := gen_random_uuid();
  INSERT INTO ambientes (id, empresa_id, projeto_id, medicao_id, nome, created_at)
  VALUES (v_ambiente_id, NEW.empresa_id, NEW.projeto_id, NEW.id, 'Medição', NOW());

  -- Itera sobre cada linha de medida
  FOR v_medida IN SELECT value FROM jsonb_array_elements(NEW.medidas) LOOP

    v_nome_peca  := NULLIF(TRIM(COALESCE(v_medida->>'peca', '')), '');
    v_acabamento := COALESCE(v_medida->>'acabamento', '');

    v_altura := NULLIF(REPLACE(COALESCE(v_medida->>'altura', ''), ',', '.'), '')::numeric;
    v_largura := NULLIF(REPLACE(COALESCE(v_medida->>'largura', ''), ',', '.'), '')::numeric;
    v_qtd     := COALESCE(
      NULLIF(REPLACE(COALESCE(v_medida->>'qtd', ''), ',', '.'), '')::numeric, 1
    );

    IF v_altura IS NULL OR v_largura IS NULL OR v_altura <= 0 OR v_largura <= 0 THEN
      CONTINUE;
    END IF;

    v_area := ROUND(v_altura * v_largura * v_qtd, 4);

    v_esp_str := COALESCE(v_medida->>'espessura', '');
    v_espessura_cm := COALESCE(
      NULLIF(REGEXP_REPLACE(v_esp_str, '[^0-9]', '', 'g'), '')::int, 2
    );
    IF v_espessura_cm NOT IN (1, 2, 3) THEN v_espessura_cm := 2; END IF;

    v_peca_id := gen_random_uuid();

    INSERT INTO pecas (
      id, empresa_id, ambiente_id, tipo, nome_livre, espessura_cm,
      area_bruta_m2, area_liquida_m2, dimensoes, arestas, recortes,
      incluida, created_at
    ) VALUES (
      v_peca_id,
      NEW.empresa_id,
      v_ambiente_id,
      'retangulo',
      COALESCE(v_nome_peca, 'Peça sem nome'),
      v_espessura_cm,
      v_area,
      v_area,
      jsonb_build_object('altura', v_altura, 'largura', v_largura, 'qtd', v_qtd),
      CASE WHEN v_acabamento <> '' THEN jsonb_build_object('face', v_acabamento)
           ELSE '{}'::jsonb END,
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
              THEN ROUND((v_altura + v_largura) * 2 * v_qtd, 2) ELSE 0 END,
          'reto_simples_ml',
            CASE WHEN v_acabamento ILIKE '%reto%simples%'
              THEN ROUND((v_altura + v_largura) * 2 * v_qtd, 2) ELSE 0 END
        ),
        'recortes_qty', 0
      )
    );

    v_total_area := v_total_area + v_area;

  END LOOP;

  -- Persiste json_medicao e muda status para 'processada'
  UPDATE medicoes
  SET
    json_medicao = jsonb_build_object(
      'resumo_por_peca', v_resumo,
      'totais', jsonb_build_object(
        'area_total_m2', ROUND(v_total_area, 4),
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

  -- Notificação REMOVIDA daqui. O tg_notificar_medicao_enviada (status = 'enviada')
  -- é responsável por toda notificação de medição para o vendedor e o admin.

  RETURN NEW;
END;
$$;


-- ─── 3. Verificação ──────────────────────────────────────────────────────────

-- Confirma triggers ativos em medicoes após o fix:
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'medicoes'
  AND trigger_schema = 'public'
ORDER BY trigger_name, event_manipulation;
