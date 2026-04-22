# Contexto — ERP Marmoraria (Módulo Financeiro)

## Stack atual do projeto

**Banco:** Supabase (PostgreSQL 15, Auth, RLS, Realtime, Storage, Edge Functions)

**Dashboard web:**
- React 19 + Vite
- React Router 7
- Tailwind CSS 4
- `@supabase/supabase-js` ^2.101
- `lucide-react` (ícones)
- `jspdf` + `html2canvas` (geração de PDF)
- `recharts` (gráficos — será adicionado no módulo financeiro)
- `sonner` (toast — será adicionado no módulo financeiro)

**NÃO usar** (não estão no projeto e não devem ser introduzidos):
- shadcn/ui, Radix, Headless UI
- TanStack Query — queries são feitas direto com o client Supabase
- react-hook-form, zod — forms são controlados padrão React (`useState`)
- Bibliotecas de date picker — usar `<input type="date">` nativo

**App medidor:** Flutter (fora do escopo deste módulo, apenas lê/escreve no mesmo Supabase)

## Arquitetura

Multi-tenant por `empresa_id`. Toda tabela do módulo tem `empresa_id uuid NOT NULL` referenciando `empresas(id)`, com RLS filtrando pelo `empresa_id` do usuário logado.

Padrão de RLS usado no projeto (inline, não depender de função helper):

```sql
empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
```

Para checar perfil:

```sql
(SELECT perfil FROM usuarios WHERE id = auth.uid()) = 'admin'
```

## Tabelas pré-existentes (NÃO RECRIAR, NÃO ALTERAR sem aviso explícito)

- `empresas` (id, nome, logo_url, email_contato)
- `usuarios` (id = auth.uid, empresa_id, nome, email, perfil ∈ {admin, vendedor, medidor}, ativo)
- `profiles` (id = auth.uid, full_name, role, empresa_id) — gerenciada pelo Supabase Auth
- `clientes` (id, empresa_id, nome, telefone, email, endereco)
- `projetos` (id, empresa_id, cliente_id, vendedor_id, nome, status ∈ {orcado, aprovado, produzindo, entregue, perdido}, arquiteto_id, rt_padrao_percentual, status_pedido)
- `orcamentos` (id, empresa_id, ambiente_id, vendedor_id, projeto_id, valor_total, rt_percentual, rt_arquiteto_nome, taxa_instalacao, valor_frete, majoramento_percentual, descartado_em, ...)
- `fechamentos` (id, empresa_id, projeto_id, vendedor_id, orcamento_id, data_fechamento, valor_fechado, forma_pagamento_id, dados_pagamento jsonb)
- `formas_pagamento` (id, empresa_id, nome, campos jsonb)
- `arquitetos` (id, empresa_id, nome, cpf, rg, telefone, endereco, email, data_nascimento, dados_pagamento_pix) — **usada pela aba Arquitetos**. RT é pago a esses cadastros.
- `pedidos_fechados` (id, projeto_id, vendedor_id, cenario_ids[], forma_pagamento, parcelas, prazo_entrega, pdf_pedido_url, pdf_contrato_url, status)
- `notificacoes` (id, empresa_id, usuario_id, tipo, titulo, corpo, lida)

## Relação entre `arquitetos` e `parceiros` do financeiro

- **`arquitetos`** (já existe): cadastro completo dos arquitetos, usado pela aba "Arquitetos" do dashboard. RT é pago a esses registros.
- **`parceiros`** (será criada no módulo financeiro): cadastro de **fornecedores e funcionários** (quem a marmoraria paga que NÃO é arquiteto nem cliente). Ex: transportadora, fornecedor de chapas, concessionária de energia, vendedor (pra comissão).
- `financeiro_lancamentos` tem **três FKs mutuamente exclusivas**: `parceiro_id` (fornecedores/funcionários), `arquiteto_id` (arquitetos) e `cliente_id` (recebimentos de clientes). No máximo uma preenchida por lançamento. Todas podem ser NULL (ex: lançamento sem parceiro tipo "tarifa bancária").

## Convenções de código

