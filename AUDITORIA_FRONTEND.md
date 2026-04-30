# Auditoria de Segurança — Dashboard Frontend

**Data:** 2026-04-30  
**Escopo:** `src/` — rotas, queries Supabase, exposição de dados sensíveis  
**Metodologia:** leitura estática de código (sem execução)  
**Status:** somente levantamento — nada foi corrigido

---

## Resumo Executivo

| Eixo | Crítico | Alto | Médio | Total |
|------|---------|------|-------|-------|
| Guards de rota | 3 | 2 | 0 | 5 |
| Queries sem empresa_id | 0 | 4 | 1 | 5 |
| Dados sensíveis expostos | 2 | 2 | 1 | 5 |
| **Total** | **5** | **8** | **2** | **15** |

---

## Eixo 1 — Guards de Rota

### Como funciona hoje

`src/App.jsx:61` define `RequireAuth`, que verifica apenas se há sessão ativa (`session !== null`). **Não há nenhuma verificação de `perfil` no roteador.** Qualquer usuário autenticado (vendedor, medidor, admin) pode acessar qualquer rota.

```jsx
// App.jsx:61-85 — RequireAuth só verifica autenticação, nunca o perfil
function RequireAuth() {
  const { session, loading } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />  // ← sem check de perfil aqui
}
```

### V001 — `/admin` acessível por vendedor e medidor
**Severidade: CRÍTICO**  
**Arquivo:** `src/pages/Admin.jsx`

`Admin.jsx` não possui nenhuma verificação de perfil. Um vendedor acessa `/admin` via URL direta e visualiza:
- Métricas globais de faturamento da empresa
- Ranking comparativo de todos os vendedores
- Gráfico de faturamento mensal

Não há `if (perfil !== 'admin') return <Navigate />` no componente.

---

### V002 — `/admin/configuracoes` sem guard — dados bancários e lista de usuários expostos
**Severidade: CRÍTICO**  
**Arquivo:** `src/pages/Configuracoes.jsx:47-49`

O próprio código contém um TODO alertando para a ausência do guard:

```jsx
// TODO: SEGURANÇA [V004] — sem guard de perfil. Vendedor acessa lista de usuários e
// dados da empresa (incluindo dados_bancarios no estado React via DevTools).
// Adicionar: if (profile && profile.perfil !== 'admin') return <AccessDenied />
```

Vendedor/medidor acessa `/admin/configuracoes` e pode:
- Ver/editar dados da empresa (CNPJ, inscrição estadual, WhatsApp, endereço)
- Ler `dados_bancarios` (banco, agência, conta, PIX) carregado pelo componente
- Ver e editar lista de todos os usuários da empresa (query `.select('id, nome, email, perfil, ativo')` na linha 165)
- Convidar novos usuários

Obs: o card "Dados Bancários" tem `{profile?.perfil === 'admin' && ...}` na UI (`Configuracoes.jsx:708`), mas o dado já foi carregado na query e está no estado React — visível via DevTools independentemente do guard de UI.

---

### V003 — `/admin/financeiro/dashboard` sem guard
**Severidade: CRÍTICO**  
**Arquivo:** `src/pages/financeiro/FinanceiroDashboard.jsx:40-41`

Mesma situação com TODO explícito no arquivo:

```jsx
// TODO: SEGURANÇA [V005] — sem guard de perfil. Vendedor/medidor acessa esta UI pela URL.
// Adicionar: if (profile?.perfil !== 'admin') return <AccessDenied /> — igual a FinanceiroContas.
```

Vendedor acessa `/admin/financeiro` ou `/admin/financeiro/dashboard` e vê:
- Saldo total de todas as contas bancárias da empresa
- Contas a receber vencidas
- Contas a pagar vencidas
- Previsão de caixa do mês

---

### V004 — `/admin/mensagens` sem guard — vendedor pode enviar mensagens em nome do admin
**Severidade: ALTO**  
**Arquivo:** `src/pages/AdminMensagens.jsx`

