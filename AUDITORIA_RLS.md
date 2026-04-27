# Auditoria RLS — 2026-04-27

> Fonte: análise dos arquivos em `supabase/migrations/`.
> Tabelas sem migration de RLS podem estar configuradas via Supabase Dashboard (não rastreado em git).
> **VERIFICAR** as marcadas com ⚠️ diretamente no banco.

## Como verificar no SQL Editor do Supabase

```sql
SELECT relname AS tabela, relrowsecurity AS rls_habilitado
FROM pg_class
WHERE relname IN (
  'usuarios','empresas','profiles','clientes','projetos','orcamentos',
  'fechamentos','formas_pagamento','arquitetos','pedidos_fechados',
  'notificacoes','medicoes','pdf_templates','acabamentos_unitarios',
  'materiais','parceiros','financeiro_contas','financeiro_plano_contas',
  'financeiro_lancamentos','financeiro_cheques',
  'financeiro_mdo_direta','financeiro_emprestimos'
)
AND relkind = 'r'
ORDER BY relname;
```

---

## Tabelas do Módulo Financeiro (novas — migrations documentadas)

| Tabela | RLS Habilitado | SELECT | INSERT | UPDATE | DELETE | Risco |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| `financeiro_contas` | ✅ | Admin only | Admin only | Admin only | Admin only | ✅ OK |
| `financeiro_plano_contas` | ✅ | Admin only | Admin only | Admin only | Admin only | ✅ OK |
| `financeiro_lancamentos` | ✅ | Admin + Vendedor (só própria comissão) | Admin only | Admin only | ❌ Nenhuma (soft delete intencional) | ✅ OK |
| `financeiro_cheques` | ✅ | Admin only | Admin only | Admin only | Admin only | ✅ OK |
| `parceiros` | ✅ | Admin only (+ view `parceiros_publicos` para autenticados) | Admin only | Admin only | Admin only | ✅ OK |
| `financeiro_mdo_direta` | ❌ NÃO ENCONTRADA | ❌ | ❌ | ❌ | ❌ | 🔴 ALTO — V001 |
| `financeiro_emprestimos` | ❌ NÃO ENCONTRADA | ❌ | ❌ | ❌ | ❌ | 🔴 ALTO — V001 |

---

## Tabelas Pré-Existentes (migrations parciais ou sem RLS documentada)

| Tabela | RLS Habilitado | SELECT | INSERT | UPDATE | DELETE | Risco |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| `arquitetos` | ✅ | `empresa_id` match | `empresa_id` match | `empresa_id` match | `empresa_id` match | ✅ OK |
| `pedidos_fechados` | ✅ | `empresa_id` match | — | — | — | ⚠️ INSERT/UPDATE/DELETE não confirmados |
| `medicoes` | ✅ | `empresa_id` match | `empresa_id` match | `empresa_id` match | `empresa_id` match | ✅ OK |
| `pdf_templates` | ✅ | `empresa_id` match | — | — | — | ⚠️ verificar demais operações |
| `acabamentos_unitarios` | ✅ | `empresa_id` match | — | — | — | ⚠️ verificar demais operações |

---

## Tabelas Principais (sem migration de RLS — VERIFICAR NO DASHBOARD)

| Tabela | RLS Habilitado | SELECT | INSERT | UPDATE | DELETE | Risco |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| `usuarios` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `empresas` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `clientes` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `projetos` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `orcamentos` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `fechamentos` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🔴 CRÍTICO se desabilitado |
| `formas_pagamento` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🟡 MÉDIO se desabilitado |
| `notificacoes` | ⚠️ VERIFICAR | ? | ? | ? | ? | 🟡 MÉDIO se desabilitado |
| `profiles` | gerenciada pelo Supabase Auth | — | — | — | — | ℹ️ Protegida pelo Auth |

---

## Observações

### `financeiro_lancamentos` — DELETE intencional bloqueado
Não existe policy de DELETE por design: cancelamento é feito via `status = 'cancelado'` (soft delete). Isso está correto e é uma regra de negócio documentada.

### `parceiros_publicos` — View com security_invoker=false
View que expõe campos não-sensíveis de `parceiros` para usuários não-admin. A tabela base tem RLS admin-only; a view bypassa essa RLS intencionalmente mas filtra `empresa_id = auth.uid()` via subquery. `dados_bancarios` **não está incluído** na view. Padrão correto.

### Prioridade de ação
1. Rodar a query de verificação acima no Supabase Dashboard — 5 minutos
2. Confirmar `relrowsecurity = true` para todas as tabelas principais
3. Se alguma retornar `false` → tratamento imediato antes de qualquer outra atividade
