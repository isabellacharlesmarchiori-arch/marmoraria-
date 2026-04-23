import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full [color-scheme:dark]';

const SELECT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full cursor-pointer';

function Campo({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}{required && ' *'}
      </span>
      {children}
    </div>
  );
}

function Secao({ label }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 border border-zinc-800 px-2 py-0.5">
        {label}
      </span>
      <div className="flex-1 border-t border-zinc-800" />
    </div>
  );
}

function hoje() { return new Date().toISOString().split('T')[0]; }
function primeiroDiaDoMes(d) { const [y, m] = d.split('-'); return `${y}-${m}-01`; }

function formVazio() {
  return {
    vinculo:           'existente',
    lancamento_id:     '',
    descricao:         '',
    categoria_id:      '',
    cliente_id:        '',
    numero_cheque:     '',
    banco_emissor:     '',
    agencia_emissora:  '',
    conta_emissora:    '',
    titular:           '',
    documento_titular: '',
    valor:             '',
    data_emissao:      hoje(),
    data_bom_para:     '',
  };
}

export default function ModalCadastrarCheque({
  aberto,
  onFechar,
  onSucesso,
  lancamentosEntradaPendentes = [],
  categorias = [],
  clientes   = [],
}) {
  const { profile } = useAuth();
  const [form, setForm]       = useState(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  useEffect(() => {
    if (aberto) { setForm(formVazio()); setErroForm(''); }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const categoriasReceita = categorias.filter(c => c.tipo === 'receita');

  const lancSelecionado = lancamentosEntradaPendentes.find(l => l.id === form.lancamento_id);
  const saldoLanc = lancSelecionado
    ? parseFloat(lancSelecionado.valor_previsto) - parseFloat(lancSelecionado.valor_pago || 0)
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErroForm('');

    // Validações comuns
    if (!form.numero_cheque.trim()) return setErroForm('Número do cheque obrigatório.');
    if (!form.banco_emissor.trim()) return setErroForm('Banco emissor obrigatório.');
    if (!form.titular.trim())       return setErroForm('Titular obrigatório.');
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0)       return setErroForm('Valor inválido.');
    if (!form.data_bom_para)        return setErroForm('Data "bom para" obrigatória.');

    // Validações por vinculo
    if (form.vinculo === 'existente') {
      if (!form.lancamento_id) return setErroForm('Selecione um lançamento.');
      if (saldoLanc !== null && Math.abs(valor - saldoLanc) > 0.01) {
        return setErroForm(
          `Valor do cheque (${formatBRL(valor)}) deve corresponder ao saldo do lançamento (${formatBRL(saldoLanc)}).`
        );
      }
    } else {
      if (!form.descricao.trim())  return setErroForm('Descrição obrigatória.');
      if (!form.categoria_id)      return setErroForm('Categoria obrigatória.');
    }

    setSalvando(true);
    try {
      const dadosCheque = {
        empresa_id:        profile.empresa_id,
        numero_cheque:     form.numero_cheque.trim(),
        banco_emissor:     form.banco_emissor.trim(),
        agencia_emissora:  form.agencia_emissora.trim() || null,
        conta_emissora:    form.conta_emissora.trim()   || null,
        titular:           form.titular.trim(),
        documento_titular: form.documento_titular.trim() || null,
        valor,
        data_emissao:      form.data_emissao  || null,
        data_bom_para:     form.data_bom_para,
        status:            'em_maos',
      };

      if (form.vinculo === 'existente') {
        const { error: errCheque } = await supabase
          .from('financeiro_cheques')
          .insert({ ...dadosCheque, lancamento_id: form.lancamento_id });
        if (errCheque) throw errCheque;

        const { error: errLanc } = await supabase
          .from('financeiro_lancamentos')
          .update({ forma_pagamento: 'cheque' })
          .eq('id', form.lancamento_id);
        if (errLanc) throw errLanc;

      } else {
        const { data: lanc, error: errLanc } = await supabase
          .from('financeiro_lancamentos')
          .insert({
            empresa_id:      profile.empresa_id,
            tipo:            'entrada',
            status:          'pendente',
            descricao:       form.descricao.trim(),
            valor_previsto:  valor,
            data_emissao:    hoje(),
            data_vencimento: form.data_bom_para,
            competencia:     primeiroDiaDoMes(form.data_bom_para),
            categoria_id:    form.categoria_id,
            cliente_id:      form.cliente_id || null,
            forma_pagamento: 'cheque',
            origem:          'manual',
          })
          .select('id')
          .single();
        if (errLanc) throw errLanc;

        const { error: errCheque } = await supabase
          .from('financeiro_cheques')
          .insert({ ...dadosCheque, lancamento_id: lanc.id });
        if (errCheque) throw errCheque;
      }

      toast.success('Cheque cadastrado');
      onSucesso();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao cadastrar cheque');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 overflow-y-auto py-8"
      onClick={onFechar}
    >
      <div
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-lg mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
            Cadastrar cheque
          </span>
          <button type="button" onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors">
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">

          {/* Vínculo */}
          <Secao label="Vínculo com lançamento" />
          <div className="flex flex-col gap-2">
            {[
              { v: 'existente', l: 'Vincular a lançamento existente' },
              { v: 'novo',      l: 'Criar lançamento junto'           },
            ].map(({ v, l }) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="vinculo"
                  value={v}
                  checked={form.vinculo === v}
                  onChange={() => set('vinculo', v)}
                  className="accent-yellow-400"
                />
                <span className="text-sm text-zinc-300">{l}</span>
              </label>
            ))}
          </div>

          {form.vinculo === 'existente' ? (
            <Campo label="Lançamento de entrada" required>
              <select
                value={form.lancamento_id}
                onChange={e => set('lancamento_id', e.target.value)}
                className={SELECT_BASE}
              >
                <option value="">Selecionar lançamento…</option>
                {lancamentosEntradaPendentes.map(l => {
                  const saldo = parseFloat(l.valor_previsto) - parseFloat(l.valor_pago || 0);
                  return (
                    <option key={l.id} value={l.id}>
                      {l.descricao} — {formatBRL(saldo)}
                    </option>
                  );
                })}
              </select>
              {saldoLanc !== null && (
                <span className="font-mono text-[9px] text-zinc-600">
                  Saldo pendente: {formatBRL(saldoLanc)}
                </span>
              )}
            </Campo>
          ) : (
            <>
              <Campo label="Descrição do lançamento" required>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  className={INPUT_BASE}
                />
              </Campo>
              <Campo label="Categoria" required>
                <select
                  value={form.categoria_id}
                  onChange={e => set('categoria_id', e.target.value)}
                  className={SELECT_BASE}
                >
                  <option value="">Selecionar categoria…</option>
                  {categoriasReceita.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Cliente (opcional)">
                <select
                  value={form.cliente_id}
                  onChange={e => set('cliente_id', e.target.value)}
                  className={SELECT_BASE}
                >
                  <option value="">Sem cliente</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Campo>
            </>
          )}

          {/* Dados do cheque */}
          <Secao label="Dados do cheque" />

          <Campo label="Número do cheque" required>
            <input type="text" value={form.numero_cheque} onChange={e => set('numero_cheque', e.target.value)} className={INPUT_BASE} />
          </Campo>

          <Campo label="Banco emissor" required>
            <input type="text" value={form.banco_emissor} onChange={e => set('banco_emissor', e.target.value)} className={INPUT_BASE} />
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Agência">
              <input type="text" value={form.agencia_emissora} onChange={e => set('agencia_emissora', e.target.value)} className={INPUT_BASE} />
            </Campo>
            <Campo label="Conta">
              <input type="text" value={form.conta_emissora} onChange={e => set('conta_emissora', e.target.value)} className={INPUT_BASE} />
            </Campo>
          </div>

          <Campo label="Titular" required>
            <input type="text" value={form.titular} onChange={e => set('titular', e.target.value)} className={INPUT_BASE} />
          </Campo>

          <Campo label="Documento titular (CPF/CNPJ)">
            <input type="text" value={form.documento_titular} onChange={e => set('documento_titular', e.target.value)} className={INPUT_BASE} />
          </Campo>

          <Campo label="Valor" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-zinc-500">R$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.valor}
                onChange={e => set('valor', e.target.value)}
                className={INPUT_BASE + ' pl-8'}
              />
            </div>
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Data de emissão">
              <input type="date" value={form.data_emissao} onChange={e => set('data_emissao', e.target.value)} className={INPUT_BASE} />
            </Campo>
            <Campo label="Data bom pra" required>
              <input type="date" value={form.data_bom_para} onChange={e => set('data_bom_para', e.target.value)} className={INPUT_BASE} />
            </Campo>
          </div>

          {erroForm && (
            <p className="font-mono text-[10px] text-red-400 border border-red-900 px-3 py-2">{erroForm}</p>
          )}

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors border border-zinc-800 px-4 py-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="font-mono text-[9px] uppercase tracking-widest bg-yellow-400 text-black px-4 py-2 hover:bg-yellow-300 transition-colors disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
