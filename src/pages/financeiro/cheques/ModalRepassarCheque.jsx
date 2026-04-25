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

const TIPOS_FORNECEDOR = ['fornecedor', 'funcionario', 'terceiro'];

export default function ModalRepassarCheque({
  aberto,
  cheque,
  categorias        = [],
  parceirosPublicos = [],
  contas            = [],
  onFechar,
  onSucesso,
}) {
  const [parceiroId,  setParceiroId]  = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [contaId,     setContaId]     = useState('');
  const [data,        setData]        = useState(hoje());
  const [descricao,   setDescricao]   = useState('');
  const [salvando,    setSalvando]    = useState(false);

  useEffect(() => {
    if (aberto) {
      setParceiroId(''); setCategoriaId(''); setContaId('');
      setData(hoje()); setDescricao('');
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aberto, onFechar]);

  if (!aberto || !cheque) return null;

  const parceirosFornecedor = parceirosPublicos.filter(p =>
    p.tipos?.some(t => TIPOS_FORNECEDOR.includes(t))
  );

  const categoriasDespesa = categorias.filter(c =>
    c.tipo === 'despesa' && c.aceita_lancamento !== false
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!parceiroId)  return toast.error('Selecione o fornecedor.');
    if (!categoriaId) return toast.error('Selecione a categoria.');
    if (!contaId)     return toast.error('Selecione a conta.');
    if (!data)        return toast.error('Informe a data do repasse.');

    setSalvando(true);
    try {
      const { error } = await supabase.rpc('repassar_cheque', {
        p_cheque_id:              cheque.id,
        p_parceiro_fornecedor_id: parceiroId,
        p_categoria_id:           categoriaId,
        p_conta_id:               contaId,
        p_data_pagamento:         data,
        p_descricao:              descricao.trim() || null,
      });
      if (error) throw error;

      toast.success('Cheque repassado');
      onSucesso();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao repassar cheque');
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
            Repassar cheque
          </span>
          <button type="button" onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors">
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">

          {/* Resumo */}
          <div className="border border-gray-300 dark:border-zinc-800 px-4 py-3 flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Cheque nº {cheque.numero_cheque}</span>
            <span className="text-gray-900 dark:text-white text-sm">{cheque.titular}</span>
            <span className="font-mono text-sm tabular-nums text-gray-900 dark:text-white">{formatBRL(cheque.valor)}</span>
          </div>

          <Campo label="Fornecedor / Funcionário" required>
            <select value={parceiroId} onChange={e => setParceiroId(e.target.value)} className={SELECT_BASE}>
              <option value="">Selecionar…</option>
              {parceirosFornecedor.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Categoria de despesa" required>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className={SELECT_BASE}>
              <option value="">Selecionar categoria…</option>
              {categoriasDespesa.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Conta vinculada" required>
            <select value={contaId} onChange={e => setContaId(e.target.value)} className={SELECT_BASE}>
              <option value="">Selecionar conta…</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Data do repasse" required>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className={INPUT_BASE} />
          </Campo>

          <Campo label="Descrição (opcional)">
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Deixe em branco para descrição automática"
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
              {salvando ? 'Repassando…' : 'Repassar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
