import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../utils/format';
import ContaCard from './contas/ContaCard';
import ModalContaForm from './contas/ModalContaForm';
import ModalConfirmacao from './contas/ModalConfirmacao';

const CONF_VAZIO = {
  aberto:         false,
  titulo:         '',
  mensagem:       '',
  onConfirmar:    null,
  textoConfirmar: 'Confirmar',
  textoCancelar:  'Cancelar',
  variante:       'neutra',
};

export default function FinanceiroContas() {
  const { profile } = useAuth();

  const [contas,          setContas]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [modalForm,       setModalForm]       = useState({ aberto: false, conta: null });
  const [modalConf,       setModalConf]       = useState(CONF_VAZIO);

  const carregarContas = useCallback(async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financeiro_contas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('ativo', { ascending: false })
      .order('nome',  { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setContas(data ?? []);
    }
    setLoading(false);
  }, [profile?.empresa_id]);

  useEffect(() => { carregarContas(); }, [carregarContas]);

  if (profile?.perfil !== 'admin') {
    return (
      <div className="p-6">
        <p className="text-zinc-500 font-mono text-sm">
          Apenas administradores podem gerenciar contas bancárias.
        </p>
      </div>
    );
  }

  const contasVisiveis = mostrarInativas
    ? contas
    : contas.filter(c => c.ativo);

  function fecharConf() {
    setModalConf(CONF_VAZIO);
  }

  function abrirDesativar(conta) {
    const reativando = !conta.ativo;
    setModalConf({
      aberto:         true,
      titulo:         reativando ? 'Reativar conta' : 'Desativar conta',
      mensagem:       reativando
        ? `Reativar "${conta.nome}"? A conta voltará a aparecer na listagem.`
        : `Desativar "${conta.nome}"? Ela não aparecerá na listagem, mas o histórico de lançamentos permanece intacto.`,
      textoConfirmar: reativando ? 'Reativar' : 'Desativar',
      textoCancelar:  'Cancelar',
      variante:       reativando ? 'neutra' : 'destrutiva',
      onConfirmar:    async () => {
        const { error } = await supabase
          .from('financeiro_contas')
          .update({ ativo: !conta.ativo })
          .eq('id', conta.id);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(reativando ? 'Conta reativada.' : 'Conta desativada.');
          fecharConf();
          carregarContas();
        }
      },
    });
  }

  function abrirRecalcular(conta) {
    setModalConf({
      aberto:         true,
      titulo:         'Recalcular saldo',
      mensagem:       `Recalcular saldo de "${conta.nome}"? Essa ação soma todos os lançamentos liquidados da conta e atualiza o saldo atual. Útil quando desconfiar de inconsistência.`,
      textoConfirmar: 'Recalcular',
      textoCancelar:  'Cancelar',
      variante:       'neutra',
      onConfirmar:    async () => {
        const { data, error } = await supabase.rpc('recalcular_saldo_conta', {
          p_conta_id: conta.id,
        });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(`Saldo recalculado: ${formatBRL(data)}`);
          fecharConf();
          carregarContas();
        }
      },
    });
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white border border-zinc-800 w-max px-2 py-1">
          Contas bancárias e caixas
        </span>
        <button
          type="button"
          onClick={() => setModalForm({ aberto: true, conta: null })}
          className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors border border-zinc-800 px-3 py-1.5"
        >
          + Nova conta
        </button>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none w-max">
        <input
          type="checkbox"
          checked={mostrarInativas}
          onChange={e => setMostrarInativas(e.target.checked)}
          className="w-4 h-4 accent-yellow-400"
        />
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
          Mostrar inativas
        </span>
      </label>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#0a0a0a] p-5 flex flex-col gap-3">
              <div className="h-3 w-20 bg-zinc-800 animate-pulse rounded" />
              <div className="h-5 w-40 bg-zinc-800 animate-pulse rounded" />
              <div className="h-9 w-36 bg-zinc-800 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : contasVisiveis.length === 0 ? (
        <div className="border border-zinc-800 p-10 flex flex-col items-center gap-3">
          <iconify-icon icon="lucide:landmark" width="28" className="text-zinc-700" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            {mostrarInativas ? 'Nenhuma conta cadastrada' : 'Nenhuma conta ativa'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-800 border border-zinc-800">
          {contasVisiveis.map(conta => (
            <ContaCard
              key={conta.id}
              conta={conta}
              onEditar={()     => setModalForm({ aberto: true, conta })}
              onDesativar={()  => abrirDesativar(conta)}
              onRecalcular={() => abrirRecalcular(conta)}
            />
          ))}
        </div>
      )}

      <ModalContaForm
        aberto={modalForm.aberto}
        contaEditando={modalForm.conta}
        onFechar={() => setModalForm({ aberto: false, conta: null })}
        onSalvar={() => {
          setModalForm({ aberto: false, conta: null });
          carregarContas();
        }}
      />

      <ModalConfirmacao
        aberto={modalConf.aberto}
        titulo={modalConf.titulo}
        mensagem={modalConf.mensagem}
        textoConfirmar={modalConf.textoConfirmar}
        textoCancelar={modalConf.textoCancelar}
        variante={modalConf.variante}
        onConfirmar={modalConf.onConfirmar ?? (() => {})}
        onCancelar={fecharConf}
      />
    </div>
  );
}
