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
      : 'text-yellow-400 hover:text-yellow-300';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancelar}
    >
      <div
        className="bg-[#0a0a0a] border border-zinc-800 p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-4">
          {titulo}
        </div>

        <p className="text-white text-sm leading-relaxed mb-6">
          {mensagem}
        </p>

        <div className="flex justify-end gap-6">
          <button
            type="button"
            onClick={onCancelar}
            className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
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
