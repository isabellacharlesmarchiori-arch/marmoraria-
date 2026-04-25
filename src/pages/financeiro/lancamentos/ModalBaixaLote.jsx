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
      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function hoje() { return new Date().toISOString().split('T')[0]; }

export default function ModalBaixaLote({ aberto, lancamentos, contas, onFechar, onSucesso }) {
  const [form,     setForm]     = useState({ conta_id: '', data_pagamento: hoje(), forma_pagamento: '' });
  const [salvando, setSalvando] = useState(false);

  const elegiveis = (lancamentos ?? []).filter(l =>
    ['pendente', 'atrasado', 'parcial'].includes(l.status)
  );
  const ignorados  = (lancamentos ?? []).length - elegiveis.length;
  const totalValor = elegiveis.reduce((s, l) => s + (l.valor_previsto - (l.valor_pago || 0)), 0);

  useEffect(() => {
    if (aberto) setForm({ conta_id: '', data_pagamento: hoje(), forma_pagamento: '' });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fn(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.conta_id)        { toast.error('Selecione uma conta bancária.'); return; }
    if (!form.data_pagamento)  { toast.error('Informe a data de pagamento.'); return; }
    if (!form.forma_pagamento) { toast.error('Selecione a forma de pagamento.'); return; }
    if (elegiveis.length === 0) { toast.error('Nenhum lançamento elegível selecionado.'); return; }

    setSalvando(true);
    try {
      const results = await Promise.all(
        elegiveis.map(l =>
          supabase
            .from('financeiro_lancamentos')
            .update({
              status:          'pago',
              valor_pago:      l.valor_previsto,
              conta_id:        form.conta_id,
              data_pagamento:  form.data_pagamento,
              forma_pagamento: form.forma_pagamento,
              taxa_percentual: 0,
            })
            .eq('id', l.id)
        )
      );

      const erros = results.filter(r => r.error);
      if (erros.length > 0) throw new Error(erros[0].error.message);

      toast.success(`${elegiveis.length} lançamento${elegiveis.length !== 1 ? 's' : ''} baixado${elegiveis.length !== 1 ? 's' : ''}.`);
      onSucesso();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao registrar baixas.');
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
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            Baixa em lote
          </span>
          <button type="button" onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors">
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        {/* Resumo */}
        <div className="px-6 pt-5 pb-0 flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <span className="text-white text-lg font-bold tabular-nums">{elegiveis.length}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              lançamento{elegiveis.length !== 1 ? 's' : ''} a baixar
            </span>
            <span className="font-mono text-sm font-bold text-emerald-400 ml-auto tabular-nums">
              {formatBRL(totalValor)}
            </span>
          </div>
          {ignorados > 0 && (
            <p className="font-mono text-[8px] text-zinc-600">
              {ignorados} lançamento{ignorados !== 1 ? 's' : ''} ignorado{ignorados !== 1 ? 's' : ''} (já pago{ignorados !== 1 ? 's' : ''} ou cancelado{ignorados !== 1 ? 's' : ''})
            </p>
          )}
        </div>

        {/* Lista dos elegíveis */}
        {elegiveis.length > 0 && (
          <div className="px-6 pt-3 pb-0 max-h-40 overflow-y-auto">
            <div className="border border-zinc-900 divide-y divide-zinc-900">
              {elegiveis.map(l => (
                <div key={l.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-zinc-300 truncate max-w-[260px]">{l.descricao}</span>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-500 shrink-0 ml-3">
                    {formatBRL(l.valor_previsto - (l.valor_pago || 0))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Conta + Data */}
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Conta bancária">
              <select
                value={form.conta_id}
                onChange={e => set('conta_id', e.target.value)}
                className={INPUT_BASE + ' cursor-pointer'}
                autoFocus
              >
                <option value="">— selecione —</option>
                {(contas ?? []).map(c => (
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

          {/* Forma */}
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
              disabled={salvando || elegiveis.length === 0}
              className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Registrando…' : `Confirmar ${elegiveis.length} baixa${elegiveis.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
