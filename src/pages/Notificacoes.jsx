import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const TIPO_CONFIG = {
  medicao_processada: { icon: 'solar:ruler-pen-linear',      cor: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
  medicao_agendada:   { icon: 'solar:calendar-linear',       cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  medicao_concluida:  { icon: 'solar:check-square-linear',   cor: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20'  },
  projeto_aprovado:   { icon: 'solar:check-circle-linear',   cor: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20'  },
  status_atualizado:  { icon: 'solar:layers-linear',         cor: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'   },
  novo_fechamento:    { icon: 'solar:wallet-money-linear',   cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  projeto_perdido:    { icon: 'solar:close-circle-linear',   cor: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20'    },
};

function formatarData(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const agora = new Date();
  const diffMs = agora - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);

  const horaFormatada = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (diffMin < 1) return 'Agora';
  if (diffH < 24) return `Hoje, ${horaFormatada}`;

  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem, ${horaFormatada}`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function Notificacoes() {
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch notificações do Supabase
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!session || !empresaId) return;

    async function fetchNotifs() {
      setLoading(true);
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('usuario_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) console.error('Erro ao buscar notificações:', error);
      if (data) setNotifs(data);
      setLoading(false);
    }

    fetchNotifs();
  }, [session, profile?.empresa_id]);

  // Animação
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { threshold: 0.05 }
    );
    document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [notifs]);

  const naoLidas = notifs.filter(n => !n.lida).length;

  async function marcarLida(id) {
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id);
    if (error) { console.error(error); return; }
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
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

  function handleClick(notif) {
    marcarLida(notif.id);
    if (notif.projeto_id) navigate(`/projetos/${notif.projeto_id}`);
  }

  return (
    <div className="bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-[#a1a1aa] min-h-screen font-sans">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div className="sys-reveal px-6 pt-6 pb-4 border-b border-gray-300 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-gray-900 dark:text-white mb-1 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-0.5">09 // Notificações</div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Notificações</h1>
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

      {/* ── Lista ───────────────────────────────────────── */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="py-16 text-center font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 animate-pulse">
            Carregando notificações...
          </div>
        ) : notifs.length === 0 ? (
          <div className="py-16 text-center">
            <iconify-icon icon="solar:bell-linear" width="36" className="text-gray-300 dark:text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 sys-reveal sys-delay-100">
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
                  {/* Ícone */}
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                    <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium mb-0.5 group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-gray-600 dark:text-zinc-300' : 'text-gray-900 dark:text-white'}`}>
                      {n.titulo}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 truncate">{n.descricao}</div>
                  </div>

                  {/* Data + indicador */}
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
          <div className="mt-3 sys-reveal sys-delay-200">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">
              {notifs.length} notificaç{notifs.length !== 1 ? 'ões' : 'ão'} · {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
