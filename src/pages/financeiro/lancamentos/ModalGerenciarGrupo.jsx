import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { formatBRL } from '../../../utils/format';
import { corPorStatus } from '../theme';

function dataDisplay(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function ModalGerenciarGrupo({
  aberto,
  grupoParcelamentoId,
  onFechar,
  onSucesso,
}) {
  const { profile } = useAuth();

  const [parcelas,            setParcelas]           = useState([]);
  const [selecionadas,        setSelecionadas]       = useState(new Set());
  const [loading,             setLoading]            = useState(true);
  const [executando,          setExecutando]         = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoEstornar, setConfirmandoEstornar] = useState(false);

  const timerCancelarRef = useRef(null);
  const timerEstornarRef = useRef(null);

  // ── carregar parcelas ────────────────────────────────────────────────────
  async function carregarParcelas() {
    setLoading(true);
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .select('id, descricao, status, valor_previsto, valor_pago, data_vencimento, parcela_num, parcela_total')
      .eq('empresa_id', profile.empresa_id)
      .eq('grupo_parcelamento_id', grupoParcelamentoId)
      .order('parcela_num', { ascending: true });

    if (error) { toast.error(error.message); setLoading(false); return; }

    const lista = data ?? [];
    setParcelas(lista);
    // Default: pendentes/atrasadas/parciais marcadas
    setSelecionadas(new Set(
      lista
        .filter(p => ['pendente', 'atrasado', 'parcial'].includes(p.status))
        .map(p => p.id)
    ));
    setLoading(false);
  }

  useEffect(() => {
    if (!aberto || !grupoParcelamentoId) return;
    setConfirmandoCancelar(false);
    setConfirmandoEstornar(false);
    clearTimeout(timerCancelarRef.current);
    clearTimeout(timerEstornarRef.current);
    carregarParcelas();
  }, [aberto, grupoParcelamentoId]);

  useEffect(() => {
    if (!aberto) return;
    function fn(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  // ── seleção ──────────────────────────────────────────────────────────────
  function toggleParcela(id) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Qualquer mudança de seleção cancela o estado de confirmação pendente
    setConfirmandoCancelar(false);
    setConfirmandoEstornar(false);
    clearTimeout(timerCancelarRef.current);
    clearTimeout(timerEstornarRef.current);
  }

  const selecionadasArr  = parcelas.filter(p => selecionadas.has(p.id));
  const totalSelecionado = selecionadasArr.reduce((s, p) => s + (p.valor_previsto || 0), 0);

  const pagas    = parcelas.filter(p => ['pago', 'parcial'].includes(p.status)).length;
  const pendentes = parcelas.filter(p => ['pendente', 'atrasado'].includes(p.status)).length;

  // ── ações em lote ────────────────────────────────────────────────────────
  async function executarCancelar(ids) {
    setExecutando(true);
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'cancelado' })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} ${ids.length === 1 ? 'parcela cancelada' : 'parcelas canceladas'}.`);
      await carregarParcelas();
      if (onSucesso) onSucesso();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecutando(false);
    }
  }

  async function executarEstornar(ids) {
    setExecutando(true);
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pendente', valor_pago: 0, data_pagamento: null, conta_id: null })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} ${ids.length === 1 ? 'pagamento estornado' : 'pagamentos estornados'}.`);
      await carregarParcelas();
      if (onSucesso) onSucesso();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecutando(false);
    }
  }

  // ── handlers com duplo clique ────────────────────────────────────────────
  function handleCancelarClick() {
    if (selecionadasArr.length === 0) {
      toast.error('Selecione pelo menos uma parcela.');
      return;
    }
    const temPaga = selecionadasArr.some(p => ['pago', 'parcial'].includes(p.status));
    if (temPaga) {
      toast.error('Seleção inclui parcelas já pagas. Use "Estornar selecionadas" para desfazer o pagamento primeiro.');
      return;
    }
    if (!confirmandoCancelar) {
      setConfirmandoCancelar(true);
      setConfirmandoEstornar(false);
      clearTimeout(timerEstornarRef.current);
      timerCancelarRef.current = setTimeout(() => setConfirmandoCancelar(false), 5000);
      return;
    }
    clearTimeout(timerCancelarRef.current);
    setConfirmandoCancelar(false);
    executarCancelar(selecionadasArr.map(p => p.id));
  }

  function handleEstornarClick() {
    if (selecionadasArr.length === 0) {
      toast.error('Selecione pelo menos uma parcela.');
      return;
    }
    const temNaoPaga = selecionadasArr.some(p => !['pago', 'parcial'].includes(p.status));
    if (temNaoPaga) {
      toast.error('Seleção inclui parcelas não pagas. Ajuste a seleção.');
      return;
    }
    if (!confirmandoEstornar) {
      setConfirmandoEstornar(true);
      setConfirmandoCancelar(false);
      clearTimeout(timerCancelarRef.current);
      timerEstornarRef.current = setTimeout(() => setConfirmandoEstornar(false), 5000);
      return;
    }
    clearTimeout(timerEstornarRef.current);
    setConfirmandoEstornar(false);
    executarEstornar(selecionadasArr.map(p => p.id));
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 py-6"
      onClick={onFechar}
    >
      <div
        className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-xl max-h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-[#0a0a0a] z-10">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            Gerenciar parcelamento
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="text-zinc-600 hover:text-white transition-colors"
          >
            <iconify-icon icon="lucide:x" width="16"></iconify-icon>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Resumo */}
          {!loading && parcelas.length > 0 && (
            <p className="font-mono text-[9px] text-zinc-500">
              {parcelas.length} parcelas
              {pagas    > 0 && ` · ${pagas} ${pagas === 1 ? 'paga' : 'pagas'}`}
              {pendentes > 0 && ` · ${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}`}
            </p>
          )}

          {/* Lista */}
          {loading ? (
            <div className="flex flex-col gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-11 bg-zinc-800 animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="border border-zinc-800">
              {parcelas.map((p, i) => {
                const cor       = corPorStatus(p.status);
                const cancelada = p.status === 'cancelado';
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-white/[0.015] transition-colors${
                      i < parcelas.length - 1 ? ' border-b border-zinc-900' : ''
                    }${cancelada ? ' opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selecionadas.has(p.id)}
                      onChange={() => toggleParcela(p.id)}
                      className="w-4 h-4 accent-yellow-400 shrink-0"
                    />
                    <span className="font-mono text-[11px] text-zinc-500 w-8 shrink-0">
                      {p.parcela_num}/{p.parcela_total}
                    </span>
                    <span className={`font-mono text-[11px] text-zinc-500 w-14 shrink-0${cancelada ? ' line-through' : ''}`}>
                      {dataDisplay(p.data_vencimento)}
                    </span>
                    <span className={`font-mono text-sm tabular-nums text-white flex-1${cancelada ? ' line-through' : ''}`}>
                      {formatBRL(p.valor_previsto)}
                    </span>
                    <span className={`px-1.5 py-0.5 border font-mono text-[8px] uppercase tracking-widest shrink-0 ${cor.text} ${cor.border}`}>
                      {p.status}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Rodapé de seleção */}
          {selecionadas.size > 0 && (
            <p className="font-mono text-[9px] text-zinc-600">
              {selecionadas.size} {selecionadas.size === 1 ? 'selecionada' : 'selecionadas'}
              {' · '}total {formatBRL(totalSelecionado)}
            </p>
          )}

          {/* Botões de ação */}
          <div className="flex gap-3 flex-wrap pt-2 border-t border-zinc-800">
            <button
              type="button"
              disabled={executando || selecionadas.size === 0}
              onClick={handleCancelarClick}
              className={`font-mono text-[9px] uppercase tracking-widest border px-3 py-1.5 transition-colors disabled:opacity-40 ${
                confirmandoCancelar
                  ? 'border-red-700 text-red-400 hover:text-red-300'
                  : 'border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900'
              }`}
            >
              {confirmandoCancelar ? 'Clique de novo para confirmar' : 'Cancelar selecionadas'}
            </button>
            <button
              type="button"
              disabled={executando || selecionadas.size === 0}
              onClick={handleEstornarClick}
              className={`font-mono text-[9px] uppercase tracking-widest border px-3 py-1.5 transition-colors disabled:opacity-40 ${
                confirmandoEstornar
                  ? 'border-red-700 text-red-400 hover:text-red-300'
                  : 'border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900'
              }`}
            >
              {confirmandoEstornar ? 'Clique de novo para confirmar' : 'Estornar selecionadas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
