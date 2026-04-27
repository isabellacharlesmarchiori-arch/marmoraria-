# Auditoria de Segurança — 2026-04-27

## Resumo Executivo

- **Total de vulnerabilidades:** 6
- **Críticas:** 1 | **Altas:** 2 | **Médias:** 2 | **Baixas/Info:** 1
- **Correções aplicadas nesta sessão:** 4 comentários `TODO: SEGURANÇA`
- **Status do git antes da auditoria:** não estava limpo (`package.json` e `package-lock.json` modificados, `gerar-icones.html` não rastreado)
- **Sem Flutter, sem Edge Functions** — escopo reduzido ao frontend React e migrations Supabase

---

## ✅ Pontos Positivos Encontrados

Antes das vulnerabilidades, o que está correto:

- `repassar_cheque` (RPC): valida `perfil = 'admin'` e `empresa_id` antes de executar — correto
- `RequireAuth` em `App.jsx`: aguarda `loading=false` antes de redirecionar, sem flash de conteúdo protegido
- Sem nenhum `USING (true)` em policies — nenhuma policy aberta encontrada
- Sem `service_role` key no frontend — apenas `anon` key, lida de `import.meta.env`
- `.env.local` coberto pelo padrão `*.local` no `.gitignore` — não comitado
- Nenhum `console.log` com CPF, senha, token ou dados bancários encontrado
- Módulo financeiro: `FinanceiroContas`, `FinanceiroCheques`, `FinanceiroRelatorios` têm guard `profile.perfil !== 'admin'`
- SECURITY DEFINER functions usam `SET search_path = public, pg_temp` (proteção contra search_path injection)

---

## Vulnerabilidades CRÍTICAS/ALTAS — Aguardando Aprovação

### [V001] financeiro_mdo_direta e financeiro_emprestimos sem RLS

- **Severidade:** 🔴 ALTA
- **Localização:** `supabase/migrations/20260424000001_financeiro_dre_schema.sql:117–220`
- **Descrição:** Duas tabelas criadas no módulo DRE (MDO Direta e Empréstimos) não têm `ENABLE ROW LEVEL SECURITY` nem policies. Qualquer usuário autenticado pode ler e escrever dados de qualquer empresa nessas tabelas diretamente via Supabase client.
- **Impacto:** Violação completa de isolamento multi-tenant nessas duas tabelas. Um usuário de empresa A pode ler/modificar/inserir dados de empresa B.
- **Recomendação:** Migration separada com `ALTER TABLE financeiro_mdo_direta ENABLE ROW LEVEL SECURITY` + `ALTER TABLE financeiro_emprestimos ENABLE ROW LEVEL SECURITY` + policies admin-only idênticas ao padrão do módulo financeiro.
- **Status:** ⏸️ Aguardando aprovação para aplicar migration

---

### [V002] Tabelas principais sem RLS documentada em migrations

- **Severidade:** 🔴 CRÍTICA (risco desconhecido — precisa verificação imediata)
- **Localização:** Supabase Dashboard > Authentication > Policies
- **Descrição:** As tabelas abaixo não têm `ENABLE ROW LEVEL SECURITY` em nenhum arquivo de migration. Podem ter sido configuradas manualmente via dashboard (não rastreado em git), ou podem estar completamente sem proteção.

  Tabelas: `usuarios`, `empresas`, `clientes`, `projetos`, `orcamentos`, `fechamentos`, `formas_pagamento`, `notificacoes`

- **Impacto potencial:** Se RLS não estiver habilitado, qualquer usuário autenticado pode ler todos os dados de todas as empresas — violação total de multi-tenancy.
- **Ação imediata:** Verificar no Supabase Dashboard → Table Editor ou SQL Editor:
  ```sql
  SELECT relname, relrowsecurity
  FROM pg_class
  WHERE relname IN ('usuarios','empresas','clientes','projetos','orcamentos',
                    'fechamentos','formas_pagamento','notificacoes')
    AND relkind = 'r';
  ```
  `relrowsecurity = true` = RLS habilitado. Qualquer `false` = vulnerabilidade crítica.
- **Status:** ⏸️ Verificação necessária antes de qualquer ação

---

### [V003] `recalcular_saldo_conta` sem validação de empresa_id

- **Severidade:** 🟠 MÉDIA-ALTA
- **Localização:** `supabase/migrations/20260422183001_financeiro_triggers.sql:35–75`
- **Descrição:** Função RPC com `SECURITY DEFINER` e `GRANT EXECUTE TO authenticated`. Como bypassa RLS, qualquer usuário autenticado pode chamar com qualquer `conta_id` UUID — incluindo contas de outras empresas. A função retorna o saldo calculado (leitura cross-tenant) e atualiza `saldo_atual` (escrita cross-tenant).
- **Impacto:** Leitura de saldo financeiro de outra empresa + capacidade de recalcular/sobrescrever esse saldo.
- **Mitigação atual:** UUIDs são v4 aleatórios (122 bits de entropia) — praticamente impossível adivinhar. Risco real só se um UUID vazar por outro meio.
- **Recomendação (não aplicar sem aprovação):**
  ```sql
  -- Adicionar ANTES do SELECT saldo_inicial:
  DECLARE
    v_conta_empresa_id uuid;
    v_usuario_empresa_id uuid;
  BEGIN
    SELECT empresa_id INTO v_conta_empresa_id FROM financeiro_contas WHERE id = p_conta_id;
    SELECT empresa_id INTO v_usuario_empresa_id FROM usuarios WHERE id = auth.uid();
    IF v_conta_empresa_id IS DISTINCT FROM v_usuario_empresa_id THEN
      RAISE EXCEPTION 'Conta pertence a outra empresa.';
    END IF;
  ```
