import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';

const TIPOS = [
  { value: 'corrente',  label: 'Corrente' },
  { value: 'poupanca',  label: 'Poupança' },
  { value: 'aplicacao', label: 'Aplicação' },
  { value: 'fisico',    label: 'Caixa físico' },
  { value: 'cartao',    label: 'Cartão de crédito' },
];

const VAZIO = {
  nome:          '',
  tipo:          'corrente',
  banco:         '',
  agencia:       '',
  conta:         '',
  saldo_inicial: '0.00',
  ativo:         true,
};

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full';

function Campo({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function ModalContaForm({ aberto, contaEditando, onFechar, onSalvar }) {
  const { profile } = useAuth();
  const [form, setForm]         = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const editando = contaEditando != null;

  useEffect(() => {
    if (!aberto) return;
    if (editando) {
      setForm({
        nome:          contaEditando.nome          ?? '',
        tipo:          contaEditando.tipo          ?? 'corrente',
        banco:         contaEditando.banco         ?? '',
        agencia:       contaEditando.agencia       ?? '',
        conta:         contaEditando.conta         ?? '',
        saldo_inicial: String(contaEditando.saldo_inicial ?? '0.00'),
        ativo:         contaEditando.ativo         ?? true,
      });
    } else {
      setForm(VAZIO);
    }
  }, [aberto, contaEditando]);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const mostrarBanco   = form.tipo !== 'fisico';
  const mostrarAgencia = form.tipo !== 'fisico' && form.tipo !== 'cartao';

  function set(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório.');
      return;
    }

    const saldoNum = parseFloat(form.saldo_inicial);
    if (!editando && (isNaN(saldoNum) || saldoNum < 0)) {
      toast.error('Saldo inicial não pode ser negativo.');
      return;
    }

    setSalvando(true);
    try {
      if (editando) {
        const { error } = await supabase
          .from('financeiro_contas')
          .update({
            nome:    form.nome.trim(),
            tipo:    form.tipo,
            banco:   mostrarBanco   ? (form.banco   || null) : null,
            agencia: mostrarAgencia ? (form.agencia || null) : null,
            conta:   mostrarAgencia ? (form.conta   || null) : null,
            ativo:   form.ativo,
          })
          .eq('id', contaEditando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('financeiro_contas')
          .insert({
            empresa_id:    profile.empresa_id,
            nome:          form.nome.trim(),
            tipo:          form.tipo,
            banco:         mostrarBanco   ? (form.banco   || null) : null,
            agencia:       mostrarAgencia ? (form.agencia || null) : null,
            conta:         mostrarAgencia ? (form.conta   || null) : null,
            saldo_inicial: saldoNum,
            saldo_atual:   saldoNum,
          });
        if (error) throw error;
      }

      toast.success('Conta salva.');
      onSalvar();
    } catch (err) {
      const msg =
        err.code === '23505'
          ? 'Já existe uma conta com esse nome.'
          : err.message;
      toast.error(msg);
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
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-800">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            {editando ? 'Editar conta' : 'Nova conta'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <Campo label="Nome">
            <input
              type="text"
              maxLength={60}
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              className={INPUT_BASE}
              placeholder="Ex: Itaú Corrente Principal"
              autoFocus
            />
          </Campo>

          <Campo label="Tipo">
            <select
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
              className={INPUT_BASE + ' cursor-pointer'}
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Campo>

          {mostrarBanco && (
            <Campo label="Banco">
              <input
                type="text"
                value={form.banco}
                onChange={e => set('banco', e.target.value)}
                className={INPUT_BASE}
                placeholder="Ex: Itaú, Nubank, Bradesco"
              />
            </Campo>
          )}

          {mostrarAgencia && (
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Agência">
                <input
                  type="text"
                  value={form.agencia}
                  onChange={e => set('agencia', e.target.value)}
                  className={INPUT_BASE}
                  placeholder="1234-5"
                />
              </Campo>
              <Campo label="Conta">
                <input
                  type="text"
                  value={form.conta}
                  onChange={e => set('conta', e.target.value)}
                  className={INPUT_BASE}
                  placeholder="00123-4"
                />
              </Campo>
            </div>
          )}

          <Campo label={editando ? 'Saldo inicial — bloqueado' : 'Saldo inicial'}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.saldo_inicial}
              onChange={e => !editando && set('saldo_inicial', e.target.value)}
              readOnly={editando}
              title={
                editando
                  ? 'Saldo inicial não pode ser alterado após a criação. Mudar esse valor depois que já existem lançamentos desincronizaria o saldo atual da conta.'
                  : undefined
              }
              className={
                INPUT_BASE +
                (editando ? ' opacity-40 cursor-not-allowed' : '')
              }
            />
          </Campo>

          {editando && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={e => set('ativo', e.target.checked)}
                className="w-4 h-4 accent-yellow-400"
              />
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                Conta ativa
              </span>
            </label>
          )}

          <div className="flex justify-end gap-6 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onFechar}
              className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
