# Relatório de Auditoria — Marmoraria ERP Dashboard
Data: 2026-05-04

---

## Sumário Executivo

O projeto apresenta fundação de segurança sólida no backend (RLS ativo, multi-tenant por empresa_id), mas possui três falhas de média-alta gravidade no frontend: duas rotas `/admin/*` acessíveis a qualquer usuário autenticado sem guard de perfil; a função SQL `recalcular_saldo_conta` exposta a qualquer usuário autenticado sem validação de empresa_id (o próprio código fonte documenta isso como TODO de segurança); e um padrão de fallback com UUID hardcoded que pode associar dados a uma empresa errada em cenário de falha de autenticação. A qualidade de código é prejudicada por um arquivo de 4.343 linhas com lógica de renderização duplicada e mais de 55 `console.log` deixados no código de produção.

---

## AUDITORIA 1 — Guards de Rota

### Resultado: FALHA

**Guards disponíveis:**
- `RequireAuth` — verifica se existe sessão ativa. Redireciona para `/login` se não houver.
- `RequireAdmin` — verifica `profile?.perfil !== 'admin'`. Redireciona para `/dashboard`.
- `RequireMedidor` — verifica perfis com acesso de medidor.

**Análise da estrutura de rotas (src/App.jsx):**

Rotas dentro de `<RequireAuth>` MAS FORA de `<RequireAdmin>` (acessíveis a qualquer usuário autenticado — vendedor, medidor, etc.):

| Rota | Guard de perfil? | Observação |
|---|---|---|
| `/dashboard` | Nenhum | Intencional |
| `/projetos` | Nenhum | Intencional (vendedor acessa) |
| `/projetos/:id` | Nenhum | Intencional (vendedor acessa) |
| `/clientes` | Nenhum | Intencional (vendedor acessa) |
| `/notificacoes` | Nenhum | Intencional |
| `/projetos/:id/orcamento/novo` | Nenhum | Intencional |
| `/projetos/:id/carrinho` | Nenhum | Intencional |
| **/admin/projetos** | **AUSENTE** | **FALHA — mesma página de `/projetos`, acessível por vendedor** |
| **/admin/clientes** | **AUSENTE** | **FALHA — mesma página de `/clientes`, acessível por vendedor** |
| `/agenda` | Nenhum | Intencional |

Rotas dentro de `<RequireAdmin>` (corretamente protegidas):

| Rota | Guard de perfil? |
|---|---|
| `/admin` | RequireAdmin |
| `/admin/financeiro` (e subrotas) | RequireAdmin |
| `/admin/configuracoes` | RequireAdmin |
| `/admin/mensagens` | RequireAdmin |
| `/admin/notificacoes` | RequireAdmin |

**Problema:** As rotas `/admin/projetos` e `/admin/clientes` estão declaradas **dentro do bloco `<RequireAuth>` mas fora do bloco `<RequireAdmin>`** (linhas 131–132 do `src/App.jsx`), ficando portanto desprotegidas. Embora renderizem os mesmos componentes que `/projetos` e `/clientes` (que vendedores podem acessar normalmente), o prefixo `/admin/` cria uma expectativa semântica de proteção que não existe. Qualquer vendedor que navegue diretamente para `/admin/projetos` ou `/admin/clientes` entra sem bloqueio.

---

## AUDITORIA 2 — Função recalcular_saldo_conta

### Resultado: VULNERÁVEL

**A função existe** em `supabase/migrations/20260422183001_financeiro_triggers.sql` (linha 38).

**O problema está documentado pelo próprio autor no código:**

```sql
-- TODO: SEGURANÇA [V003] — função SECURITY DEFINER com GRANT TO authenticated sem validação de empresa_id.
-- Qualquer usuário autenticado pode chamar com qualquer UUID e ler/modificar saldo de conta de outra empresa.
-- Mitigação atual: UUIDs v4 (não adivinháveis). Correção: adicionar check de empresa_id antes do SELECT.
CREATE OR REPLACE FUNCTION public.recalcular_saldo_conta(p_conta_id uuid)
...
SECURITY DEFINER
...
GRANT EXECUTE ON FUNCTION public.recalcular_saldo_conta(uuid) TO authenticated;
```

