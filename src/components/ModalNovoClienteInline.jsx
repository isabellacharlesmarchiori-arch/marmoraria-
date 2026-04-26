import React, { useState, useRef } from 'react';

// Máscaras puras — react-input-mask usa ReactDOM.findDOMNode removido no React 19
function maskPhone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (!d.length) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function maskCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    // CPF
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  // CNPJ
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function cleanMasked(val) {
  if (!val) return null;
  const stripped = val.replace(/_/g, '').trim();
  const raw = stripped.replace(/[\.\-\(\)\s/]/g, '');
  return raw.length > 0 ? stripped : null;
}

// ── Primitivos de estilo ────────────────────────────────────────────────────
const INPUT_CLS =
  'w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 ' +
  'text-gray-900 dark:text-white text-sm px-3 py-2.5 outline-none ' +
  'focus:border-yellow-500 dark:focus:border-yellow-400 font-mono ' +
  'placeholder:text-gray-400 dark:placeholder:text-zinc-700';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-[9px] font-mono uppercase text-gray-500 dark:text-zinc-500 mb-1.5 block">
        {label}
        {required && <span className="text-yellow-500 dark:text-yellow-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// Campo com máscara: gerencia state interno, expõe o valor formatado via name
// para não quebrar formulário — e também aceita onChange externo opcional.
function MaskedInput({ maskFn, value, onChange, ...rest }) {
  return (
    <input
      {...rest}
      value={value}
      onChange={e => onChange(maskFn(e.target.value))}
      className={INPUT_CLS}
    />
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'basico',   label: 'Dados Básicos', icon: 'solar:user-linear' },
  { id: 'endereco', label: 'Endereço',       icon: 'solar:map-point-linear' },
];

// ── Componente principal ─────────────────────────────────────────────────────
export default function ModalNovoClienteInline({ empresaId, onClose, onCreated }) {
  const [tab, setTab] = useState('basico');

  // Aba 1 — Dados Básicos
  const [nome,     setNome]     = useState('');
  const [telefone, setTelefone] = useState('');
  const [email,    setEmail]    = useState('');
  const [cpf,      setCpf]      = useState('');
  const [rg,       setRg]       = useState('');
  const [dataNasc, setDataNasc] = useState('');

  // Aba 2 — Endereço
  const [cep,         setCep]         = useState('');
  const [rua,         setRua]         = useState('');
  const [numero,      setNumero]      = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro,      setBairro]      = useState('');
  const [cidade,      setCidade]      = useState('');
  const [estado,      setEstado]      = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepErro,     setCepErro]     = useState('');

  const cepDebounce = useRef(null);

  // ── Validação ─────────────────────────────────────────────────────────────
  const basicoOk   = nome.trim().length > 0 && cleanMasked(telefone) !== null;
  const enderecoOk =
    cep.replace(/\D/g, '').length === 8 &&
    rua.trim().length > 0 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0;
  const podeSubmeter = basicoOk && enderecoOk;

  // ── ViaCEP ────────────────────────────────────────────────────────────────
  function handleCepChange(e) {
    const raw  = e.target.value.replace(/\D/g, '').slice(0, 8);
    const mask = raw.length > 5 ? `${raw.slice(0,5)}-${raw.slice(5)}` : raw;
    setCep(mask);
    setCepErro('');
    clearTimeout(cepDebounce.current);
    if (raw.length !== 8) return;
    cepDebounce.current = setTimeout(async () => {
      setBuscandoCep(true);
      try {
        const res  = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
        const data = await res.json();
        if (data.erro) {
          setCepErro('CEP não encontrado.');
        } else {
          setRua(data.logradouro ?? '');
          setBairro(data.bairro    ?? '');
          setCidade(data.localidade ?? '');
          setEstado(data.uf         ?? '');
        }
      } catch {
        setCepErro('Erro ao buscar CEP. Preencha manualmente.');
      } finally {
        setBuscandoCep(false);
      }
    }, 400);
  }

  // ── Submit — apenas monta o objeto e devolve ao pai; quem salva é o pai ──
  function handleSubmit() {
    if (!podeSubmeter) {
      if (!basicoOk) { setTab('basico'); return; }
      setTab('endereco');
      return;
    }

    const endereco = [rua, numero, complemento, bairro, cidade, estado]
      .map(s => s.trim()).filter(Boolean).join(', ') || null;

    onCreated({
      nome:            nome.trim(),
      telefone:        cleanMasked(telefone),
      email:           email.trim() || null,
      cpf:             cleanMasked(cpf),
      rg:              rg.trim() || null,
      data_nascimento: dataNasc || null,
      endereco,
    });
  }

  // ── Indicadores de status nas tabs ────────────────────────────────────────
  const tabStatus = {
    basico:   basicoOk   ? 'ok' : nome.trim() || telefone ? 'parcial' : 'vazio',
    endereco: enderecoOk ? 'ok' : cep || rua              ? 'parcial' : 'vazio',
  };

  function StatusDot({ status }) {
    if (status === 'ok')      return <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />;
    if (status === 'parcial') return <span className="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0" />;
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-yellow-500 dark:bg-yellow-400" />
            <span className="text-gray-900 dark:text-white font-semibold uppercase tracking-tight text-sm">Novo Cliente</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors p-1"
          >
            <iconify-icon icon="solar:close-linear" width="16" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-300 dark:border-zinc-800 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-400'
                  : 'border-transparent text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'
              }`}
            >
              <StatusDot status={tabStatus[t.id]} />
              <iconify-icon icon={t.icon} width="12" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo das tabs */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

          {/* ── ABA 1: Dados Básicos ─────────────────────── */}
          {tab === 'basico' && (
            <>
              <Field label="Nome Completo" required>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  autoFocus
                  className={INPUT_CLS}
                />
              </Field>

              <Field label="Telefone" required>
                <MaskedInput
                  maskFn={maskPhone}
                  value={telefone}
                  onChange={setTelefone}
                  placeholder="(11) 99999-9999"
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className={INPUT_CLS}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="CPF / CNPJ">
                  <MaskedInput
                    maskFn={maskCPF}
                    value={cpf}
                    onChange={setCpf}
                    placeholder="000.000.000-00"
                  />
                </Field>

                <Field label="RG">
                  <input
                    type="text"
                    value={rg}
                    onChange={e => setRg(e.target.value)}
                    placeholder="00.000.000-0"
                    className={INPUT_CLS}
                  />
                </Field>
              </div>

              <Field label="Data de Nascimento">
                <input
                  type="date"
                  value={dataNasc}
                  onChange={e => setDataNasc(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setTab('endereco')}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors"
                >
                  Próximo: Endereço
                  <iconify-icon icon="solar:arrow-right-linear" width="12" />
                </button>
              </div>
            </>
          )}

          {/* ── ABA 2: Endereço ─────────────────────────── */}
          {tab === 'endereco' && (
            <>
              <Field label="CEP" required>
                <div className="relative">
                  <input
                    type="text"
                    value={cep}
                    onChange={handleCepChange}
                    placeholder="00000-000"
                    maxLength={9}
                    className={INPUT_CLS}
                  />
                  {buscandoCep && (
                    <iconify-icon
                      icon="solar:spinner-linear"
                      width="13"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin pointer-events-none"
                    />
                  )}
                  {!buscandoCep && enderecoOk && (
                    <iconify-icon
                      icon="solar:check-circle-linear"
                      width="13"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none"
                    />
                  )}
                </div>
                {cepErro && (
                  <p className="mt-1 font-mono text-[9px] text-amber-500">{cepErro}</p>
                )}
              </Field>

              <Field label="Rua / Logradouro" required>
                <input
                  type="text"
                  value={rua}
                  onChange={e => setRua(e.target.value)}
                  placeholder="Ex: Rua das Flores"
                  className={INPUT_CLS}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Número" required>
                  <input
                    type="text"
                    value={numero}
                    onChange={e => setNumero(e.target.value)}
                    placeholder="142"
                    className={INPUT_CLS}
                  />
                </Field>

                <Field label="Complemento">
                  <input
                    type="text"
                    value={complemento}
                    onChange={e => setComplemento(e.target.value)}
                    placeholder="Apto 42"
                    className={INPUT_CLS}
                  />
                </Field>
              </div>

              <Field label="Bairro" required>
                <input
                  type="text"
                  value={bairro}
                  onChange={e => setBairro(e.target.value)}
                  placeholder="Centro"
                  className={INPUT_CLS}
                />
              </Field>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <Field label="Cidade" required>
                  <input
                    type="text"
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                    placeholder="São Paulo"
                    className={INPUT_CLS}
                  />
                </Field>

                <Field label="UF" required>
                  <input
                    type="text"
                    value={estado}
                    onChange={e => setEstado(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                    className={INPUT_CLS}
                  />
                </Field>
              </div>
            </>
          )}

        </div>

        {/* Rodapé fixo */}
        <div className="px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 text-gray-700 dark:text-zinc-400 py-3 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!podeSubmeter}
            title={!podeSubmeter ? 'Preencha Nome, Telefone e Endereço completo' : ''}
            className="flex-1 bg-yellow-400 text-black font-mono font-bold text-[10px] uppercase py-3 flex items-center justify-center gap-2 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <iconify-icon icon="solar:check-circle-linear" width="13" />
            Criar e Usar
          </button>
        </div>

      </div>
    </div>
  );
}
