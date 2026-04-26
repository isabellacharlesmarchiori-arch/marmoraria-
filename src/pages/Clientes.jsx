import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// ── Máscaras nativas ──────────────────────────────────────────────────────────
function maskCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function maskPhone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (!d.length) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function maskCEP(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

// ── Validações ────────────────────────────────────────────────────────────────
function validarCPF(cpf) {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = 11 - (s % 11);
  if ((r >= 10 ? 0 : r) !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = 11 - (s % 11);
  return (r >= 10 ? 0 : r) === parseInt(d[10]);
}

function validarRG(rg) {
  const d = rg.replace(/\D/g, '');
  return d.length >= 7 && d.length <= 9;
}

// ── Endereço helpers ──────────────────────────────────────────────────────────
// Endereço é armazenado como JSON no campo `endereco` (texto). Legacy: string plain.
function parseAddress(endStr) {
  const empty = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
  if (!endStr) return empty;
  try {
    const p = JSON.parse(endStr);
    if (p && typeof p === 'object' && !Array.isArray(p)) return { ...empty, ...p };
  } catch {}
  return { ...empty, rua: endStr };
}

function formatAddressDisplay(endStr) {
  if (!endStr) return null;
  try {
    const a = JSON.parse(endStr);
    if (a && typeof a === 'object') {
      const line1 = [a.rua, a.numero].filter(Boolean).join(', ');
      const line2 = a.complemento || '';
      const line3 = [a.bairro, a.cidade, a.estado].filter(Boolean).join(' — ');
      const cep   = a.cep ? `CEP ${a.cep}` : '';
      return [line1, line2, line3, cep].filter(Boolean).join('\n');
    }
  } catch {}
  return endStr;
}

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

// ── Componentes de campo para TabArquitetos (uncontrolled) ────────────────────
const FIELD_CLS = 'w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 outline-none focus:border-yellow-500 dark:focus:border-yellow-400 font-mono resize-none';

function Field({ label, name, type = 'text', defaultValue = '', required = false, span2 = false, textarea = false }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">{label}{required && <span className="text-yellow-600 dark:text-yellow-400 ml-0.5">*</span>}</label>
      {textarea
        ? <textarea name={name} rows="2" defaultValue={defaultValue} className={FIELD_CLS} />
        : <input name={name} type={type} defaultValue={defaultValue} required={required} className={FIELD_CLS} />}
    </div>
  );
}

function MaskedField({ label, name, maskFn, defaultValue = '', required = false, span2 = false }) {
  const [val, setVal] = useState(() => maskFn(defaultValue ?? ''));
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">{label}{required && <span className="text-yellow-600 dark:text-yellow-400 ml-0.5">*</span>}</label>
      <input name={name} value={val} onChange={e => setVal(maskFn(e.target.value))} required={required} className={FIELD_CLS} />
    </div>
  );
}

// ── STATUS ────────────────────────────────────────────────────────────────────
const statusColors = {
  orcado:     'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-300 dark:border-zinc-700',
  aprovado:   'bg-gray-100 dark:bg-[#020202] text-gray-900 dark:text-white border-gray-400 dark:border-white',
  produzindo: 'bg-gray-100 dark:bg-zinc-900 text-yellow-700 dark:text-yellow-400 border-yellow-500 dark:border-yellow-400',
  entregue:   'bg-gray-100 dark:bg-[#050505] text-gray-500 dark:text-zinc-400 border-gray-400 dark:border-zinc-600',
  perdido:    'bg-gray-100 dark:bg-zinc-950 text-gray-400 dark:text-zinc-500 border-gray-300 dark:border-zinc-800 line-through',
};
const statusLabels = { orcado: 'Orçado', aprovado: 'Aprovado', produzindo: 'Produzindo', entregue: 'Entregue', perdido: 'Perdido' };

const statusPedidoColors = {
  FECHADO:   'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700/60',
  ORCAMENTO: 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border-gray-300 dark:border-zinc-700',
};

// ── MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ─────────────────────────────────────────
function ConfirmDeleteModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="modal-content bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-tight flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-red-500"></span>{title}
        </h2>
        <p className="text-gray-600 dark:text-zinc-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 font-mono text-[10px] uppercase border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 bg-red-500/10 text-red-600 dark:text-red-500 font-mono font-bold text-[10px] uppercase py-3 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all">Excluir</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ABA CLIENTES
