import { useState, useRef, useEffect } from 'react';

const PLACEHOLDER_MESSAGES = [
  {
    id: 1,
    role: 'assistant',
    text: 'Olá! Sou o assistente inteligente da SmartStone. Em breve poderei ajudar com análises financeiras, resumos de projetos e muito mais.',
  },
];

export default function AdminIA() {
  const [messages, setMessages] = useState(PLACEHOLDER_MESSAGES);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    setMessages(prev => [
      ...prev,
      { id: Date.now(), role: 'user', text },
      {
        id: Date.now() + 1,
        role: 'assistant',
        text: 'Funcionalidade em desenvolvimento. Em breve a IA estará disponível.',
      },
    ]);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div className="w-8 h-8 bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
          <iconify-icon icon="solar:stars-linear" width="16" class="text-yellow-400"></iconify-icon>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-white font-bold">Assistente IA</div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Em desenvolvimento</div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <iconify-icon icon="solar:stars-linear" width="12" class="text-yellow-400"></iconify-icon>
              </div>
            )}

            <div
              className={`max-w-[75%] px-4 py-3 font-mono text-[12px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-yellow-400/10 border border-yellow-400/20 text-yellow-100'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
              }`}
            >
              {msg.text}
            </div>

            {msg.role === 'user' && (
              <div className="w-6 h-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 ml-2 mt-0.5 font-mono text-[8px] text-yellow-400 font-bold">
                EU
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-zinc-800 pt-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem... (Enter para enviar)"
            rows={3}
            className="flex-1 bg-zinc-950 border border-zinc-800 text-white text-[12px] font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.10)] placeholder:text-zinc-700 resize-none transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest font-bold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center gap-2"
          >
            <iconify-icon icon="solar:arrow-up-linear" width="14"></iconify-icon>
            Enviar
          </button>
        </div>
        <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-zinc-700">
          Shift+Enter para nova linha
        </div>
      </div>
    </div>
  );
}
