import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../utils/format';
import FiltrosCheques, { filtroChequesDefault } from './cheques/FiltrosCheques';
import TabelaCheques from './cheques/TabelaCheques';
import ModalCadastrarCheque from './cheques/ModalCadastrarCheque';
import ModalDepositarCheque from './cheques/ModalDepositarCheque';
import ModalRepassarCheque from './cheques/ModalRepassarCheque';
import ModalConfirmacao from './contas/ModalConfirmacao';

function hoje() { return new Date().toISOString().split('T')[0]; }

// Reverte lançamento para 'pendente' se estava 'pago'
async function estornarLancamentoSeNecessario(lancamentoId) {
  if (!lancamentoId) return;
  const { data: lanc } = await supabase
    .from('financeiro_lancamentos')
    .select('id, status')
    .eq('id', lancamentoId)
    .single();
  if (lanc?.status === 'pago') {
    const { error } = await supabase
      .from('financeiro_lancamentos')
      .update({ status: 'pendente', valor_pago: 0, data_pagamento: null, conta_id: null })
      .eq('id', lancamentoId);
    if (error) throw error;
  }
}

const CONF_VAZIO = {
  aberto:          false,
  titulo:          '',
  mensagem:        '',
  textoConfirmar:  'Confirmar',
  variante:        'neutra',
  onConfirmar:     null,
};