**SQL / Migrations:**
- Pasta: `supabase/migrations/`, arquivos nomeados `YYYYMMDDHHMMSS_descricao.sql`
- Prefixo `financeiro_` para tabelas novas do módulo (exceto `parceiros`, que é unificada)
- Toda FK com `ON DELETE` explícito (`RESTRICT` por padrão para dados financeiros; `CASCADE` só para filhos lógicos como `financeiro_cheques`)
- Toda tabela: `created_at timestamptz NOT NULL DEFAULT now()` e, quando mutável, `updated_at timestamptz` com trigger
- Valores monetários: `numeric(14,2)` — nunca `float`, `double precision` ou `money`
- Datas (vencimento/pagamento/competência): `date` (não `timestamptz`)
- Enums: via `CHECK` constraint com lista de valores (mais fácil de evoluir que `CREATE TYPE`)
- Comentários `-- ` em policies, triggers e constraints não óbvias

**Frontend React:**
- Módulo financeiro em `src/pages/financeiro/` (seguindo o padrão `src/pages/` já usado no projeto)
- Componentes reutilizáveis em `src/components/financeiro/`
- Cliente Supabase em `src/lib/supabase.js` (já existe)
- Queries sempre filtram `empresa_id` no lado do app (defesa em profundidade, além da RLS)
- JSX (o projeto usa `.jsx`, não TypeScript — confirmar com usuário se migrar pra TS)
- Erros de Supabase tratados com `toast.error()` (sonner) — nunca silenciados
- Formatação de moeda: função utilitária `formatBRL(n)` em `src/utils/format.js`

**Paleta do projeto (usar estas cores, não inventar):**

```css
--primary: #1D9E75;           /* verde marmoraria */
--status-orcado: #6B7280;     /* cinza */
--status-aprovado: #10B981;   /* verde */
--status-produzindo: #8B5CF6; /* roxo */
--status-entregue: #3B82F6;   /* azul */
--status-perdido: #EF4444;    /* vermelho */
```

**Cores específicas do financeiro:**
- Entrada: `#10B981` (verde — mesma do status aprovado)
- Saída: `#EF4444` (vermelho — mesma do status perdido)
- Pendente: `#F59E0B` (âmbar)
- Vencido: `#DC2626` (vermelho escuro)

Fonte: `Inter, sans-serif`.

## Regras de negócio invioláveis

1. **Isolamento por empresa.** RLS garante, app também filtra `empresa_id` explicitamente.
2. **Dados bancários** (`arquitetos.dados_pagamento_pix`, `parceiros.dados_bancarios`, `fechamentos.dados_pagamento`) só são retornados para perfil `admin`. Vendedor nunca vê.
3. **RT e comissão** só ficam liberados para pagamento quando o projeto associado está totalmente pago (soma de `valor_pago` das entradas do projeto ≥ `fechamentos.valor_fechado`).
4. **Nenhum lançamento é deletado.** Cancelamento via `status = 'cancelado'` (soft).
5. **Saldo de conta** (`financeiro_contas.saldo_atual`) é sempre derivado via trigger — nunca editado direto pelo app.
6. **Nunca** usar `service_role` key no frontend.
7. **Não mexer** nas tabelas pré-existentes sem aviso explícito. Se o módulo precisar de um campo novo em `projetos` ou `orcamentos`, proponha a migration separada e peça confirmação.

## Estado atual do projeto (o que já existe e o que falta)

- Painel financeiro básico existe (~30%) em `src/pages/Financeiro.jsx` — será **substituído** pelo módulo novo.
- Tabela `fechamentos` já registra pedidos fechados com valor e forma de pagamento.
- `notificacoes` tem Realtime implementado mas "não funciona como esperado" — evitar depender disso no MVP financeiro.
- Não existe: contas bancárias, plano de contas, contas a pagar/receber, DRE, fluxo de caixa, cheques, RT automático.

## Padrão de resposta esperado do Claude Code

- Antes de criar migration nova, listar arquivos em `supabase/migrations/` para escolher timestamp correto
- Ao alterar comportamento de algo existente, mostrar o diff proposto antes de aplicar
- Explicar trade-offs de decisões de schema em comentário no topo da migration
- Em componente React, começar com versão mínima funcional e iterar, não tentar entregar tela completa de uma vez
