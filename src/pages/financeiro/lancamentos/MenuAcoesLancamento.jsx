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

export default function MenuAcoesLancamento({
  lancamento,
  onEditar,
  onMarcarPago,
  onEstornar,
  onCancelar,
  onGerenciarGrupo,
}) {
  const [aberto, setAberto] = useState(false);
  const [pos,    setPos]    = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  // Fechar ao clicar em qualquer lugar fora do menu
  useEffect(() => {
    if (!aberto) return;
    function handler() { setAberto(false); }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [aberto]);

  // Fechar com ESC
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

  const status          = lancamento.status;
  const mostrarMarcarPago = ['pendente', 'atrasado', 'parcial'].includes(status);
  const mostrarEstornar   = ['pago', 'parcial'].includes(status);
  const mostrarCancelar   = status !== 'cancelado';
  const temGrupo          = !!lancamento.grupo_parcelamento_id;

  // Fecha menu e invoca o callback com o lançamento
  function acao(fn) {
    return (e) => {
      e?.stopPropagation();
      setAberto(false);
      fn(lancamento);
    };
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
          className="fixed z-[200] bg-[#0a0a0a] border border-zinc-800 min-w-[200px] py-1"
          style={{ top: pos.top, right: pos.right }}
          onClick={e => e.stopPropagation()}
        >
          <ItemMenu
            icon="lucide:pencil"
            label="Editar"
            onClick={acao(onEditar)}
          />
          {mostrarMarcarPago && (
            <ItemMenu
              icon="lucide:check-circle"
              label="Marcar como pago"
              onClick={acao(onMarcarPago)}
            />
          )}
          {mostrarEstornar && (
            <ItemMenu
              icon="lucide:rotate-ccw"
              label="Estornar pagamento"
              onClick={acao(onEstornar)}
              destrutivo
            />
          )}
          {mostrarCancelar && (
            <ItemMenu
              icon="lucide:x-circle"
              label="Cancelar"
              onClick={acao(onCancelar)}
              destrutivo
            />
          )}
          {temGrupo && (
            <>
              <div className="border-t border-zinc-800 my-1" />
              <ItemMenu
                icon="lucide:layers"
                label="Gerenciar parcelamento"
                onClick={acao(onGerenciarGrupo)}
              />
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
