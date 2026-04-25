import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

const INPUT_BASE =
  'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full [color-scheme:dark]';

const SELECT_BASE =
  'bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full cursor-pointer';

function Campo({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">
        {label}{required && ' *'}
      </span>
      {children}
    </div>
  );
}

function hoje() { return new Date().toISOString().split('T')[0]; }

export default function ModalDepositarCheque({ aberto, cheque, contas, onFechar, onSucesso }) {
  const [contaId,       setContaId]      = useState('');
  const [dataDeposito,  setDataDeposito] = useState(hoje());
  const [salvando,      setSalvando]     = useState(false);

  useEffect(() => {
    if (aberto) { setContaId(''); setDataDeposito(hoje()); }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onFechar]);

  if (!aberto || !cheque) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!contaId) return toast.error('Selecione a conta de depósito.');
    if (!dataDeposito) return toast.error('Informe a data do depósito.');

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('financeiro_cheques')
        .update({ status: 'depositado', conta_deposito_id: contaId })
        .eq('id', cheque.id);
      if (error) throw error;

      toast.success('Cheque marcado como depositado');
      onSucesso();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao depositar cheque');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onFechar}
    >
      <div
        className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
          <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-400">
            Depositar cheque
          </span>
          <button type="button" onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors">
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">

          {/* Resumo do cheque */}
          <div className="border border-gray-300 dark:border-zinc-800 px-4 py-3 flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Cheque nº {cheque.numero_cheque}</span>
            <span className="text-gray-900 dark:text-white text-sm">{cheque.titular}</span>
            <span className="font-mono text-sm tabular-nums text-gray-900 dark:text-white">{formatBRL(cheque.valor)}</span>
          </div>

          <Campo label="Conta de depósito" required>
            <select
              value={contaId}
              onChange={e => setContaId(e.target.value)}
              className={SELECT_BASE}
            >
              <option value="">Selecionar conta…</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Data do depósito" required>
            <input
              type="date"
              value={dataDeposito}
              onChange={e => setDataDeposito(e.target.value)}
              className={INPUT_BASE}
            />
          </Campo>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors border border-gray-300 dark:border-zinc-800 px-4 py-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="font-mono text-[9px] uppercase tracking-widest bg-yellow-400 text-black px-4 py-2 hover:bg-yellow-300 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Depositar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
