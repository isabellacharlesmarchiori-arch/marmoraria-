import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/AuthContext';

const fmtBRL = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const FORMAS_PAG = {
  a_vista: 'À Vista', pix: 'PIX', transferencia: 'Transferência',
  dinheiro: 'Dinheiro', cartao: 'Cartão de Crédito',
  boleto_parcelado: 'Boleto Parcelado', cheque: 'Cheque',
};

export default function PainelBaixaPedidos({ onBaixaRealizada }) {
  const { profile, session } = useAuth();
  const [pedidos,    setPedidos]    = useState([]);
  const [contas,     setContas]     = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modalBaixa, setModalBaixa] = useState(null); // pedido selecionado

  const carregar = useCallback(async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;
    setLoading(true);
    try {
      const [{ data: peds }, { data: conts }, { data: cats }] = await Promise.all([
        supabase
          .from('pedidos_fechados')
          .select(`
            id, created_at, forma_pagamento, parcelas, parcelas_detalhes,
            prazo_entrega, status, baixado_em,
            projetos(id, nome, clientes(nome))
          `)
          .eq('status', 'FECHADO')
          .is('baixado_em', null)
          .order('created_at', { ascending: false }),
        supabase.from('financeiro_contas').select('id, nome, saldo_atual').eq('empresa_id', empresaId).eq('ativo', true),
        supabase.from('financeiro_plano_contas').select('id, nome').eq('empresa_id', empresaId).eq('tipo', 'receita'),
      ]);
      setPedidos(peds ?? []);
      setContas(conts ?? []);
      setCategorias(cats ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrirBaixa(pedido) {
    const { data: orcs } = await supabase
      .from('orcamentos')
      .select('valor_total, desconto_total')
      .in('id', pedido.cenario_ids ?? []);

    const valorTotal = (orcs ?? []).reduce((s, o) => s + (o.valor_total ?? 0) - (o.desconto_total ?? 0), 0);

    setModalBaixa({
      pedido,
      valorTotal,
      conta_id:     contas[0]?.id ?? '',
      categoria_id: categorias[0]?.id ?? '',
      observacao:   `Recebimento — Pedido #${pedido.id.slice(-8).toUpperCase()} — ${pedido.projetos?.clientes?.nome ?? pedido.projetos?.nome ?? ''}`,
    });
  }

  async function confirmarBaixa() {
    const { pedido, valorTotal, conta_id, categoria_id, observacao } = modalBaixa;
    if (!conta_id)     { toast.error('Selecione uma conta'); return; }
    if (!categoria_id) { toast.error('Selecione uma categoria'); return; }

    const empresaId = profile?.empresa_id;
    const hoje      = new Date().toISOString().slice(0, 10);
    const parcelado = pedido.parcelas_detalhes?.length > 0;

    try {
      let lancamentoIds = [];

      if (!parcelado) {
        const { data, error } = await supabase
          .from('financeiro_lancamentos')
          .insert({
            empresa_id:      empresaId,
            tipo:            'entrada',
            status:          'pago',
            descricao:       observacao,
            valor_previsto:  valorTotal,
            valor_pago:      valorTotal,
            data_emissao:    hoje,
            data_vencimento: hoje,
            data_pagamento:  hoje,
            competencia:     hoje.slice(0, 7) + '-01',
            conta_id,
            categoria_id,
            projeto_id:      pedido.projetos?.id ?? null,
            origem:          'pedido',
          })
          .select('id').single();
        if (error) throw error;
        lancamentoIds = [data.id];
      } else {
        const grupoId  = crypto.randomUUID();
        const parcelas = pedido.parcelas_detalhes;
        const payloads = parcelas.map((p, i) => ({
          empresa_id:            empresaId,
          tipo:                  'entrada',
          status:                'pendente',
          descricao:             `${observacao} (${i + 1}/${parcelas.length})`,
          valor_previsto:        p.valor,
          valor_pago:            0,
          data_emissao:          hoje,
          data_vencimento:       p.vencimento,
          competencia:           (p.vencimento ?? hoje).slice(0, 7) + '-01',
          conta_id,
          categoria_id,
          projeto_id:            pedido.projetos?.id ?? null,
          origem:                'pedido',
          grupo_parcelamento_id: grupoId,
          parcela_num:           i + 1,
          parcela_total:         parcelas.length,
        }));
        const { data, error } = await supabase
          .from('financeiro_lancamentos')
          .insert(payloads)
          .select('id');
        if (error) throw error;
        lancamentoIds = data.map(d => d.id);
      }

      await supabase
        .from('pedidos_fechados')
        .update({
          baixado_em:     new Date().toISOString(),
          baixado_por:    session?.user?.id,
          lancamento_ids: lancamentoIds,
        })
        .eq('id', pedido.id);

      toast.success('Baixa realizada! Lançamento criado no financeiro.');
      setModalBaixa(null);
      carregar();
      onBaixaRealizada?.();
    } catch (err) {
      toast.error('Erro ao dar baixa: ' + err.message);
    }
  }

  if (loading) return (
    <div className="py-8 text-center font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 animate-pulse">
      Carregando pedidos...
    </div>
  );

  if (pedidos.length === 0) return (
    <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-8 text-center">
      <iconify-icon icon="solar:check-circle-linear" width="32" className="text-gray-400 dark:text-zinc-800 block mx-auto mb-3"></iconify-icon>
      <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum pedido aguardando baixa</p>
    </div>
  );

  return (
    <>
      <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 divide-y divide-gray-200 dark:divide-zinc-900">
        {pedidos.map(p => {
          const parcelado = (p.parcelas_detalhes?.length ?? 0) > 0;
          return (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.015] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-gray-900 dark:text-white font-medium text-sm truncate">
                    {p.projetos?.clientes?.nome ?? p.projetos?.nome ?? '—'}
                  </span>
                  <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">
                    #{p.id.slice(-8).toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-gray-500 dark:text-zinc-500">
                  <span>{FORMAS_PAG[p.forma_pagamento] ?? p.forma_pagamento}</span>
                  {parcelado && <span className="text-yellow-400">{p.parcelas}x</span>}
                  <span>Fechado em {fmtData(p.created_at?.slice(0, 10))}</span>
                  {p.prazo_entrega && <span>Entrega: {fmtData(p.prazo_entrega)}</span>}
                </div>
              </div>
              <button
                onClick={() => abrirBaixa(p)}
                className="flex items-center gap-2 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest px-3 py-2 hover:bg-yellow-300 transition-colors shrink-0"
              >
                <iconify-icon icon="solar:arrow-down-linear" width="12"></iconify-icon>
                Dar Baixa
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal de confirmação da baixa */}
      {modalBaixa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-gray-300 dark:border-zinc-700 w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">Confirmar Baixa</span>
              <button onClick={() => setModalBaixa(null)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white">
                <iconify-icon icon="solar:close-linear" width="16"></iconify-icon>
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Resumo do pedido */}
              <div className="bg-zinc-900/60 border border-gray-300 dark:border-zinc-800 p-3 space-y-1">
                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Pedido</div>
                <div className="text-gray-900 dark:text-white font-medium">{modalBaixa.pedido.projetos?.clientes?.nome ?? '—'}</div>
                <div className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">
                  {FORMAS_PAG[modalBaixa.pedido.forma_pagamento]}
                  {modalBaixa.pedido.parcelas_detalhes?.length > 0 && ` — ${modalBaixa.pedido.parcelas}x`}
                </div>
                <div className="font-mono text-xl font-bold text-yellow-400 mt-2">{fmtBRL(modalBaixa.valorTotal)}</div>
                {modalBaixa.pedido.parcelas_detalhes?.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                    {modalBaixa.pedido.parcelas_detalhes.map((p, i) => (
                      <div key={i} className="flex justify-between font-mono text-[10px] text-gray-500 dark:text-zinc-400">
                        <span>{i + 1}/{modalBaixa.pedido.parcelas} — Venc: {fmtData(p.vencimento)}</span>
                        <span>{fmtBRL(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Conta */}
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block">Conta que recebeu</label>
                <select
                  value={modalBaixa.conta_id}
                  onChange={e => setModalBaixa(p => ({ ...p, conta_id: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white font-mono text-sm px-3 py-2 focus:outline-none focus:border-yellow-400"
                >
                  <option value="">Selecione...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} — {fmtBRL(c.saldo_atual)}</option>)}
                </select>
              </div>

              {/* Categoria */}
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block">Categoria do lançamento</label>
                <select
                  value={modalBaixa.categoria_id}
                  onChange={e => setModalBaixa(p => ({ ...p, categoria_id: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white font-mono text-sm px-3 py-2 focus:outline-none focus:border-yellow-400"
                >
                  <option value="">Selecione...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {/* Observação */}
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 block">Descrição do lançamento</label>
                <input
                  type="text"
                  value={modalBaixa.observacao}
                  onChange={e => setModalBaixa(p => ({ ...p, observacao: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white font-mono text-sm px-3 py-2 focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setModalBaixa(null)}
                className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase py-2.5 hover:text-gray-900 dark:hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBaixa}
                className="flex-1 bg-yellow-400 text-black font-bold font-mono text-[10px] uppercase py-2.5 hover:bg-yellow-300 transition-colors flex items-center justify-center gap-2"
              >
                <iconify-icon icon="solar:check-circle-linear" width="13"></iconify-icon>
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
