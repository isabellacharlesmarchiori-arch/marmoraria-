# Marmoraria App — Especificação de UI (Lovable)

## Visão Geral
Dashboard web usado por vendedores e admins.
Autenticação via Supabase Auth (email + senha).
Após login, sistema detecta o perfil e redireciona para a área correta.

---

## Navegação Geral

### Sidebar (todos os perfis)
- Logo da empresa (configurada pelo admin)
- Menu com itens conforme o perfil
- Nome do usuário logado + foto/iniciais
- Botão de logout

### Perfil: Vendedor — menu
- Início (dashboard pessoal)
- Projetos
- Clientes
- Notificações (com badge de não lidas)

### Perfil: Admin — menu
- Início (dashboard geral)
- Projetos (todos)
- Clientes (todos)
- Financeiro
- Configurações

---

## Telas — Vendedor

---

### 1. Início (dashboard pessoal)

**Cards de métricas no topo (linha de 3):**
- Orçamentos este mês
- Projetos fechados este mês
- Taxa de fechamento (%)

**Lista: Projetos recentes**
- Últimos 5 projetos com status colorido
- Clique leva para o projeto

**Lista: Notificações recentes**
- Últimas 3 notificações não lidas
- Link "ver todas"

---

### 2. Projetos

**Cabeçalho da tela:**
- Título "Projetos"
- Botão "Novo projeto" (abre modal)
- Campo de busca por nome do cliente ou projeto
- Filtro por status: todos | orçado | aprovado | produzindo | entregue | perdido

**Lista de projetos (cards):**
Cada card mostra:
- Nome do projeto
- Nome do cliente
- Status com cor (orçado=cinza, aprovado=verde, produzindo=roxo, entregue=azul, perdido=vermelho)
- Data de criação
- Clique abre a tela do projeto

**Modal: Novo projeto**
- Campo: nome do projeto
- Select: cliente (busca por nome, opção de criar novo cliente)
- Botão confirmar → cria projeto e abre tela do projeto

---

### 3. Tela do Projeto

**Cabeçalho:**
- Nome do projeto + status (pill colorida)
- Nome do cliente com link para ficha do cliente
- Botão "Atualizar status" (dropdown: produzindo → entregue)
- Botão "Marcar como perdido" (abre modal com campo de motivo opcional)

**Aba: Medições**
- Lista de medições com status (agendada | enviada | processada)
- Botão "Agendar medição" (abre modal)
- Cada medição mostra: data, medidor, status
- Medição processada: botão "Ver dados" abre painel lateral com resumo por peça

**Modal: Agendar medição**
- Select: medidor (lista de medidores da empresa)
- Date/time picker: data e hora
- Campo: endereço (pré-preenchido com endereço do cliente)
- Botão confirmar → cria medição e notifica medidor

**Aba: Ambientes e Orçamentos**
Lista de ambientes do projeto. Cada ambiente tem:
- Nome do ambiente
- Status do orçamento (sem orçamento | em andamento | completo)
- Botão "Criar orçamento" ou "Ver orçamentos"
- Lista de versões do orçamento com nome, valor total e data

**Botão fixo no rodapé da aba: "Gerar PDF / WhatsApp"**
→ Abre tela do Carrinho

---

### 4. Tela de Criação de Orçamento

**Cabeçalho:**
- Nome do ambiente
- Breadcrumb: Projeto > Ambiente > Novo orçamento

**Por peça (lista vertical):**
Cada peça mostra:
- Nome da peça (ex: "Bancada principal")
- Dados da IA: área líquida em m², ml de acabamento por tipo, qtd de recortes
- Espessura em cm
- Toggle "Incluir neste orçamento" (marcado por padrão)
- Botão "Selecionar material" → abre painel lateral

**Painel lateral: Selecionar material**
- Campo de busca por nome
- Filtro por categoria (granito, mármore, porcelanato...)
- Lista de materiais com nome, categoria e preço por m² conforme espessura
- Checkbox em cada material — pode selecionar mais de um
- Botão confirmar

**Seção: Produtos avulsos**
- Lista de produtos já adicionados com quantidade e valor
- Botão "Adicionar produto" → abre modal de busca de produtos avulsos
- Modal: busca por nome, subcategoria, mostra preço unitário, campo de quantidade

**Rodapé da tela:**
- Total calculado em tempo real
- Botão "Continuar" → se mais de um material selecionado em alguma peça, abre modal de criação de versões

**Modal: Como criar as versões?**
Aparece quando há múltiplos materiais selecionados.
- Opção 1: Versões pareadas (N versões)
- Opção 2: Todas as combinações (N×M versões)
- Opção 3: Montar manualmente
- Botão "Criar versões"

**Tela: Versões criadas**
- Lista de versões geradas
- Cada versão: campo de nome editável, lista de peças com material, valor total
- Botão "Salvar orçamento"

---

### 5. Tela de Orçamento (versão existente)

**Cabeçalho:**
- Nome da versão (editável inline)
- Valor total
- Botões: "Editar" | "Duplicar como variante"

**Lista de peças:**
Cada peça mostra:
- Nome
- Material selecionado
- Área, acabamentos, recortes
- Valor calculado
- Botão "Editar material" → abre painel lateral
- Toggle "Incluída" 

**Seção: Produtos avulsos**
- Lista com quantidade e valor
- Botão "Editar"

**Rodapé:**
- Subtotal · desconto (campo editável) · total

---

### 6. Carrinho — Gerar PDF / WhatsApp