**Impacto:** A função é `SECURITY DEFINER` (executa com privilégios do dono, contornando RLS) e tem `GRANT EXECUTE TO authenticated`. Qualquer usuário autenticado pode chamar `supabase.rpc('recalcular_saldo_conta', { p_conta_id: '<uuid_de_outra_empresa>' })` e:
1. Ler o saldo recalculado de uma conta de outra empresa (retorno da função).
2. Forçar um UPDATE no `saldo_atual` de qualquer conta cujo UUID seja conhecido.

A mitigação citada (UUIDs não adivinháveis) é insuficiente: UUIDs podem vazar via logs, erros de API, ou engenharia social.

**A função é chamada no frontend** em `src/pages/financeiro/FinanceiroContas.jsx` (linha 103), passando apenas o `conta.id` sem validação de empresa.

**SQL de correção:**

```sql
CREATE OR REPLACE FUNCTION public.recalcular_saldo_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_saldo_inicial  numeric(14,2);
  v_saldo_novo     numeric(14,2);
  v_empresa_caller uuid;
  v_empresa_conta  uuid;
BEGIN
  -- Identifica a empresa do usuário chamador (inline, sem função helper)
  SELECT empresa_id INTO v_empresa_caller
  FROM usuarios
  WHERE id = auth.uid();

  IF v_empresa_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa associada';
  END IF;

  -- Verifica que a conta pertence à mesma empresa do chamador
  SELECT empresa_id, saldo_inicial
  INTO v_empresa_conta, v_saldo_inicial
  FROM financeiro_contas
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada: %', p_conta_id;
  END IF;

  IF v_empresa_conta <> v_empresa_caller THEN
    RAISE EXCEPTION 'Acesso negado: conta não pertence à empresa do usuário';
  END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN tipo = 'entrada' THEN  valor_liquido
      WHEN tipo = 'saida'   THEN -valor_liquido
      ELSE 0
    END
  ), 0)
  INTO v_saldo_novo
  FROM financeiro_lancamentos
  WHERE conta_id = p_conta_id
    AND status IN ('pago', 'parcial');

  UPDATE financeiro_contas
  SET saldo_atual = v_saldo_novo
  WHERE id = p_conta_id;

  RETURN v_saldo_novo;
END;
$$;
```

---

## AUDITORIA 3 — Penetração Simulada

### 3a. Acesso a /admin/* por vendedor

### Resultado: PARCIALMENTE VULNERÁVEL

**Como o perfil é lido:** O perfil é carregado via query ao Supabase (`from('usuarios').select('*').eq('id', userId)`) no `AuthContext.jsx` e armazenado no estado React (não em `localStorage`). Isso é adequado — um atacante não pode manipular o perfil diretamente via `localStorage`.

**`RequireAdmin` funciona corretamente para as rotas em que é aplicado:** verifica `profile?.perfil !== 'admin'` e redireciona para `/dashboard`.

**Vulnerabilidade identificada:** Conforme Auditoria 1, `/admin/projetos` e `/admin/clientes` não passam por `RequireAdmin`. Um vendedor pode acessar essas URLs diretamente.

**Não há bypass de `RequireAdmin` via `localStorage`:** o perfil vem do banco via sessão autenticada.

**Risco de timeout de 3s:** Se o banco não responder em 3 segundos, `profileLoading` é forçado para `false` com `profile = null`. Nesse caso, `RequireAdmin` avalia `profile?.perfil !== 'admin'` como `true` e redireciona para `/dashboard` — comportamento seguro (fail-safe).

---

### 3b. Vazamento de dados cross-empresa

### Resultado: PARCIALMENTE VULNERÁVEL

A RLS é a principal proteção, e aparenta estar configurada corretamente. No entanto, o frontend deveria filtrar `empresa_id` explicitamente em todas as queries como defesa em profundidade (conforme o próprio CLAUDE.md). As seguintes queries **não filtram** `empresa_id` no lado do app:

**Queries de leitura sem filtro explícito de empresa_id:**