Componente não verifica perfil em nenhuma linha. Qualquer usuário autenticado acessa `/admin/mensagens` e pode enviar notificações para:
- Todos os usuários da empresa
- Todo o time de vendas
- Todo o time de medidores
- Um usuário específico

A query de inserção inclui `tipo: 'mensagem_admin'` e `titulo: 'Mensagem do administrador'`, ou seja, a mensagem chega para os destinatários como se fosse do admin.

---

### V005 — `/admin/notificacoes` sem guard — vendedor pode marcar todas lidas
**Severidade: ALTO**  
**Arquivo:** `src/pages/AdminNotificacoes.jsx`

Sem guard de perfil no componente. Qualquer usuário autenticado acessa `/admin/notificacoes` e pode:
- Ler todas as notificações da empresa (não só as suas)
- Marcar todas como lidas (usando `empresa_id` sem verificar se o chamador é admin)

---

### Mapa completo de rotas

| Rota | Componente | Guard no roteador | Guard no componente | Perfil requerido |
|------|-----------|---|---|---|
| `/admin` | Admin.jsx | Apenas auth | **Nenhum** | admin |
| `/admin/projetos` | ProjetosAdminV2.jsx | Apenas auth | A verificar | admin |
| `/admin/clientes` | Clientes.jsx | Apenas auth | A verificar | admin |
| `/admin/financeiro/dashboard` | FinanceiroDashboard.jsx | Apenas auth | **Nenhum (TODO no arquivo)** | admin |
| `/admin/financeiro/lancamentos` | FinanceiroLancamentos.jsx | Apenas auth | Bloqueia medidor, **permite vendedor** | admin |
| `/admin/financeiro/contas` | FinanceiroContas.jsx | Apenas auth | Tem guard de admin | admin |
| `/admin/financeiro/cheques` | FinanceiroCheques.jsx | Apenas auth | A verificar | admin |
| `/admin/financeiro/relatorios` | FinanceiroRelatorios.jsx | Apenas auth | Tem guard de admin | admin |
| `/admin/configuracoes` | Configuracoes.jsx | Apenas auth | **Nenhum (TODO no arquivo)** | admin |
| `/admin/mensagens` | AdminMensagens.jsx | Apenas auth | **Nenhum** | admin |
| `/admin/notificacoes` | AdminNotificacoes.jsx | Apenas auth | **Nenhum** | admin |

---

## Eixo 2 — Queries sem filtro de empresa_id

### V006 — `usuarios` com filtro condicional em `useProjetoData.js`
**Severidade: ALTO**  
**Arquivo:** `src/hooks/useProjetoData.js:121-122`

```js
let query = supabase.from('usuarios')
    .select('id, nome')
    .in('perfil', ['medidor', 'vendedor_medidor', 'admin_medidor'])
    .eq('ativo', true)
    .order('nome');
if (profile?.empresa_id) query = query.eq('empresa_id', profile.empresa_id);
```

O filtro `empresa_id` é condicional. Se `profile?.empresa_id` for `undefined` (por race condition no carregamento do AuthContext, erro de rede ou sessão corrompida), a query retorna medidores de **todas as empresas**. O padrão correto é falhar explicitamente quando `empresa_id` não está disponível, não executar sem o filtro.

---

### V007 — `pedidos_fechados` sem empresa_id em `useProjetoData.js` e `useProjectData.jsx`
**Severidade: ALTO**  
**Arquivos:** `src/hooks/useProjetoData.js:133`, `src/hooks/useProjectData.jsx:155`

```js
supabase.from('pedidos_fechados')
    .select('*')
    .eq('projeto_id', projetoId)
    .eq('status', 'FECHADO')
    .order('created_at', { ascending: false })
    .limit(1)
```

