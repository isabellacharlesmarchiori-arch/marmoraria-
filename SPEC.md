# Marmoraria App — Especificação Técnica

## Stack
- **App de desenho (medidor):** Flutter (tablet, offline-first)
- **Banco de dados:** Supabase (PostgreSQL + Auth + Storage + Realtime + RLS)
- **Automação + IA:** n8n (webhook → Claude/GPT → Supabase)
- **Dashboard (vendedor + admin):** Lovable

---

## Modelo Multi-tenant

Cada marmoraria é um `tenant`. Todo registro tem `empresa_id` como foreign key.
Supabase RLS garante isolamento total — cada usuário só acessa dados da própria empresa.

### Cadastro de empresa
1. Admin acessa o site e cria conta com email → vira admin da empresa
2. Admin convida vendedores e medidores via link por email (expira 48h, uso único)
3. Convidado clica no link, cria senha → entra vinculado à empresa

---

## Perfis e Acessos

| Perfil | Acesso |
|--------|--------|
| `admin` | tudo — usuários, tabela de preços, financeiro, dashboard geral |
| `vendedor` | clientes, projetos, orçamentos, dashboard pessoal |
| `medidor` | app de desenho, agenda, envio de medições |

---

## Schema do Banco de Dados

### empresas
```sql
id uuid PK
nome text
logo_url text
email_contato text
created_at timestamptz
```

### usuarios
```sql
id uuid PK (= auth.users.id)
empresa_id uuid FK empresas
nome text
email text
perfil text CHECK ('admin','vendedor','medidor')
ativo boolean DEFAULT true
created_at timestamptz
```

### convites
```sql
id uuid PK
empresa_id uuid FK empresas
email text
perfil text CHECK ('vendedor','medidor')
token text UNIQUE
usado boolean DEFAULT false
expira_em timestamptz
created_at timestamptz
```

### clientes
```sql
id uuid PK
empresa_id uuid FK empresas
nome text
telefone text
email text
endereco text
created_at timestamptz
```

### projetos
```sql
id uuid PK
empresa_id uuid FK empresas
cliente_id uuid FK clientes
vendedor_id uuid FK usuarios
nome text
status text CHECK ('orcado','aprovado','produzindo','entregue','perdido')
motivo_perda text NULLABLE
created_at timestamptz
updated_at timestamptz
```

### medicoes
```sql
id uuid PK
empresa_id uuid FK empresas
projeto_id uuid FK projetos
medidor_id uuid FK usuarios
data_agendada timestamptz
data_enviada timestamptz NULLABLE
status text CHECK ('agendada','enviada','processada')
json_medicao jsonb
svg_url text NULLABLE
created_at timestamptz
```

### ambientes
```sql
id uuid PK
empresa_id uuid FK empresas
projeto_id uuid FK projetos
medicao_id uuid FK medicoes
nome text
created_at timestamptz
```

### pecas
```sql
id uuid PK
empresa_id uuid FK empresas
ambiente_id uuid FK ambientes
tipo text CHECK ('retangulo','poligono','faixa')
nome_livre text
espessura_cm int CHECK (1,2,3)
area_bruta_m2 numeric
area_liquida_m2 numeric
dimensoes jsonb
arestas jsonb NULLABLE
segmentos jsonb NULLABLE
recortes jsonb DEFAULT '[]'
incluida boolean DEFAULT true
created_at timestamptz
```

### orcamentos
```sql
id uuid PK
empresa_id uuid FK empresas
ambiente_id uuid FK ambientes
vendedor_id uuid FK usuarios
nome_versao text
status text CHECK ('rascunho','completo')
desconto_total numeric DEFAULT 0
valor_total numeric
created_at timestamptz
updated_at timestamptz
```

### orcamento_pecas
```sql
id uuid PK
orcamento_id uuid FK orcamentos
peca_id uuid FK pecas
material_id uuid FK materiais
incluida boolean DEFAULT true
valor_area numeric
valor_acabamentos numeric
valor_recortes numeric
valor_total numeric
```

### orcamento_avulsos
```sql
id uuid PK
orcamento_id uuid FK orcamentos
produto_id uuid FK produtos_avulsos
quantidade int DEFAULT 1
valor_unitario numeric
valor_total numeric
```

### materiais
```sql
id uuid PK
empresa_id uuid FK empresas
nome text
categoria text
preco_1cm numeric
preco_2cm numeric
preco_3cm numeric
ativo boolean DEFAULT true
created_at timestamptz
```

### materiais_lineares
```sql
id uuid PK
empresa_id uuid FK empresas
nome text
tipo text CHECK ('acabamento_aresta','material_linear')
preco_ml numeric
ativo boolean DEFAULT true
created_at timestamptz
```

### produtos_avulsos
```sql
id uuid PK
empresa_id uuid FK empresas
nome text
subcategoria text CHECK ('cuba','torneira','furo','recorte','outro')
preco_unitario numeric
inclui_material boolean DEFAULT false
ativo boolean DEFAULT true
created_at timestamptz
```

