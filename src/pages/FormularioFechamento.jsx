import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PROJETO = {
  id: '1',
  nome: 'Bancada Cozinha Silestone',
  cliente: 'Arch & Co. Arquitetura',
};

const MOCK_VERSOES = [
  { id: 'v1', nome: 'Cozinha Principal — Versão A (Silestone Blanco Zeus)', valor: 4280 },
  { id: 'v2', nome: 'Cozinha Principal — Versão B (Mármore Carrara C)',     valor: 5640 },
  { id: 'v3', nome: 'Lavabo — Versão A (Travertino Romano 2cm)',            valor: 1840 },
  { id: 'v4', nome: 'Área Gourmet — Versão Única (Granito São Gabriel)',    valor: 3100 },
];

const CHAVES_PIX = [
  'financeiro@marmoraria.com.br',
  '11.222.333/0001-44',
  '+55 11 91234-5678',
];

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'];

const MAQUININHAS = ['Stone S920', 'PagSeguro Mini', 'Cielo LIO', 'Getnet Smart', 'Rede Pop'];

const FORMAS_PAGAMENTO = [
  { id: 'pix',            label: 'Pix',            icon: 'solar:qr-code-linear'       },
  { id: 'cartao_credito', label: 'Cartão Crédito',  icon: 'solar:card-linear'          },
  { id: 'cartao_debito',  label: 'Cartão Débito',   icon: 'solar:card-recive-linear'   },
  { id: 'boleto',         label: 'Boleto',           icon: 'solar:bill-linear'          },
  { id: 'dinheiro',       label: 'Dinheiro',         icon: 'solar:banknote-linear'      },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function maskCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function Label({ children, optional = false }) {
  return (
    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1.5 flex items-center gap-2">
      {children}
      {optional && (
        <span className="text-[9px] text-zinc-700 normal-case tracking-normal font-normal">opcional</span>
      )}
    </label>
  );
}

function Input({ error, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full bg-black border ${
        error ? 'border-red-500/70 focus:border-red-400' : 'border-zinc-800 focus:border-yellow-400'
      } text-white text-sm font-mono px-3 py-3 rounded-none outline-none transition-colors placeholder:text-zinc-700 ${className}`}
    />
  );
}

function Select({ error, children, className = '', ...props }) {
  return (
    <select
      {...props}
      className={`w-full bg-black border ${
        error ? 'border-red-500/70 focus:border-red-400' : 'border-zinc-800 focus:border-yellow-400'
      } text-white text-sm font-mono px-3 py-3 rounded-none outline-none transition-colors appearance-none cursor-pointer ${className}`}
    >
      {children}
    </select>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="font-mono text-[10px] text-red-400 mt-1.5 flex items-center gap-1.5">
      <iconify-icon icon="solar:danger-triangle-linear" width="11"></iconify-icon>
      {msg}
    </p>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <div className="flex-1 h-px bg-zinc-800"></div>
    </div>
  );
}

// ── Blocos dinâmicos por forma de pagamento ───────────────────────────────────

function CamposPix({ dados, onChange, errors }) {
  return (
    <>
      <SectionDivider label="Dados do Pix" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Chave Pix da empresa</Label>
          <div className="relative">
            <Select
              value={dados.chave_pix ?? ''}
              onChange={e => onChange('chave_pix', e.target.value)}
              error={errors.chave_pix}
            >
              <option value="">Selecionar chave...</option>
              {CHAVES_PIX.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
          <FieldError msg={errors.chave_pix} />
        </div>
        <div>
          <Label>Data de recebimento</Label>
          <Input
            type="date"
            value={dados.data_recebimento ?? ''}
            onChange={e => onChange('data_recebimento', e.target.value)}
            error={errors.data_recebimento}
          />
          <FieldError msg={errors.data_recebimento} />
        </div>
        <div>
          <Label>Nome do cliente (pagador)</Label>
          <Input
            type="text"
            placeholder="Nome completo"
            value={dados.nome_cliente ?? ''}
            onChange={e => onChange('nome_cliente', e.target.value)}
            error={errors.nome_cliente}
          />
          <FieldError msg={errors.nome_cliente} />
        </div>
        <div>
          <Label optional>CPF do pagador</Label>
          <Input
            type="text"
            placeholder="000.000.000-00"
            value={dados.cpf_pagador ?? ''}
            onChange={e => onChange('cpf_pagador', maskCPF(e.target.value))}
          />
        </div>
        <div>
          <Label>Banco do cliente</Label>
          <Input
            type="text"
            placeholder="Ex: Itaú, Nubank, Bradesco..."
            value={dados.banco_cliente ?? ''}
            onChange={e => onChange('banco_cliente', e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

function CamposCartaoCredito({ dados, onChange, errors }) {
  return (
    <>
      <SectionDivider label="Dados do Cartão de Crédito" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Bandeira</Label>
          <div className="relative">
            <Select
              value={dados.bandeira ?? ''}
              onChange={e => onChange('bandeira', e.target.value)}
              error={errors.bandeira}
            >
              <option value="">Selecionar bandeira...</option>
              {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
          <FieldError msg={errors.bandeira} />
        </div>
        <div>
          <Label>Nº de parcelas</Label>
          <div className="relative">
            <Select
              value={dados.parcelas ?? ''}
              onChange={e => onChange('parcelas', e.target.value)}
              error={errors.parcelas}
            >
              <option value="">Selecionar...</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                <option key={n} value={n}>{n}× {n === 1 ? '(à vista)' : ''}</option>
              ))}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
          <FieldError msg={errors.parcelas} />
        </div>
        <div>
          <Label>Data da 1ª cobrança</Label>
          <Input
            type="date"
            value={dados.data_primeira_cobranca ?? ''}
            onChange={e => onChange('data_primeira_cobranca', e.target.value)}
            error={errors.data_primeira_cobranca}
          />
          <FieldError msg={errors.data_primeira_cobranca} />
        </div>
        <div>
          <Label>Maquininha</Label>
          <div className="relative">
            <Select
              value={dados.maquininha ?? ''}
              onChange={e => onChange('maquininha', e.target.value)}
            >
              <option value="">Selecionar maquininha...</option>
              {MAQUININHAS.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
        </div>
      </div>
    </>
  );
}

function CamposCartaoDebito({ dados, onChange, errors }) {
  return (
    <>
      <SectionDivider label="Dados do Cartão de Débito" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Bandeira</Label>
          <div className="relative">
            <Select
              value={dados.bandeira ?? ''}
              onChange={e => onChange('bandeira', e.target.value)}
              error={errors.bandeira}
            >
              <option value="">Selecionar bandeira...</option>
              {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
          <FieldError msg={errors.bandeira} />
        </div>
        <div>
          <Label>Data da cobrança</Label>
          <Input
            type="date"
            value={dados.data_cobranca ?? ''}
            onChange={e => onChange('data_cobranca', e.target.value)}
            error={errors.data_cobranca}
          />
          <FieldError msg={errors.data_cobranca} />
        </div>
        <div>
          <Label>Maquininha</Label>
          <div className="relative">
            <Select
              value={dados.maquininha ?? ''}
              onChange={e => onChange('maquininha', e.target.value)}
            >
              <option value="">Selecionar maquininha...</option>
              {MAQUININHAS.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
          </div>
        </div>
      </div>
    </>
  );
}

function CamposBoleto({ dados, onChange, errors }) {
  return (
    <>
      <SectionDivider label="Dados do Boleto" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Banco emissor</Label>
          <Input
            type="text"
            placeholder="Ex: Bradesco, Itaú, Santander..."
            value={dados.banco ?? ''}
            onChange={e => onChange('banco', e.target.value)}
            error={errors.banco}
          />
          <FieldError msg={errors.banco} />
        </div>
        <div>
          <Label>Data de vencimento</Label>
          <Input
            type="date"
            value={dados.vencimento ?? ''}
            onChange={e => onChange('vencimento', e.target.value)}
            error={errors.vencimento}
          />
          <FieldError msg={errors.vencimento} />
        </div>
        <div>
          <Label>Dados bancários do cliente</Label>
          <Input
            type="text"
            placeholder="Ag. 0000 · CC. 00000-0 · banco"
            value={dados.dados_bancarios_cliente ?? ''}
            onChange={e => onChange('dados_bancarios_cliente', e.target.value)}
            error={errors.dados_bancarios_cliente}
          />
          <FieldError msg={errors.dados_bancarios_cliente} />
          <p className="font-mono text-[9px] text-zinc-700 mt-1.5 flex items-center gap-1">
            <iconify-icon icon="solar:lock-linear" width="9"></iconify-icon>
            Visível apenas para administradores
          </p>
        </div>
        <div>
          <Label optional>CPF/CNPJ do sacado</Label>
          <Input
            type="text"
            placeholder="000.000.000-00"
            value={dados.cpf_sacado ?? ''}
            onChange={e => onChange('cpf_sacado', maskCPF(e.target.value))}
          />
        </div>
      </div>
    </>
  );
}

function CamposDinheiro({ dados, onChange, errors }) {
  return (
    <>
      <SectionDivider label="Dados do Pagamento em Dinheiro" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Data de recebimento</Label>
          <Input
            type="date"
            value={dados.data_recebimento ?? ''}
            onChange={e => onChange('data_recebimento', e.target.value)}
            error={errors.data_recebimento}
          />
          <FieldError msg={errors.data_recebimento} />
        </div>
        <div>
          <Label optional>Troco (R$)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-600 pointer-events-none">R$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={dados.troco ?? ''}
              onChange={e => onChange('troco', e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

export default function FormularioFechamento() {
  const navigate  = useNavigate();
  const { id: projetoId } = useParams();

  // ── Estado do formulário ──────────────────────

  const [form, setForm] = useState({
    data_fechamento: hoje(),
    versao_id:       '',
    valor_fechado:   '',
    forma_pagamento: '',
  });

  const [dadosDinamicos, setDadosDinamicos] = useState({});
  const [errors, setErrors]                 = useState({});
  const [errDin, setErrDin]                 = useState({});
  const [loading, setLoading]               = useState(false);
  const [sucesso, setSucesso]               = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { threshold: 0.05 }
    );
    document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Preenche valor automaticamente ao selecionar versão
  useEffect(() => {
    if (form.versao_id) {
      const v = MOCK_VERSOES.find(x => x.id === form.versao_id);
      if (v) setForm(prev => ({ ...prev, valor_fechado: String(v.valor) }));
    }
  }, [form.versao_id]);

  // Limpa dados dinâmicos ao trocar forma de pagamento
  useEffect(() => {
    setDadosDinamicos({});
    setErrDin({});
  }, [form.forma_pagamento]);

  // ── Handlers ───────────────────────────────────

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  }

  function setDin(key, value) {
    setDadosDinamicos(prev => ({ ...prev, [key]: value }));
    setErrDin(prev => ({ ...prev, [key]: '' }));
  }

  function validate() {
    const e = {};
    if (!form.data_fechamento) e.data_fechamento = 'Campo obrigatório';
    if (!form.versao_id)       e.versao_id       = 'Selecione a versão fechada';
    if (!form.valor_fechado || isNaN(parseFloat(form.valor_fechado)) || parseFloat(form.valor_fechado) <= 0)
      e.valor_fechado = 'Informe um valor válido';
    if (!form.forma_pagamento) e.forma_pagamento = 'Selecione a forma de pagamento';
    setErrors(e);

    const ed = {};
    if (form.forma_pagamento === 'pix') {
      if (!dadosDinamicos.chave_pix)        ed.chave_pix        = 'Selecione a chave Pix';
      if (!dadosDinamicos.data_recebimento) ed.data_recebimento = 'Informe a data';
      if (!dadosDinamicos.nome_cliente)     ed.nome_cliente     = 'Campo obrigatório';
    }
    if (form.forma_pagamento === 'cartao_credito') {
      if (!dadosDinamicos.bandeira)               ed.bandeira               = 'Selecione a bandeira';
      if (!dadosDinamicos.parcelas)               ed.parcelas               = 'Selecione o nº de parcelas';
      if (!dadosDinamicos.data_primeira_cobranca) ed.data_primeira_cobranca = 'Informe a data';
    }
    if (form.forma_pagamento === 'cartao_debito') {
      if (!dadosDinamicos.bandeira)     ed.bandeira     = 'Selecione a bandeira';
      if (!dadosDinamicos.data_cobranca) ed.data_cobranca = 'Informe a data';
    }
    if (form.forma_pagamento === 'boleto') {
      if (!dadosDinamicos.banco)      ed.banco      = 'Informe o banco';
      if (!dadosDinamicos.vencimento) ed.vencimento = 'Informe o vencimento';
      if (!dadosDinamicos.dados_bancarios_cliente) ed.dados_bancarios_cliente = 'Campo obrigatório';
    }
    if (form.forma_pagamento === 'dinheiro') {
      if (!dadosDinamicos.data_recebimento) ed.data_recebimento = 'Informe a data';
    }
    setErrDin(ed);

    return Object.keys(e).length === 0 && Object.keys(ed).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    // TODO: salvar no Supabase (fechamentos table) + atualizar status do projeto
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setSucesso(true);
  }

  // ── Versão selecionada (para exibir valor de referência) ──
  const versaoSel = MOCK_VERSOES.find(v => v.id === form.versao_id);
  const valorNum  = parseFloat(form.valor_fechado) || 0;
  const formaSel  = FORMAS_PAGAMENTO.find(f => f.id === form.forma_pagamento);

  // ── Tela de sucesso ───────────────────────────

  if (sucesso) {
    return (
      <div className="bg-[#050505] text-[#a1a1aa] min-h-screen font-sans flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 border border-green-400/30 bg-green-400/5 flex items-center justify-center mx-auto mb-6">
            <iconify-icon icon="solar:check-circle-linear" width="28" className="text-green-400"></iconify-icon>
          </div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-green-400 mb-2">Fechamento registrado</div>
          <h2 className="text-xl font-semibold text-white tracking-tight mb-1">{MOCK_PROJETO.nome}</h2>
          <p className="font-mono text-[11px] text-zinc-500 mb-1">{MOCK_PROJETO.cliente}</p>
          <p className="text-2xl font-semibold text-yellow-400 mt-4 mb-6">
            {fmt(valorNum)}
          </p>
          <div className="bg-[#0a0a0a] border border-zinc-800 px-4 py-3 mb-8 text-left">
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-900">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Versão</span>
              <span className="font-mono text-[10px] text-zinc-300 text-right max-w-[60%]">{versaoSel?.nome}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-900">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Forma de pagamento</span>
              <span className="font-mono text-[10px] text-zinc-300">{formaSel?.label}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Data de fechamento</span>
              <span className="font-mono text-[10px] text-zinc-300">
                {form.data_fechamento
                  ? new Date(form.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/projetos/${projetoId ?? '1'}`)}
            className="w-full bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest py-3 hover:bg-yellow-300 transition-colors font-bold flex items-center justify-center gap-2"
          >
            <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
            Voltar ao projeto
          </button>
        </div>
      </div>
    );
  }

  // ── Formulário ────────────────────────────────

  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen font-sans pb-10">

      {/* ── Cabeçalho ──────────────────────────────── */}
      <div className="sys-reveal px-6 pt-6 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-600 mb-3">
          <span
            className="hover:text-zinc-400 cursor-pointer transition-colors"
            onClick={() => navigate(`/projetos/${projetoId ?? '1'}`)}
          >
            {MOCK_PROJETO.nome}
          </span>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10"></iconify-icon>
          <span className="text-white">Registrar fechamento</span>
        </div>

        <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">
          12 // Fechamento
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Registrar fechamento</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1.5">
                <iconify-icon icon="solar:buildings-linear" width="11"></iconify-icon>
                {MOCK_PROJETO.nome}
              </span>
              <span className="text-zinc-800">·</span>
              <span className="font-mono text-[10px] text-zinc-600">{MOCK_PROJETO.cliente}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/projetos/${projetoId ?? '1'}`)}
            className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-3 py-2 transition-colors flex items-center gap-2 shrink-0"
          >
            <iconify-icon icon="solar:arrow-left-linear" width="12"></iconify-icon>
            Cancelar
          </button>
        </div>
      </div>

      {/* ── Formulário ─────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-6 max-w-2xl flex flex-col gap-8">

          {/* ── Seção 1: Dados gerais ── */}
          <div className="sys-reveal">
            <SectionDivider label="Dados do fechamento" />

            <div className="flex flex-col gap-4">

              {/* Versão fechada */}
              <div>
                <Label>Versão / orçamento fechado</Label>
                <div className="relative">
                  <Select
                    value={form.versao_id}
                    onChange={e => setField('versao_id', e.target.value)}
                    error={errors.versao_id}
                  >
                    <option value="">Selecionar versão...</option>
                    {MOCK_VERSOES.map(v => (
                      <option key={v.id} value={v.id}>{v.nome} — {fmt(v.valor)}</option>
                    ))}
                  </Select>
                  <iconify-icon icon="solar:alt-arrow-down-linear" width="12" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"></iconify-icon>
                </div>
                <FieldError msg={errors.versao_id} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Data de fechamento */}
                <div>
                  <Label>Data de fechamento</Label>
                  <Input
                    type="date"
                    value={form.data_fechamento}
                    onChange={e => setField('data_fechamento', e.target.value)}
                    error={errors.data_fechamento}
                  />
                  <FieldError msg={errors.data_fechamento} />
                </div>

                {/* Valor fechado */}
                <div>
                  <Label>Valor fechado (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-600 pointer-events-none">R$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={versaoSel ? String(versaoSel.valor) : '0,00'}
                      value={form.valor_fechado}
                      onChange={e => setField('valor_fechado', e.target.value)}
                      error={errors.valor_fechado}
                      className="pl-9"
                    />
                  </div>
                  <FieldError msg={errors.valor_fechado} />
                  {versaoSel && valorNum !== versaoSel.valor && valorNum > 0 && (
                    <p className="font-mono text-[9px] text-yellow-400/70 mt-1.5 flex items-center gap-1.5">
                      <iconify-icon icon="solar:info-circle-linear" width="10"></iconify-icon>
                      Difere do orçamento ({fmt(versaoSel.valor)})
                    </p>
                  )}
                </div>
              </div>

              {/* Forma de pagamento */}
              <div>
                <Label>Forma de pagamento</Label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {FORMAS_PAGAMENTO.map(fp => (
                    <button
                      key={fp.id}
                      type="button"
                      onClick={() => setField('forma_pagamento', fp.id)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 border transition-colors ${
                        form.forma_pagamento === fp.id
                          ? 'border-yellow-400/40 bg-yellow-400/[0.04] text-yellow-400'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      <iconify-icon icon={fp.icon} width="18"></iconify-icon>
                      <span className="font-mono text-[9px] uppercase tracking-widest leading-tight text-center">{fp.label}</span>
                    </button>
                  ))}
                </div>
                <FieldError msg={errors.forma_pagamento} />
              </div>
            </div>
          </div>

          {/* ── Seção 2: Campos dinâmicos ── */}
          {form.forma_pagamento && (
            <div className="sys-reveal">
              {form.forma_pagamento === 'pix'            && <CamposPix            dados={dadosDinamicos} onChange={setDin} errors={errDin} />}
              {form.forma_pagamento === 'cartao_credito' && <CamposCartaoCredito  dados={dadosDinamicos} onChange={setDin} errors={errDin} />}
              {form.forma_pagamento === 'cartao_debito'  && <CamposCartaoDebito   dados={dadosDinamicos} onChange={setDin} errors={errDin} />}
              {form.forma_pagamento === 'boleto'         && <CamposBoleto         dados={dadosDinamicos} onChange={setDin} errors={errDin} />}
              {form.forma_pagamento === 'dinheiro'       && <CamposDinheiro       dados={dadosDinamicos} onChange={setDin} errors={errDin} />}
            </div>
          )}

          {/* ── Resumo visual antes do submit ── */}
          {form.versao_id && valorNum > 0 && form.forma_pagamento && (
            <div className="sys-reveal bg-[#0a0a0a] border border-zinc-800 px-5 py-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-3">Resumo do fechamento</div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Projeto',    value: MOCK_PROJETO.nome    },
                  { label: 'Cliente',    value: MOCK_PROJETO.cliente },
                  { label: 'Versão',     value: versaoSel?.nome      },
                  { label: 'Pagamento',  value: formaSel?.label      },
                  {
                    label: 'Data',
                    value: form.data_fechamento
                      ? new Date(form.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')
                      : '—',
                  },
                ].map(item => (
                  <div key={item.label} className="flex items-start justify-between gap-4 py-1.5 border-b border-zinc-900 last:border-b-0">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 shrink-0">{item.label}</span>
                    <span className="font-mono text-[10px] text-zinc-300 text-right">{item.value ?? '—'}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-zinc-700">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Valor fechado</span>
                <span className="text-xl font-semibold text-yellow-400">{fmt(valorNum)}</span>
              </div>
            </div>
          )}

          {/* ── Botão confirmar ── */}
          <div className="sys-reveal flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(`/projetos/${projetoId ?? '1'}`)}
              className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[11px] uppercase tracking-widest py-3.5 hover:border-zinc-600 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-[2] bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest py-3.5 hover:bg-yellow-300 transition-colors font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>
                  Registrando...
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                  Confirmar fechamento e aprovar projeto
                </>
              )}
            </button>
          </div>

        </div>
      </form>
    </div>
  );
}