// ═══════════════════════════════════════════════════════════════════════════════
function TabClientes({ empresaId, session, isAdmin }) {
  // ── list state ──
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  // ── controlled form state ──
  const [form, setForm] = useState({});
  const [loadingCep, setLoadingCep] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // ── load ──
  useEffect(() => {
    if (!session || !empresaId) return;
    setLoading(true);
    supabase
      .from('clientes')
      .select('*, projetos(id, nome, status, status_pedido, created_at)')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        setClientes((data ?? []).map(c => ({
          ...c,
          projetos: (c.projetos ?? []).map(p => ({ ...p, data: p.created_at?.slice(0, 10) ?? '' })),
        })));
        setLoading(false);
      });
  }, [session, empresaId]);

  useEffect(() => {
    document.querySelectorAll('.sys-reveal').forEach(el => el.classList.add('sys-active'));
  }, [clientes, selected, isModalOpen]);

  useEffect(() => { setCurrentPage(0); }, [searchTerm]);

  // ── filter / page ──
  const filtered = clientes.filter(c => {
    const t = searchTerm.toLowerCase();
    return c.nome.toLowerCase().includes(t) ||
      (c.telefone ?? '').toLowerCase().includes(t) ||
      (c.email ?? '').toLowerCase().includes(t);
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const filteredPage = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // ── modal helpers ──
  const setF = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setFormErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const openModal = (cli = null) => {
    setEditing(cli);
    const addr = cli ? parseAddress(cli.endereco) : { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
    setForm({
      nome:            cli?.nome            ?? '',
      cpf:             cli?.cpf             ?? '',
      rg:              cli?.rg              ?? '',
      telefone:        cli?.telefone        ?? '',
      email:           cli?.email           ?? '',
      data_nascimento: cli?.data_nascimento ?? '',
      ...addr,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setEditing(null);
    setIsModalOpen(false);
    setForm({});
    setFormErrors({});
  };

  // ── ViaCEP ──
  const buscarCep = async (cep) => {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setLoadingCep(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          rua:    data.logradouro || prev.rua,
          bairro: data.bairro     || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf         || prev.estado,
        }));
        setFormErrors(prev => ({ ...prev, cep: undefined, rua: undefined, bairro: undefined, cidade: undefined, estado: undefined }));
      } else {
        setFormErrors(prev => ({ ...prev, cep: 'CEP não encontrado' }));
      }
    } catch {
      setFormErrors(prev => ({ ...prev, cep: 'Erro ao buscar CEP' }));
    } finally {
      setLoadingCep(false);
    }
  };

  // ── validation ──
  const validateForm = () => {
    const e = {};
    if (!form.nome?.trim())    e.nome    = 'Campo obrigatório';
    if (!form.telefone?.trim()) e.telefone = 'Campo obrigatório';
    if (!form.cep?.trim())     e.cep     = 'Campo obrigatório';
    if (!form.rua?.trim())     e.rua     = 'Campo obrigatório';
    if (!form.numero?.trim())  e.numero  = 'Campo obrigatório';
    if (!form.bairro?.trim())  e.bairro  = 'Campo obrigatório';
    if (!form.cidade?.trim())  e.cidade  = 'Campo obrigatório';
    if (!form.estado?.trim())  e.estado  = 'Campo obrigatório';
    const cpfDigits = (form.cpf || '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && !validarCPF(form.cpf || '')) e.cpf = 'CPF inválido';
    if (form.rg?.trim() && !validarRG(form.rg)) e.rg = 'RG deve ter 7 a 9 dígitos';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── save ──
  const handleSave = async (ev) => {
    ev.preventDefault();
    if (!validateForm()) return;
    const payload = {
      nome:            form.nome.trim(),
      cpf:             form.cpf             || null,
      rg:              form.rg              || null,
      telefone:        form.telefone        || null,
      email:           form.email           || null,
      data_nascimento: form.data_nascimento || null,
      endereco: JSON.stringify({
        cep:          form.cep,
        rua:          form.rua,
        numero:       form.numero,
        complemento:  form.complemento,
        bairro:       form.bairro,
        cidade:       form.cidade,
        estado:       form.estado,
      }),
      empresa_id: empresaId,
    };
    try {
      if (editing) {
        const { data, error } = await supabase.from('clientes').update(payload).eq('id', editing.id).select().single();
        if (error) throw error;
        const updated = { ...editing, ...data };
        setClientes(prev => prev.map(c => c.id === editing.id ? updated : c));
        if (selected?.id === editing.id) setSelected(updated);
      } else {
        const { data, error } = await supabase.from('clientes').insert(payload).select().single();
        if (error) throw error;
        setClientes(prev => [...prev, { ...data, projetos: [] }]);
      }
      closeModal();
    } catch (err) { alert(err.message); }
  };

  // ── other handlers ──
  const handleDelete = async () => {
    const { error } = await supabase.from('clientes').delete().eq('id', deleteId);
    if (error) { alert(error.message); return; }
    setClientes(prev => prev.filter(c => c.id !== deleteId));
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
  };

  const handleReativarProjeto = async (e, proj) => {
    e.stopPropagation();
    const { error } = await supabase.from('projetos').update({ status: 'orcado' }).eq('id', proj.id);
    if (error) { alert(error.message); return; }
    const updated = selected.projetos.map(p => p.id === proj.id ? { ...p, status: 'orcado' } : p);
    setSelected({ ...selected, projetos: updated });
    setClientes(prev => prev.map(c => c.id === selected.id ? { ...c, projetos: updated } : c));
  };

  const handleVoltarParaOrcamento = async (e, proj) => {
    e.stopPropagation();
    if (!window.confirm(`Reverter "${proj.nome}" para status de orçamento? Os cenários descartados dentro dos 7 dias serão restaurados.`)) return;
    try {
      await supabase.from('projetos').update({ status_pedido: 'ORCAMENTO' }).eq('id', proj.id);
      await supabase.from('pedidos_fechados').update({ status: 'REVERTIDO' })
        .eq('projeto_id', proj.id).eq('status', 'FECHADO');
      const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: ambsData } = await supabase.from('ambientes').select('id').eq('projeto_id', proj.id);
      const ambIds = (ambsData ?? []).map(a => a.id);
      if (ambIds.length) {
        await supabase.from('orcamentos')
          .update({ descartado_em: null })
          .in('ambiente_id', ambIds)
          .not('descartado_em', 'is', null)
          .gt('descartado_em', limite);
      }
      const updated = selected.projetos.map(p => p.id === proj.id ? { ...p, status_pedido: 'ORCAMENTO' } : p);
      setSelected({ ...selected, projetos: updated });
      setClientes(prev => prev.map(c => c.id === selected.id ? { ...c, projetos: updated } : c));
    } catch (err) { alert('Erro: ' + err.message); }
  };

  // ── field class (red on error, green when explicitly valid) ──
  const cpfDigits = (form.cpf || '').replace(/\D/g, '');
  const cpfOk = cpfDigits.length === 11 && validarCPF(form.cpf || '');
  const rgOk  = !!(form.rg?.trim() && validarRG(form.rg));

  const fc = (field, isValid) => {
    const base = 'w-full bg-gray-50 dark:bg-black text-gray-900 dark:text-white text-sm px-4 py-3 outline-none font-mono border transition-colors ';
    if (formErrors[field]) return base + 'border-red-500 dark:border-red-500';
    if (isValid)           return base + 'border-green-500 dark:border-green-500';
    return base + 'border-gray-300 dark:border-zinc-800 focus:border-yellow-500 dark:focus:border-yellow-400';
  };

  // ── render ──
  return (
    <div className="lg:flex lg:gap-8 h-full">
      {/* Lista */}
      <div className={`flex-1 flex flex-col h-full bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 ${selected ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-6 border-b border-gray-300 dark:border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            </span>
            <button onClick={() => openModal()} className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all flex items-center gap-2">
              <iconify-icon icon="solar:user-plus-linear" width="14"></iconify-icon> Novo Cliente
            </button>
          </div>
          <div className="relative">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-600"></iconify-icon>
            <input type="text" placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-10 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-300 dark:text-zinc-700 animate-pulse font-mono text-[10px] uppercase">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-300 dark:text-zinc-700 font-mono text-[10px] uppercase">Nenhum cliente encontrado</div>
          ) : filteredPage.map(cli => (
            <div key={cli.id} onClick={() => setSelected(cli)}
              className={`sys-reveal p-4 border transition-all cursor-pointer group ${selected?.id === cli.id ? 'border-yellow-500 dark:border-yellow-400 bg-yellow-50 dark:bg-zinc-900/40' : 'border-gray-300 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className={`font-medium ${selected?.id === cli.id ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>{cli.nome}</h3>
                  <div className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 uppercase mt-1 flex items-center gap-3">
                    <span>{cli.projetos?.length ?? 0} Projetos</span>
                    <span>•</span>
                    <span>{cli.telefone || 'Sem fone'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); openModal(cli); }} className="p-2 border border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                    <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                  </button>
                  {isAdmin && (
                    <button onClick={e => { e.stopPropagation(); setDeleteId(cli.id); }} className="p-2 border border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 hover:border-red-400/50 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="border-t border-gray-300 dark:border-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest">
              Página {currentPage + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <iconify-icon icon="solar:arrow-left-linear" width="11"></iconify-icon> Anterior
              </button>
              <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Próxima <iconify-icon icon="solar:arrow-right-linear" width="11"></iconify-icon>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ficha */}
      {selected ? (
        <div className="flex-[1.4] bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 flex flex-col h-full overflow-hidden sys-reveal relative">
          <button onClick={() => setSelected(null)} className="lg:hidden absolute top-4 left-4 z-20 text-gray-500 dark:text-zinc-500 flex items-center gap-2 font-mono text-[10px] uppercase">
            <iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Voltar
          </button>
          <div className="p-6 border-b border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/40">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 border border-gray-300 dark:border-zinc-800 px-2 py-1">ID_{selected.id.slice(0, 8)}</div>
              <button onClick={() => openModal(selected)} className="text-[10px] font-mono uppercase bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-zinc-400 px-4 py-2 hover:text-gray-900 dark:hover:text-white transition-colors">Editar</button>
            </div>
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tighter uppercase mb-5">{selected.nome}</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Telefone',   value: selected.telefone },
                { label: 'Email',      value: selected.email },
                { label: 'CPF',        value: selected.cpf },
                { label: 'RG',         value: selected.rg },
                { label: 'Nascimento', value: selected.data_nascimento },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 border border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/20">
                  <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-600 uppercase mb-1">{label}</div>
                  <div className="text-gray-700 dark:text-zinc-300 font-mono text-xs">{value || '—'}</div>
                </div>
              ))}
              <div className="col-span-2 p-3 border border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/20">
                <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-600 uppercase mb-1">Endereço</div>
                <div className="text-gray-700 dark:text-zinc-300 font-mono text-xs whitespace-pre-line">
                  {formatAddressDisplay(selected.endereco) || '—'}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4 border-l-2 border-yellow-500 dark:border-yellow-400 pl-3">Projetos</h3>
            {(selected.projetos?.length ?? 0) === 0 ? (
              <div className="py-16 text-center border border-dashed border-gray-300 dark:border-zinc-800 text-gray-300 dark:text-zinc-700 font-mono text-[10px] uppercase">Nenhum projeto</div>
            ) : selected.projetos.map(proj => (
              <div key={proj.id} className={`p-4 border bg-gray-50/50 dark:bg-zinc-950/20 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors flex items-center justify-between group/proj mb-2 ${proj.status_pedido === 'FECHADO' ? 'border-blue-200 dark:border-blue-900/60' : 'border-gray-100 dark:border-zinc-900'}`}>
                <div>
                  <span className="text-gray-800 dark:text-zinc-200 font-medium uppercase text-sm">{proj.nome}</span>
                  <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 uppercase ml-3">Criado {proj.data}</span>
                </div>
                <div className="flex items-center gap-2">
                  {proj.status === 'perdido' && (
                    <button onClick={e => handleReativarProjeto(e, proj)} className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono uppercase border border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-400/10 transition-colors">
                      <iconify-icon icon="solar:restart-linear" width="12"></iconify-icon> Reativar
                    </button>
                  )}
                  {proj.status_pedido === 'FECHADO' && (
                    <>
                      <div className={`px-2 py-1 text-[9px] font-mono uppercase border flex items-center gap-1 ${statusPedidoColors.FECHADO}`}>
                        <iconify-icon icon="solar:lock-keyhole-minimalistic-bold" width="10"></iconify-icon> Fechado
                      </div>
                      {isAdmin && (
                        <button onClick={e => handleVoltarParaOrcamento(e, proj)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono uppercase border border-red-700/40 text-red-500 dark:text-red-400 hover:bg-red-400/10 hover:border-red-500/60 transition-colors">
                          <iconify-icon icon="solar:refresh-linear" width="11"></iconify-icon> Voltar para Orçamento
                        </button>
                      )}
                    </>
                  )}
                  <div className={`px-2 py-1 text-[9px] font-mono uppercase border ${statusColors[proj.status] || statusColors.orcado}`}>
                    {statusLabels[proj.status] || 'Orçado'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-[1.4] bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 items-center justify-center">
          <div className="text-center">
            <iconify-icon icon="solar:users-group-two-rounded-linear" width="48" className="text-gray-200 dark:text-zinc-800 mb-4 mx-auto block"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Selecione um cliente</p>
          </div>
        </div>
      )}

      {/* Modal Criar/Editar Cliente */}
      {isModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-gray-100 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 w-full max-w-xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 dark:text-white uppercase mb-6 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-yellow-500 dark:bg-yellow-400"></span>
              {editing ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
            <form onSubmit={handleSave} noValidate className="flex flex-col gap-6">

              {/* Dados Pessoais */}
              <div>
                <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-500 uppercase tracking-widest pb-2 mb-4 border-b border-gray-200 dark:border-zinc-800">Dados Pessoais</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Nome Completo <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.nome ?? ''} onChange={e => setF('nome', e.target.value)} className={fc('nome')} />
                    {formErrors.nome && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.nome}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Telefone <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.telefone ?? ''} onChange={e => setF('telefone', maskPhone(e.target.value))} className={fc('telefone')} placeholder="(00) 00000-0000" />
                    {formErrors.telefone && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.telefone}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Email</label>
                    <input type="email" value={form.email ?? ''} onChange={e => setF('email', e.target.value)} className={fc('email')} />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Data de Nascimento</label>
                    <input type="date" value={form.data_nascimento ?? ''} onChange={e => setF('data_nascimento', e.target.value)} className={fc('data_nascimento')} />
                  </div>
                </div>
              </div>

              {/* Documentos */}
              <div>
                <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-500 uppercase tracking-widest pb-2 mb-4 border-b border-gray-200 dark:border-zinc-800">Documentos</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">CPF</label>
                    <input value={form.cpf ?? ''} onChange={e => setF('cpf', maskCPF(e.target.value))} className={fc('cpf', cpfOk)} placeholder="000.000.000-00" />
                    {formErrors.cpf  && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.cpf}</p>}
                    {cpfOk && !formErrors.cpf && <p className="text-[9px] font-mono text-green-500 mt-1">CPF válido</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">RG</label>
                    <input value={form.rg ?? ''} onChange={e => setF('rg', e.target.value)} className={fc('rg', rgOk)} placeholder="Apenas números" />
                    {formErrors.rg  && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.rg}</p>}
                    {rgOk && !formErrors.rg && <p className="text-[9px] font-mono text-green-500 mt-1">RG válido</p>}
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div>
                <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-500 uppercase tracking-widest pb-2 mb-4 border-b border-gray-200 dark:border-zinc-800">Endereço</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block flex items-center gap-2">
                      CEP <span className="text-yellow-600 dark:text-yellow-400">*</span>
                      {loadingCep && <span className="text-[8px] text-yellow-500 animate-pulse normal-case tracking-normal">buscando...</span>}
                    </label>
                    <input
                      value={form.cep ?? ''}
                      onChange={e => { const v = maskCEP(e.target.value); setF('cep', v); buscarCep(v); }}
                      className={fc('cep')}
                      placeholder="00000-000"
                    />
                    {formErrors.cep && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.cep}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Número <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.numero ?? ''} onChange={e => setF('numero', e.target.value)} className={fc('numero')} placeholder="123" />
                    {formErrors.numero && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.numero}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Rua / Logradouro <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.rua ?? ''} onChange={e => setF('rua', e.target.value)} className={fc('rua')} />
                    {formErrors.rua && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.rua}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Complemento</label>
                    <input value={form.complemento ?? ''} onChange={e => setF('complemento', e.target.value)} className={fc('complemento')} placeholder="Apto, Bloco..." />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Bairro <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.bairro ?? ''} onChange={e => setF('bairro', e.target.value)} className={fc('bairro')} />
                    {formErrors.bairro && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.bairro}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Cidade <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <input value={form.cidade ?? ''} onChange={e => setF('cidade', e.target.value)} className={fc('cidade')} />
                    {formErrors.cidade && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.cidade}</p>}
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">Estado <span className="text-yellow-600 dark:text-yellow-400">*</span></label>
                    <select value={form.estado ?? ''} onChange={e => setF('estado', e.target.value)} className={fc('estado') + ' appearance-none cursor-pointer'}>
                      <option value="">UF</option>
                      {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                    {formErrors.estado && <p className="text-[9px] font-mono text-red-500 mt-1">{formErrors.estado}</p>}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black font-mono font-bold text-[10px] uppercase py-3 hover:opacity-90 transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmDeleteModal
          title="Excluir Cliente"
          message="Esta ação apagará o cliente permanentemente. Não pode ser desfeita."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ABA ARQUITETOS
// ═══════════════════════════════════════════════════════════════════════════════
function TabArquitetos({ empresaId, session, isAdmin }) {
  const PAGE_SIZE = 20;
  const [arquitetos, setArquitetos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    if (!session || !empresaId) return;
    setLoading(true);
    supabase
      .from('arquitetos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        setArquitetos(data ?? []);
        setLoading(false);
      });
  }, [session, empresaId]);

  useEffect(() => {
    document.querySelectorAll('.sys-reveal').forEach(el => el.classList.add('sys-active'));
  }, [arquitetos, selected, isModalOpen]);

  useEffect(() => { setCurrentPage(0); }, [searchTerm]);

  const filtered = arquitetos.filter(a => {
    const t = searchTerm.toLowerCase();
    return a.nome.toLowerCase().includes(t) ||
      (a.telefone ?? '').toLowerCase().includes(t) ||
      (a.email ?? '').toLowerCase().includes(t);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const filteredPage = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const openModal = (arq = null) => { setEditing(arq); setIsModalOpen(true); };
  const closeModal = () => { setEditing(null); setIsModalOpen(false); };

  const handleSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      nome:                fd.get('nome'),
      cpf:                 fd.get('cpf') || null,
      rg:                  fd.get('rg') || null,
      telefone:            fd.get('telefone') || null,
      email:               fd.get('email') || null,
      endereco:            fd.get('endereco') || null,
      data_nascimento:     fd.get('data_nascimento') || null,
      dados_pagamento_pix: fd.get('dados_pagamento_pix') || null,
      empresa_id:          empresaId,
    };
    try {
      if (editing) {
        const { data, error } = await supabase.from('arquitetos').update(payload).eq('id', editing.id).select().single();
        if (error) throw error;
        const updated = { ...editing, ...data };
        setArquitetos(prev => prev.map(a => a.id === editing.id ? updated : a));
        if (selected?.id === editing.id) setSelected(updated);
      } else {
        const { data, error } = await supabase.from('arquitetos').insert(payload).select().single();
        if (error) throw error;
        setArquitetos(prev => [...prev, data]);
      }
      closeModal();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('arquitetos').delete().eq('id', deleteId);
    if (error) { alert(error.message); return; }
    setArquitetos(prev => prev.filter(a => a.id !== deleteId));
    if (selected?.id === deleteId) setSelected(null);
    setDeleteId(null);
  };

  return (
    <div className="lg:flex lg:gap-8 h-full">
      {/* Lista */}
      <div className={`flex-1 flex flex-col h-full bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 ${selected ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-6 border-b border-gray-300 dark:border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">
              {filtered.length} arquiteto{filtered.length !== 1 ? 's' : ''}
            </span>
            <button onClick={() => openModal()} className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all flex items-center gap-2">
              <iconify-icon icon="solar:user-plus-linear" width="14"></iconify-icon> Novo Arquiteto
            </button>
          </div>
          <div className="relative">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-600"></iconify-icon>
            <input type="text" placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-10 py-2.5 outline-none focus:border-yellow-500 dark:focus:border-yellow-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-300 dark:text-zinc-700 animate-pulse font-mono text-[10px] uppercase">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-300 dark:text-zinc-700 font-mono text-[10px] uppercase">Nenhum arquiteto cadastrado</div>
          ) : filteredPage.map(arq => (
            <div key={arq.id} onClick={() => setSelected(arq)}
              className={`sys-reveal p-4 border transition-all cursor-pointer group ${selected?.id === arq.id ? 'border-yellow-500 dark:border-yellow-400 bg-yellow-50 dark:bg-zinc-900/40' : 'border-gray-300 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className={`font-medium ${selected?.id === arq.id ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>{arq.nome}</h3>
                  <div className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 uppercase mt-1 flex items-center gap-3">
                    <span>{arq.telefone || 'Sem fone'}</span>
                    {arq.dados_pagamento_pix && <><span>•</span><span className="text-green-600">PIX cadastrado</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); openModal(arq); }} className="p-2 border border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                    <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                  </button>
                  {isAdmin && (
                    <button onClick={e => { e.stopPropagation(); setDeleteId(arq.id); }} className="p-2 border border-gray-300 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 hover:border-red-400/50 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="border-t border-gray-300 dark:border-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
            <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest">
              Página {currentPage + 1} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <iconify-icon icon="solar:arrow-left-linear" width="11"></iconify-icon> Anterior
              </button>
              <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase px-3 py-2 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Próxima <iconify-icon icon="solar:arrow-right-linear" width="11"></iconify-icon>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ficha */}
      {selected ? (
        <div className="flex-[1.4] bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 flex flex-col h-full overflow-hidden sys-reveal relative">
          <button onClick={() => setSelected(null)} className="lg:hidden absolute top-4 left-4 z-20 text-gray-500 dark:text-zinc-500 flex items-center gap-2 font-mono text-[10px] uppercase">
            <iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Voltar
          </button>
          <div className="p-6 border-b border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/40">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 border border-gray-300 dark:border-zinc-800 px-2 py-1">ID_{selected.id.slice(0, 8)}</div>
              <button onClick={() => openModal(selected)} className="text-[10px] font-mono uppercase bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-zinc-400 px-4 py-2 hover:text-gray-900 dark:hover:text-white transition-colors">Editar</button>
            </div>
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white tracking-tighter uppercase mb-5">{selected.nome}</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Telefone',   value: selected.telefone },
                { label: 'Email',      value: selected.email },
                { label: 'CPF',        value: selected.cpf },
                { label: 'RG',         value: selected.rg },
                { label: 'Nascimento', value: selected.data_nascimento },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 border border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/20">
                  <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-600 uppercase mb-1">{label}</div>
                  <div className="text-gray-700 dark:text-zinc-300 font-mono text-xs">{value || '—'}</div>
                </div>
              ))}
              <div className="col-span-2 p-3 border border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-black/20">
                <div className="text-[9px] font-mono text-gray-400 dark:text-zinc-600 uppercase mb-1">Endereço</div>
                <div className="text-gray-700 dark:text-zinc-300 font-mono text-xs">{selected.endereco || '—'}</div>
              </div>
              {selected.dados_pagamento_pix && (
                <div className="col-span-2 p-3 border border-green-300/40 dark:border-green-900/40 bg-green-50/50 dark:bg-green-400/5">
                  <div className="text-[9px] font-mono text-green-700 dark:text-green-600 uppercase mb-1">PIX / Dados Bancários</div>
                  <div className="text-green-800 dark:text-green-300 font-mono text-xs">{selected.dados_pagamento_pix}</div>
                </div>
              )}
            </div>
          </div>
          <div className="p-6 flex-1 flex items-center justify-center">
            <div className="text-center">
              <iconify-icon icon="solar:buildings-2-linear" width="36" className="text-gray-200 dark:text-zinc-800 mb-3 mx-auto block"></iconify-icon>
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-300 dark:text-zinc-700">Projetos vinculados visíveis na aba Projetos</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-[1.4] bg-gray-100 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 items-center justify-center">
          <div className="text-center">
            <iconify-icon icon="solar:buildings-2-linear" width="48" className="text-gray-200 dark:text-zinc-800 mb-4 mx-auto block"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Selecione um arquiteto</p>
          </div>
        </div>
      )}

      {/* Modal Criar/Editar Arquiteto */}
      {isModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-gray-100 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 w-full max-w-lg p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 dark:text-white uppercase mb-6 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-yellow-500 dark:bg-yellow-400"></span>
              {editing ? 'Editar Arquiteto' : 'Novo Arquiteto'}
            </h3>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
              <Field label="Nome Completo" name="nome" required span2 defaultValue={editing?.nome} />
              <MaskedField label="CPF" name="cpf" maskFn={maskCPF} defaultValue={editing?.cpf} />
              <Field label="RG" name="rg" defaultValue={editing?.rg} />
              <MaskedField label="Telefone" name="telefone" maskFn={maskPhone} defaultValue={editing?.telefone} />
              <Field label="Email" name="email" type="email" defaultValue={editing?.email} />
              <Field label="Data de Nascimento" name="data_nascimento" type="date" defaultValue={editing?.data_nascimento} />
              <Field label="Endereço" name="endereco" span2 textarea defaultValue={editing?.endereco} />
              <div className="col-span-2">
                <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 mb-2 block">PIX / Dados Bancários</label>
                <input name="dados_pagamento_pix" defaultValue={editing?.dados_pagamento_pix || ''}
                  placeholder="Chave PIX, agência, conta..."
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 outline-none focus:border-green-500 font-mono placeholder:text-gray-400 dark:placeholder:text-zinc-700" />
              </div>
              <div className="col-span-2 flex gap-4 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase py-3 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black font-mono font-bold text-[10px] uppercase py-3 hover:opacity-90 transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmDeleteModal
          title="Excluir Arquiteto"
          message="Esta ação removerá o arquiteto permanentemente. Projetos vinculados perderão o vínculo."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function ClientesPage() {
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.perfil === 'admin';
  const [subTab, setSubTab] = useState('clientes');

  return (
    <div className="page-enter min-h-screen bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-zinc-400 font-sans selection:bg-gray-900 selection:text-white dark:selection:bg-gray-50 dark:selection:text-black flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-gray-300 dark:border-zinc-800">
        <div className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-3">06 // Clientes &amp; Arquitetos</div>
        <div className="flex items-end gap-0">
          {[
            { id: 'clientes',   label: 'Clientes',   icon: 'solar:users-group-two-rounded-linear' },
            { id: 'arquitetos', label: 'Arquitetos',  icon: 'solar:buildings-2-linear' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 font-mono text-[11px] uppercase tracking-widest border-b-2 transition-colors ${
                subTab === tab.id
                  ? 'border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-400'
                  : 'border-transparent text-gray-500 dark:text-zinc-600 hover:text-gray-700 dark:hover:text-zinc-300'
              }`}
            >
              <iconify-icon icon={tab.icon} width="14"></iconify-icon>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8 lg:flex lg:flex-col overflow-hidden" style={{ height: 'calc(100vh - 96px)' }}>
        {subTab === 'clientes' && (
          <TabClientes empresaId={profile?.empresa_id} session={session} isAdmin={isAdmin} />
        )}
        {subTab === 'arquitetos' && (
          <TabArquitetos empresaId={profile?.empresa_id} session={session} isAdmin={isAdmin} />
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .sys-reveal { opacity: 0; transform: translateY(8px); transition: all 0.5s cubic-bezier(0.16,1,0.3,1); }
        .sys-active { opacity: 1; transform: translateY(0); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
      `}} />
    </div>
  );
}