### formas_pagamento
```sql
id uuid PK
empresa_id uuid FK empresas
nome text
campos jsonb
ativo boolean DEFAULT true
```

### fechamentos
```sql
id uuid PK
empresa_id uuid FK empresas
projeto_id uuid FK projetos
vendedor_id uuid FK usuarios
orcamento_id uuid FK orcamentos
data_fechamento date
valor_fechado numeric
forma_pagamento_id uuid FK formas_pagamento
dados_pagamento jsonb
created_at timestamptz
```

### notificacoes
```sql
id uuid PK
empresa_id uuid FK empresas
usuario_id uuid FK usuarios
tipo text
titulo text
corpo text
lida boolean DEFAULT false
created_at timestamptz
```

---

## JSON da Medição

```json
{
  "projeto_id": "uuid",
  "cliente_id": "uuid",
  "medidor_id": "uuid",
  "data_medicao": "2026-03-31T10:00:00Z",
  "ambientes": [
    {
      "ambiente_id": "uuid",
      "nome": "Cozinha",
      "pecas": [
        {
          "peca_id": "uuid",
          "tipo": "retangulo",
          "nome_livre": "Bancada principal",
          "dimensoes": {
            "largura_cm": 60,
            "comprimento_cm": 180,
            "espessura_cm": 3
          },
          "area_bruta_m2": 1.08,
          "area_liquida_m2": 0.94,
          "arestas": {
            "topo":     { "acabamento": "meia_esquadria", "comprimento_cm": 180 },
            "base":     { "acabamento": "sem_acabamento", "comprimento_cm": 180 },
            "esquerda": { "acabamento": "reto_simples",   "comprimento_cm": 60  },
            "direita":  { "acabamento": "sem_acabamento", "comprimento_cm": 60  }
          },
          "recortes": [
            { "tipo": "retangulo", "descricao": "cooktop", "largura_cm": 50, "comprimento_cm": 56, "area_m2": 0.28 },
            { "tipo": "circular",  "descricao": "furo torneira", "diametro_cm": 3.5 }
          ]
        },
        {
          "peca_id": "uuid",
          "tipo": "poligono",
          "nome_livre": "Bancada diagonal",
          "espessura_cm": 3,
          "area_bruta_m2": 0.90,
          "area_liquida_m2": 0.90,
          "segmentos": [
            { "seg_id": 1, "comprimento_cm": 100, "acabamento": "meia_esquadria" },
            { "seg_id": 2, "comprimento_cm": 60,  "acabamento": "sem_acabamento" },
            { "seg_id": 3, "comprimento_cm": 72,  "acabamento": "reto_simples"   },
            { "seg_id": 4, "comprimento_cm": 80,  "acabamento": "sem_acabamento" }
          ],
          "recortes": [
            { "tipo": "circular", "descricao": "cuba", "diametro_cm": 35 }
          ]
        },
        {
          "peca_id": "uuid",
          "tipo": "faixa",
          "nome_livre": "Rodapé",
          "dimensoes": {
            "largura_cm": 10,
            "comprimento_cm": 340,
            "espessura_cm": 1
          },
          "area_bruta_m2": 0.34,
          "area_liquida_m2": 0.34,
          "arestas": {
            "topo": { "acabamento": "reto_simples",   "comprimento_cm": 340 },
            "base": { "acabamento": "sem_acabamento", "comprimento_cm": 340 }
          },
          "recortes": []
        }
      ]
    }
  ]
}
```

### Valores válidos
- `peca.tipo`: `retangulo` | `poligono` | `faixa`
- `acabamento`: `meia_esquadria` | `reto_simples` | `sem_acabamento`
- `recorte.tipo`: `circular` | `retangulo`
- `espessura_cm`: `1` | `2` | `3`

---

## Prompt da IA (n8n → Claude/GPT)

```
Você é um assistente de orçamentos de marmoraria.
Analise as medidas abaixo e retorne um JSON com:
- area_liquida_m2 por peça
- metros lineares de acabamento por tipo
- totais consolidados por ambiente

NÃO defina material nem preço. Apenas extraia e some as medidas.

DADOS: {{ambientes_json}}

RETORNE EXATAMENTE:
{
  "resumo_por_peca": [
    {
      "peca_id": "...",
      "nome": "...",
      "area_liquida_m2": 0.00,
      "espessura_cm": 0,
      "acabamentos": {
        "meia_esquadria_ml": 0.00,
        "reto_simples_ml": 0.00
      },
      "recortes_qty": 0
    }
  ],
  "totais": {
    "area_total_m2": 0.00,
    "meia_esquadria_ml": 0.00,
    "reto_simples_ml": 0.00
  }
}
```

---

## Fluxo n8n