A busca filtra apenas por `projeto_id`, sem `empresa_id`. Como UUIDs não são adivinháveis mas podem ser descobertos (logs, URLs compartilhadas), um vendedor que obtenha o UUID de um projeto de outra empresa pode acessar dados do pedido fechado desse projeto. A RLS resolve no banco, mas o app deveria sempre incluir o filtro como defesa em profundidade — conforme a convenção descrita no CLAUDE.md.

---

### V008 — DELETE em `ambientes` e `orcamentos` sem empresa_id em `Carrinho.jsx`
**Severidade: ALTO**  
**Arquivo:** `src/pages/Carrinho.jsx:662, 712`

```js
// Linha 662 — excluirAmbiente
await supabase.from('ambientes').delete().eq('id', ambId);

// Linha 712 — excluirVersao
await supabase.from('orcamentos').delete().eq('id', versaoId);
```

Ambas as operações de DELETE filtram apenas pelo ID do registro, sem adicionar `.eq('empresa_id', profile.empresa_id)`. Se `ambId` ou `versaoId` forem manipulados (por exemplo, via interceptação do payload ou injeção de estado), o delete é executado sem validação de propriedade no app. A RLS protege no banco, mas a defesa em profundidade está ausente.

---

### V009 — `orcamento_pecas` em `useProjectData.jsx:169` sem empresa_id
**Severidade: ALTO**  
**Arquivo:** `src/hooks/useProjectData.jsx:169`

```js
supabase.from('orcamento_pecas')
    .select(...)
    .eq('orcamento_id', orcId)
```

Filtra por `orcamento_id` mas não por `empresa_id`. Mesma exposição que V008.

---

### V010 — `notificacoes.marcarTodasLidas` sem empresa_id em `Notificacoes.jsx`
**Severidade: MÉDIO**  
**Arquivo:** `src/pages/Notificacoes.jsx:82-91`

```js
await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('usuario_id', session.user.id)
    .eq('lida', false);
```

O filtro por `usuario_id` é suficiente para isolar por usuário, mas falta o filtro por `empresa_id` que é o padrão do projeto (defesa em profundidade). Baixo risco real, mas inconsistente com o padrão documentado.

---

## Eixo 3 — Dados sensíveis expostos por perfil errado

### V011 — `dados_bancarios` da empresa carregado para todos os perfis no AuthContext
**Severidade: CRÍTICO**  
**Arquivo:** `src/lib/AuthContext.jsx:94`

```js
const { data: emp } = await supabase
    .from('empresas')
    .select('id, nome, cnpj, inscricao_estadual, telefone, whatsapp, email,
            email_contato, endereco, website, logo_url, dados_bancarios')  // ← campo sensível
    .eq('id', perfilNormalizado.empresa_id)
    .single()
```

O campo `dados_bancarios` (que contém banco, agência, conta, PIX) é carregado **logo após o login para todos os perfis** e armazenado no contexto global via `setEmpresa(emp)`. Qualquer vendedor ou medidor que abrir o React DevTools vê os dados bancários da empresa completos em `AuthContext > empresa > dados_bancarios`.

A regra de negócio no CLAUDE.md é explícita: *"Dados bancários só são retornados para perfil `admin`."*

**Impacto:** todos os usuários logados da empresa têm acesso aos dados bancários via DevTools, independentemente do guard de UI.

---

### V012 — `dados_pagamento_pix` de arquiteto exibido sem verificação `isAdmin` interna
**Severidade: ALTO**  
**Arquivo:** `src/pages/Clientes.jsx:815-818`

```jsx
{/* Dentro de TabArquitetos — sem verificação de isAdmin no bloco */}
{selected.dados_pagamento_pix && (
    <div className="col-span-2 p-3 border border-green-300/40 ...">
        <div className="...">PIX / Dados Bancários</div>
        <div className="...font-mono text-xs">{selected.dados_pagamento_pix}</div>
    </div>
)}
```

