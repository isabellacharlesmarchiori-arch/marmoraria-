import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

const OPCOES = [
  { label: 'Novo lançamento',            icon: 'lucide:arrow-right-left' },
  { label: 'Transferência entre contas', icon: 'lucide:repeat'           },
  { label: 'Novo cadastro',              icon: 'lucide:user-plus'        },
];

export default function FabNovoFinanceiro() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;

    function onKey(e) {
      if (e.key === 'Escape') setAberto(false);
    }
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickFora);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickFora);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">

      {/* Opções expansíveis */}
      {aberto && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {OPCOES.map((op, i) => (
            <button
              key={op.label}
              onClick={() => { toast.info('Em breve'); setAberto(false); }}
              className="flex items-center gap-2 bg-[#0a0a0a] border border-zinc-700 text-zinc-300 font-mono text-[11px] uppercase tracking-widest px-4 py-2 hover:bg-zinc-800 hover:text-white transition-colors"
              style={{ animation: `fadeUp 0.12s ease ${i * 40}ms both` }}
            >
              <iconify-icon icon={op.icon} width="13"></iconify-icon>
              {op.label}
            </button>
          ))}
        </div>
      )}

      {/* Botão principal */}
      <button
        onClick={() => setAberto(v => !v)}
        aria-label={aberto ? 'Fechar menu' : 'Novo'}
        className="w-14 h-14 bg-yellow-400 border border-yellow-400 flex items-center justify-center text-zinc-950 hover:bg-yellow-300 transition-colors"
      >
        <iconify-icon icon={aberto ? 'lucide:x' : 'lucide:plus'} width="22"></iconify-icon>
      </button>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </div>
  );
}
