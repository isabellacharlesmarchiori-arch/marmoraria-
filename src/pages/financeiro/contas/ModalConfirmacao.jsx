import { useEffect } from 'react';

export default function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  onConfirmar,
  onCancelar,
  textoConfirmar = 'Confirmar',
  textoCancelar  = 'Cancelar',
  variante       = 'neutra',
}) {
  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancelar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  const corConfirmar =
    variante === 'destrutiva'
      ? 'text-red-400 hover:text-red-300'
      : 'text-orange-600 dark:text-yellow-400 hover:text-orange-600 dark:hover:text-yellow-300';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancelar}
    >
      <div
        className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm shadow-zinc-100/60 dark:shadow-none rounded-[2rem] dark:rounded-none p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-4">
          {titulo}
        </div>

        <p className="text-zinc-900 dark:text-white text-sm leading-relaxed mb-6">
          {mensagem}
        </p>

        <div className="flex justify-end gap-6">
          <button
            type="button"
            onClick={onCancelar}
            className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`font-mono text-[9px] uppercase tracking-widest transition-colors ${corConfirmar}`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