| Arquivo | Linha | Tabela | Filtro usado | Observação |
|---|---|---|---|---|
| `src/hooks/useProjectData.jsx` | 41 | `medicoes` | `projeto_id` | projeto_id não é verificado contra empresa_id |
| `src/hooks/useProjectData.jsx` | 62 | `ambientes` | `projeto_id` | idem |
| `src/hooks/useProjectData.jsx` | 89 | `projetos` | `.eq('id', projectId)` | nenhum filtro de empresa |
| `src/hooks/useProjectData.jsx` | 170 | `orcamento_pecas` | `orcamento_id` | sem empresa |
| `src/pages/Carrinho.jsx` | 133 | `projetos` | `.eq('id', projetoId)` | sem empresa |
| `src/pages/Carrinho.jsx` | 157, 166 | `orcamentos` | `ambiente_id IN (...)` | sem empresa |
| `src/pages/Carrinho.jsx` | 394, 530 | `orcamentos` | `orcamento_id IN (...)` | sem empresa |
| `src/pages/CriarOrcamento.jsx` | 2856 | `medicoes` | `.eq('id', medicaoId)` | fetch por UUID apenas |
| `src/pages/CriarOrcamento.jsx` | 2916 | `ambientes` | `medicao_id` | sem empresa |
| `src/pages/CriarOrcamento.jsx` | 2928 | `pecas` | `ambiente_id IN (...)` | sem empresa |
| `src/hooks/useProjectActions.jsx` | 60, 72 | `medicoes` | `projeto_id` | sem empresa |
| `src/hooks/useProjectActions.jsx` | 91 | `medicoes` | `.eq('id', m.id)` | delete sem empresa |
| `src/pages/financeiro/FinanceiroLancamentos.jsx` | 328–333 | `clientes`, `projetos`, `arquitetos`, etc. | `.in('id', ids)` | lookup por IDs derivados do query principal; risco baixo mas sem empresa_id |

**Queries de lookup secundário sem empresa_id (risco menor — IDs derivados de query principal já filtrada):**
- `FinanceiroDashboard.jsx:117` — `clientes` via `.in('id', clienteIds)` sem empresa_id.

**Mitigação real:** A RLS está ativa e bem configurada para as tabelas principais. O risco de vazamento em produção é baixo, mas a ausência de filtro no app viola a defesa em profundidade definida no CLAUDE.md.

---

### 3c. INSERT/UPDATE sem empresa_id

### Resultado: PARCIALMENTE VULNERÁVEL

**Mutations com empresa_id corretamente incluído (OK):**
- `projetos` INSERT/UPDATE em `ProjetosAdminV2.jsx` — inclui `empresa_id: profile.empresa_id`.
- `clientes` INSERT em `ProjetosAdminV2.jsx` — inclui `empresa_id: profile.empresa_id`.
- `orcamentos` INSERT em `CriarOrcamento.jsx`, `Carrinho.jsx`, `useProjectActions.jsx` — inclui `empresa_id`.
- `ambientes` INSERT em `CriarOrcamento.jsx` — inclui `empresa_id`.
- Módulo financeiro: INSERT em `financeiro_lancamentos`, `financeiro_contas`, `financeiro_cheques` — inclui `empresa_id`.

**Problemas identificados:**

| Arquivo | Linha | Tabela | Operação | Problema |
|---|---|---|---|---|
| `src/pages/Configuracoes.jsx` | 466 | `materiais` | INSERT | `empresa_id` com fallback hardcoded: `profile?.empresa_id ?? 'a1b2c3d4-0000-0000-0000-000000000001'`. Se o perfil não estiver carregado, insere com UUID fictício. |
| `src/hooks/useProjectActions.jsx` | 107 | `medicoes` / `notificacoes` | INSERT | `EMPRESA_ID_FALLBACK = 'a1b2c3d4-...'` hardcoded como fallback. |
| `src/components/projeto/MedicoesTab.jsx` | 85, 162 | `medicoes` / `notificacoes` | INSERT | Mesmo padrão de `EMPRESA_ID_FALLBACK` hardcoded. |
| `src/pages/financeiro/FinanceiroLancamentos.jsx` | 122–125 | `financeiro_lancamentos` | UPDATE | `.update({ status: 'cancelado' }).eq('id', lancamento.id)` — sem filtro de empresa. Depende exclusivamente de RLS. |
| `src/pages/financeiro/FinanceiroLancamentos.jsx` | 145–152 | `financeiro_lancamentos` | UPDATE (estorno) | Idem — sem empresa_id no filtro. |
| `src/pages/financeiro/FinanceiroCheques.jsx` | 238–284 | `financeiro_cheques`, `financeiro_lancamentos` | UPDATE | Múltiplas operações de status (compensar, devolver, cancelar) filtradas apenas por `.eq('id', ...)`. Sem empresa_id. |
| `src/pages/financeiro/relatorios/DRE.jsx` | 902, 927, 942 | `financeiro_plano_contas` | UPDATE | UPDATE por `.eq('id', ...)` sem empresa_id. |
| `src/pages/financeiro/lancamentos/ModalGerenciarGrupo.jsx` | 99, 117 | `financeiro_lancamentos` | UPDATE | Por `grupo_id` sem empresa_id. |

