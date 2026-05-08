import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

// ── Constants ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY  = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MODEL           = 'gemini-2.0-flash';
const STORAGE_KEY     = 'smartstone_ia_history';
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
      name: 'buscar_projetos',
      description: 'Busca projetos da empresa. Filtra por status e/ou nome do cliente.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['orcado','aprovado','produzindo','entregue','perdido'], description: 'Filtrar por status.' },
          cliente_nome: { type: 'string', description: 'Filtrar por nome parcial do cliente.' },
          limite: { type: 'number', description: 'Máximo de projetos (padrão 20, máx 50).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_clientes',
      description: 'Lista clientes da empresa.',
      parameters: {
        type: 'object',
        properties: {
          nome:  { type: 'string', description: 'Filtrar por nome (parcial).' },
          email: { type: 'string', description: 'Filtrar por e-mail (parcial).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_orcamento',
      description: 'Retorna orçamentos de um projeto com ambientes e valores.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string', description: 'UUID do projeto.' },
        },
        required: ['projeto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_materiais',
      description: 'Lista materiais de área e lineares da empresa.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Filtrar por nome (parcial).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_financeiro',
      description: 'Resumo do mês: fechamentos, contas, lançamentos e categorias. Retorna categoria_id e conta_id necessários para lançamentos. Apenas admin.',
      parameters: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'Período YYYY-MM. Padrão: mês atual.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_medicoes',
      description: 'Busca medições de um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string', description: 'UUID do projeto.' },
        },
        required: ['projeto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_usuarios',
      description: 'Lista usuários. Admin vê todos; vendedor vê apenas medidores (necessário para agendar_medicao).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_cliente',
      description: 'Cadastra novo cliente. Exige nome, telefone e endereço completo. Se faltar algum dado, pergunte antes de chamar.',
      parameters: {
        type: 'object',
        properties: {
          nome:     { type: 'string', description: 'Nome completo do cliente.' },
          telefone: { type: 'string', description: 'Telefone com DDD. Ex: (11) 99999-9999.' },
          email:    { type: 'string', description: 'E-mail (opcional).' },
          endereco: { type: 'string', description: 'Endereço completo: Rua, Número, Bairro, Cidade - UF.' },
        },
        required: ['nome', 'telefone', 'endereco'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_projeto',
      description: 'Cria um novo projeto. Use buscar_clientes para obter cliente_id antes.',
      parameters: {
        type: 'object',
        properties: {
          nome:       { type: 'string', description: 'Nome do projeto.' },
          cliente_id: { type: 'string', description: 'UUID do cliente.' },
        },
        required: ['nome', 'cliente_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_status_projeto',
      description: 'Atualiza o status de um projeto.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string', description: 'UUID do projeto.' },
          status: { type: 'string', enum: ['orcado','aprovado','produzindo','entregue','perdido'], description: 'Novo status.' },
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
          projeto_id:  { type: 'string', description: 'UUID do projeto.' },
          valor_total: { type: 'number', description: 'Valor estimado (opcional).' },
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
          tipo:            { type: 'string', enum: ['entrada','saida'], description: 'Tipo.' },
          valor:           { type: 'number', description: 'Valor previsto em reais.' },
          descricao:       { type: 'string', description: 'Descrição.' },
          data_vencimento: { type: 'string', description: 'Vencimento YYYY-MM-DD.' },
          categoria_id:    { type: 'string', description: 'UUID da categoria.' },
          conta_id:        { type: 'string', description: 'UUID da conta bancária (opcional).' },
        },
        required: ['tipo', 'valor', 'descricao', 'data_vencimento', 'categoria_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_arquitetos',
      description: 'Lista arquitetos parceiros da empresa. Use para consultar quem pode receber RT.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Filtrar por nome (parcial).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_parceiros',
      description: 'Lista fornecedores e funcionários (parceiros) da empresa. Apenas admin. Use para obter parceiro_id antes de lançamentos.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Filtrar por nome (parcial).' },
          tipo: { type: 'string', enum: ['fornecedor','funcionario','terceiro'], description: 'Filtrar por tipo.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_fechamentos',
      description: 'Lista fechamentos de projetos com valor pago e data.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id: { type: 'string', description: 'UUID do projeto (opcional).' },
          limite:     { type: 'number', description: 'Máximo de resultados (padrão 20).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_notificacoes',
      description: 'Lista notificações do usuário atual.',
      parameters: {
        type: 'object',
        properties: {
          apenas_nao_lidas: { type: 'boolean', description: 'Se true, retorna apenas não lidas.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_lancamentos_periodo',
      description: 'Lista lançamentos com filtros de tipo, status e data. Apenas admin. Retorna IDs para baixa/cancelamento.',
      parameters: {
        type: 'object',
        properties: {
          tipo:        { type: 'string', enum: ['entrada','saida'], description: 'Filtrar por tipo.' },
          status:      { type: 'string', enum: ['pendente','pago','parcial','atrasado','cancelado'], description: 'Filtrar por status.' },
          data_inicio: { type: 'string', description: 'Data inicial YYYY-MM-DD.' },
          data_fim:    { type: 'string', description: 'Data final YYYY-MM-DD.' },
          limite:      { type: 'number', description: 'Máximo de resultados (padrão 30, máx 100).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_cliente',
      description: 'Atualiza telefone, email ou endereço de um cliente. Use buscar_clientes antes para obter cliente_id.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { type: 'string', description: 'UUID do cliente.' },
          telefone:   { type: 'string', description: 'Novo telefone.' },
          email:      { type: 'string', description: 'Novo e-mail.' },
          endereco:   { type: 'string', description: 'Novo endereço completo.' },
        },
        required: ['cliente_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_medicao',
      description: 'Agenda uma medição para um projeto. Use buscar_usuarios para obter medidor_id.',
      parameters: {
        type: 'object',
        properties: {
          projeto_id:   { type: 'string', description: 'UUID do projeto.' },
          medidor_id:   { type: 'string', description: 'UUID do usuário medidor.' },
          data_medicao: { type: 'string', description: 'Data/hora ISO 8601. Ex: 2026-05-10T09:00:00.' },
          endereco:     { type: 'string', description: 'Endereço do local (opcional).' },
          observacoes:  { type: 'string', description: 'Observações de acesso (opcional).' },
        },
        required: ['projeto_id', 'medidor_id', 'data_medicao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marcar_lancamento_pago',
      description: 'Baixa total ou parcial de um lançamento. Apenas admin. Use buscar_lancamentos_periodo para o ID.',
      parameters: {
        type: 'object',
        properties: {
          lancamento_id:   { type: 'string', description: 'UUID do lançamento.' },
          valor_pago:      { type: 'number', description: 'Valor pago nesta baixa.' },
          data_pagamento:  { type: 'string', description: 'Data do pagamento YYYY-MM-DD.' },
          forma_pagamento: { type: 'string', enum: ['pix','boleto','cartao_credito','cartao_debito','dinheiro','cheque','transferencia','outro'], description: 'Forma de pagamento.' },
          conta_id:        { type: 'string', description: 'UUID da conta bancária (opcional).' },
        },
        required: ['lancamento_id', 'valor_pago', 'data_pagamento', 'forma_pagamento'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_lancamento',
      description: 'Cancela (soft-delete) um lançamento financeiro. Apenas admin. O registro permanece com status "cancelado".',
      parameters: {
        type: 'object',
        properties: {
          lancamento_id: { type: 'string', description: 'UUID do lançamento.' },
          motivo:        { type: 'string', description: 'Motivo do cancelamento (opcional).' },
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
          nome:      { type: 'string', description: 'Nome do parceiro.' },
          tipos:     { type: 'array', items: { type: 'string', enum: ['fornecedor','funcionario','terceiro'] }, description: 'Tipos do parceiro (ao menos um).' },
          telefone:  { type: 'string', description: 'Telefone (opcional).' },
          email:     { type: 'string', description: 'E-mail (opcional).' },
          documento: { type: 'string', description: 'CPF ou CNPJ (opcional).' },
        },
        required: ['nome', 'tipos'],
      },
    },
  },
];

// ── Gemini tool conversion ────────────────────────────────────────────────────

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  if (schema.type)        out.type        = schema.type.toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum)        out.enum        = schema.enum;
  if (schema.required)    out.required    = schema.required;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = toGeminiSchema(v);
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

function toGeminiTools(tools) {
  return [{
    function_declarations: tools.map(t => ({
      name:        t.function.name,
      description: t.function.description,
      parameters:  toGeminiSchema(t.function.parameters),
    })),
  }];
}

function getToolsForPerfil(perfil) {
  if (perfil === 'medidor') {
    return ALL_TOOLS.filter(t => ['buscar_projetos', 'buscar_medicoes', 'buscar_notificacoes'].includes(t.function.name));
  }
  if (perfil === 'vendedor') {
    const adminOnly = new Set([
      'buscar_financeiro', 'adicionar_lancamento_financeiro',
      'buscar_parceiros', 'buscar_lancamentos_periodo',
      'marcar_lancamento_pago', 'cancelar_lancamento', 'cadastrar_parceiro',
    ]); // buscar_usuarios está disponível ao vendedor mas retorna apenas medidores
    return ALL_TOOLS.filter(t => !adminOnly.has(t.function.name));
  }
  return ALL_TOOLS;
}

// ── Supabase executors ────────────────────────────────────────────────────────

async function executeTool(name, args, empresaId, userId, perfil) {
  try {
    switch (name) {

      case 'buscar_projetos': {
        const limite = Math.min(args.limite ?? 20, 50);
        let clienteIds = null;
        if (args.cliente_nome) {
          const { data: clts } = await supabase.from('clientes').select('id')
            .eq('empresa_id', empresaId).ilike('nome', `%${args.cliente_nome}%`);
          clienteIds = (clts ?? []).map(c => c.id);
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
        return {
          total: data.length,
          projetos: data.map(p => ({
            id: p.id, nome: p.nome,
            status: p.status, status_pt: STATUS_PT[p.status] ?? p.status,
            cliente: p.clientes?.nome ?? '—',
            criado_em: p.created_at?.split('T')[0],
          })),
        };
      }

      case 'buscar_clientes': {
        let q = supabase.from('clientes').select('id, nome, telefone, email')
          .eq('empresa_id', empresaId).order('nome').limit(50);
        if (args.nome)  q = q.ilike('nome',  `%${args.nome}%`);
        if (args.email) q = q.ilike('email', `%${args.email}%`);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, clientes: data };
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
        let q = supabase.from('materiais').select('id, nome, categoria')
          .eq('empresa_id', empresaId).order('nome').limit(50);
        if (args.nome) q = q.ilike('nome', `%${args.nome}%`);
        const [{ data: area, error: errA }, { data: lin }] = await Promise.all([
          q,
          supabase.from('materiais_lineares').select('id, nome, unidade')
            .eq('empresa_id', empresaId).order('nome').limit(30),
        ]);
        if (errA) return { erro: errA.message };
        return {
          materiais_area:     { total: area.length,      lista: area },
          materiais_lineares: { total: lin?.length ?? 0, lista: lin ?? [] },
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
        // Vendedor só vê medidores (necessário para agendar_medicao).
        // Admin vê todos os usuários.
        if (perfil !== 'admin' && perfil !== 'superadmin') {
          const { data, error } = await supabase.from('usuarios')
            .select('id, nome, perfil')
            .eq('empresa_id', empresaId).eq('perfil', 'medidor').eq('ativo', true).order('nome');
          if (error) return { erro: error.message };
          return { total: data.length, usuarios: data, aviso: 'Vendedor visualiza apenas medidores.' };
        }
        const { data, error } = await supabase.from('usuarios')
          .select('id, nome, email, perfil, ativo').eq('empresa_id', empresaId).order('nome');
        if (error) return { erro: error.message };
        return { total: data.length, usuarios: data };
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
        // Busca o nome do medidor para preencher `responsavel` (NOT NULL no banco)
        const { data: medidor } = await supabase.from('usuarios')
          .select('nome').eq('id', args.medidor_id).single();
        const { data, error } = await supabase.from('medicoes')
          .insert({
            empresa_id:         empresaId,
            projeto_id:         args.projeto_id,
            medidor_id:         args.medidor_id,
            responsavel:        medidor?.nome ?? '',
            data_medicao:       args.data_medicao,
            endereco:           args.endereco?.trim()    || null,
            observacoes_acesso: args.observacoes?.trim() || null,
            status:             'agendada',
          })
          .select('id, projeto_id, data_medicao, status, responsavel').single();
        if (error) return { erro: error.message };
        return { sucesso: true, medicao_criada: data };
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

      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { erro: err.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    default:
      return name;
  }
}

function buildSystemPrompt(perfil, nome, nomeEmpresa) {
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const perfilLabel = { admin: 'Administrador', vendedor: 'Vendedor', medidor: 'Medidor', superadmin: 'Superadmin' }[perfil] ?? perfil;
  const restricoes = perfil === 'medidor'
    ? 'Este usuário é Medidor — ajude com projetos, medições e notificações.'
    : perfil === 'vendedor'
    ? 'Este usuário é Vendedor — acesso a projetos, clientes (consultar e atualizar), orçamentos, materiais, arquitetos, fechamentos, agendamento de medições e notificações. SEM acesso a financeiro, parceiros ou usuários.'
    : 'Este usuário é Administrador — acesso completo: projetos, clientes, orçamentos, materiais, arquitetos, parceiros, financeiro (lançamentos, contas, plano de contas, baixa, cancelamento), usuários e notificações.';
  return [
    `Você é o assistente do sistema SmartStone da empresa "${nomeEmpresa}". Hoje é ${hoje}.`,
    `Usuário: ${nome} (${perfilLabel}). ${restricoes}`,
    '',
    'Regras:',
    '- Responda sempre em português, de forma objetiva e direta.',
    '- Seja proativo: ao falar de um projeto, busque também orçamentos e medições associados.',
    '- Para cadastrar_cliente: OBRIGATÓRIO coletar nome, telefone E endereço completo (rua, número, bairro, cidade, estado) ANTES de chamar a ferramenta. Se faltar algum dado, pergunte ao usuário primeiro.',
    '- Para atualizar_cliente: use buscar_clientes primeiro para obter o cliente_id.',
    '- Para agendar_medicao: chame buscar_usuarios PRIMEIRO para obter o medidor_id (vendedor vê apenas medidores).',
    '- Para lançamentos financeiros: chame buscar_financeiro antes para obter categoria_id. Para baixa, use buscar_lancamentos_periodo para obter o lancamento_id.',
    '- Para cadastrar_parceiro: informe nome e ao menos um tipo (fornecedor, funcionario, terceiro).',
    '- O sistema pede confirmação automática para operações de escrita — chame a ferramenta normalmente.',
    '- Formate valores como "R$ X.XXX,XX".',
  ].join('\n');
}

function getInitialMessage(perfil, nome) {
  const primeiro = (nome ?? 'Usuário').split(' ')[0];
  if (perfil === 'medidor')  return `Olá, ${primeiro}! Posso consultar projetos, medições e suas notificações. Como posso ajudar?`;
  if (perfil === 'vendedor') return `Olá, ${primeiro}! Posso consultar e criar projetos, clientes, orçamentos, agendar medições, buscar arquitetos e fechamentos. Como posso ajudar?`;
  return `Olá, ${primeiro}! Acesso completo: projetos, clientes, orçamentos, materiais, arquitetos, parceiros, financeiro (lançamentos, baixa, cancelamento, contas) e usuários. Como posso ajudar?`;
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
  const raw = first?.parts?.find(p => p.text)?.text ?? '';
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
    <div className="flex flex-col w-52 shrink-0 border-r border-zinc-800 bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800 shrink-0">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Conversas</span>
        <button
          onClick={onNew}
          title="Nova conversa"
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-yellow-400 transition-colors"
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
                ? 'bg-zinc-900 border-yellow-400'
                : 'border-transparent hover:bg-zinc-900/50 hover:border-zinc-700'
            }`}
          >
            <div className="flex-1 min-w-0 pt-px">
              <p className={`font-mono text-[11px] leading-snug truncate ${
                conv.id === currentId ? 'text-yellow-400' : 'text-zinc-300'
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

function MessageBubble({ msg }) {
  const isUser  = msg.role === 'user';
  const isError = msg.role === 'error';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className={`w-6 h-6 border flex items-center justify-center shrink-0 mr-2 mt-0.5 ${
          isError ? 'bg-red-900/30 border-red-700/40' : 'bg-yellow-400/10 border-yellow-400/20'
        }`}>
          <iconify-icon
            icon={isError ? 'solar:danger-triangle-linear' : 'solar:stars-linear'}
            width="12"
            class={isError ? 'text-red-400' : 'text-yellow-400'}
          />
        </div>
      )}
      <div className={`max-w-[75%] font-mono text-[12px] leading-relaxed overflow-hidden ${
        isUser
          ? 'bg-yellow-400/10 border border-yellow-400/20 text-yellow-100'
          : isError
          ? 'bg-red-900/20 border border-red-700/40 text-red-300'
          : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
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
      {isUser && (
        <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 ml-2 mt-0.5 font-mono text-[8px] text-yellow-400 font-bold">
          EU
        </div>
      )}
    </div>
  );
}

function ConfirmBubble({ msg, onConfirm, onCancel, isActive }) {
  const [clicked, setClicked] = useState(false);

  const cls = {
    pending:   'border-amber-500/40 bg-amber-950/20',
    confirmed: 'border-emerald-600/40 bg-emerald-950/15',
    canceled:  'border-zinc-700 bg-zinc-900/40',
  }[msg.status] ?? 'border-amber-500/40 bg-amber-950/20';

  function fire(fn) {
    if (clicked) return;
    setClicked(true);
    fn();
  }

  return (
    <div className="flex justify-start">
      <div className="w-6 h-6 bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <iconify-icon icon="solar:shield-warning-linear" width="12" class="text-amber-400" />
      </div>
      <div className={`max-w-[75%] border font-mono text-[12px] ${cls}`}>
        <div className="px-4 pt-3 pb-2">
          <span className="text-[9px] uppercase tracking-widest text-amber-400 font-bold">Confirmar operação</span>
          <p className="text-zinc-200 mt-1 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
        {msg.status === 'pending' && isActive && (
          <div className="flex border-t border-amber-500/20">
            <button
              onClick={() => fire(onConfirm)}
              disabled={clicked}
              className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clicked ? '…' : 'Confirmar'}
            </button>
            <div className="w-px bg-amber-500/20" />
            <button
              onClick={() => fire(onCancel)}
              disabled={clicked}
              className="flex-1 py-2 bg-red-600/10 hover:bg-red-600/25 text-red-400 text-[10px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        )}
        {msg.status !== 'pending' && (
          <div className={`px-4 py-1.5 text-[10px] font-bold border-t ${
            msg.status === 'confirmed' ? 'border-emerald-600/30 text-emerald-400' : 'border-zinc-700/50 text-zinc-600'
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
      <div className="w-6 h-6 bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <iconify-icon icon="solar:stars-linear" width="12" class="text-yellow-400" />
      </div>
      <div className="px-4 py-3 bg-zinc-900 border border-zinc-800 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:300ms]" />
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

  const apiHistory     = useRef([]);
  const bottomRef      = useRef(null);
  const confirmResolve = useRef(null);
  const profileInitRef = useRef(false);
  const fileInputRef   = useRef(null);
  const convIdRef      = useRef(convId);
  useEffect(() => { convIdRef.current = convId; }, [convId]);

  // Init greeting once profile loads
  useEffect(() => {
    if (profile && !profileInitRef.current) {
      profileInitRef.current = true;
      setMessages([{ id: 0, role: 'assistant', text: getInitialMessage(perfil, nomeUsuario) }]);
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
    if ((!text && !hasImage) || loading || !GEMINI_API_KEY || hasPendingConfirm) return;

    const imgData      = imageBase64;
    const imgNameSnap  = imageName;
    setInput('');
    setImageBase64(null);
    setImageName('');

    pushDisplay({ role: 'user', text: text || '', imagePreview: imgData || undefined });

    setLoading(true);
    const systemText = buildSystemPrompt(perfil, nomeUsuario, nomeEmpresa);

    try {
      if (hasImage) {
        // ── Vision turn (no tools) ──────────────────────────────────────────
        const [meta, b64] = imgData.split(',');
        const mimeType    = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg';

        const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents: [
              ...apiHistory.current,
              {
                role:  'user',
                parts: [
                  { text: text || 'Analise esta imagem.' },
                  { inlineData: { mimeType, data: b64 } },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `Erro HTTP ${res.status}`);
        }

        const data         = await res.json();
        const modelContent = data.candidates?.[0]?.content;
        if (!modelContent) throw new Error('Resposta inválida do modelo de visão.');

        const replyText = modelContent.parts?.find(p => p.text)?.text ?? '(sem resposta)';

        // Store text-only in history (Gemini format); avoids re-sending image bytes
        const textMsg = {
          role:  'user',
          parts: [{ text: (text ? `${text}\n` : '') + `[Imagem enviada: ${imgNameSnap}]` }],
        };
        const newHist = [
          ...apiHistory.current,
          textMsg,
          { role: 'model', parts: [{ text: replyText }] },
        ];
        apiHistory.current = newHist;

        pushDisplay({ role: 'assistant', text: replyText });
        saveConv(newHist);

      } else {
        // ── Text turn with tools ─────────────────────────────────────────────
        const tools           = getToolsForPerfil(perfil);
        let   loopHistory     = [...apiHistory.current, { role: 'user', parts: [{ text }] }];
        let   wroteInLastTurn = false; // após write: força texto na próxima iteração
        let   wroteInThisTurn = false; // impede que qualquer write seja executada >1x por mensagem

        while (true) {
          // Após uma write tool: omite tools da request → modelo só pode gerar texto
          const sendTools = !wroteInLastTurn && tools.length > 0;

          const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemText }] },
              contents: loopHistory,
              ...(sendTools ? {
                tools:       toGeminiTools(tools),
                tool_config: { function_calling_config: { mode: 'AUTO' } },
              } : {}),
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message ?? `Erro HTTP ${res.status}`);
          }

          const data         = await res.json();
          const modelContent = data.candidates?.[0]?.content;
          if (!modelContent) throw new Error('Resposta inválida da API.');

          loopHistory.push(modelContent);

          // Gemini signals function calls via parts containing `functionCall` objects
          const funcCalls = modelContent.parts?.filter(p => p.functionCall) ?? [];

          if (funcCalls.length > 0) {
            const funcResponses = [];
            let   executedWrite = false;

            for (const part of funcCalls) {
              const { name, args } = part.functionCall; // args already a parsed object

              let result;
              if (WRITE_TOOLS.has(name)) {
                if (wroteInThisTurn) {
                  // Duplicate write tool in same batch — silently cancel
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

                  executedWrite   = true;
                  wroteInThisTurn = true;
                }
              } else {
                result = await executeTool(name, args, empresaId, userId, perfil);
              }

              funcResponses.push({ functionResponse: { name, response: result } });
            }

            // Function responses go as a user-role message in Gemini protocol
            loopHistory.push({ role: 'user', parts: funcResponses });
            wroteInLastTurn = executedWrite;
          } else {
            const textParts = modelContent.parts?.filter(p => p.text) ?? [];
            const clean     = textParts.map(p => p.text).join('').trim();

            apiHistory.current = loopHistory;
            if (clean) pushDisplay({ role: 'assistant', text: clean });
            saveConv(loopHistory);
            break;
          }
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

  const startNewConversation = useCallback(() => {
    const newId = crypto.randomUUID();
    setConvId(newId);
    convIdRef.current = newId;
    apiHistory.current = [];
    profileInitRef.current = false;
    setMessages([{ id: Date.now(), role: 'assistant', text: getInitialMessage(perfil, nomeUsuario) }]);
    setInput('');
    setImageBase64(null);
  }, [perfil, nomeUsuario, setMessages]);

  const handleSelectConversation = useCallback((conv) => {
    setConvId(conv.id);
    convIdRef.current = conv.id;
    // Strip function-call/response turns from saved history — keep only text-bearing
    // messages so replaying never hits schema mismatches with a different tool set.
    const rawHist = conv.apiHistory ?? [];
    apiHistory.current = rawHist.filter(m => {
      if (m.role === 'user')  return m.parts?.some(p => p.text);
      if (m.role === 'model') return m.parts?.some(p => p.text);
      return false;
    });
    setMessages(
      conv.messages?.length
        ? conv.messages
        : [{ id: Date.now(), role: 'assistant', text: getInitialMessage(perfil, nomeUsuario) }]
    );
    setInput('');
    setImageBase64(null);
  }, [perfil, nomeUsuario, setMessages]);

  const handleDeleteConversation = useCallback((id) => {
    removeConversation(id);
    setConversations(loadConversations());
    if (id === convIdRef.current) startNewConversation();
  }, [startNewConversation]);

  const apiKeyMissing = !GEMINI_API_KEY;
  const inputDisabled = loading || hasPendingConfirm || apiKeyMissing;

  return (
    <div className="flex h-full overflow-hidden">

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
          <div className="mt-4 mb-2 px-4 py-3 border border-amber-500/40 bg-amber-500/10 flex items-start gap-3 shrink-0">
            <iconify-icon icon="solar:danger-triangle-linear" width="16" class="text-amber-400 mt-0.5 shrink-0" />
            <p className="font-mono text-[11px] text-amber-300 leading-relaxed">
              <span className="font-bold uppercase tracking-widest">Chave não configurada. </span>
              Adicione <code className="bg-zinc-800 px-1">VITE_GEMINI_API_KEY</code> ao <code className="bg-zinc-800 px-1">.env.local</code> e reinicie.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pt-4 pb-3 shrink-0 border-b border-zinc-800/60 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(p => !p)}
              title={sidebarOpen ? 'Fechar painel' : 'Ver conversas'}
              className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 transition-colors mr-1"
            >
              <iconify-icon icon="solar:sidebar-minimalistic-linear" width="14" />
            </button>
            <div className="w-7 h-7 bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
              <iconify-icon icon="solar:stars-linear" width="14" class="text-yellow-400" />
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-white font-bold leading-tight">
                Assistente IA
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{MODEL}</div>
            </div>
          </div>
          <button
            onClick={startNewConversation}
            className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 px-2 py-1 border border-zinc-800 hover:border-zinc-600 transition-colors flex items-center gap-1.5"
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
              <MessageBubble key={msg.id} msg={msg} />
            )
          )}
          {loading && <LoadingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-zinc-800 pt-4 pb-4">
          {hasPendingConfirm && (
            <div className="mb-2 px-3 py-1.5 bg-amber-950/30 border border-amber-500/30 font-mono text-[10px] text-amber-400 uppercase tracking-widest">
              Confirme ou cancele a operação acima para continuar
            </div>
          )}

          {imageBase64 && (
            <div className="mb-2 flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-700">
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
              className="px-3 border border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center"
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
              className="flex-1 bg-zinc-950 border border-zinc-800 text-white text-[12px] font-mono px-3 py-2 outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.10)] placeholder:text-zinc-700 resize-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            />

            <button
              onClick={handleSend}
              disabled={(!input.trim() && !imageBase64) || inputDisabled}
              className="px-4 bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest font-bold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
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
  );
}
