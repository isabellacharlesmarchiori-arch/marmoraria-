import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';
import SelectParceiroUnificado from './SelectParceiroUnificado';
import CamposParcelamento from './CamposParcelamento';

// ─── constantes ─────────────────────────────────────────────────────────────

const FORMAS_PAGAMENTO = [
  { value: 'pix',            label: 'PIX'              },
  { value: 'boleto',         label: 'Boleto'           },
  { value: 'cartao_credito', label: 'Cartão de crédito'},
  { value: 'cartao_debito',  label: 'Cartão de débito' },
  { value: 'dinheiro',       label: 'Dinheiro'         },
  { value: 'cheque',         label: 'Cheque'           },
  { value: 'transferencia',  label: 'Transferência'    },
  { value: 'outro',          label: 'Outro'            },
];

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full';

const CHIP_BASE = 'border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors';
const CHIP_ON   = 'border-yellow-400 text-yellow-400';
const CHIP_OFF  = 'border-zinc-800 text-zinc-500';

// ─── sub-componente Campo (idêntico ao ModalContaForm) ───────────────────────

function Campo({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

// ─── helpers de data ─────────────────────────────────────────────────────────

function hoje() { return new Date().toISOString().split('T')[0]; }

function formVazio() {
  const h = hoje();
  return {
    tipo:            'saida',
    descricao:       '',
    valor_previsto:  '',
    data_emissao:    h,
    data_vencimento: h,
    competencia:     h.slice(0, 7),
    categoria_id:    '',
    projeto_id:      '',
  };
}

function pagVazio() {
  return { conta_id: '', data_pagamento: hoje(), forma_pagamento: '', taxa_percentual: '0' };
}

// ─── componente ─────────────────────────────────────────────────────────────

export default function ModalLancamentoForm({
  aberto,
  lancamentoEditando,
  onFechar,
  onSalvar,
  categorias        = [],
  parceirosPublicos = [],
  arquitetos        = [],
  clientes          = [],
  contas            = [],
  projetos          = [],
}) {
  const { profile } = useAuth();

  const [form,      setFormState] = useState(formVazio);
  const [parceiro,  setParceiro]  = useState(null);
  const [parcelado, setParcelado] = useState(false);
  const [parcelas,  setParcelas]  = useState([]);
  const [jaPago,    setJaPago]    = useState(false);
  const [pagamento, setPagState]  = useState(pagVazio);
  const [salvando,  setSalvando]  = useState(false);

  const editando = lancamentoEditando != null;

  // ── inicialização ao abrir ────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;

    if (editando) {
      const l = lancamentoEditando;
      setFormState({
        tipo:            l.tipo,
        descricao:       l.descricao          ?? '',
        valor_previsto:  String(l.valor_previsto ?? ''),
        data_emissao:    l.data_emissao        ?? hoje(),
        data_vencimento: l.data_vencimento     ?? hoje(),
        competencia:     (l.competencia        ?? hoje()).slice(0, 7),
        categoria_id:    l.categoria_id        ?? '',
        projeto_id:      l.projeto_id          ?? '',
      });
      const origem = l.parceiro_id  ? 'parceiro'  :
                     l.arquiteto_id ? 'arquiteto' :
                     l.cliente_id   ? 'cliente'   : null;
      setParceiro(origem ? { id: l[origem + '_id'], origem } : null);

      const pago = l.status === 'pago';
      setJaPago(pago);
      setPagState(pago ? {
        conta_id:        l.conta_id         ?? '',
        data_pagamento:  l.data_pagamento   ?? hoje(),
        forma_pagamento: l.forma_pagamento  ?? '',
        taxa_percentual: String(l.taxa_percentual ?? '0'),
      } : pagVazio());
      setParcelado(false);
      setParcelas([]);
    } else {
      setFormState(formVazio());
      setParceiro(null);
      setJaPago(false);
      setPagState(pagVazio());
      setParcelado(false);
      setParcelas([]);
    }
  }, [aberto, lancamentoEditando]);

  // ── ESC fecha ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    const fn = e => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  // ── valores computados ────────────────────────────────────────────────────
  const tiposPermitidos    = form.tipo === 'entrada' ? ['cliente'] : ['parceiro', 'arquiteto'];
  const categoriasFiltradas = categorias.filter(c =>
    c.tipo === (form.tipo === 'entrada' ? 'receita' : 'despesa')
  );
  const valorNum = parseFloat(form.valor_previsto) || 0;

  // ── setters ───────────────────────────────────────────────────────────────
  function set(campo, valor) {
    setFormState(f => {
      const next = { ...f, [campo]: valor };
      if (campo === 'data_vencimento' && !editando) next.competencia = valor.slice(0, 7);
      return next;
    });
  }

  function setPag(campo, valor) {
    setPagState(f => ({ ...f, [campo]: valor }));
  }

  function handleTipo(t) {
    setFormState(f => ({ ...f, tipo: t, categoria_id: '' }));
    setParceiro(null);
  }

  function handleParcelado(checked) {
    setParcelado(checked);
    if (checked) { setJaPago(false); setParcelas([]); }
  }

  function handleJaPago(checked) {
    setJaPago(checked);
    if (!checked) setPagState(pagVazio());
  }

  // ── validação ─────────────────────────────────────────────────────────────
  function validar() {
    if (form.descricao.trim().length < 3)
      return 'Descrição deve ter pelo menos 3 caracteres.';
    if (!valorNum || valorNum <= 0)
      return 'Valor deve ser maior que zero.';
    if (!form.categoria_id)
      return 'Categoria é obrigatória.';
    if (jaPago && !parcelado) {
      if (!pagamento.conta_id)        return 'Selecione uma conta bancária.';
      if (!pagamento.data_pagamento)  return 'Informe a data de pagamento.';
      if (!pagamento.forma_pagamento) return 'Selecione a forma de pagamento.';
    }
    if (parcelado) {
      if (parcelas.length < 2)
        return 'Mínimo de 2 parcelas.';
      if (parcelas.some(p => !(parseFloat(p.valor) > 0)))
        return 'Todas as parcelas precisam ter valor maior que zero.';
      if (parcelas.some(p => !p.data_vencimento))
        return 'Preencha o vencimento de todas as parcelas.';
      for (let i = 1; i < parcelas.length; i++) {
        if (parcelas[i].data_vencimento <= parcelas[i - 1].data_vencimento)
          return `Vencimento da parcela ${i + 1} deve ser posterior à parcela ${i}.`;
      }
      const soma = parcelas.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0);
      if (Math.abs(soma - valorNum) > 0.01)
        return `Soma das parcelas (${formatBRL(soma)}) diverge do valor total (${formatBRL(valorNum)}).`;
    }
    return null;
  }

  // ── builders de payload ───────────────────────────────────────────────────
  function buildBase() {
    return {
      empresa_id:      profile.empresa_id,
      tipo:            form.tipo,
      descricao:       form.descricao.trim(),
      valor_previsto:  valorNum,
      data_emissao:    form.data_emissao,
      data_vencimento: form.data_vencimento,
      competencia:     form.competencia + '-01',
      categoria_id:    form.categoria_id,
      parceiro_id:     parceiro?.origem === 'parceiro'  ? parceiro.id : null,
      arquiteto_id:    parceiro?.origem === 'arquiteto' ? parceiro.id : null,
      cliente_id:      parceiro?.origem === 'cliente'   ? parceiro.id : null,
      projeto_id:      form.projeto_id || null,
      origem:          'manual',
      created_by:      profile.id,
    };
  }

  function buildPagamentoCampos() {
    return {
      status:          'pago',
      valor_pago:      valorNum,
      data_pagamento:  pagamento.data_pagamento,
      conta_id:        pagamento.conta_id,
      forma_pagamento: pagamento.forma_pagamento,
      taxa_percentual: pagamento.forma_pagamento === 'cartao_credito'
        ? (parseFloat(pagamento.taxa_percentual) || 0)
        : 0,
    };
  }

  // ── submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) { toast.error(erro); return; }

    setSalvando(true);
    try {
      if (editando) {
        const payload = {
          descricao:       form.descricao.trim(),
          valor_previsto:  valorNum,
          data_emissao:    form.data_emissao,
          data_vencimento: form.data_vencimento,
          competencia:     form.competencia + '-01',
          categoria_id:    form.categoria_id,
          parceiro_id:     parceiro?.origem === 'parceiro'  ? parceiro.id : null,
          arquiteto_id:    parceiro?.origem === 'arquiteto' ? parceiro.id : null,
          cliente_id:      parceiro?.origem === 'cliente'   ? parceiro.id : null,
          projeto_id:      form.projeto_id || null,
        };
        if (jaPago) {
          Object.assign(payload, buildPagamentoCampos());
        } else if (lancamentoEditando.status === 'pago') {
          Object.assign(payload, {
            status: 'pendente', valor_pago: 0,
            data_pagamento: null, conta_id: null,
            forma_pagamento: null, taxa_percentual: 0,
          });
        }
        const { error } = await supabase
          .from('financeiro_lancamentos')
          .update(payload)
          .eq('id', lancamentoEditando.id);
        if (error) throw error;
        toast.success('Lançamento atualizado.');

      } else if (parcelado) {
        const grupoId = crypto.randomUUID();
        const total   = parcelas.length;
        const payloads = parcelas.map((p, i) => ({
          ...buildBase(),
          descricao:             `${form.descricao.trim()} (${i + 1}/${total})`,
          valor_previsto:        parseFloat(p.valor),
          valor_pago:            0,
          status:                'pendente',
          data_vencimento:       p.data_vencimento,
          parcela_num:           i + 1,
          parcela_total:         total,
          grupo_parcelamento_id: grupoId,
        }));
        const { error } = await supabase.from('financeiro_lancamentos').insert(payloads);
        if (error) throw error;
        toast.success(`${total} parcelas criadas.`);

      } else {
        const payload = {
          ...buildBase(),
          status:    jaPago ? 'pago' : 'pendente',
          valor_pago: jaPago ? valorNum : 0,
          ...(jaPago ? buildPagamentoCampos() : {}),
        };
        const { error } = await supabase.from('financeiro_lancamentos').insert(payload);
        if (error) throw error;
        toast.success('Lançamento criado.');
      }

      onSalvar();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 py-6"
      onClick={onFechar}
    >
      <div
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-2xl max-h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            {editando ? 'Editar lançamento' : 'Novo lançamento'}
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="text-zinc-600 hover:text-white transition-colors"
          >
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {/* Alerta de parcelamento em modo editar */}
          {editando && lancamentoEditando?.grupo_parcelamento_id && (
            <div className="border border-amber-800/50 bg-amber-950/20 px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-amber-400 mb-1">
                Parcela {lancamentoEditando.parcela_num}/{lancamentoEditando.parcela_total}
              </p>
              <p className="text-sm text-zinc-400">
                Este lançamento é parte de um parcelamento. Edições de grupo ainda não são suportadas — você pode editar apenas este item.
              </p>
            </div>
          )}

          {/* Tipo */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Tipo</span>
            <div className="flex gap-2">
              {[{ v: 'entrada', l: 'Entrada' }, { v: 'saida', l: 'Saída' }].map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  disabled={editando}
                  onClick={() => handleTipo(v)}
                  className={`${CHIP_BASE} ${form.tipo === v ? CHIP_ON : CHIP_OFF} ${
                    editando ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <Campo label="Descrição">
            <input
              type="text"
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              className={INPUT_BASE}
              placeholder="Ex: Pagamento fornecedor de chapas"
              autoFocus
            />
          </Campo>

          {/* Valor */}
          <Campo label="Valor (R$)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.valor_previsto}
              onChange={e => set('valor_previsto', e.target.value)}
              className={INPUT_BASE}
              placeholder="0.00"
            />
          </Campo>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Data de emissão">
              <input
                type="date"
                value={form.data_emissao}
                onChange={e => set('data_emissao', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
            <Campo label="Data de vencimento">
              <input
                type="date"
                value={form.data_vencimento}
                onChange={e => set('data_vencimento', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
          </div>

          {/* Competência */}
          <Campo label="Competência">
            <input
              type="month"
              value={form.competencia}
              onChange={e => set('competencia', e.target.value)}
              className={INPUT_BASE + ' [color-scheme:dark]'}
            />
          </Campo>

          {/* Categoria */}
          <Campo label="Categoria">
            <select
              value={form.categoria_id}
              onChange={e => set('categoria_id', e.target.value)}
              className={INPUT_BASE + ' cursor-pointer'}
            >
              <option value="">— selecione —</option>
              {categoriasFiltradas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          {/* Parceiro */}
          <Campo label="Parceiro (opcional)">
            <SelectParceiroUnificado
              valor={parceiro}
              onChange={setParceiro}
              tiposPermitidos={tiposPermitidos}
              parceirosPublicos={parceirosPublicos}
              arquitetos={arquitetos}
              clientes={clientes}
            />
          </Campo>

          {/* Projeto */}
          <Campo label="Projeto (opcional)">
            <select
              value={form.projeto_id}
              onChange={e => set('projeto_id', e.target.value)}
              className={INPUT_BASE + ' cursor-pointer'}
            >
              <option value="">— sem projeto —</option>
              {projetos.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </Campo>

          <div className="border-t border-zinc-800" />

          {/* Parcelado — só em modo criar */}
          {!editando && (
            <>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={parcelado}
                  onChange={e => handleParcelado(e.target.checked)}
                  className="w-4 h-4 accent-yellow-400"
                />
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  Parcelado
                </span>
              </label>

              {parcelado && (
                <CamposParcelamento
                  parcelas={parcelas}
                  setParcelas={setParcelas}
                  valorTotal={valorNum}
                  dataPrimeiraParcela={form.data_vencimento}
                />
              )}

              <div className="border-t border-zinc-800" />
            </>
          )}

          {/* Já foi pago — oculto quando parcelado */}
          {!parcelado && (
            <>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={jaPago}
                  onChange={e => handleJaPago(e.target.checked)}
                  className="w-4 h-4 accent-yellow-400"
                />
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  Já foi pago
                </span>
              </label>

              {jaPago && (
                <div className="border border-zinc-800 p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Campo label="Conta bancária">
                      <select
                        value={pagamento.conta_id}
                        onChange={e => setPag('conta_id', e.target.value)}
                        className={INPUT_BASE + ' cursor-pointer'}
                      >
                        <option value="">— selecione —</option>
                        {contas.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Data de pagamento">
                      <input
                        type="date"
                        value={pagamento.data_pagamento}
                        onChange={e => setPag('data_pagamento', e.target.value)}
                        className={INPUT_BASE + ' [color-scheme:dark]'}
                      />
                    </Campo>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Campo label="Forma de pagamento">
                      <select
                        value={pagamento.forma_pagamento}
                        onChange={e => setPag('forma_pagamento', e.target.value)}
                        className={INPUT_BASE + ' cursor-pointer'}
                      >
                        <option value="">— selecione —</option>
                        {FORMAS_PAGAMENTO.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </Campo>

                    {pagamento.forma_pagamento === 'cartao_credito' && (
                      <Campo label="Taxa (%)">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={pagamento.taxa_percentual}
                          onChange={e => setPag('taxa_percentual', e.target.value)}
                          className={INPUT_BASE}
                          placeholder="0.00"
                        />
                      </Campo>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

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
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
