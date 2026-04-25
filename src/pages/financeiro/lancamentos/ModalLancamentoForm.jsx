import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';
import SelectParceiroUnificado from './SelectParceiroUnificado';
import TabelaParcelasEditavel from './TabelaParcelasEditavel';

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

const PERIODICIDADES = [
  { value: 'semanal',    label: 'Semanal (7 dias)'     },
  { value: 'quinzenal',  label: 'Quinzenal (15 dias)'  },
  { value: 'mensal',     label: 'Mensal'                },
  { value: 'bimestral',  label: 'Bimestral (2 meses)'  },
  { value: 'trimestral', label: 'Trimestral (3 meses)' },
  { value: 'semestral',  label: 'Semestral (6 meses)'  },
  { value: 'anual',      label: 'Anual (12 meses)'     },
];

const TIPOS_SAIDA = ['custo_variavel', 'custo_fixo', 'tributo', 'financeiro'];

const GRUPO_LABEL = {
  receita:        'Receitas',
  tributo:        'Deduções / Tributos',
  custo_variavel: 'Custos Variáveis',
  custo_fixo:     'Custos Fixos',
  financeiro:     'Financeiro',
};

const INPUT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full';

const CHIP_BASE = 'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors cursor-pointer';
const CHIP_ON   = 'border-yellow-400 text-yellow-400';
const CHIP_OFF  = 'border-zinc-800 text-zinc-500 hover:border-zinc-600';

// ─── helpers ─────────────────────────────────────────────────────────────────