**O padrão `EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001'`** é particularmente preocupante porque, se a sessão carregar mas o perfil ainda não tiver sido carregado (race condition), insere dados reais com um UUID de empresa inválido. Isso pode causar violação de FK se a empresa com esse UUID não existir, ou pior, inserir na empresa errada se esse UUID existir em produção.

---

## AUDITORIA 4 — Qualidade de Código

### Arquivo 1: src/pages/CriarOrcamento.jsx (4.343 linhas)

**Lógica duplicada:**
- O componente `TelaVersoes` (linha 914) contém dois blocos de renderização de peças (`temItens = false` e `temItens = true`) que duplicam as chamadas a `renderAcabamento`, `renderRecorte`, e `renderRecortesGrupados`. Os caminhos "lista plana" e "agrupado por item" repetem ~300 linhas de JSX com lógica quase idêntica.
- As funções `garantirAmbientesNoBanco` e `garantirPecasNoBanco` realizam queries independentes à tabela `ambientes` e `medicoes`, duplicando lógica de inserção condicional que poderia ser extraída em um hook `useGarantirEntidades`.
- Duas constantes de mapeamento redundantes: `ACABAMENTO_LABEL` e `ACAB_TIPO_NOME` mapeiam os mesmos 6 tipos de acabamento com nomes minimamente diferentes.

**Queries sem tratamento de erro:**
- Linha 2797–2800: `from('acabamento_precos_material')` — ignora o campo `error` do retorno: `.then(({ data }) => { if (data) ... })`. Se a query falhar, o erro é silenciado.
- Linha 3232: `from('ambientes').select('id').eq('medicao_id', ...).single()` — o erro do `recheck` é ignorado completamente.

**console.log esquecidos (debug):**
- Linha 2042: `console.log('[DEBUG pecasList] amb=...')` — log verboso de debug dentro de um `map()` de renderização, executado a cada render.
- Linha 2052: `console.warn('[DEBUG pOrig NULO] nome=...')` — debug de iteração.
- Linha 2193: `console.warn('[DEBUG pOrig NULO item] nome=...')` — idem.
- Linha 2788: `console.log('[DEBUG] matLineares retornou: ...')` — log de debug com dados completos de usuário.

---

### Arquivo 2: src/pages/TelaProjeto.jsx (2.251 linhas)

**Lógica duplicada:**
- TelaProjeto delega quase toda a lógica para `useProjectData` e `useProjectActions`, que é boa separação. Porém, o arquivo ainda mantém ~200 linhas de estado local para controle de modais que poderiam ser extraídas em hooks menores (ex: `useAgendarModal`, `useEditarVersaoModal`).
- A checagem `isAdmin` é feita de duas formas diferentes no mesmo arquivo: `profile?.perfil === 'admin' || profile?.role === 'admin'` (linha 24), o que é defensivo mas indica inconsistência no schema normalizado.

**Queries sem tratamento de erro:**
- Não há queries Supabase diretas em TelaProjeto.jsx — as queries estão em `useProjectData.jsx` e `useProjectActions.jsx`. O arquivo em si não tem esse problema.

**console.log esquecidos:**
- Nenhum `console.log` encontrado neste arquivo (diferente do `.bkp.jsx`).

---

### Arquivo 3: src/pages/Configuracoes.jsx (1.766 linhas)

**Lógica duplicada:**
- O modal de CRUD (materiais_lineares, produtos_avulsos, usuarios) é tratado por um único `handleSaveModal` com if/else encadeados para cada tipo. Uma abordagem mais limpa seria um dicionário de handlers por tipo.
- Tratamento de erro inconsistente: algumas mutations usam `alert(error.message)`, outras usam `console.error`, e nenhuma usa o padrão `toast.error()` que o restante do módulo financeiro adota.

**Queries sem tratamento de erro:**
- Linha 119–122: `from('acabamento_precos_material')` — não verifica o campo `error` do retorno.
- Linha 192–194: `from('pdf_templates')` — não verifica `error`.

**console.log esquecidos:**
- Linha 434: `console.log('abrirMatModal →', { id, nome, categoria, variacoes })` — log de debug que vaza nome de itens para o console em produção.

