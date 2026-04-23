import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

const FORMAS_PAGAMENTO = [
  { value: 'pix',            label: 'PIX'               },
  { value: 'boleto',         label: 'Boleto'            },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito',  label: 'Cartão de débito'  },
  { value: 'dinheiro',       label: 'Dinheiro'          },
  { value: 'cheque',         label: 'Cheque'            },
  { value: 'transferencia',  label: 'Transferência'     },
  { value: 'outro',          label: 'Outro'             },
];

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

export default function ModalMarcarPago({ aberto, lancamento, contas, onFechar, onSucesso }) {
  const [form,     setFormState] = useState({ valor_pago: '', conta_id: '', data_pagamento: '', forma_pagamento: '', taxa_percentual: '0' });
  const [salvando, setSalvando]  = useState(false);

  const saldoPendente = lancamento
    ? lancamento.valor_previsto - (lancamento.valor_pago || 0)
    : 0;

  useEffect(() => {
    if (!aberto || !lancamento) return;
    setFormState({
      valor_pago:      saldoPendente.toFixed(2),
      conta_id:        lancamento.conta_id        ?? '',
      data_pagamento:  new Date().toISOString().split('T')[0],
      forma_pagamento: lancamento.forma_pagamento ?? '',
      taxa_percentual: String(lancamento.taxa_percentual ?? '0'),
    });
  }, [aberto, lancamento]);

  useEffect(() => {
    if (!aberto) return;
    function fn(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [aberto, onFechar]);

  if (!aberto || !lancamento) return null;

  function set(campo, valor) {
    setFormState(f => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const valorInput = parseFloat(form.valor_pago);
    if (!valorInput || valorInput <= 0) {
      toast.error('Valor pago deve ser maior que zero.');
      return;
    }
    if (valorInput > saldoPendente + 0.005) {
      toast.error(`Valor não pode exceder o saldo pendente (${formatBRL(saldoPendente)}).`);
      return;
    }
    if (!form.conta_id)        { toast.error('Selecione uma conta bancária.'); return; }
    if (!form.data_pagamento)  { toast.error('Informe a data de pagamento.'); return; }
    if (!form.forma_pagamento) { toast.error('Selecione a forma de pagamento.'); return; }

    const novoTotalPago = (lancamento.valor_pago || 0) + valorInput;
    const novoStatus    = novoTotalPago >= lancamento.valor_previsto - 0.005 ? 'pago' : 'parcial';

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({
          status:          novoStatus,
          valor_pago:      novoTotalPago,
          conta_id:        form.conta_id,
          data_pagamento:  form.data_pagamento,
          forma_pagamento: form.forma_pagamento,
          taxa_percentual: form.forma_pagamento === 'cartao_credito'
            ? (parseFloat(form.taxa_percentual) || 0)
            : 0,
        })
        .eq('id', lancamento.id);
      if (error) throw error;
      toast.success('Pagamento registrado.');
      onSucesso();
    } catch (err) {
      toast.error(err.message);
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
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            Registrar pagamento
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="text-zinc-600 hover:text-white transition-colors"
          >
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        {/* Contexto */}
        <div className="px-6 pt-5 pb-0">
          <p className="text-white text-sm truncate">{lancamento.descricao}</p>
          <p className="font-mono text-[9px] text-zinc-600 mt-1">
            Total: {formatBRL(lancamento.valor_previsto)}
            {lancamento.valor_pago > 0 && (
              <> · Já pago: {formatBRL(lancamento.valor_pago)} · Saldo: {formatBRL(saldoPendente)}</>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Valor */}
          <Campo label="Valor pago agora (R$)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={saldoPendente}
              value={form.valor_pago}
              onChange={e => set('valor_pago', e.target.value)}
              className={INPUT_BASE}
              autoFocus
            />
          </Campo>

          {/* Conta + Data */}
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Conta bancária">
              <select
                value={form.conta_id}
                onChange={e => set('conta_id', e.target.value)}
                className={INPUT_BASE + ' cursor-pointer'}
              >
                <option value="">— selecione —</option>
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Data do pagamento">
              <input
                type="date"
                value={form.data_pagamento}
                onChange={e => set('data_pagamento', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
          </div>

          {/* Forma + Taxa */}
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Forma de pagamento">
              <select
                value={form.forma_pagamento}
                onChange={e => set('forma_pagamento', e.target.value)}
                className={INPUT_BASE + ' cursor-pointer'}
              >
                <option value="">— selecione —</option>
                {FORMAS_PAGAMENTO.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </Campo>
            {form.forma_pagamento === 'cartao_credito' && (
              <Campo label="Taxa (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.taxa_percentual}
                  onChange={e => set('taxa_percentual', e.target.value)}
                  className={INPUT_BASE}
                  placeholder="0.00"
                />
              </Campo>
            )}
          </div>

          {/* Ações */}
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
              {salvando ? 'Registrando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