function Campo({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</span>
        {hint && <span className="font-mono text-[8px] text-zinc-700">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function hoje() { return new Date().toISOString().split('T')[0]; }

function addIntervalo(dateISO, periodicidade) {
  const d = new Date(dateISO + 'T00:00:00');
  switch (periodicidade) {
    case 'semanal':    d.setDate(d.getDate() + 7);           break;
    case 'quinzenal':  d.setDate(d.getDate() + 15);          break;
    case 'mensal':     d.setMonth(d.getMonth() + 1);         break;
    case 'bimestral':  d.setMonth(d.getMonth() + 2);         break;
    case 'trimestral': d.setMonth(d.getMonth() + 3);         break;
    case 'semestral':  d.setMonth(d.getMonth() + 6);         break;
    case 'anual':      d.setFullYear(d.getFullYear() + 1);   break;
    default:           d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// Extrai descrição base retirando o sufixo "(X/Y)" gerado no parcelamento
function descBase(descricao) {
  return (descricao ?? '').replace(/ \(\d+\/\d+\)$/, '').trim();
}

function formVazio() {
  const h = hoje();
  return {
    tipo:            'saida',
    descricao:       '',
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

  const [form,          setFormState]    = useState(formVazio);
  const [parceiro,      setParceiro]     = useState(null);
  const [qtdParcelas,   setQtdParcelas]  = useState(1);
  const [valorParcela,  setValorParcela] = useState('');
  const [periodicidade, setPeriodicidade]= useState('mensal');
  const [salvando,      setSalvando]     = useState(false);
  const [escopoEdicao,  setEscopoEdicao] = useState('esta');
  const [parcelas,      setParcelas]     = useState([]);

  const editando = lancamentoEditando != null;
  const ehGrupo  = editando && !!lancamentoEditando?.grupo_parcelamento_id;

  const qtd             = Math.max(1, parseInt(qtdParcelas) || 1);
  const valorParcelaNum = parseFloat(valorParcela) || 0;
  const valorTotal      = qtd * valorParcelaNum;
  const multiParcelas   = qtd > 1;

  // ── inicialização ao abrir ────────────────────────────────────────────────

  useEffect(() => {
    if (!aberto) return;

    if (editando) {
      const l = lancamentoEditando;
      setFormState({
        tipo:            l.tipo,
        descricao:       descBase(l.descricao),
        data_emissao:    l.data_emissao        ?? hoje(),
        data_vencimento: l.data_vencimento     ?? hoje(),
        competencia:     (l.competencia        ?? hoje()).slice(0, 7),
        categoria_id:    l.categoria_id        ?? '',
        projeto_id:      l.projeto_id          ?? '',
      });
      setValorParcela(String(l.valor_previsto ?? ''));
      setQtdParcelas(1);
      setPeriodicidade('mensal');
      const origem = l.parceiro_id  ? 'parceiro'  :
                     l.arquiteto_id ? 'arquiteto' :
                     l.cliente_id   ? 'cliente'   : null;
      setParceiro(origem ? { id: l[origem + '_id'], origem } : null);
      setEscopoEdicao('esta');
      setParcelas([]);
    } else {
      setFormState(formVazio());
      setParceiro(null);
      setQtdParcelas(1);
      setValorParcela('');
      setPeriodicidade('mensal');
      setEscopoEdicao('esta');
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

  // Gera prévia de parcelas automaticamente quando os inputs geradores mudam
  useEffect(() => {
    if (editando || qtd <= 1 || valorParcelaNum <= 0 || !form.data_vencimento) {
      setParcelas([]);
      return;
    }
    setParcelas(
      Array.from({ length: qtd }, (_, i) => {
        let d = form.data_vencimento;
        for (let j = 0; j < i; j++) d = addIntervalo(d, periodicidade);
        return { valor: valorParcelaNum, data_vencimento: d, competencia: d.slice(0, 7) };
      })
    );
  }, [qtd, valorParcelaNum, periodicidade, form.data_vencimento, editando]);

  if (!aberto) return null;

  // ── valores computados ────────────────────────────────────────────────────

  const tiposPermitidos = form.tipo === 'entrada' ? ['cliente'] : ['parceiro', 'arquiteto'];

  const categoriasFiltradas = categorias.filter(c =>
    form.tipo === 'entrada' ? c.tipo === 'receita' : TIPOS_SAIDA.includes(c.tipo)
  );

  const categoriasPorGrupo = categoriasFiltradas.reduce((acc, c) => {
    if (!acc[c.tipo]) acc[c.tipo] = [];
    acc[c.tipo].push(c);
    return acc;
  }, {});

  // ── setters ───────────────────────────────────────────────────────────────

  function set(campo, valor) {
    setFormState(f => {
      const next = { ...f, [campo]: valor };
      // competência segue vencimento automaticamente (em modo criar, parcela única)
      if (campo === 'data_vencimento' && !editando && !multiParcelas) {
        next.competencia = valor.slice(0, 7);
      }
      return next;
    });
  }

  function setPag(campo, valor) { setPagState(f => ({ ...f, [campo]: valor })); }

  function handleTipo(t) {
    setFormState(f => ({ ...f, tipo: t, categoria_id: '' }));
    setParceiro(null);
  }

  function handleQtd(v) {
    const n = Math.max(1, parseInt(v) || 1);
    setQtdParcelas(n);
  }

  // ── validação ─────────────────────────────────────────────────────────────

  function validar() {
    if (form.descricao.trim().length < 3)
      return 'Descrição deve ter pelo menos 3 caracteres.';
    if (valorParcelaNum <= 0)
      return 'Valor da parcela deve ser maior que zero.';
    if (!form.categoria_id)
      return 'Categoria é obrigatória.';
    if (qtd < 1)
      return 'Quantidade de parcelas deve ser ≥ 1.';
    if (multiParcelas && !periodicidade)
      return 'Periodicidade é obrigatória para lançamentos parcelados.';
    if (multiParcelas && parcelas.some(p => !p.data_vencimento))
      return 'Preencha todas as datas de vencimento das parcelas.';
    if (form.data_vencimento < form.data_emissao)
      return 'Data de vencimento não pode ser anterior à data de emissão.';
    return null;
  }

  // ── builders ──────────────────────────────────────────────────────────────

  function buildBase(overrides = {}) {
    return {
      empresa_id:   profile.empresa_id,
      tipo:         form.tipo,
      descricao:    form.descricao.trim(),
      data_emissao: form.data_emissao,
      categoria_id: form.categoria_id,
      parceiro_id:  parceiro?.origem === 'parceiro'  ? parceiro.id : null,
      arquiteto_id: parceiro?.origem === 'arquiteto' ? parceiro.id : null,
      cliente_id:   parceiro?.origem === 'cliente'   ? parceiro.id : null,
      projeto_id:   form.projeto_id || null,
      origem:       'manual',
      created_by:   profile.id,
      ...overrides,
    };
  }

  // ── save: criar ───────────────────────────────────────────────────────────

  async function handleCriar() {
    if (!multiParcelas) {
      // Lançamento único — sempre criado como pendente
      const payload = {
        ...buildBase(),
        valor_previsto:  valorParcelaNum,
        valor_pago:      0,
        status:          'pendente',
        data_vencimento: form.data_vencimento,
        competencia:     form.competencia + '-01',
      };
      const { error } = await supabase.from('financeiro_lancamentos').insert(payload);
      if (error) throw error;
      toast.success('Lançamento criado.');
    } else {
      const grupoId  = crypto.randomUUID();
      const total    = parcelas.length;
      const payloads = parcelas.map((p, i) => ({
        ...buildBase(),
        descricao:             `${form.descricao.trim()} (${i + 1}/${total})`,
        valor_previsto:        p.valor,
        valor_pago:            0,
        status:                'pendente',
        data_vencimento:       p.data_vencimento,
        competencia:           p.competencia + '-01',
        parcela_num:           i + 1,
        parcela_total:         total,
        grupo_parcelamento_id: grupoId,
      }));
      const { error } = await supabase.from('financeiro_lancamentos').insert(payloads);
      if (error) throw error;
      toast.success(`${total} parcelas criadas.`);
    }
  }

  // ── save: editar ──────────────────────────────────────────────────────────

  async function handleEditar() {
    const parcelaNum   = lancamentoEditando.parcela_num;
    const parcelaTotal = lancamentoEditando.parcela_total;
    const desc         = form.descricao.trim();

    // Payload completo para edição de uma parcela individual
    const payloadUnico = {
      descricao:       ehGrupo && parcelaNum
        ? `${desc} (${parcelaNum}/${parcelaTotal})`
        : desc,
      valor_previsto:  valorParcelaNum,
      data_emissao:    form.data_emissao,
      data_vencimento: form.data_vencimento,
      competencia:     form.competencia + '-01',
      categoria_id:    form.categoria_id,
      parceiro_id:     parceiro?.origem === 'parceiro'  ? parceiro.id : null,
      arquiteto_id:    parceiro?.origem === 'arquiteto' ? parceiro.id : null,
      cliente_id:      parceiro?.origem === 'cliente'   ? parceiro.id : null,
      projeto_id:      form.projeto_id || null,
    };

    // Sem grupo, ou escopo = somente esta parcela
    if (!ehGrupo || escopoEdicao === 'esta') {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update(payloadUnico)
        .eq('id', lancamentoEditando.id);
      if (error) throw error;
      toast.success('Parcela atualizada.');
      return;
    }

    // Escopo: esta e próximas / todas
    // Para atualizações em grupo, apenas campos comuns (não as datas individuais de cada parcela)
    const payloadGrupo = {
      valor_previsto: valorParcelaNum,
      categoria_id:   form.categoria_id,
      parceiro_id:    parceiro?.origem === 'parceiro'  ? parceiro.id : null,
      arquiteto_id:   parceiro?.origem === 'arquiteto' ? parceiro.id : null,
      cliente_id:     parceiro?.origem === 'cliente'   ? parceiro.id : null,
      projeto_id:     form.projeto_id || null,
    };

    let query = supabase
      .from('financeiro_lancamentos')
      .update(payloadGrupo)
      .eq('grupo_parcelamento_id', lancamentoEditando.grupo_parcelamento_id);

    if (escopoEdicao === 'proximas') {
      query = query.gte('parcela_num', parcelaNum);
    }

    const { error } = await query;
    if (error) throw error;
    toast.success(
      escopoEdicao === 'proximas'
        ? `Parcelas ${parcelaNum}–${parcelaTotal} atualizadas.`
        : 'Todas as parcelas atualizadas.'
    );
  }

  // ── submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    try {
      if (editando) await handleEditar();
      else          await handleCriar();
      onSalvar();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao salvar.');
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
          <div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              {editando ? 'Editar lançamento' : 'Novo lançamento'}
            </span>
            {editando && ehGrupo && (
              <span className="ml-3 font-mono text-[8px] text-amber-500 border border-amber-900/50 px-1.5 py-px">
                Parcela {lancamentoEditando.parcela_num}/{lancamentoEditando.parcela_total}
              </span>
            )}
          </div>
          <button type="button" onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors">
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

          {/* ── Escopo de edição (só para parcelas em grupo) ─────────────── */}
          {ehGrupo && (
            <div className="border border-amber-900/40 bg-amber-950/15 px-4 py-3 flex flex-col gap-2">
              <span className="font-mono text-[8px] uppercase tracking-widest text-amber-500">
                Aplicar alterações em
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'esta',     l: 'Somente esta parcela' },
                  { v: 'proximas', l: `Esta e as próximas (${lancamentoEditando.parcela_num}–${lancamentoEditando.parcela_total})` },
                  { v: 'todas',    l: 'Todas as parcelas'    },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEscopoEdicao(v)}
                    className={`${CHIP_BASE} text-[9px] ${escopoEdicao === v ? CHIP_ON : CHIP_OFF}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {escopoEdicao !== 'esta' && (
                <p className="font-mono text-[8px] text-zinc-600">
                  Datas individuais de cada parcela são preservadas. Apenas valor, categoria e parceiro são atualizados em lote.
                </p>
              )}
            </div>
          )}

          {/* ── 1. Tipo ──────────────────────────────────────────────────── */}
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
                    editando ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. Descrição ─────────────────────────────────────────────── */}
          <Campo label="Descrição" hint={editando && ehGrupo ? '(sufixo de parcela adicionado automaticamente)' : undefined}>
            <input
              type="text"
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              className={INPUT_BASE}
              placeholder="Ex: Aluguel do galpão"
              autoFocus
            />
          </Campo>

          {/* ── 3. Competência (parcela única ou edição) ─────────────────── */}
          {(!multiParcelas || editando) && (
            <Campo label="Competência" hint="mês/ano ao qual o lançamento pertence na DRE">
              <input
                type="month"
                value={form.competencia}
                onChange={e => set('competencia', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
          )}

          {/* ── 4 & 5. Datas ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Data de emissão">
              <input
                type="date"
                value={form.data_emissao}
                onChange={e => set('data_emissao', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
            <Campo label={multiParcelas ? '1ª data de vencimento' : 'Data de vencimento'}>
              <input
                type="date"
                value={form.data_vencimento}
                onChange={e => set('data_vencimento', e.target.value)}
                className={INPUT_BASE + ' [color-scheme:dark]'}
              />
            </Campo>
          </div>

          {/* ── 6. Categoria ─────────────────────────────────────────────── */}
          <Campo label="Categoria">
            <select
              value={form.categoria_id}
              onChange={e => set('categoria_id', e.target.value)}
              className={INPUT_BASE + ' cursor-pointer'}
            >
              <option value="">— selecione —</option>
              {Object.entries(categoriasPorGrupo).map(([tipo, contas]) => (
                <optgroup key={tipo} label={GRUPO_LABEL[tipo] ?? tipo}>
                  {contas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Campo>

          {/* ── 7. Bloco Valor e Parcelas ─────────────────────────────────── */}
          <div className="border border-zinc-800 p-4 flex flex-col gap-4">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Valor e Parcelas
            </span>

            <div className="grid grid-cols-2 gap-4">
              {/* Qtd de parcelas */}
              <Campo label="Qtd. de parcelas">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={qtdParcelas}
                  onChange={e => handleQtd(e.target.value)}
                  className={INPUT_BASE}
                  disabled={editando}
                />
              </Campo>

              {/* Valor por parcela */}
              <Campo label="Valor por parcela (R$)">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valorParcela}
                  onChange={e => setValorParcela(e.target.value)}
                  className={INPUT_BASE}
                  placeholder="0,00"
                />
              </Campo>
            </div>

            {/* Periodicidade (só quando mais de 1 parcela) */}
            {multiParcelas && !editando && (
              <Campo label="Periodicidade">
                <select
                  value={periodicidade}
                  onChange={e => setPeriodicidade(e.target.value)}
                  className={INPUT_BASE + ' cursor-pointer'}
                >
                  {PERIODICIDADES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </Campo>
            )}

            {/* Valor total em destaque */}
            <div className="flex items-baseline justify-between pt-2 border-t border-zinc-800">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                {multiParcelas ? `Total (${qtd} × ${formatBRL(valorParcelaNum)})` : 'Valor total'}
              </span>
              <span className={`font-mono text-xl font-bold tabular-nums tracking-tight ${
                valorTotal > 0 ? 'text-yellow-400' : 'text-zinc-700'
              }`}>
                {valorTotal > 0 ? formatBRL(valorTotal) : '—'}
              </span>
            </div>

            {/* Prévia editável das parcelas */}
            {parcelas.length > 0 && (
              <TabelaParcelasEditavel
                parcelas={parcelas}
                onChange={setParcelas}
                valorTotal={valorTotal}
              />
            )}
          </div>

          {/* ── 8. Parceiro ──────────────────────────────────────────────── */}
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

          {/* ── 9. Projeto ───────────────────────────────────────────────── */}
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

          {/* Nota informativa sobre o fluxo de baixa */}
          <p className="font-mono text-[8px] text-zinc-700 leading-relaxed">
            Todo lançamento é criado como <span className="text-zinc-500">pendente</span>.
            Para registrar o pagamento, use o botão &quot;Marcar como pago&quot; na listagem.
          </p>

          {/* ── Ações ────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onFechar}
              className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <div className="flex items-center gap-4">
              {multiParcelas && !editando && (
                <span className="font-mono text-[8px] text-zinc-600">
                  {qtd} parcelas · {PERIODICIDADES.find(p => p.value === periodicidade)?.label}
                </span>
              )}
              <button
                type="submit"
                disabled={salvando}
                className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50"
              >
                {salvando
                  ? 'Salvando…'
                  : editando
                  ? 'Atualizar'
                  : multiParcelas
                  ? `Criar ${qtd} parcelas`
                  : 'Criar lançamento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