---

## Problemas por Severidade

### Critico

- **[S-001] `recalcular_saldo_conta` sem validação de empresa_id** — `supabase/migrations/20260422183001_financeiro_triggers.sql:38`. Função `SECURITY DEFINER` acessível a qualquer usuário autenticado via RPC. Pode ler e sobrescrever saldo de contas de qualquer empresa. SQL de correção disponível na Auditoria 2.

- **[S-002] Rotas `/admin/projetos` e `/admin/clientes` sem guard de perfil** — `src/App.jsx:131–132`. Qualquer usuário autenticado (vendedor, medidor) pode acessar essas URLs. Correção: mover as duas rotas para dentro do bloco `<RequireAdmin>`, ou removê-las se são aliases não intencionais.

### Importante

- **[S-003] EMPRESA_ID_FALLBACK hardcoded em múltiplos arquivos** — `src/hooks/useProjectActions.jsx:107`, `src/components/projeto/MedicoesTab.jsx:85,162`, `src/pages/Configuracoes.jsx:466`. O UUID `'a1b2c3d4-0000-0000-0000-000000000001'` é usado como fallback quando `profile?.empresa_id` é null. Em race conditions de carregamento de perfil, pode inserir dados com empresa_id inválido. Correção: bloquear a operação (return early) se `empresa_id` não estiver disponível.

- **[S-004] Updates financeiros sem filtro de empresa_id no app** — `src/pages/financeiro/FinanceiroLancamentos.jsx:122–152`, `src/pages/financeiro/FinanceiroCheques.jsx:238–284`, `src/pages/financeiro/relatorios/DRE.jsx:902,927,942`. Todas essas mutations usam `.eq('id', ...)` apenas, dependendo exclusivamente do RLS para isolamento multi-tenant. Violação da defesa em profundidade do CLAUDE.md. Adicionar `.eq('empresa_id', profile.empresa_id)` em cada operação.

- **[S-005] Queries em `medicoes`, `ambientes`, `pecas` sem empresa_id** — `src/hooks/useProjectData.jsx:41,62,89`, `src/pages/Carrinho.jsx:133,157`, `src/pages/CriarOrcamento.jsx:2856`. Tabelas acessadas apenas por ID de projeto/medição sem verificação de empresa_id no app. RLS protege, mas viola defesa em profundidade.

### Melhoria

- **[Q-001] 55+ `console.log` em código de produção** — Mais críticos: `src/pages/CriarOrcamento.jsx:2042,2788`, `src/pages/AceiteConvite.jsx:6–64` (15 logs no fluxo de convite), `src/pages/ProjetosAdminV2.jsx:91,151,301,307`, `src/pages/CadastroEmpresa.jsx:58–122` (10 logs no fluxo de cadastro). Vaza informações de usuário e de estrutura do banco no console do navegador.

- **[Q-002] Lógica de erro inconsistente** — `src/pages/Configuracoes.jsx` usa `alert()` para erros de mutations enquanto o restante do projeto usa `toast.error()` (sonner). Uniformizar.

- **[Q-003] Queries sem verificação de `error`** — `src/pages/CriarOrcamento.jsx:2797` (`acabamento_precos_material`), `src/pages/Configuracoes.jsx:119,192` (`acabamento_precos_material`, `pdf_templates`). Erros de banco silenciados.

- **[Q-004] CriarOrcamento.jsx com 4.343 linhas** — Arquivo único contendo 3 componentes independentes (`PecaRow`, `PainelMaterial`, `PainelMaterialLinear`), um componente principal (`TelaVersoes` com ~1.600 linhas), e o componente de página (`CriarOrcamento`). Deve ser dividido em pelo menos 3–4 arquivos para manutenibilidade.

- **[Q-005] Constantes duplicadas de acabamento** — `src/pages/CriarOrcamento.jsx:15–32`. `ACABAMENTO_LABEL` e `ACAB_TIPO_NOME` mapeiam os mesmos 6 acabamentos com valores quase idênticos. Consolidar em uma única estrutura.

- **[Q-006] Arquivo `.bkp.jsx` em produção** — `src/pages/TelaProjeto.bkp.jsx` (1.101 linhas) está sendo compilado pelo Vite junto com o projeto (aparece no `find`). Embora não seja roteado, aumenta o bundle e pode conter lógica desatualizada.