**Cabeçalho:**
- Título "Gerar orçamento"
- Nome do cliente e endereço

**Checkbox "Selecionar todos"**

**Lista de ambientes (grupos):**
Cada grupo: nome do ambiente com checkbox
Dentro de cada grupo: versões disponíveis com checkbox, nome, materiais resumidos e valor total
Apenas uma versão pode ser selecionada por ambiente.

**Rodapé:**
- Campo: desconto no total geral (%)
- Resumo: X ambientes selecionados · subtotal · desconto · total
- Botão "Imprimir PDF"
- Botão "Enviar WhatsApp" → abre WhatsApp Web com número do cliente e PDF anexado

---

### 7. Formulário de Fechamento

Aparece quando vendedora muda status para "aprovado".

**Campos obrigatórios:**
- Data de fechamento (date picker)
- Qual versão/orçamento foi fechado (select das versões do projeto)
- Valor fechado (número — pode diferir do orçamento)
- Forma de pagamento (select das opções cadastradas pelo admin)

**Campos dinâmicos por forma de pagamento:**
- Pix: chave Pix da empresa (select), nome do cliente, banco, data do recebimento
- Cartão crédito: bandeira (select), nº parcelas, data 1ª cobrança, maquininha (select)
- Cartão débito: bandeira (select), data da cobrança, maquininha (select)
- Boleto: banco, data de vencimento, dados bancários do cliente
- Dinheiro: data do recebimento, troco (opcional)

**Botão confirmar** → salva fechamento e notifica admin

---

### 8. Clientes

**Lista de clientes com busca por nome.**
Cada item: nome, telefone, email, nº de projetos.
Botão "Novo cliente".
Clique abre ficha do cliente.

**Ficha do cliente:**
- Dados: nome, telefone, email, endereço
- Botão editar
- Lista de projetos do cliente com status

**Modal: Novo cliente / Editar cliente**
- Nome (obrigatório)
- Telefone
- Email
- Endereço

---

### 9. Notificações

Lista de todas as notificações em ordem cronológica.
Cada item: ícone por tipo, título, descrição, data, indicador de lida/não lida.
Clique marca como lida e navega para o projeto relacionado.
Botão "Marcar todas como lidas".

---

## Telas — Admin

---

### 1. Início (dashboard geral)

**Cards de métricas (linha de 4):**
- Faturamento do mês (R$)
- Orçamentos gerados no mês
- Taxa de fechamento geral (%)
- Projetos em produção

**Tabela: Ranking de vendedoras**
Colunas: nome, total vendido, orçamentos gerados, fechados, taxa de fechamento.
Ordenado por total vendido decrescente.

**Gráfico: Faturamento mensal**
Linha dos últimos 6 meses.

**Lista: Últimos fechamentos**
5 mais recentes com cliente, vendedora, valor e forma de pagamento.

---

### 2. Financeiro

**Filtros no topo:**
- Período (date range picker)
- Vendedora (select, todos por padrão)
- Forma de pagamento (select, todas por padrão)
- Status: fechados | perdidos | todos

**Cards de totais (conforme filtro ativo):**
- Total recebido
- Ticket médio
- Nº de fechamentos

**Tabela: Extrato de recebimentos**
Colunas: data, cliente, projeto, vendedora, valor, forma de pagamento, ações (ver detalhes).

**Painel lateral: Detalhes do fechamento**
Todos os dados do formulário de fechamento incluindo dados bancários.

**Tabela: Projetos perdidos**
Colunas: data, cliente, projeto, vendedora, motivo (se preenchido).

---

### 3. Configurações

**Seção: Dados da empresa**
- Nome, logo (upload), email de contato
- Botão salvar

**Seção: Usuários**
- Lista de vendedores e medidores com nome, email, perfil, status (ativo/inativo)
- Botão "Convidar usuário" → modal com campo email e select de perfil → envia link
- Botão desativar/reativar usuário

**Seção: Materiais de área**
Tabela com nome, categoria, preço 1cm, preço 2cm, preço 3cm, ativo.
Botões: adicionar, editar, ativar/desativar.

**Seção: Materiais lineares**
Tabela com nome, tipo (acabamento_aresta | material_linear), preço/ml, ativo.
Botões: adicionar, editar, ativar/desativar.

**Seção: Produtos avulsos**
Tabela com nome, subcategoria, preço unitário, inclui material, ativo.
Botões: adicionar, editar, ativar/desativar.

**Seção: Formas de pagamento**
Lista de formas cadastradas com campos configurados.
Botão "Nova forma de pagamento" → modal para configurar nome e campos dinâmicos.
Botão ativar/desativar.

---

## Componentes Reutilizáveis

**StatusPill:** pill colorida conforme status do projeto
**NotifBadge:** número de notificações não lidas no ícone do sino
**MaterialSelector:** painel lateral de busca e seleção de material
**PecaCard:** card de peça com dados da IA e seleção de material
**OrcamentoCard:** card de versão de orçamento no carrinho
**MetricCard:** card de métrica com label, valor e variação
**ConfirmModal:** modal genérico de confirmação com título, descrição e botões

---

## Paleta e Estilo

- Fundo: branco com sidebar cinza claro
- Status colors: orçado=cinza, aprovado=verde, produzindo=roxo, entregue=azul, perdido=vermelho
- Primária: verde (#1D9E75)
- Tipografia: sans-serif, clean, sem serifa
- Cards com borda sutil 0.5px, sem sombra
- Botões outline com hover suave
- Tabelas com linhas alternadas levemente

