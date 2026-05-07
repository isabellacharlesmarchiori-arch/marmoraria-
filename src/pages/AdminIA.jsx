import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_projetos',
      description: 'Busca projetos da empresa. Retorna nome, status e data.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['orcado', 'aprovado', 'produzindo', 'entregue', 'perdido'],
            description: 'Filtrar por status. Omitir para todos.',
          },
        },
        required: [],
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
          nome: {
            type: 'string',
            description: 'Filtrar por nome (busca parcial).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrar_cliente',
      description: 'Cadastra um novo cliente na empresa.',
      parameters: {
        type: 'object',
        properties: {
          nome:     { type: 'string', description: 'Nome completo do cliente.' },
          telefone: { type: 'string', description: 'Telefone do cliente.' },
          email:    { type: 'string', description: 'E-mail do cliente.' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_materiais',
      description: 'Lista materiais de área cadastrados na empresa.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_financeiro',
      description: 'Retorna resumo financeiro do mês atual: total de projetos, orçamentos emitidos e fechamentos realizados.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// ── Supabase tool executors ─────────────────────────────────────────────────

async function executeTool(name, args, empresaId) {
  try {
    switch (name) {
      case 'buscar_projetos': {
        let q = supabase
          .from('projetos')
          .select('id, nome, status, created_at')
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (args.status) q = q.eq('status', args.status);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, projetos: data };
      }

      case 'buscar_clientes': {
        let q = supabase
          .from('clientes')
          .select('id, nome, telefone, email')
          .eq('empresa_id', empresaId)
          .order('nome')
          .limit(50);
        if (args.nome) q = q.ilike('nome', `%${args.nome}%`);
        const { data, error } = await q;
        if (error) return { erro: error.message };
        return { total: data.length, clientes: data };
      }

      case 'cadastrar_cliente': {
        const { data, error } = await supabase
          .from('clientes')
          .insert({
            empresa_id: empresaId,
            nome:     args.nome,
            telefone: args.telefone ?? null,
            email:    args.email    ?? null,
          })
          .select('id, nome')
          .single();
        if (error) return { erro: error.message };
        return { sucesso: true, cliente_criado: data };
      }

      case 'buscar_materiais': {
        const { data, error } = await supabase
          .from('materiais')
          .select('id, nome, categoria')
          .eq('empresa_id', empresaId)
          .order('nome')
          .limit(50);
        if (error) return { erro: error.message };
        return { total: data.length, materiais: data };
      }

      case 'buscar_financeiro': {
        const now   = new Date();
        const ini   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const fim   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const fimTs = fim + 'T23:59:59';

        const [rProj, rOrc, rFech] = await Promise.all([
          supabase.from('projetos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId),
          supabase.from('orcamentos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
            .gte('created_at', ini)
            .lte('created_at', fimTs),
          supabase.from('fechamentos')
            .select('id, valor_fechado')
            .eq('empresa_id', empresaId)
            .gte('created_at', ini)
            .lte('created_at', fimTs),
        ]);

        const valorFechado = (rFech.data ?? []).reduce((s, f) => s + (Number(f.valor_fechado) || 0), 0);

        return {
          periodo:          `${ini} a ${fim}`,
          total_projetos:   rProj.count   ?? 0,
          orcamentos_mes:   rOrc.count    ?? 0,
          fechamentos_mes:  (rFech.data ?? []).length,
          valor_fechado_mes: valorFechado,
        };
      }

      default:
        return { erro: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { erro: err.message };
  }
}

// ── UI sub-components ───────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser  = msg.role === 'user';
  const isError = msg.role === 'error';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className={`w-6 h-6 border flex items-center justify-center shrink-0 mr-2 mt-0.5 ${
          isError
            ? 'bg-red-900/30 border-red-700/40'
            : 'bg-yellow-400/10 border-yellow-400/20'
        }`}>
          <iconify-icon
            icon={isError ? 'solar:danger-triangle-linear' : 'solar:stars-linear'}
            width="12"
            class={isError ? 'text-red-400' : 'text-yellow-400'}
          />
        </div>
      )}

      <div className={`max-w-[75%] px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-yellow-400/10 border border-yellow-400/20 text-yellow-100'
          : isError
          ? 'bg-red-900/20 border border-red-700/40 text-red-300'
          : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
      }`}>
        {msg.text}
      </div>

      {isUser && (
        <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 ml-2 mt-0.5 font-mono text-[8px] text-yellow-400 font-bold">
          EU
        </div>
      )}
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

// ── Main component ──────────────────────────────────────────────────────────

const INITIAL_MESSAGE = {
  id: 0,
  role: 'assistant',
  text: 'Olá! Posso consultar projetos, clientes, materiais e financeiro — ou cadastrar um novo cliente. Como posso ajudar?',
};

export default function AdminIA() {
  const { profile, empresa } = useAuth();
  const empresaId  = profile?.empresa_id;
  const nomeEmpresa = empresa?.nome ?? 'Marmoraria';

  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const apiHistory = useRef([]);
  const bottomRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const pushDisplay = (msg) =>
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || !GROQ_API_KEY) return;

    setInput('');
    pushDisplay({ role: 'user', text });

    const userApiMsg = { role: 'user', content: text };
    let loopHistory  = [...apiHistory.current, userApiMsg];

    setLoading(true);
    try {
      const system = {
        role: 'system',
        content: `Você é um assistente da marmoraria ${nomeEmpresa} no sistema SmartStone. Você tem acesso aos dados da empresa e pode cadastrar clientes e consultar projetos, materiais e financeiro. Responda sempre em português de forma objetiva e direta.`,
      };

      // Tool-call loop: keep calling until finish_reason !== 'tool_calls'
      while (true) {
        const res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model:       MODEL,
            messages:    [system, ...loopHistory],
            tools:       TOOLS,
            tool_choice: 'auto',
            max_tokens:  1024,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `Erro HTTP ${res.status}`);
        }

        const data     = await res.json();
        const choice   = data.choices?.[0];
        const asstMsg  = choice?.message;
        if (!asstMsg) throw new Error('Resposta inválida da API.');

        loopHistory.push(asstMsg);

        if (choice.finish_reason === 'tool_calls' && asstMsg.tool_calls?.length) {
          const toolResults = await Promise.all(
            asstMsg.tool_calls.map(async (tc) => {
              let args = {};
              try { args = JSON.parse(tc.function.arguments ?? '{}'); } catch {}
              const result = await executeTool(tc.function.name, args, empresaId);
              return {
                role:         'tool',
                tool_call_id: tc.id,
                content:      JSON.stringify(result),
              };
            })
          );
          loopHistory.push(...toolResults);
          // continue loop to get final response
        } else {
          // Final text answer
          apiHistory.current = loopHistory;
          pushDisplay({ role: 'assistant', text: asstMsg.content ?? '(sem resposta)' });
          break;
        }
      }
    } catch (err) {
      pushDisplay({ role: 'error', text: `Não consegui processar sua mensagem. ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const apiKeyMissing = !GROQ_API_KEY;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">

      {/* API key warning */}
      {apiKeyMissing && (
        <div className="mb-4 px-4 py-3 border border-amber-500/40 bg-amber-500/10 flex items-start gap-3 shrink-0">
          <iconify-icon icon="solar:danger-triangle-linear" width="16" class="text-amber-400 mt-0.5 shrink-0" />
          <p className="font-mono text-[11px] text-amber-300 leading-relaxed">
            <span className="font-bold uppercase tracking-widest">Chave de API não configurada. </span>
            Adicione <code className="bg-zinc-800 px-1">VITE_GROQ_API_KEY</code> ao arquivo{' '}
            <code className="bg-zinc-800 px-1">.env</code> e reinicie o servidor para ativar o assistente.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="w-8 h-8 bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
          <iconify-icon icon="solar:stars-linear" width="16" class="text-yellow-400" />
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-white font-bold">
            Assistente IA
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{MODEL}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && <LoadingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 pt-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || apiKeyMissing}
            placeholder={
              apiKeyMissing
                ? 'Configure VITE_GROQ_API_KEY para usar o assistente'
                : 'Digite sua mensagem... (Enter para enviar)'
            }
            rows={3}
            className="flex-1 bg-zinc-950 border border-zinc-800 text-white text-[12px] font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.10)] placeholder:text-zinc-700 resize-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || apiKeyMissing}
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
          Shift+Enter para nova linha
        </div>
      </div>
    </div>
  );
}