1. Trigger: webhook POST do Supabase quando `medicoes.status` muda para `'enviada'`
2. Busca o JSON da medição em `medicoes.json_medicao`
3. Monta prompt com os dados
4. Chama Claude/GPT API
5. Salva resultado em `medicoes.status = 'processada'`
6. Insere notificação para a vendedora do projeto
7. Atualiza Supabase Realtime → vendedora recebe notificação in-app

---

## Notificações — Gatilhos

| Evento | Quem recebe | Canal |
|--------|-------------|-------|
| Medição agendada | medidor | push + in-app |
| Lembrete de medição | medidor | push (1 dia antes + 2h antes) |
| Medição reagendada/cancelada | medidor | push + in-app |
| Medição enviada pelo medidor | vendedora | push + in-app |
| IA processou a medição | vendedora | in-app |
| Projeto aprovado | vendedora | in-app |
| Status de produção atualizado | vendedora | in-app |
| Novo pedido aprovado | admin | in-app |
| Projeto perdido | admin | in-app |

---

## App de Desenho — Flutter

### Formas disponíveis
- **Retângulo:** arestas nomeadas topo/base/esquerda/direita
- **Polígono:** linhas conectadas ponto a ponto, fecha ao tocar o primeiro ponto, área via Shoelace
- **Faixa:** linha pontilhada, peça independente com largura + comprimento

### Recortes (filhos de qualquer peça)
- **Circular:** só diâmetro (círculo = sempre furo)
- **Retangular:** largura + comprimento (cooktop, cuba de embutir)

### Acabamentos por aresta
`meia_esquadria` | `reto_simples` | `sem_acabamento`

### Canvas
- Fundo quadriculado
- Escala automática pela maior peça do ambiente
- Cotas visíveis no desenho
- Export SVG com cotas, sem escala impressa
- Uma tela por ambiente (medidor pode criar telas adicionais)

---

## Fluxo de Orçamento

1. IA entrega dados por peça (m², ml acabamento, qtd recortes)
2. Vendedora seleciona material por peça — obrigatório antes de prosseguir
3. Pode selecionar múltiplos materiais por peça
4. Sistema pergunta: versões pareadas | todas as combinações | manual
5. Versões geradas com nome automático (renomeável)
6. Vendedora adiciona produtos avulsos (opcional)
7. Orçamento disponível no carrinho

### Carrinho (estilo Shopee)
- Ambientes como grupos, versões como itens selecionáveis
- Seleciona quais ambientes e qual versão de cada um
- Desconto no total geral
- Botões: Imprimir PDF | Enviar WhatsApp

### Edição pós-criação
- Botão editar em cada peça dentro de cada versão
- Versões são independentes — editar uma não afeta outras
- Duplicar versão — nasce igual, edita o que mudou
- Peças podem ser marcadas como "não incluída" (dados preservados)

---

## Documentos Gerados

### Orçamento (cliente)
Cabeçalho · detalhamento por peça com valores · subtotal por ambiente · desconto · total · validade · sem desenho

### Ordem de produção (fábrica)
Desenhos com cotas · sem preços · gerado ao marcar projeto como aprovado

---

## Status do Projeto
`orcado` → `aprovado` → `produzindo` → `entregue`
`perdido` — pode ser marcado em qualquer etapa (motivo opcional)

Atualização de status: vendedora (só projetos dela) ou admin (qualquer projeto)

---

## Formulário de Fechamento (vendedora preenche ao marcar aprovado)

**Obrigatório:** data de fechamento · valor fechado · forma de pagamento + campos dinâmicos

**Campos por forma de pagamento:**
- Pix: chave Pix, nome/banco cliente, data recebimento
- Cartão crédito: bandeira, parcelas, data 1ª cobrança, maquininha
- Cartão débito: bandeira, data cobrança, maquininha
- Boleto: banco, vencimento, dados bancários cliente
- Dinheiro: data recebimento, troco (opcional)

Dados bancários do cliente: restritos ao admin.

---

## Painel Admin — Financeiro

- Faturamento do mês + variação
- Orçamentos gerados e taxa de fechamento
- Por vendedora: total vendido, nº orçamentos, taxa fechamento, ranking
- Extrato: lista de fechamentos com filtros por período, vendedora, forma de pagamento
- Projetos perdidos com motivo

---

## RLS Policies (Supabase)

Todas as tabelas com `empresa_id` devem ter policy:
```sql
-- SELECT
CREATE POLICY "empresa_isolamento" ON <tabela>
  FOR ALL USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid()
  ));
```

Exceções:
- `usuarios`: vendedor vê só a si mesmo + medidores da empresa; admin vê todos
- `fechamentos.dados_pagamento`: visível apenas para admin
- `projetos`: vendedor vê só os seus; admin vê todos da empresa

---

## Ordem de Implementação Recomendada

1. Supabase — schema + RLS + seed de dados de teste
2. n8n — fluxo de automação com dados fictícios
3. Lovable — dashboard vendedor e admin
4. Flutter — app do medidor

