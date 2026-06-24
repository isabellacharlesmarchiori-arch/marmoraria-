import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import {
  callGemini,
  buildChatSystemPrompt,
  sanitizeGeminiHistory,
  isConfigured,
  MODEL_NAME,
  MAX_HISTORY_MESSAGES,
} from '../services/aiService';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL       = MODEL_NAME;
const STORAGE_KEY = 'smartstone_ia_history';
const MAX_SAVED_CONVS = 30;

const WRITE_TOOLS = new Set([
  'cadastrar_cliente', 'cadastrar_projeto', 'atualizar_status_projeto',
  'criar_orcamento', 'adicionar_lancamento_financeiro',
  'atualizar_cliente', 'agendar_medicao',
  'marcar_lancamento_pago', 'cancelar_lancamento', 'cadastrar_parceiro',
]);

const STATUS_PT = {
  orcado: 'Orçado', aprovado: 'Aprovado', produzindo: 'Produzindo',
  entregue: 'Entregue', perdido: 'Perdido',
};

// ── Tool definitions ──────────────────────────────────────────────────────────

const ALL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_cep',
      description: 'Busca endereço completo a partir de um CEP brasileiro via ViaCEP. Use ANTES de cadastrar_cliente quando o usuário fornecer apenas um CEP, para preencher logradouro, bairro, cidade e estado automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          cep: { type: 'string', description: 'CEP no formato 00000-000 ou 00000000.' },
        },
        required: ['cep'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_projetos',
      description: 'Busca projetos da empresa. Use `projeto_nome` para localizar um projeto por nome parcial (ILIKE) e obter o projeto_id — nunca peça o ID ao usuário. Combine com `cliente_nome` ou `cliente_id` para restringir ao cliente certo.',
      parameters: {
        type: 'object',
        properties: {
          projeto_nome: { type: 'string', description: 'Nome parcial do projeto (busca ILIKE). Use para resolver o projeto_id sem pedir ao usuário.' },
          status:       { type: 'string', enum: ['orcado','aprovado','produzindo','entregue','perdido'] },
          cliente_nome: { type: 'string', description: 'Nome parcial do cliente dono do projeto.' },
          cliente_id:   { type: 'string', description: 'ID exato do cliente (use quando já tiver o ID de buscar_clientes).' },
          limite:       { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_clientes',
      description: 'Busca clientes por nome parcial (ILIKE). SEMPRE use esta tool para resolver nomes em IDs — nunca peça o ID ao usuário. Se retornar múltiplos resultados, apresente os nomes encontrados e pergunte qual é o correto antes de continuar.',
      parameters: {
        type: 'object',
        properties: {
          nome:  { type: 'string', description: 'Nome parcial do cliente (busca ILIKE). Use para obter o cliente_id.' },
          email: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_orcamento',
      description: 'Retorna orçamentos de um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string' },
        },
        required: ['projeto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_materiais',
      description: 'Lista materiais com preços. IMPORTANTE: o campo "nome" é só o nome base do material SEM a categoria e SEM acabamento/espessura (ex: "Preto São Gabriel", não "Granito Preto São Gabriel Polido 2cm"). Use "categoria" para filtrar por tipo (Granito, Mármore, Quartzito etc). Preços ficam em variacoes_precos com acabamento e espessura.',
      parameters: {
        type: 'object',
        properties: {
          nome:      { type: 'string', description: 'Nome base do material, sem categoria e sem acabamento/espessura.' },
          categoria: { type: 'string', description: 'Tipo do material: Granito, Mármore, Quartzito, Lâmina Ultra Compacta, Quartzo, etc.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_financeiro',
      description: 'Resumo financeiro do mês: contas, lançamentos, categorias. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'YYYY-MM' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_medicoes',
      description: 'Lista medições de um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string' },
        },
        required: ['projeto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_usuarios',
      description: 'Busca usuários da empresa. Use `nome` para localizar um medidor pelo nome parcial (ILIKE) e obter o medidor_id — nunca peça o ID ao usuário. Vendedor só vê medidores; admin vê todos.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome parcial do usuário (busca ILIKE). Use para resolver o medidor_id.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_cliente',
      description: 'Cadastra cliente. Se o usuário informar um CEP, chame buscar_cep PRIMEIRO para obter o endereço completo. Colete nome, telefone e endereço ANTES de chamar.',
      parameters: {
        type: 'object',
        properties: {
          nome:     { type: 'string' },
          telefone: { type: 'string' },
          email:    { type: 'string' },
          endereco: { type: 'string' },
        },
        required: ['nome', 'telefone', 'endereco'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_projeto',
      description: 'Cria projeto. Use buscar_clientes para obter cliente_id.',
      parameters: {
        type: 'object',
        properties: {
          nome:       { type: 'string' },
          cliente_id: { type: 'string' },
        },
        required: ['nome', 'cliente_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_status_projeto',
      description: 'Muda o status de um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string' },
          status:     { type: 'string', enum: ['orcado','aprovado','produzindo','entregue','perdido'] },
        },
        required: ['projeto_id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_orcamento',
      description: 'Cria rascunho de orçamento para um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id:  { type: 'string' },
          valor_total: { type: 'number' },
        },
        required: ['projeto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adicionar_lancamento_financeiro',
      description: 'Cria lançamento financeiro. Chame buscar_financeiro antes para categoria_id. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          tipo:            { type: 'string', enum: ['entrada','saida'] },
          valor:           { type: 'number' },
          descricao:       { type: 'string' },
          data_vencimento: { type: 'string', description: 'YYYY-MM-DD' },
          categoria_id:    { type: 'string' },
          conta_id:        { type: 'string' },
        },
        required: ['tipo', 'valor', 'descricao', 'data_vencimento', 'categoria_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_arquitetos',
      description: 'Lista arquitetos da empresa.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_parceiros',
      description: 'Lista fornecedores/funcionários. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          tipo: { type: 'string', enum: ['fornecedor','funcionario','terceiro'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_fechamentos',
      description: 'Lista fechamentos de projetos.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string' },
          limite:     { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_notificacoes',
      description: 'Lista notificações do usuário.',
      parameters: {
        type: 'object',
        properties: {
          apenas_nao_lidas: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_lancamentos_periodo',
      description: 'Lista lançamentos financeiros por período/tipo/status. Retorna IDs para baixa. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          tipo:        { type: 'string', enum: ['entrada','saida'] },
          status:      { type: 'string', enum: ['pendente','pago','parcial','atrasado','cancelado'] },
          data_inicio: { type: 'string', description: 'YYYY-MM-DD' },
          data_fim:    { type: 'string', description: 'YYYY-MM-DD' },
          limite:      { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_cliente',
      description: 'Atualiza dados de um cliente. Use buscar_clientes para obter cliente_id.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { type: 'string' },
          telefone:   { type: 'string' },
          email:      { type: 'string' },
          endereco:   { type: 'string' },
        },
        required: ['cliente_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_medicao',
      description: 'Agenda medição. FLUXO OBRIGATÓRIO antes de chamar esta tool: 1) buscar_clientes pelo nome do cliente → 2) buscar_projetos com projeto_nome e o cliente_id encontrado → 3) buscar_usuarios com o nome do medidor → 4) somente então chamar agendar_medicao com os IDs. Nunca peça projeto_id nem medidor_id ao usuário — resolva-os sempre via tools.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id:   { type: 'string', description: 'ID do projeto (obtenha via buscar_projetos, nunca peça ao usuário).' },
          medidor_id:   { type: 'string', description: 'ID do medidor (obtenha via buscar_usuarios, nunca peça ao usuário).' },
          data_medicao: { type: 'string', description: 'ISO 8601, ex: 2026-05-20T09:00:00' },
          endereco:     { type: 'string' },
          observacoes:  { type: 'string' },
        },
        required: ['projeto_id', 'medidor_id', 'data_medicao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marcar_lancamento_pago',
      description: 'Registra pagamento de um lançamento. Use buscar_lancamentos_periodo para o ID. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          lancamento_id:   { type: 'string' },
          valor_pago:      { type: 'number' },
          data_pagamento:  { type: 'string', description: 'YYYY-MM-DD' },
          forma_pagamento: { type: 'string', enum: ['pix','boleto','cartao_credito','cartao_debito','dinheiro','cheque','transferencia','outro'] },
          conta_id:        { type: 'string' },
        },
        required: ['lancamento_id', 'valor_pago', 'data_pagamento', 'forma_pagamento'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_lancamento',
      description: 'Cancela um lançamento (soft-delete). Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          lancamento_id: { type: 'string' },
          motivo:        { type: 'string' },
        },
        required: ['lancamento_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_parceiro',
      description: 'Cadastra fornecedor ou funcionário. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          nome:      { type: 'string' },
          tipos:     { type: 'array', items: { type: 'string', enum: ['fornecedor','funcionario','terceiro'] } },
          telefone:  { type: 'string' },
          email:     { type: 'string' },
          documento: { type: 'string' },
        },
        required: ['nome', 'tipos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_estoque',
      description: 'Retorna resumo do estoque para responder vendedores sobre disponibilidade de materiais.',
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            enum: ['chapas', 'pedaceiras', 'produtos', 'insumos'],
            description: 'Tipo de estoque a consultar. Omitir retorna todos.',
          },
          material_nome: {
            type: 'string',
            description: 'Filtrar chapas/pedaceiras por nome parcial do material (ILIKE).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_chapa',
      description: 'Cadastra uma ou mais chapas no estoque. Resolve material_id automaticamente pelo nome. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          material_nome:  { type: 'string',  description: 'Nome do material (busca ILIKE na tabela materiais).' },
          categoria:      { type: 'string',  enum: ['granito','marmore','quartzito','quartzo','lamina','nanoglass'] },
          largura_cm:     { type: 'number' },
          altura_cm:      { type: 'number' },
          espessura_cm:   { type: 'number',  description: 'Padrão 2 cm.' },
          quantidade:     { type: 'integer', description: 'Quantas chapas idênticas cadastrar. Padrão 1.' },
          tem_trinca:     { type: 'boolean' },
          tem_mula:       { type: 'boolean' },
          observacoes:    { type: 'string' },
        },
        required: ['material_nome', 'categoria', 'largura_cm', 'altura_cm'],
      },
    },
  },
];

function getToolsForPerfil(perfil) {
  let tools;
  if (perfil === 'medidor') {
    tools = ALL_TOOLS.filter(t => ['buscar_projetos', 'buscar_medicoes', 'buscar_notificacoes'].includes(t.function.name));
  } else if (perfil === 'vendedor') {
    const adminOnly = new Set([
      'buscar_financeiro', 'adicionar_lancamento_financeiro',
      'buscar_parceiros', 'buscar_lancamentos_periodo',
      'marcar_lancamento_pago', 'cancelar_lancamento', 'cadastrar_parceiro',
    ]);
    tools = ALL_TOOLS.filter(t => !adminOnly.has(t.function.name));
  } else {
    tools = ALL_TOOLS;
  }
  console.log(`[IA] tools para ${perfil}: ${tools.length} — ${tools.map(t => t.function.name).join(', ')}`);
  return tools;
}

// ── Supabase executors ────────────────────────────────────────────────────────

async function executeTool(name, args, empresaId, userId, perfil) {
  try {
    switch (name) {

      case 'buscar_cep': {
        const cep = (args.cep ?? '').replace(/\D/g, '');
        if (cep.length !== 8) return { erro: 'CEP inválido — informe exatamente 8 dígitos.' };
        const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!res.ok) return { erro: `ViaCEP não respondeu (HTTP ${res.status}).` };
        const d = await res.json();
        if (d.erro) return { erro: `CEP ${args.cep} não encontrado.` };
        const enderecoCompleto = [d.logradouro, d.bairro, `${d.localidade}/${d.uf}`, d.cep]
          .filter(Boolean).join(', ');
        return {
          cep:               d.cep,
          logradouro:        d.logradouro,
          bairro:            d.bairro,
          cidade:            d.localidade,
          estado:            d.uf,
          endereco_completo: enderecoCompleto,
        };
      }

      case 'buscar_projetos': {
        const limite = Math.min(args.limite ?? 50, 100);
        const normalizeStr = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        let clienteIds = null;
        if (args.cliente_id) {
          clienteIds = [args.cliente_id];
        } else if (args.cliente_nome) {
          // Busca todos e filtra client-side (accent-insensitive)
          const { data: clts } = await supabase.from('clientes').select('id, nome')
            .eq('empresa_id', empresaId);
          const matched = (clts ?? []).filter(c => normalizeStr(c.nome).includes(normalizeStr(args.cliente_nome)));
          clienteIds = matched.map(c => c.id);
          if (clienteIds.length === 0) return { total: 0, projetos: [] };
        }
        let q = supabase.from('projetos')
          .select('id, nome, status, created_at, clientes(nome)')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false }).limit(limite);
        if (args.status)  q = q.eq('status', args.status);
        if (clienteIds)   q = q.in('cliente_id', clienteIds);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        const projetos = args.projeto_nome
          ? data.filter(p => normalizeStr(p.nome).includes(normalizeStr(args.projeto_nome)))
          : data;
        return {
          total: projetos.length,
          projetos: projetos.map(p => ({
            id: p.id, nome: p.nome,
            status: p.status, status_pt: STATUS_PT[p.status] ?? p.status,
            cliente: p.clientes?.nome ?? '—',
            criado_em: p.created_at?.split('T')[0],
          })),
        };
      }

      case 'buscar_clientes': {
        const normalizeStr = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        let q = supabase.from('clientes').select('id, nome, telefone, email')
          .eq('empresa_id', empresaId).order('nome').limit(200);
        if (args.email) q = q.ilike('email', `%${args.email}%`);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        const filtered = args.nome
          ? data.filter(c => normalizeStr(c.nome).includes(normalizeStr(args.nome)))
          : data;
        return { total: filtered.length, clientes: filtered };
      }

      case 'buscar_orcamento': {
        const { data, error } = await supabase.from('orcamentos')
          .select('id, valor_total, taxa_instalacao, valor_frete, majoramento_percentual, rt_percentual, created_at, descartado_em, ambientes(nome)')
          .eq('empresa_id', empresaId).eq('projeto_id', args.projeto_id)
          .order('created_at', { ascending: false }).limit(20);
        if (error) return { erro: error.message };
        return {
          total: data.length,
          orcamentos: data.map(o => ({
            id: o.id, ambiente: o.ambientes?.nome ?? '—',
            valor_total: o.valor_total, taxa_instalacao: o.taxa_instalacao,
            valor_frete: o.valor_frete, rt_percentual: o.rt_percentual,
            descartado: !!o.descartado_em, criado_em: o.created_at?.split('T')[0],
          })),
        };
      }

      case 'buscar_materiais': {
        // materiais são globais (empresa_id = null) — NÃO filtrar por empresa_id.
        // Os preços ficam em variacoes_precos, que é filtrada por empresa via RLS.
        let q = supabase.from('materiais')
          .select('id, nome, categoria, variacoes_precos(acabamento, espessura, preco_venda)')
          .eq('ativo', true).order('nome').limit(50);
        if (args.nome)      q = q.ilike('nome',      `%${args.nome}%`);
        if (args.categoria) q = q.ilike('categoria', `%${args.categoria}%`);
        const [{ data: area, error: errA }, { data: lin, error: errL }] = await Promise.all([
          q,
          supabase.from('materiais_lineares').select('id, nome, tipo, preco_ml')
            .eq('empresa_id', empresaId).eq('ativo', true).order('nome').limit(30),
        ]);
        if (errA) return { erro: errA.message };
        if (errL) return { erro: errL.message };
        return {
          aviso: 'nome é o nome base (ex: "Preto São Gabriel"), categoria é o tipo (ex: "Granito"). Preços estão em precos_variacoes com acabamento e espessura.',
          materiais_area: {
            total: area?.length ?? 0,
            lista: (area ?? []).map(m => ({
              nome: m.nome, categoria: m.categoria,
              precos: (m.variacoes_precos ?? []).map(v => ({
                acabamento: v.acabamento, espessura: v.espessura, preco_venda: v.preco_venda,
              })),
            })),
          },
          materiais_lineares: {
            total: lin?.length ?? 0,
            lista: (lin ?? []).map(m => ({ nome: m.nome, tipo: m.tipo, preco_ml: m.preco_ml })),
          },
        };
      }

      case 'buscar_financeiro': {
        let ano, mes;
        if (args.mes) { [ano, mes] = args.mes.split('-').map(Number); }
        else { const n = new Date(); ano = n.getFullYear(); mes = n.getMonth() + 1; }
        const pad = n => String(n).padStart(2, '0');
        const ini = `${ano}-${pad(mes)}-01`;
        const fim = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`;

        const [rFech, rContas, rLanc, rCats] = await Promise.all([
          supabase.from('fechamentos').select('id, valor_fechado, data_fechamento')
            .eq('empresa_id', empresaId).gte('data_fechamento', ini).lte('data_fechamento', fim),
          supabase.from('financeiro_contas').select('id, nome, saldo_atual, tipo').eq('empresa_id', empresaId),
          supabase.from('financeiro_lancamentos')
            .select('id, tipo, valor_previsto, valor_pago, descricao, data_vencimento, status')
            .eq('empresa_id', empresaId).gte('data_vencimento', ini).lte('data_vencimento', fim)
            .order('data_vencimento', { ascending: false }).limit(20),
          supabase.from('financeiro_plano_contas').select('id, nome, tipo')
            .eq('empresa_id', empresaId).order('nome'),
        ]);

        const fechamentos = rFech.data ?? [];
        const contas      = rContas.error ? [] : (rContas.data ?? []);
        const lancs       = rLanc.error   ? [] : (rLanc.data  ?? []);
        const cats        = rCats.error   ? [] : (rCats.data  ?? []);
        const totalFechado = fechamentos.reduce((s, f) => s + (Number(f.valor_fechado) || 0), 0);
        const entradas = lancs.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor_previsto), 0);
        const saidas   = lancs.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor_previsto), 0);

        return {
          periodo: `${ini} a ${fim}`,
          fechamentos_mes: { quantidade: fechamentos.length, valor_total: totalFechado },
          contas_bancarias: contas.map(c => ({ id: c.id, nome: c.nome, saldo: c.saldo_atual, tipo: c.tipo })),
          lancamentos_mes: {
            quantidade: lancs.length, total_entradas: entradas,
            total_saidas: saidas, saldo_periodo: entradas - saidas,
            ultimos: lancs.slice(0, 5).map(l => ({
              tipo: l.tipo, valor: l.valor_previsto,
              descricao: l.descricao, vencimento: l.data_vencimento, status: l.status,
            })),
          },
          categorias_plano_contas: cats.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
        };
      }

      case 'buscar_medicoes': {
        const { data, error } = await supabase.from('medicoes')
          .select('id, projeto_id, status, observacoes, created_at')
          .eq('empresa_id', empresaId).eq('projeto_id', args.projeto_id)
          .order('created_at', { ascending: false }).limit(10);
        if (error) return { erro: error.message };
        return { total: data.length, medicoes: data };
      }

      case 'buscar_usuarios': {
        // ilike do PostgreSQL é accent-sensitive: 'André' ILIKE '%andre%' = false.
        // Solução: buscar tudo no banco e filtrar client-side com normalize('NFD').
        const normalizeStr = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

        // Vendedor só vê medidores (necessário para agendar_medicao).
        // Admin vê todos os usuários.
        if (perfil !== 'admin' && perfil !== 'superadmin') {
          const { data, error } = await supabase.from('usuarios')
            .select('id, nome, perfil')
            .eq('empresa_id', empresaId)
            .in('perfil', ['medidor', 'vendedor_medidor'])
            .eq('ativo', true).order('nome');
          if (error) return { erro: error.message };
          const filtered = args.nome
            ? data.filter(u => normalizeStr(u.nome).includes(normalizeStr(args.nome)))
            : data;
          return { total: filtered.length, usuarios: filtered, aviso: 'Vendedor visualiza apenas medidores.' };
        }
        const { data, error } = await supabase.from('usuarios')
          .select('id, nome, email, perfil, ativo').eq('empresa_id', empresaId).order('nome');
        if (error) return { erro: error.message };
        const filtered = args.nome
          ? data.filter(u => normalizeStr(u.nome).includes(normalizeStr(args.nome)))
          : data;
        return { total: filtered.length, usuarios: filtered };
      }

      case 'cadastrar_cliente': {
        const missing = [];
        if (!args.nome?.trim())     missing.push('nome');
        if (!args.telefone?.trim()) missing.push('telefone');
        if (!args.endereco?.trim()) missing.push('endereço completo');
        if (missing.length > 0) {
          return {
            erro_validacao: true,
            mensagem: `Campos obrigatórios faltando: ${missing.join(', ')}. Colete essas informações do usuário antes de cadastrar.`,
            campos_faltando: missing,
          };
        }
        const { data, error } = await supabase.from('clientes')
          .insert({
            empresa_id: empresaId,
            nome:       args.nome.trim(),
            telefone:   args.telefone.trim(),
            email:      args.email?.trim()    || null,
            endereco:   args.endereco.trim(),
          })
          .select('id, nome').single();
        if (error) return { erro: error.message };
        return { sucesso: true, cliente_criado: data };
      }

      case 'cadastrar_projeto': {
        const { data, error } = await supabase.from('projetos')
          .insert({ empresa_id: empresaId, nome: args.nome, cliente_id: args.cliente_id, vendedor_id: userId, status: 'orcado' })
          .select('id, nome, status').single();
        if (error) return { erro: error.message };
        return { sucesso: true, projeto_criado: data };
      }

      case 'atualizar_status_projeto': {
        const { data, error } = await supabase.from('projetos')
          .update({ status: args.status })
          .eq('id', args.projeto_id).eq('empresa_id', empresaId)
          .select('id, nome, status').single();
        if (error) return { erro: error.message };
        return { sucesso: true, projeto_atualizado: data };
      }

      case 'criar_orcamento': {
        const { data, error } = await supabase.from('orcamentos')
          .insert({ empresa_id: empresaId, projeto_id: args.projeto_id, vendedor_id: userId, valor_total: args.valor_total ?? 0 })
          .select('id, projeto_id, valor_total').single();
        if (error) return { erro: error.message };
        return { sucesso: true, orcamento_criado: data };
      }

      case 'adicionar_lancamento_financeiro': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores podem registrar lançamentos.' };
        const hoje = new Date().toISOString().split('T')[0];
        const competencia = `${(args.data_vencimento ?? hoje).slice(0, 7)}-01`;
        const { data, error } = await supabase.from('financeiro_lancamentos')
          .insert({
            empresa_id: empresaId, tipo: args.tipo, descricao: args.descricao,
            valor_previsto: args.valor, data_vencimento: args.data_vencimento ?? hoje,
            data_emissao: hoje, competencia, categoria_id: args.categoria_id,
            conta_id: args.conta_id ?? null, origem: 'manual', created_by: userId,
          })
          .select('id, tipo, valor_previsto, descricao, data_vencimento').single();
        if (error) return { erro: error.message };
        return { sucesso: true, lancamento_criado: data };
      }

      case 'buscar_arquitetos': {
        let q = supabase.from('arquitetos').select('id, nome, telefone, email')
          .eq('empresa_id', empresaId).order('nome').limit(50);
        if (args.nome) q = q.ilike('nome', `%${args.nome}%`);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, arquitetos: data };
      }

      case 'buscar_parceiros': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };
        let q = supabase.from('parceiros')
          .select('id, nome, tipos, telefone, email, ativo')
          .eq('empresa_id', empresaId).eq('ativo', true).order('nome').limit(50);
        if (args.nome) q = q.ilike('nome', `%${args.nome}%`);
        if (args.tipo) q = q.contains('tipos', [args.tipo]);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, parceiros: data };
      }

      case 'buscar_fechamentos': {
        const limite = Math.min(args.limite ?? 20, 50);
        let q = supabase.from('fechamentos')
          .select('id, projeto_id, valor_fechado, data_fechamento, projetos(nome, status)')
          .eq('empresa_id', empresaId)
          .order('data_fechamento', { ascending: false }).limit(limite);
        if (args.projeto_id) q = q.eq('projeto_id', args.projeto_id);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return {
          total: data.length,
          fechamentos: data.map(f => ({
            id: f.id, projeto_id: f.projeto_id,
            projeto_nome: f.projetos?.nome ?? '—',
            projeto_status: f.projetos?.status ?? '—',
            valor_fechado: f.valor_fechado,
            data_fechamento: f.data_fechamento,
          })),
        };
      }

      case 'buscar_notificacoes': {
        let q = supabase.from('notificacoes')
          .select('id, tipo, titulo, corpo, lida, created_at')
          .eq('empresa_id', empresaId).eq('usuario_id', userId)
          .order('created_at', { ascending: false }).limit(20);
        if (args.apenas_nao_lidas) q = q.eq('lida', false);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return {
          total: data.length,
          nao_lidas: (data ?? []).filter(n => !n.lida).length,
          notificacoes: data,
        };
      }

      case 'buscar_lancamentos_periodo': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };
        const limite = Math.min(args.limite ?? 30, 100);
        let q = supabase.from('financeiro_lancamentos')
          .select('id, tipo, status, descricao, valor_previsto, valor_pago, data_vencimento, data_pagamento, forma_pagamento, categoria_id, parceiro_id, arquiteto_id, cliente_id, conta_id, projeto_id')
          .eq('empresa_id', empresaId)
          .order('data_vencimento', { ascending: false }).limit(limite);
        if (args.tipo)        q = q.eq('tipo', args.tipo);
        if (args.status)      q = q.eq('status', args.status);
        if (args.data_inicio) q = q.gte('data_vencimento', args.data_inicio);
        if (args.data_fim)    q = q.lte('data_vencimento', args.data_fim);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, lancamentos: data };
      }

      case 'atualizar_cliente': {
        const updates = {};
        if (args.telefone !== undefined) updates.telefone = args.telefone?.trim() || null;
        if (args.email    !== undefined) updates.email    = args.email?.trim()    || null;
        if (args.endereco !== undefined) updates.endereco = args.endereco?.trim() || null;
        if (Object.keys(updates).length === 0)
          return { erro: 'Informe pelo menos um campo para atualizar (telefone, email ou endereço).' };
        const { data, error } = await supabase.from('clientes')
          .update(updates).eq('id', args.cliente_id).eq('empresa_id', empresaId)
          .select('id, nome, telefone, email, endereco').single();
        if (error) return { erro: error.message };
        return { sucesso: true, cliente_atualizado: data };
      }

      case 'agendar_medicao': {
        // Converte data/hora para BRT (-03:00) antes de enviar ao Supabase.
        // A IA manda strings ISO sem timezone (ex: "2026-05-14T09:00:00") e o
        // PostgreSQL interpretaria como UTC, salvando com -3h. Forçamos o offset.
        function toBRTimestamp(val) {
          if (!val) return null;
          const bare       = String(val).replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
          const normalized = /T\d{2}:\d{2}$/.test(bare) ? bare + ':00' : bare;
          return normalized + '-03:00';
        }

        // Busca o nome do medidor para preencher `responsavel` (NOT NULL no banco)
        const { data: medidor, error: errMedidor } = await supabase.from('usuarios')
          .select('nome').eq('id', args.medidor_id).single();
        if (errMedidor) console.warn('[IA][agendar_medicao] busca medidor:', errMedidor.message);

        const payload = {
          empresa_id:         empresaId,
          projeto_id:         args.projeto_id,
          medidor_id:         args.medidor_id,
          responsavel:        medidor?.nome ?? '',
          data_medicao:       toBRTimestamp(args.data_medicao),
          endereco:           args.endereco?.trim()    || null,
          observacoes_acesso: args.observacoes?.trim() || null,
          status:             'agendada',
        };
        console.log('[IA][agendar_medicao] payload enviado:', JSON.stringify(payload, null, 2));

        const { data: inserted, error: insertError } = await supabase
          .from('medicoes')
          .insert(payload)
          .select('id, projeto_id, data_medicao, status, responsavel')
          .single();

        console.log('[IA][agendar_medicao] resposta Supabase:', { inserted, insertError });

        if (insertError) {
          return { sucesso: false, erro: insertError.message };
        }
        if (!inserted) {
          return { sucesso: false, erro: 'Insert não retornou dados — verifique RLS da tabela medicoes.' };
        }
        return { sucesso: true, medicao: inserted };
      }

      case 'marcar_lancamento_pago': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };
        const { data: atual, error: errBusca } = await supabase.from('financeiro_lancamentos')
          .select('id, valor_previsto, valor_pago, status')
          .eq('id', args.lancamento_id).eq('empresa_id', empresaId).single();
        if (errBusca || !atual) return { erro: errBusca?.message ?? 'Lançamento não encontrado.' };
        if (atual.status === 'cancelado') return { erro: 'Lançamento cancelado não pode receber baixa.' };
        const novoTotal  = (Number(atual.valor_pago) || 0) + args.valor_pago;
        const novoStatus = novoTotal >= Number(atual.valor_previsto) - 0.005 ? 'pago' : 'parcial';
        const upd = {
          valor_pago:      novoTotal,
          status:          novoStatus,
          data_pagamento:  args.data_pagamento,
          forma_pagamento: args.forma_pagamento,
        };
        if (args.conta_id) upd.conta_id = args.conta_id;
        const { data, error } = await supabase.from('financeiro_lancamentos')
          .update(upd).eq('id', args.lancamento_id).eq('empresa_id', empresaId)
          .select('id, status, valor_pago, valor_previsto').single();
        if (error) return { erro: error.message };
        return { sucesso: true, lancamento_atualizado: data };
      }

      case 'cancelar_lancamento': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };
        const { data, error } = await supabase.from('financeiro_lancamentos')
          .update({ status: 'cancelado' })
          .eq('id', args.lancamento_id).eq('empresa_id', empresaId)
          .select('id, status, descricao').single();
        if (error) return { erro: error.message };
        return { sucesso: true, lancamento_cancelado: data };
      }

      case 'cadastrar_parceiro': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };
        if (!args.nome?.trim())    return { erro: 'Nome é obrigatório.' };
        if (!args.tipos?.length)   return { erro: 'Informe ao menos um tipo: fornecedor, funcionario ou terceiro.' };
        const { data, error } = await supabase.from('parceiros')
          .insert({
            empresa_id: empresaId,
            nome:       args.nome.trim(),
            tipos:      args.tipos,
            telefone:   args.telefone?.trim()  || null,
            email:      args.email?.trim()     || null,
            documento:  args.documento?.trim() || null,
          })
          .select('id, nome, tipos').single();
        if (error) return { erro: error.message };
        return { sucesso: true, parceiro_criado: data };
      }

      case 'buscar_estoque': {
        const tipo = args.tipo;
        const results = {};

        if (!tipo || tipo === 'chapas') {
          let q = supabase.from('estoque_chapas')
            .select('id, categoria, largura_cm, altura_cm, espessura_cm, quantidade, tem_trinca, tem_mula, materiais(nome)')
            .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
          const { data } = await q;
          let chapas = data ?? [];
          if (args.material_nome)
            chapas = chapas.filter(c => c.materiais?.nome?.toLowerCase().includes(args.material_nome.toLowerCase()));
          results.chapas = chapas.map(c => ({
            material: c.materiais?.nome ?? '?',
            categoria: c.categoria,
            dimensoes: `${c.largura_cm}×${c.altura_cm}cm esp.${c.espessura_cm}cm`,
            quantidade: c.quantidade,
            defeitos: [c.tem_trinca && 'trinca', c.tem_mula && 'mula'].filter(Boolean).join(', ') || 'nenhum',
          }));
        }

        if (!tipo || tipo === 'pedaceiras') {
          const { data } = await supabase.from('estoque_pedaceiras')
            .select('id, categoria, largura_cm, altura_cm, espessura_cm, tem_trinca, tem_mula, materiais(nome)')
            .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100);
          let peds = data ?? [];
          if (args.material_nome)
            peds = peds.filter(p => p.materiais?.nome?.toLowerCase().includes(args.material_nome.toLowerCase()));
          results.pedaceiras = peds.map(p => ({
            material: p.materiais?.nome ?? '?',
            categoria: p.categoria,
            dimensoes: `${p.largura_cm}×${p.altura_cm}cm esp.${p.espessura_cm}cm`,
            defeitos: [p.tem_trinca && 'trinca', p.tem_mula && 'mula'].filter(Boolean).join(', ') || 'nenhum',
          }));
        }

        if (!tipo || tipo === 'produtos') {
          const { data } = await supabase.from('estoque_produtos_avulsos')
            .select('nome, categoria, quantidade, unidade').eq('empresa_id', empresaId).order('nome').limit(100);
          results.produtos = data ?? [];
        }

        if (!tipo || tipo === 'insumos') {
          const { data } = await supabase.from('estoque_insumos')
            .select('nome, categoria, quantidade, unidade').eq('empresa_id', empresaId).order('nome').limit(100);
          results.insumos = data ?? [];
        }

        return results;
      }

      case 'cadastrar_chapa': {
        if (perfil !== 'admin' && perfil !== 'superadmin')
          return { erro: 'Acesso negado: apenas administradores.' };

        // Resolve material_id pelo nome (ILIKE)
        const { data: mats, error: errMat } = await supabase.from('materiais')
          .select('id, nome').eq('empresa_id', empresaId)
          .ilike('nome', `%${args.material_nome}%`).limit(5);
        if (errMat)       return { erro: errMat.message };
        if (!mats?.length) return { erro: `Material "${args.material_nome}" não encontrado.` };
        if (mats.length > 1) return {
          erro: `Nome ambíguo — encontrei: ${mats.map(m => m.nome).join(', ')}. Seja mais específico.`,
        };

        const material = mats[0];
        const MEDIDAS_FIXAS_IA = { lamina: { largura_cm: 320, altura_cm: 160 }, nanoglass: { largura_cm: 320, altura_cm: 160 } };
        const fixed = MEDIDAS_FIXAS_IA[args.categoria];
        const largura = fixed ? fixed.largura_cm : args.largura_cm;
        const altura  = fixed ? fixed.altura_cm  : args.altura_cm;

        const payload = {
          empresa_id:  empresaId,
          material_id: material.id,
          categoria:   args.categoria,
          largura_cm:  largura,
          altura_cm:   altura,
          espessura_cm: args.espessura_cm ?? 2,
          quantidade:  args.quantidade ?? 1,
          tem_trinca:  args.tem_trinca ?? false,
          tem_mula:    args.tem_mula ?? false,
          observacoes: args.observacoes ?? null,
        };

        const qty = payload.quantidade;
        const rows = qty === 1 ? [payload] : Array.from({ length: qty }, () => ({ ...payload, quantidade: 1 }));
        const { error } = await supabase.from('estoque_chapas').insert(rows);
        if (error) return { erro: error.message };

        return {
          sucesso: true,
          resumo: `${qty} chapa${qty > 1 ? 's' : ''} de ${material.nome} cadastrada${qty > 1 ? 's' : ''} (${largura}×${altura}cm, esp.${payload.espessura_cm}cm).`,
        };
      }

      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { erro: err.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeModelText(text) {
  return text
    // Remove function-call markup that the model sometimes generates as plain text
    .replace(/<function=[^>]*>/g, '')
    .replace(/<\/function>/g, '')
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
    // Remove "Aguardo a resposta..." filler lines
    .replace(/Aguardo a resposta\.{0,3}/gi, '')
    // Collapse excessive blank lines left after removal
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanizeTool(name, args) {
  const brl = n => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  switch (name) {
    case 'cadastrar_cliente':
      return `Cadastrar cliente "${args.nome}" · ${args.telefone}${args.endereco ? `\n${args.endereco}` : ''}`;
    case 'cadastrar_projeto':
      return `Criar projeto "${args.nome}"`;
    case 'atualizar_status_projeto':
      return `Mudar status para "${STATUS_PT[args.status] ?? args.status}"`;
    case 'criar_orcamento':
      return `Criar rascunho de orçamento${args.valor_total ? ` — ${brl(args.valor_total)}` : ''}`;
    case 'adicionar_lancamento_financeiro':
      return `Registrar ${args.tipo === 'entrada' ? 'entrada' : 'saída'} de ${brl(args.valor)}: "${args.descricao}" (venc. ${args.data_vencimento ?? 'hoje'})`;
    case 'atualizar_cliente':
      return `Atualizar cliente${args.telefone ? ` · tel: ${args.telefone}` : ''}${args.email ? ` · email: ${args.email}` : ''}${args.endereco ? `\n${args.endereco}` : ''}`;
    case 'agendar_medicao':
      return `Agendar medição para ${args.data_medicao?.split('T')[0] ?? '?'}${args.endereco ? `\nLocal: ${args.endereco}` : ''}`;
    case 'marcar_lancamento_pago':
      return `Registrar pagamento de ${brl(args.valor_pago)} · data: ${args.data_pagamento} · via ${args.forma_pagamento}`;
    case 'cancelar_lancamento':
      return `Cancelar lançamento${args.motivo ? `\nMotivo: ${args.motivo}` : ''}`;
    case 'cadastrar_parceiro':
      return `Cadastrar parceiro "${args.nome}" (${(args.tipos ?? []).join(', ')})`;
    case 'buscar_estoque':
      return `Consultar estoque${args.tipo ? ` — ${args.tipo}` : ''}${args.material_nome ? ` · material: ${args.material_nome}` : ''}`;
    case 'cadastrar_chapa':
      return `Cadastrar ${args.quantidade ?? 1} chapa(s) de "${args.material_nome}" (${args.largura_cm}×${args.altura_cm}cm)`;
    default:
      return name;
  }
}

function buildSystemPrompt(perfil, nome, nomeEmpresa, economyMode = false) {
  return buildChatSystemPrompt(perfil, nome, nomeEmpresa, economyMode);
}

function getInitialMessage() {
  return 'Olá! Eu sou a Gi, como posso te ajudar?';
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function persistConversation(conv) {
  try {
    const all = loadConversations();
    const idx = all.findIndex(c => c.id === conv.id);
    if (idx >= 0) all[idx] = conv; else all.unshift(conv);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_SAVED_CONVS)));
  } catch {}
}

function removeConversation(id) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadConversations().filter(c => c.id !== id)));
  } catch {}
}

function makeTitleFromHistory(history) {
  const first = history.find(m => m.role === 'user');
  // Gemini format: parts array; fallback to legacy content string
  const raw = first?.parts?.[0]?.text ?? (typeof first?.content === 'string' ? first.content : '');
  const trimmed = raw.replace(/\[.*?\]/g, '').trim();
  return (trimmed.slice(0, 38) + (trimmed.length > 38 ? '…' : '')) || 'Nova conversa';
}

function formatRelDate(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = Math.floor(diff / 86400);
  if (d === 1) return 'ontem';
  if (d < 7)   return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConversationSidebar({ conversations, currentId, onSelect, onNew, onDelete }) {
  return (
    <div className="flex flex-col w-52 shrink-0 border-r border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200/80 dark:border-zinc-800 shrink-0">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Conversas</span>
        <button
          onClick={onNew}
          title="Nova conversa"
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-orange-600 dark:hover:text-yellow-400 transition-colors"
        >
          <iconify-icon icon="solar:add-square-linear" width="14" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="p-4 font-mono text-[10px] text-zinc-700 text-center leading-relaxed">
            Nenhuma conversa salva
          </p>
        )}
        {conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`group flex items-start gap-1.5 px-3 py-2.5 cursor-pointer transition-colors border-l-2 ${
              conv.id === currentId
                ? 'bg-zinc-200 dark:bg-zinc-900 border-orange-500 dark:border-yellow-400'
                : 'border-transparent hover:bg-zinc-200/70 dark:hover:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex-1 min-w-0 pt-px">
              <p className={`font-mono text-[11px] leading-snug truncate ${
                conv.id === currentId ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-700 dark:text-zinc-300'
              }`}>
                {conv.title}
              </p>
              <p className="font-mono text-[9px] text-zinc-600 mt-0.5">
                {formatRelDate(conv.updatedAt)}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
              title="Excluir"
              className="opacity-0 group-hover:opacity-100 mt-0.5 text-zinc-600 hover:text-red-400 transition-all shrink-0"
            >
              <iconify-icon icon="solar:trash-bin-minimalistic-linear" width="11" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onDelete, onEdit, onRetry, disabled }) {
  const isUser  = msg.role === 'user';
  const isError = msg.role === 'error';

  const actions = (
    <div className={`flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser && !disabled && (
        <button
          onClick={() => onEdit?.(msg.id, msg.text ?? '')}
          title="Editar e reenviar"
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-orange-600 dark:hover:text-yellow-500 dark:hover:text-yellow-400 transition-colors"
        >
          <iconify-icon icon="solar:pen-linear" width="11" />
        </button>
      )}
      {!disabled && (
        <button
          onClick={() => onDelete?.(msg.id)}
          title="Excluir mensagem"
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
        >
          <iconify-icon icon="solar:trash-bin-minimalistic-linear" width="11" />
        </button>
      )}
      {isError && !disabled && (
        <button
          onClick={() => onRetry?.()}
          title="Tentar novamente"
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-emerald-400 transition-colors"
        >
          <iconify-icon icon="solar:refresh-linear" width="11" />
        </button>
      )}
    </div>
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      {!isUser && (
        <div className={`w-6 h-6 border flex items-center justify-center shrink-0 mr-2 mt-0.5 ${
          isError ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/40' : 'bg-orange-100 dark:bg-yellow-400/10 border-orange-300 dark:border-yellow-400/20'
        }`}>
          <iconify-icon
            icon={isError ? 'solar:danger-triangle-linear' : 'solar:stars-linear'}
            width="12"
            class={isError ? 'text-red-400' : 'text-orange-600 dark:text-yellow-400'}
          />
        </div>
      )}
      <div className="flex flex-col max-w-[75%]">
        <div className={`font-mono text-[12px] leading-relaxed overflow-hidden ${
          isUser
            ? 'bg-orange-100 dark:bg-yellow-400/10 border border-orange-300 dark:border-yellow-400/20 text-orange-900 dark:text-yellow-100'
            : isError
            ? 'bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700/40 text-red-700 dark:text-red-300'
            : 'bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
        }`}>
          {msg.imagePreview && (
            <img
              src={msg.imagePreview}
              alt="imagem"
              className="max-w-full max-h-52 object-contain w-full border-b border-zinc-700/50"
            />
          )}
          {(msg.text || (!msg.imagePreview)) && (
            <p className="px-4 py-3 whitespace-pre-wrap">{msg.text}</p>
          )}
        </div>
        {actions}
      </div>
      {isUser && (
        <div className="w-6 h-6 bg-zinc-200 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 flex items-center justify-center shrink-0 ml-2 mt-0.5 font-mono text-[8px] text-orange-600 dark:text-yellow-400 font-bold">
          EU
        </div>
      )}
    </div>
  );
}

function ConfirmBubble({ msg, onConfirm, onCancel, isActive }) {
  const [clicked, setClicked] = useState(false);

  const cls = {
    pending:   'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20',
    confirmed: 'border-emerald-400 dark:border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/15',
    canceled:  'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/40',
  }[msg.status] ?? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/20';

  function fire(fn) {
    if (clicked) return;
    setClicked(true);
    fn();
  }

  return (
    <div className="flex justify-start">
      <div className="w-6 h-6 bg-amber-100 dark:bg-amber-400/10 border border-amber-300 dark:border-amber-400/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <iconify-icon icon="solar:shield-warning-linear" width="12" class="text-amber-400" />
      </div>
      <div className={`max-w-[75%] border font-mono text-[12px] ${cls}`}>
        <div className="px-4 pt-3 pb-2">
          <span className="text-[9px] uppercase tracking-widest text-amber-700 dark:text-amber-400 font-bold">Confirmar operação</span>
          <p className="text-zinc-800 dark:text-zinc-200 mt-1 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
        {msg.status === 'pending' && isActive && (
          <div className="flex border-t border-amber-500/20">
            <button
              onClick={() => fire(onConfirm)}
              disabled={clicked}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white dark:bg-emerald-600/20 dark:hover:bg-emerald-600/35 dark:text-emerald-300 text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clicked ? '…' : 'Confirmar'}
            </button>
            <div className="w-px bg-amber-500/20" />
            <button
              onClick={() => fire(onCancel)}
              disabled={clicked}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white dark:bg-red-600/10 dark:hover:bg-red-600/25 dark:text-red-400 text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        )}
        {msg.status !== 'pending' && (
          <div className={`px-4 py-1.5 text-[10px] font-bold border-t ${
            msg.status === 'confirmed' ? 'border-emerald-300 dark:border-emerald-600/30 text-emerald-700 dark:text-emerald-400' : 'border-zinc-300 dark:border-zinc-700/50 text-zinc-600'
          }`}>
            {msg.status === 'confirmed' ? '✓ Confirmado e executado' : '✗ Cancelado'}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="w-6 h-6 bg-orange-100 dark:bg-yellow-400/10 border border-orange-300 dark:border-yellow-400/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <iconify-icon icon="solar:stars-linear" width="12" class="text-orange-600 dark:text-yellow-400" />
      </div>
      <div className="px-4 py-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminIA() {
  const { profile, empresa } = useAuth();
  const empresaId   = profile?.empresa_id;
  const perfil      = profile?.perfil ?? 'vendedor';
  const nomeUsuario = profile?.nome   ?? 'Usuário';
  const userId      = profile?.id;
  const nomeEmpresa = empresa?.nome   ?? 'Marmoraria';

  // Conversation management
  const [convId,        setConvId]        = useState(() => crypto.randomUUID());
  const [conversations, setConversations] = useState(() => loadConversations());
  const [sidebarOpen,   setSidebarOpen]   = useState(true);

  // Chat state — keep messagesRef in sync for synchronous reads in async handlers
  const messagesRef = useRef([{ id: 0, role: 'assistant', text: 'Carregando...' }]);
  const [messages, _setMessages] = useState(messagesRef.current);
  const setMessages = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(messagesRef.current) : updater;
    messagesRef.current = next;
    _setMessages(next);
  }, []);

  const [input,             setInput]             = useState('');
  const [loading,           setLoading]           = useState(false);
  const [hasPendingConfirm, setHasPendingConfirm] = useState(false);

  // Image upload state
  const [imageBase64, setImageBase64] = useState(null);
  const [imageName,   setImageName]   = useState('');

  const apiHistory           = useRef([]);
  const bottomRef            = useRef(null);
  const confirmResolve       = useRef(null);
  const profileInitRef       = useRef(false);
  const fileInputRef         = useRef(null);
  const convIdRef            = useRef(convId);
  const lastUserTextRef      = useRef('');
  const historyBeforeSendRef = useRef([]);
  useEffect(() => { convIdRef.current = convId; }, [convId]);

  // Init greeting once profile loads
  useEffect(() => {
    if (profile && !profileInitRef.current) {
      profileInitRef.current = true;
      setMessages([{ id: 0, role: 'assistant', text: getInitialMessage() }]);
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const pushDisplay = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setMessages(prev => [...prev, { id, ...msg }]);
    return id;
  }, [setMessages]);

  const saveConv = useCallback((apiHist) => {
    const title = makeTitleFromHistory(apiHist);
    const msgsToSave = messagesRef.current.map(({ imagePreview, ...m }) => m);
    persistConversation({
      id: convIdRef.current, title,
      updatedAt: new Date().toISOString(),
      messages: msgsToSave,
      apiHistory: apiHist,
    });
    setConversations(loadConversations());
  }, []);

  const confirmPending = useCallback((confirmed) => {
    setMessages(prev => prev.map(m =>
      m.role === 'confirm' && m.status === 'pending'
        ? { ...m, status: confirmed ? 'confirmed' : 'canceled' }
        : m
    ));
    setHasPendingConfirm(false);
    confirmResolve.current?.(confirmed);
    confirmResolve.current = null;
  }, [setMessages]);

  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 20 * 1024 * 1024) return; // 20 MB limit
    const reader = new FileReader();
    reader.onload = ev => { setImageBase64(ev.target.result); setImageName(file.name); };
    reader.readAsDataURL(file);
  }, []);

  const handleSend = async () => {
    const text     = input.trim();
    const hasImage = !!imageBase64;
    if ((!text && !hasImage) || loading || !isConfigured || hasPendingConfirm) return;

    const imgData     = imageBase64;
    setInput('');
    setImageBase64(null);
    setImageName('');

    // Guarda estado para retry/edit
    lastUserTextRef.current      = text;
    historyBeforeSendRef.current = [...apiHistory.current];

    pushDisplay({ role: 'user', text: text || '', imagePreview: hasImage ? imgData : undefined });

    setLoading(true);
    const systemText = buildSystemPrompt(perfil, nomeUsuario, nomeEmpresa);

    try {
      const tools = getToolsForPerfil(perfil);

      // Build Gemini-format user parts (supports vision natively)
      const userParts = [];
      if (text) userParts.push({ text });
      if (hasImage) {
        const [header, data] = imgData.split(',');
        const mimeType       = header.match(/:(.*?);/)[1];
        userParts.push({ inlineData: { data, mimeType } });
      }

      // Slice e sanitiza o histórico: o slice pode cortar no meio de um par
      // functionCall/functionResponse, criando órfãos que o Gemini rejeita com 400.
      const trimmedHistory = sanitizeGeminiHistory(apiHistory.current.slice(-MAX_HISTORY_MESSAGES));
      let loopHistory      = [...trimmedHistory, { role: 'user', parts: userParts }];
      let wroteInThisTurn  = false;

      while (true) {
        if (import.meta.env.DEV) {
          console.log(`[IA] callGemini — ${loopHistory.length} turns no histórico:`);
          loopHistory.forEach((m, i) => {
            const p = m.parts?.[0] ?? {};
            const preview = p.text?.slice(0, 60)
              ?? (p.functionCall     ? `⚙ ${p.functionCall.name}(${JSON.stringify(p.functionCall.args ?? {}).slice(0, 40)})` : null)
              ?? (p.functionResponse ? `↩ ${p.functionResponse.name}` : null)
              ?? (p.inlineData       ? '[imagem]' : '?');
            console.log(`  [${i}] ${m.role}: ${preview}`);
          });
        }

        const { text: responseText, functionCalls } = await callGemini({
          systemPrompt: systemText,
          history:      loopHistory,
          tools:        tools.length > 0 ? tools : undefined,
          fluxo:        'chat_vendedor',
          empresaId,
        });

        if (functionCalls?.length > 0) {
          // Append model's function-call turn
          loopHistory.push({
            role:  'model',
            parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })),
          });

          // Execute tools and collect function responses
          const responseParts = [];
          for (const fc of functionCalls) {
            const name = fc.name;
            const args = fc.args ?? {};
            let result;

            if (WRITE_TOOLS.has(name)) {
              if (wroteInThisTurn) {
                result = { cancelado: true, mensagem: 'Operação duplicada ignorada.' };
              } else {
                setLoading(false);
                setHasPendingConfirm(true);
                pushDisplay({ role: 'confirm', status: 'pending', text: humanizeTool(name, args) });

                const confirmed = await new Promise(resolve => { confirmResolve.current = resolve; });
                setLoading(true);

                result = confirmed
                  ? await executeTool(name, args, empresaId, userId, perfil)
                  : { cancelado: true, mensagem: 'Operação cancelada pelo usuário.' };

                wroteInThisTurn = true;
              }
            } else {
              result = await executeTool(name, args, empresaId, userId, perfil);
            }

            responseParts.push({ functionResponse: { name, response: result } });
          }

          // Append all function responses as a single user turn
          loopHistory.push({ role: 'user', parts: responseParts });

        } else {
          const clean = sanitizeModelText(responseText ?? '');
          loopHistory.push({ role: 'model', parts: [{ text: clean }] });

          // Salva apenas turns de texto puro (user plain + model text).
          // Descartar os turns fc/fr intermediários evita que o slice(-N) do próximo
          // turno corte no meio de uma sequência de tool calls, o que faria a
          // sanitizeGeminiHistory descartar tudo e zerar o contexto da conversa.
          // O texto da resposta já resume o que as tools retornaram, então o
          // contexto conversacional é preservado sem precisar repassar dados brutos.
          const plainHistory = loopHistory.filter(m =>
            Array.isArray(m.parts) &&
            m.parts.every(p => !('functionCall' in p) && !('functionResponse' in p))
          );
          apiHistory.current = plainHistory;

          if (clean) pushDisplay({ role: 'assistant', text: clean });
          saveConv(plainHistory);
          break;
        }
      }
    } catch (err) {
      pushDisplay({ role: 'error', text: `Não consegui processar sua mensagem.\n${err.message}` });
    } finally {
      setLoading(false);
      setHasPendingConfirm(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDeleteMessage = useCallback((msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }, [setMessages]);

  const handleEditMessage = useCallback((msgId, text) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    apiHistory.current = historyBeforeSendRef.current;
    setInput(text);
  }, [setMessages]);

  const handleRetryMessage = useCallback(() => {
    setMessages(prev => {
      const lastErrIdx = [...prev].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'error')?.i ?? -1;
      return lastErrIdx >= 0 ? prev.slice(0, lastErrIdx) : prev;
    });
    apiHistory.current = historyBeforeSendRef.current;
    setInput(lastUserTextRef.current);
  }, [setMessages]);

  const startNewConversation = useCallback(() => {
    const newId = crypto.randomUUID();
    setConvId(newId);
    convIdRef.current = newId;
    apiHistory.current = [];
    profileInitRef.current = false;
    setMessages([{ id: Date.now(), role: 'assistant', text: getInitialMessage() }]);
    setInput('');
    setImageBase64(null);
  }, [perfil, nomeUsuario, setMessages]);

  const handleSelectConversation = useCallback((conv) => {
    setConvId(conv.id);
    convIdRef.current = conv.id;
    // Keep only pure text turns (Gemini format) — discard function call/response turns
    // to avoid schema mismatches when replaying with a different tool set.
    const rawHist = conv.apiHistory ?? [];
    apiHistory.current = rawHist.filter(m => {
      if (m.role === 'user') {
        // Gemini user turns with only text parts (not functionResponse)
        return Array.isArray(m.parts) && m.parts.length > 0 && m.parts.every(p => typeof p.text === 'string' && p.text.trim() !== '');
      }
      if (m.role === 'model') {
        // Gemini model turns with only text parts (not functionCall)
        return Array.isArray(m.parts) && m.parts.length > 0 && m.parts.every(p => typeof p.text === 'string');
      }
      return false;
    });
    setMessages(
      conv.messages?.length
        ? conv.messages
        : [{ id: Date.now(), role: 'assistant', text: getInitialMessage() }]
    );
    setInput('');
    setImageBase64(null);
  }, [perfil, nomeUsuario, setMessages]);

  const handleDeleteConversation = useCallback((id) => {
    removeConversation(id);
    setConversations(loadConversations());
    if (id === convIdRef.current) startNewConversation();
  }, [startNewConversation]);

  const apiKeyMissing = !isConfigured;
  const inputDisabled = loading || hasPendingConfirm || apiKeyMissing;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-50 dark:bg-[#050505]">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight uppercase mb-6 px-6 pt-6">
        IA — Assistente
      </h1>
      <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* Sidebar */}
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          currentId={convId}
          onSelect={handleSelectConversation}
          onNew={startNewConversation}
          onDelete={handleDeleteConversation}
        />
      )}

      {/* Chat area */}
      <div className="flex flex-col flex-1 min-w-0 px-6">

        {apiKeyMissing && (
          <div className="mt-4 mb-2 px-4 py-3 border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 flex items-start gap-3 shrink-0">
            <iconify-icon icon="solar:danger-triangle-linear" width="16" class="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="font-mono text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              <span className="font-bold uppercase tracking-widest">Chave não configurada. </span>
              Adicione <code className="bg-zinc-200 dark:bg-zinc-800 px-1">VITE_GEMINI_API_KEY</code> ao <code className="bg-zinc-200 dark:bg-zinc-800 px-1">.env.local</code> e reinicie.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pt-4 pb-3 shrink-0 border-b border-zinc-200/80 dark:border-zinc-800/60 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(p => !p)}
              title={sidebarOpen ? 'Fechar painel' : 'Ver conversas'}
              className="w-7 h-7 flex items-center justify-center text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-300 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors mr-1"
            >
              <iconify-icon icon="solar:sidebar-minimalistic-linear" width="14" />
            </button>
            <div className="w-7 h-7 bg-white/50 dark:bg-transparent backdrop-blur-md rounded-md dark:rounded-none shadow-sm dark:shadow-none border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-center">
              <iconify-icon icon="solar:stars-linear" width="14" class="text-orange-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-900 dark:text-white font-bold leading-tight">
                Gi
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{MODEL}</div>
            </div>
          </div>
          <button
            onClick={startNewConversation}
            className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-400 px-2 py-1 border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors flex items-center gap-1.5"
          >
            <iconify-icon icon="solar:add-square-linear" width="11" />
            Nova
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
          {messages.map(msg =>
            msg.role === 'confirm' ? (
              <ConfirmBubble
                key={msg.id} msg={msg} isActive={hasPendingConfirm}
                onConfirm={() => confirmPending(true)}
                onCancel={() => confirmPending(false)}
              />
            ) : (
              <MessageBubble
                key={msg.id}
                msg={msg}
                disabled={loading || hasPendingConfirm}
                onDelete={handleDeleteMessage}
                onEdit={handleEditMessage}
                onRetry={handleRetryMessage}
              />
            )
          )}
          {loading && <LoadingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-zinc-200/80 dark:border-zinc-800 pt-4 pb-4">
          {hasPendingConfirm && (
            <div className="mb-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/30 font-mono text-[10px] text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              Confirme ou cancele a operação acima para continuar
            </div>
          )}

          {imageBase64 && (
            <div className="mb-2 flex items-center gap-3 px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700">
              <img src={imageBase64} alt="preview" className="w-10 h-10 object-cover shrink-0" />
              <span className="font-mono text-[10px] text-zinc-400 truncate flex-1">{imageName}</span>
              <button
                onClick={() => { setImageBase64(null); setImageName(''); }}
                className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
              >
                <iconify-icon icon="solar:close-circle-linear" width="14" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={inputDisabled || !!imageBase64}
              title="Enviar imagem"
              className="px-3 border border-zinc-200/80 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center"
            >
              <iconify-icon icon="solar:camera-add-linear" width="16" />
            </button>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputDisabled}
              placeholder={
                apiKeyMissing       ? 'Configure VITE_GEMINI_API_KEY para usar o assistente'
                : hasPendingConfirm ? 'Confirme ou cancele a operação acima...'
                : imageBase64       ? 'Descreva a imagem ou faça uma pergunta... (Enter para enviar)'
                : 'Digite sua mensagem... (Enter para enviar)'
              }
              rows={3}
              className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-[12px] font-mono px-3 py-2 rounded-md dark:rounded-none outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(249,115,22,0.12)] dark:focus:shadow-[0_0_8px_rgba(250,204,21,0.10)] placeholder:text-zinc-400 dark:placeholder:text-zinc-700 resize-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            />

            <button
              onClick={handleSend}
              disabled={(!input.trim() && !imageBase64) || inputDisabled}
              className="px-4 bg-orange-500 dark:bg-yellow-400 text-white dark:text-black rounded-xl dark:rounded-none font-mono text-[11px] uppercase tracking-widest font-bold hover:bg-orange-600 dark:hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
            >
              {loading
                ? <iconify-icon icon="solar:refresh-linear" width="14" class="animate-spin" />
                : <iconify-icon icon="solar:arrow-up-linear" width="14" />
              }
              {loading ? 'Aguarde' : 'Enviar'}
            </button>
          </div>

          <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-zinc-700">
            Shift+Enter para nova linha · Imagens suportadas
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
