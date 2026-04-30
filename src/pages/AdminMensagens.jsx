import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const PERFIL_LABEL = {
  vendedor:         'Vendedor',
  medidor:          'Medidor',
  admin:            'Admin',
  admin_medidor:    'Admin + Medidor',
  vendedor_medidor: 'Vendedor + Medidor',
};

function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

export default function AdminMensagens() {
  const { profile, session } = useAuth();
  const [usuarios,      setUsuarios]      = useState([]);
  const [destinatario,  setDestinatario]  = useState('todos');
  const [mensagem,      setMensagem]      = useState('');
  const [agendarEnvio,  setAgendarEnvio]  = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [enviando,      setEnviando]      = useState(false);
  const [feedback,      setFeedback]      = useState(null);

  useEffect(() => {
    if (!profile?.empresa_id) return;
    supabase
      .from('usuarios')
      .select('id, nome, perfil')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .neq('id', session?.user?.id)
      .order('nome')
      .then(({ data }) => { if (data) setUsuarios(data); });
  }, [profile?.empresa_id, session?.user?.id]);

  async function enviar() {
    if (!mensagem.trim()) return;

    if (agendarEnvio && (!scheduledDate || !scheduledTime)) {
      setFeedback({ ok: false, msg: 'Informe a data e hora do agendamento.' });
      return;
    }

    setEnviando(true);
    setFeedback(null);
    try {
      const alvos = destinatario === 'todos'
        ? usuarios
        : destinatario === 'time_vendas'
        ? usuarios.filter(u => u.perfil === 'vendedor')
        : destinatario === 'time_medidores'
        ? usuarios.filter(u => u.perfil === 'medidor')
        : usuarios.filter(u => u.id === destinatario);

      if (!alvos.length) {
        setFeedback({ ok: false, msg: 'Nenhum destinatário encontrado.' });
        return;
      }

      const scheduledAt  = agendarEnvio
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : null;
      const statusEnvio  = agendarEnvio ? 'agendada' : 'enviada';

      const { error } = await supabase.from('notificacoes').insert(
        alvos.map(u => ({
          empresa_id:   profile.empresa_id,
          usuario_id:   u.id,
          tipo:         'mensagem_admin',
          titulo:       'Mensagem do administrador',
          corpo:        mensagem.trim(),
          lida:         false,
          scheduled_at: scheduledAt,
          status_envio: statusEnvio,
        }))
      );
      if (error) throw error;

      setMensagem('');
      setDestinatario('todos');
      setAgendarEnvio(false);
      setScheduledDate('');
      setScheduledTime('08:00');

      const msgFeedback = agendarEnvio
        ? `Mensagem agendada para ${new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} — ${alvos.length} destinatário${alvos.length !== 1 ? 's' : ''}.`
        : `Mensagem enviada para ${alvos.length} usuário${alvos.length !== 1 ? 's' : ''}.`;
      setFeedback({ ok: true, msg: msgFeedback });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      setFeedback({ ok: false, msg: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-[#a1a1aa] min-h-screen font-sans">

      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-300 dark:border-zinc-800">
        <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-1 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-0.5">Admin // Mensagens</div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Mensagens</h1>
        <p className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 mt-1 uppercase tracking-widest">
          Enviar aviso manual para membros do time
        </p>
      </div>

      {/* Formulário */}
      <div className="px-6 py-6 max-w-xl">
        <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-5 flex flex-col gap-4">

          {/* Destinatário */}
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
              Destinatário
            </label>
            <select
              value={destinatario}
              onChange={e => setDestinatario(e.target.value)}
              className="w-full bg-gray-100 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-3 h-9 rounded-none outline-none focus:border-yellow-500 dark:focus:border-yellow-400 appearance-none cursor-pointer"
            >
              <option value="todos">Todo o time ({usuarios.length} pessoa{usuarios.length !== 1 ? 's' : ''})</option>
              <option value="time_vendas">Time de vendas ({usuarios.filter(u => u.perfil === 'vendedor').length} vendedor{usuarios.filter(u => u.perfil === 'vendedor').length !== 1 ? 'es' : ''})</option>
              <option value="time_medidores">Time de medidores ({usuarios.filter(u => u.perfil === 'medidor').length} medidor{usuarios.filter(u => u.perfil === 'medidor').length !== 1 ? 'es' : ''})</option>
              <optgroup label="Pessoa específica">
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {PERFIL_LABEL[u.perfil] ?? u.perfil}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Mensagem */}
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
              Mensagem
            </label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              placeholder="Escreva o aviso..."
              rows={4}
              className="w-full bg-gray-100 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-500 dark:focus:border-yellow-400 placeholder:text-gray-400 dark:placeholder:text-zinc-700 resize-none"
            />
            <div className="mt-1 font-mono text-[9px] text-gray-400 dark:text-zinc-700 text-right">
              {mensagem.trim().length} caracteres
            </div>
          </div>

          {/* Toggle envio / agendamento */}
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
              Quando enviar
            </label>
            <div className="flex gap-0 border border-gray-300 dark:border-zinc-800 w-max">
              <button
                type="button"
                onClick={() => setAgendarEnvio(false)}
                className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors ${
                  !agendarEnvio
                    ? 'bg-yellow-400 text-black'
                    : 'bg-gray-100 dark:bg-zinc-950 text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Enviar agora
              </button>
              <button
                type="button"
                onClick={() => setAgendarEnvio(true)}
                className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors border-l border-gray-300 dark:border-zinc-800 ${
                  agendarEnvio
                    ? 'bg-yellow-400 text-black'
                    : 'bg-gray-100 dark:bg-zinc-950 text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <iconify-icon icon="solar:calendar-linear" width="11" className="mr-1"></iconify-icon>
                Agendar para depois
              </button>
            </div>
          </div>

          {/* Seletor de data/hora — visível só ao agendar */}
          {agendarEnvio && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
                  Data
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  min={hojeISO()}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-3 h-9 rounded-none outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                />
              </div>
              <div className="w-32">
                <label className="block font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">
                  Hora
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-3 h-9 rounded-none outline-none focus:border-yellow-500 dark:focus:border-yellow-400"
                />
              </div>
            </div>
          )}

          {/* Botão */}
          <button
            onClick={enviar}
            disabled={enviando || !mensagem.trim() || (agendarEnvio && !scheduledDate)}
            className="self-start font-mono text-[10px] uppercase tracking-widest px-4 py-2.5 bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <iconify-icon icon={agendarEnvio ? 'solar:calendar-linear' : 'solar:send-linear'} width="13"></iconify-icon>
            {enviando
              ? (agendarEnvio ? 'Agendando...' : 'Enviando...')
              : (agendarEnvio ? 'Agendar mensagem' : 'Enviar mensagem')}
          </button>

          {/* Feedback */}
          {feedback && (
            <div className={`font-mono text-[10px] uppercase tracking-widest px-3 py-2 border ${
              feedback.ok
                ? 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-400/5'
                : 'text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-400/5'
            }`}>
              {feedback.msg}
            </div>
          )}
        </div>

        {/* Aviso */}
        <div className="mt-3 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">
          {agendarEnvio
            ? 'A mensagem será salva no banco e enviada manualmente na data programada.'
            : 'A mensagem aparece na aba "Notificações" de cada destinatário em tempo real.'}
        </div>
      </div>
    </div>
  );
}