export default function FinanceiroCheques() {
  const { profile } = useAuth();

  const [filtros, setFiltros]   = useState(filtroChequesDefault);
  const [cheques, setCheques]   = useState([]);
  const [lookups, setLookups]   = useState({ lancamentos: {} });
  const [loading, setLoading]   = useState(true);
  const [erro,    setErro]      = useState(null);

  // Dados para modais
  const [contas,                      setContas]                      = useState([]);
  const [categorias,                  setCategorias]                  = useState([]);
  const [parceiros,                   setParceiros]                   = useState([]);
  const [clientes,                    setClientes]                    = useState([]);
  const [lancamentosEntradaPendentes, setLancamentosEntradaPendentes] = useState([]);

  // Estado de modais
  const [modalCadastrar, setModalCadastrar] = useState(false);
  const [modalDepositar, setModalDepositar] = useState({ aberto: false, cheque: null });
  const [modalRepassar,  setModalRepassar]  = useState({ aberto: false, cheque: null });
  const [modalConf,      setModalConf]      = useState(CONF_VAZIO);

  // Bloqueio de perfil
  const isAdmin = profile?.perfil === 'admin';

  // ── Lookup inicial (dados para modais) ────────────────────────────────────
  useEffect(() => {
    if (!profile?.empresa_id) return;

    async function carregarLookups() {
      const [
        { data: contsData },
        { data: catsData },
        { data: parcsData },
        { data: clisData },
        { data: lancsPend },
      ] = await Promise.all([
        supabase
          .from('financeiro_contas')
          .select('id, nome')
          .eq('empresa_id', profile.empresa_id)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('financeiro_plano_contas')
          .select('id, nome, tipo, aceita_lancamento')
          .eq('empresa_id', profile.empresa_id)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('parceiros')
          .select('id, nome, tipos')
          .eq('empresa_id', profile.empresa_id)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('clientes')
          .select('id, nome')
          .eq('empresa_id', profile.empresa_id)
          .order('nome'),
        supabase
          .from('financeiro_lancamentos')
          .select('id, descricao, valor_previsto, valor_pago')
          .eq('empresa_id', profile.empresa_id)
          .eq('tipo', 'entrada')
          .eq('forma_pagamento', 'cheque')
          .in('status', ['pendente', 'parcial'])
          .order('descricao'),
      ]);

      setContas(contsData ?? []);
      setCategorias(catsData ?? []);
      setParceiros(parcsData ?? []);
      setClientes(clisData ?? []);
      // Incluir também lançamentos sem forma_pagamento definida (ainda não vinculados)
      setLancamentosEntradaPendentes(lancsPend ?? []);
    }

    // Também buscar lançamentos entrada pendentes sem restrição de forma_pagamento
    async function carregarLancamentosPendentes() {
      const { data } = await supabase
        .from('financeiro_lancamentos')
        .select('id, descricao, valor_previsto, valor_pago')
        .eq('empresa_id', profile.empresa_id)
        .eq('tipo', 'entrada')
        .in('status', ['pendente', 'parcial'])
        .order('descricao');
      setLancamentosEntradaPendentes(data ?? []);
    }

    carregarLookups();
    carregarLancamentosPendentes();
  }, [profile?.empresa_id]);

  // ── Query principal ───────────────────────────────────────────────────────
  const buscarCheques = useCallback(async () => {
    if (!profile?.empresa_id) return;
    setLoading(true);
    setErro(null);

    try {
      let query = supabase
        .from('financeiro_cheques')
        .select('*')
        .eq('empresa_id', profile.empresa_id)
        .gte('data_bom_para', filtros.periodoInicio)
        .lte('data_bom_para', filtros.periodoFim)
        .order('data_bom_para', { ascending: false })
        .limit(100);

      if (filtros.statuses.length > 0) query = query.in('status', filtros.statuses);
      if (filtros.busca) {
        query = query.or(
          `numero_cheque.ilike.%${filtros.busca}%,titular.ilike.%${filtros.busca}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      setCheques(data ?? []);

      // Lookup de lançamentos vinculados para exibição (futuro)
      const lancIds = [...new Set((data ?? []).map(c => c.lancamento_id).filter(Boolean))];
      if (lancIds.length > 0) {
        const { data: lancs } = await supabase
          .from('financeiro_lancamentos')
          .select('id, descricao, status')
          .in('id', lancIds);
        const map = {};
        for (const l of lancs ?? []) map[l.id] = l;
        setLookups({ lancamentos: map });
      } else {
        setLookups({ lancamentos: {} });
      }
    } catch (err) {
      setErro(err.message ?? 'Erro ao carregar cheques');
    } finally {
      setLoading(false);
    }
  }, [profile?.empresa_id, filtros]);

  useEffect(() => { buscarCheques(); }, [buscarCheques]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  function handleAcao(tipo, cheque) {
    if (tipo === 'detalhe') {
      toast.info('Detalhe do cheque — em breve');
      return;
    }
    if (tipo === 'depositar') {
      setModalDepositar({ aberto: true, cheque });
      return;
    }
    if (tipo === 'repassar') {
      setModalRepassar({ aberto: true, cheque });
      return;
    }
    if (tipo === 'compensar') {
      setModalConf({
        aberto: true,
        titulo: 'Compensar cheque',
        mensagem: `Confirmar que o cheque de ${formatBRL(cheque.valor)} (nº ${cheque.numero_cheque}) foi compensado pelo banco? Isso marca o lançamento de entrada como pago e atualiza o saldo da conta de depósito.`,
        textoConfirmar: 'Compensar',
        variante: 'neutra',
        onConfirmar: () => handleCompensar(cheque),
      });
      return;
    }
    if (tipo === 'devolver') {
      setModalConf({
        aberto: true,
        titulo: 'Devolver cheque',
        mensagem: `Marcar cheque de ${formatBRL(cheque.valor)} como devolvido? O lançamento de entrada volta para "pendente" e pode ser cobrado novamente.`,
        textoConfirmar: 'Devolver',
        variante: 'destrutiva',
        onConfirmar: () => handleDevolver(cheque),
      });
      return;
    }
    if (tipo === 'cancelar') {
      setModalConf({
        aberto: true,
        titulo: 'Cancelar cheque',
        mensagem: `Cancelar cheque nº ${cheque.numero_cheque} de ${formatBRL(cheque.valor)}? Esta ação não pode ser desfeita. Se o lançamento vinculado estava pago, ele voltará para pendente.`,
        textoConfirmar: 'Cancelar cheque',
        variante: 'destrutiva',
        onConfirmar: () => handleCancelar(cheque),
      });
      return;
    }
  }

  async function handleCompensar(cheque) {
    setModalConf(CONF_VAZIO);
    try {
      const { error: errCheque } = await supabase
        .from('financeiro_cheques')
        .update({ status: 'compensado' })
        .eq('id', cheque.id);
      if (errCheque) throw errCheque;

      const { error: errLanc } = await supabase
        .from('financeiro_lancamentos')
        .update({
          status:          'pago',
          valor_pago:      cheque.valor,
          conta_id:        cheque.conta_deposito_id,
          data_pagamento:  hoje(),
        })
        .eq('id', cheque.lancamento_id);
      if (errLanc) throw errLanc;

      toast.success('Cheque compensado, saldo atualizado');
      buscarCheques();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao compensar cheque');
    }
  }

  async function handleDevolver(cheque) {
    setModalConf(CONF_VAZIO);
    try {
      const { error } = await supabase
        .from('financeiro_cheques')
        .update({ status: 'devolvido' })
        .eq('id', cheque.id);
      if (error) throw error;

      await estornarLancamentoSeNecessario(cheque.lancamento_id);

      toast.success('Cheque marcado como devolvido');
      buscarCheques();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao devolver cheque');
    }
  }

  async function handleCancelar(cheque) {
    setModalConf(CONF_VAZIO);
    try {
      const { error } = await supabase
        .from('financeiro_cheques')
        .update({ status: 'cancelado' })
        .eq('id', cheque.id);
      if (error) throw error;

      await estornarLancamentoSeNecessario(cheque.lancamento_id);

      toast.success('Cheque cancelado');
      buscarCheques();
    } catch (err) {
      toast.error(err.message ?? 'Erro ao cancelar cheque');
    }
  }

  function fecharConf() { setModalConf(CONF_VAZIO); }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <iconify-icon icon="lucide:lock" width="28" className="text-zinc-700"></iconify-icon>
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          Acesso restrito a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 border border-zinc-800 px-2 py-0.5">
          Cheques
        </span>
        <button
          type="button"
          onClick={() => setModalCadastrar(true)}
          className="flex items-center gap-2 bg-yellow-400 text-black font-mono text-[9px] uppercase tracking-widest px-3 py-2 hover:bg-yellow-300 transition-colors"
        >
          <iconify-icon icon="lucide:plus" width="12"></iconify-icon>
          Novo cheque
        </button>
      </div>

      {/* Filtros */}
      <FiltrosCheques filtros={filtros} setFiltros={setFiltros} />

      {/* Contagem */}
      {!loading && !erro && (
        <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
          {cheques.length === 0
            ? 'Nenhum cheque no período'
            : `${cheques.length} cheque${cheques.length > 1 ? 's' : ''} no período`}
        </p>
      )}

      {/* Tabela */}
      <TabelaCheques
        cheques={cheques}
        lookups={lookups}
        loading={loading}
        erro={erro}
        onRecarregar={buscarCheques}
        onAcao={handleAcao}
      />

      {/* Modais */}
      <ModalCadastrarCheque
        aberto={modalCadastrar}
        onFechar={() => setModalCadastrar(false)}
        onSucesso={() => { setModalCadastrar(false); buscarCheques(); }}
        lancamentosEntradaPendentes={lancamentosEntradaPendentes}
        categorias={categorias}
        clientes={clientes}
      />

      <ModalDepositarCheque
        aberto={modalDepositar.aberto}
        cheque={modalDepositar.cheque}
        contas={contas}
        onFechar={() => setModalDepositar({ aberto: false, cheque: null })}
        onSucesso={() => { setModalDepositar({ aberto: false, cheque: null }); buscarCheques(); }}
      />

      <ModalRepassarCheque
        aberto={modalRepassar.aberto}
        cheque={modalRepassar.cheque}
        categorias={categorias}
        parceirosPublicos={parceiros}
        contas={contas}
        onFechar={() => setModalRepassar({ aberto: false, cheque: null })}
        onSucesso={() => { setModalRepassar({ aberto: false, cheque: null }); buscarCheques(); }}
      />

      <ModalConfirmacao
        aberto={modalConf.aberto}
        titulo={modalConf.titulo}
        mensagem={modalConf.mensagem}
        textoConfirmar={modalConf.textoConfirmar}
        variante={modalConf.variante}
        onConfirmar={modalConf.onConfirmar ?? fecharConf}
        onCancelar={fecharConf}
      />
    </div>
  );
}