- **Status:** ⏸️ Aguardando aprovação — requer migration

---

## Vulnerabilidades MÉDIAS — Aguardando Aprovação

### [V004] `/admin/configuracoes` sem guard de perfil no componente

- **Severidade:** 🟡 MÉDIA
- **Localização:** `src/pages/Configuracoes.jsx:47`, `src/App.jsx:123`
- **Descrição:** A página de Configurações não tem verificação de `profile.perfil === 'admin'` no início do componente. Um vendedor ou medidor que digitar a URL diretamente pode:
  1. Ver a lista de todos os usuários da empresa (nomes, emails, perfis, status ativo)
  2. Ver dados bancários da empresa no estado React, mesmo com a seção oculta na UI (acessível via DevTools)
  3. Potencialmente alterar materiais e formas de pagamento (depende das RLS das tabelas subjacentes)
- **Recomendação:**
  ```jsx
  // Adicionar logo após: const { profile, session, refreshProfile } = useAuth();
  if (profile && profile.perfil !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full p-12 text-zinc-500">
        Acesso restrito a administradores.
      </div>
    );
  }
  ```
- **Status:** ⏸️ Aguardando aprovação

---

### [V005] `FinanceiroDashboard` sem guard de perfil

- **Severidade:** 🟡 BAIXA-MÉDIA
- **Localização:** `src/pages/financeiro/FinanceiroDashboard.jsx:40`
- **Descrição:** Único módulo financeiro sem verificação de perfil (os outros 4 — Contas, Cheques, Relatorios, Lançamentos — já têm). Um vendedor ou medidor que conhecer a URL `/admin/financeiro/dashboard` acessa a UI. Os dados financeiros são protegidos por RLS (veriam cards vazios), mas os dados de `projetos` e `usuarios` (que têm RLS menos restrita) poderiam aparecer.
- **Recomendação:** Adicionar o mesmo padrão já usado nos outros módulos (`if (profile?.perfil !== 'admin') return <AccessDenied />`).
- **Status:** ⏸️ Aguardando aprovação (baixo risco, sem impacto em produção)

---

## Vulnerabilidades Baixas/Info

### [V006] `AdminNotificacoes` sem guard de perfil

- **Severidade:** ℹ️ INFO
- **Localização:** `src/pages/AdminNotificacoes.jsx`
- **Descrição:** Página acessível a qualquer usuário autenticado, mas as notificações são filtradas por `usuario_id` via RLS — sem risco de vazamento de dados de outros usuários.
- **Status:** Documentado apenas

---

## Correções Aplicadas Nesta Sessão

### [C001] Comentário TODO: SEGURANÇA — FinanceiroDashboard sem guard

- **Arquivo:** `src/pages/financeiro/FinanceiroDashboard.jsx:40`
- **Ação:** Adicionado comentário apontando ausência de guard de perfil
- **Risco da correção:** Zero (apenas comentário)

### [C002] Comentário TODO: SEGURANÇA — Configuracoes sem guard

- **Arquivo:** `src/pages/Configuracoes.jsx:47`
- **Ação:** Adicionado comentário apontando ausência de guard de perfil
- **Risco da correção:** Zero (apenas comentário)

### [C003] Comentário TODO: SEGURANÇA — recalcular_saldo_conta sem empresa_id

- **Arquivo:** `supabase/migrations/20260422183001_financeiro_triggers.sql:34`
- **Ação:** Adicionado comentário SQL apontando necessidade de validação
- **Risco da correção:** Zero (apenas comentário)

### [C004] Comentário TODO: SEGURANÇA — tabelas DRE sem RLS

- **Arquivo:** `supabase/migrations/20260424000001_financeiro_dre_schema.sql:116`
- **Ação:** Adicionado comentário SQL sobre ausência de RLS
- **Risco da correção:** Zero (apenas comentário)

---

## Próximos Passos (por prioridade)

- [ ] **URGENTE** — Verificar RLS das tabelas principais no Supabase Dashboard (V002) — 5 minutos
- [ ] **ALTA** — Criar migration de RLS para `financeiro_mdo_direta` e `financeiro_emprestimos` (V001)
- [ ] **MÉDIA** — Adicionar guard de perfil em `Configuracoes.jsx` (V004)
- [ ] **MÉDIA** — Adicionar empresa_id check em `recalcular_saldo_conta` (V003)
- [ ] **BAIXA** — Adicionar guard de perfil em `FinanceiroDashboard.jsx` (V005)
- [ ] Revisar `empresas.dados_bancarios` no AuthContext — confirmar se exposição a vendedores é intencional (necessário para geração de PDFs de orçamento)
