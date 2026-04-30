import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const TIPO_CONFIG = {
  medicao_agendada:   { icon: 'solar:calendar-linear',  cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  mensagem_admin:     { icon: 'solar:chat-line-linear', cor: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'   },
  status_atualizado:  { icon: 'solar:layers-linear',    cor: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'   },
};

function formatarData(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const agora = new Date();
  const diffMin = Math.floor((agora - d) / 60000);
  const diffH   = Math.floor((agora - d) / 3600000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffMin < 1)  return 'Agora';
  if (diffH   < 24) return `Hoje, ${hora}`;
  const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem, ${hora}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function MedidorNotificacoes() {
  const { session } = useAuth();
  const navigate    = useNavigate();

  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    supabase
      .from('notificacoes')
      .select('*')
      .eq('usuario_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[MedidorNotificacoes] Erro:', error);
        if (data) setNotifs(data);
        setLoading(false);
      });
  }, [session?.user?.id]);

  const naoLidas = notifs.filter(n => !n.lida).length;

  async function marcarLida(id) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
    if (error) console.error(error);
  }

  async function marcarTodasLidas() {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('usuario_id', session.user.id)
      .eq('lida', false);
    if (error) { console.error(error); return; }
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
  }

  async function handleClick(n) {
    await marcarLida(n.id);
    if (n.projeto_id) navigate('/medidor/agenda');
  }

  return (
    <div className="bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-[#a1a1aa] min-h-screen">

      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-300 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-1 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-0.5">
            Notificações
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Avisos</h1>
            {naoLidas > 0 && (
              <span className="font-mono text-[9px] uppercase font-bold bg-yellow-400 text-black px-2 py-0.5 shadow-[0_0_8px_rgba(250,204,21,0.3)]">
                {naoLidas} nova{naoLidas > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {naoLidas > 0 && (
          <button
            onClick={marcarTodasLidas}
            className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 hover:text-yellow-400 border border-gray-300 dark:border-zinc-800 hover:border-yellow-400/30 px-3 py-2 transition-colors shrink-0 flex items-center gap-2"
          >
            <iconify-icon icon="solar:check-read-linear" width="13"></iconify-icon>
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="py-16 text-center font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 animate-pulse">
            Carregando avisos...
          </div>
        ) : notifs.length === 0 ? (
          <div className="py-16 text-center">
            <iconify-icon icon="solar:bell-linear" width="36" className="text-gray-300 dark:text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum aviso</p>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            {notifs.map((n, i) => {
              const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-4 px-4 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.015] group transition-colors ${
                    i < notifs.length - 1 ? 'border-b border-gray-200 dark:border-zinc-900' : ''
                  } ${!n.lida ? 'bg-blue-50/60 dark:bg-blue-400/5' : ''}`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                    <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium mb-0.5 group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-gray-600 dark:text-zinc-300' : 'text-gray-900 dark:text-white'}`}>
                      {n.titulo}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 truncate">{n.corpo}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-600 whitespace-nowrap">{formatarData(n.created_at)}</span>
                    {!n.lida && (
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && notifs.length > 0 && (
          <div className="mt-3">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">
              {notifs.length} aviso{notifs.length !== 1 ? 's' : ''} · {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