O painel de detalhe do arquiteto exibe a chave PIX sempre que ela existe, sem verificar `isAdmin`. A prop `isAdmin` é passada para `TabArquitetos` (`Clientes.jsx:922`) mas não é usada no bloco de exibição do PIX (linha 815). O botão de editar e deletar tem guard com `{isAdmin && ...}` (linha 757), mas a exibição do dado em si não tem.

**Impacto:** vendedores que acessem `/admin/clientes` (rota sem guard — V001) podem ver a chave PIX de todos os arquitetos da empresa.

---

### V013 — CPF e RG de clientes exibidos sem verificação `isAdmin`
**Severidade: MÉDIO**  
**Arquivo:** `src/pages/Clientes.jsx:442-443`

```jsx
{ label: 'CPF',  value: selected.cpf },
{ label: 'RG',   value: selected.rg },
```

Esses campos são renderizados no painel de detalhe da `TabClientes` sem verificação de `isAdmin` no bloco. A tab de clientes é usada em `/admin/clientes` que, combinado com a ausência de guard de rota (V001), permite que vendedores vejam CPF e RG de clientes.

---

### V014 — `FinanceiroLancamentos` permite acesso de vendedor
**Severidade: ALTO**  
**Arquivo:** `src/pages/financeiro/FinanceiroLancamentos.jsx:355-361`

O guard interno bloqueia apenas medidores, permitindo vendedores:

```jsx
// Bloqueia medidor mas permite vendedor — linha ~355
if (profile?.perfil === 'medidor') return <AccessDenied />
// Sem: if (profile?.perfil !== 'admin') return <AccessDenied />
```

Vendedores autenticados que acessam `/admin/financeiro/lancamentos` visualizam todos os lançamentos financeiros da empresa (contas a pagar, receber, histórico de pagamentos).

---

## Achados Secundários (não classificados como vulnerabilidade, mas relevantes)

1. **`Configuracoes.jsx:165`** — query usa `.select('id, nome, email, perfil, ativo')` para listar usuários, sem guard de perfil. Quando o guard for adicionado, a query já está correta (não usa `select('*')`).

2. **`FinanceiroCheques.jsx`** — guard de perfil não verificado nesta auditoria. Recomendado verificar manualmente.

3. **`ProjetosAdminV2.jsx`** — guard de perfil não verificado. Projeto tem status, cliente e valor — dados sensíveis para vendedores que não são os donos do projeto.

4. **`dados_bancarios` no estado React** — mesmo que os guards de UI estejam corretos em `Configuracoes.jsx:708`, o dado já está no estado do componente após a query. DevTools o expõe. A solução correta é não buscar o campo para não-admins.

---

## Priorização de Correção

| Prioridade | ID | Ação |
|-----------|-----|------|
| 1 | V011 | Remover `dados_bancarios` do select no `AuthContext.jsx` — carregar só se `perfil === 'admin'` |
| 2 | V001–V005 | Criar `RequireAdmin` component no `App.jsx` e envolver rotas `/admin/*` |
| 3 | V002 | Adicionar guard de perfil no início de `Configuracoes.jsx` |
| 4 | V003 | Adicionar guard de perfil no início de `FinanceiroDashboard.jsx` |
| 5 | V004 | Adicionar guard de perfil no início de `AdminMensagens.jsx` |
| 6 | V005 | Adicionar guard de perfil no início de `AdminNotificacoes.jsx` |
| 7 | V014 | Corrigir guard em `FinanceiroLancamentos.jsx` de `!== 'medidor'` para `=== 'admin'` |
| 8 | V012 | Envolver bloco PIX em `{isAdmin && ...}` em `Clientes.jsx:815` |
| 9 | V013 | Envolver CPF/RG em `{isAdmin && ...}` em `Clientes.jsx:442-443` |
| 10 | V006–V009 | Tornar filtros de `empresa_id` obrigatórios (não condicionais) |
| 11 | V010 | Adicionar `.eq('empresa_id', ...)` na função `marcarTodasLidas` |
