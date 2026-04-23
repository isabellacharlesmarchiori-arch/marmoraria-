import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function ItemMenu({ icon, label, onClick, destrutivo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 w-full text-left font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-white/[0.015] ${
        destrutivo ? 'text-zinc-400 hover:text-red-400' : 'text-white hover:text-yellow-400'
      }`}
    >
      <iconify-icon icon={icon} width="12"></iconify-icon>
      {label}
    </button>
  );
}

export default function MenuAcoesCheque({
  cheque,
  onDepositar,
  onCompensar,
  onRepassar,
  onDevolver,
  onCancelar,
}) {
  const [aberto, setAberto] = useState(false);
  const [pos,    setPos]    = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function handler() { setAberto(false); }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function handler(e) { if (e.key === 'Escape') setAberto(false); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [aberto]);

  function handleAbrirMenu(e) {
    e.stopPropagation();
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setAberto(a => !a);
  }

  function acao(fn) {
    return (e) => {
      e?.stopPropagation();
      setAberto(false);
      fn(cheque);
    };
  }

  const s = cheque.status;

  const mostrarDepositar  = s === 'em_maos';
  const mostrarRepassar   = s === 'em_maos';
  const mostrarCompensar  = s === 'depositado';
  const mostrarDevolver   = s === 'em_maos' || s === 'depositado';
  const mostrarCancelar   = s !== 'repassado' && s !== 'cancelado';

  if (!mostrarDepositar && !mostrarCompensar && !mostrarRepassar && !mostrarDevolver && !mostrarCancelar) {
    return null;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleAbrirMenu}
        className="text-zinc-600 hover:text-yellow-400 transition-colors"
      >
        <iconify-icon icon="lucide:more-horizontal" width="16"></iconify-icon>
      </button>

      {aberto && createPortal(
        <div
          className="fixed z-[200] bg-[#0a0a0a] border border-zinc-800 min-w-[180px] py-1"
          style={{ top: pos.top, right: pos.right }}
          onClick={e => e.stopPropagation()}
        >
          {mostrarDepositar && (
            <ItemMenu
              icon="lucide:banknote"
              label="Depositar"
              onClick={acao(onDepositar)}
            />
          )}
          {mostrarCompensar && (
            <ItemMenu
              icon="lucide:check-check"
              label="Compensar"
              onClick={acao(onCompensar)}
            />
          )}
          {mostrarRepassar && (
            <ItemMenu
              icon="lucide:arrow-right"
              label="Repassar"
              onClick={acao(onRepassar)}
            />
          )}
          {mostrarDevolver && (
            <ItemMenu
              icon="lucide:rotate-ccw"
              label="Devolver"
              onClick={acao(onDevolver)}
              destrutivo
            />
          )}
          {mostrarCancelar && (
            <>
              {(mostrarDepositar || mostrarCompensar || mostrarRepassar || mostrarDevolver) && (
                <div className="border-t border-zinc-800 my-1" />
              )}
              <ItemMenu
                icon="lucide:x-circle"
                label="Cancelar"
                onClick={acao(onCancelar)}
                destrutivo
              />
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
