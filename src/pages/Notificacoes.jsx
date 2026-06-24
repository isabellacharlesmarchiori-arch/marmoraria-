import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const TIPO_CONFIG = {
  medicao_processada: { icon: 'solar:ruler-pen-linear',      cor: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-400/10', border: 'border-violet-300 dark:border-violet-400/20' },
  medicao_agendada:   { icon: 'solar:calendar-linear',       cor: 'text-orange-700 dark:text-yellow-400', bg: 'bg-orange-100 dark:bg-yellow-400/10', border: 'border-orange-200 dark:border-yellow-400/20' },
  mensagem_admin:     { icon: 'solar:chat-line-linear',      cor: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-100 dark:bg-blue-400/10',     border: 'border-blue-300 dark:border-blue-400/20'   },
  status_atualizado:  { icon: 'solar:layers-linear',         cor: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-100 dark:bg-blue-400/10',     border: 'border-blue-300 dark:border-blue-400/20'   },
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
    const eraLida = notifs.find(n => n.id === id)?.lida ?? true;
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    if (!eraLida) window.dispatchEvent(new CustomEvent('notif-lida'));
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id);
    if (error) console.error(error);
  }

  async function marcarTodasLidas() {
    if (!session?.user?.id || !profile?.empresa_id) return;
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('usuario_id', session.user.id)
      .eq('empresa_id', profile.empresa_id)
      .eq('lida', false);
    if (error) { console.error(error); return; }
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
    window.dispatchEvent(new CustomEvent('notif-todas-lidas'));
  }

  async function handleClick(notif) {
    await marcarLida(notif.id);
    if (notif.tipo === 'medicao_agendada') {
      navigate('/medidor/agenda');
    } else if (notif.projeto_id) {
      navigate(`/projetos/${notif.projeto_id}`);
    }
  }

  return (
    <div className="page-enter bg-zinc-50 dark:bg-[#050505] text-zinc-700 dark:text-[#a1a1aa] min-h-screen font-sans">
      <main className="max-w-[1100px] mx-auto p-6 md:p-8">

        {/* ── Cabeçalho ── */}
        <div className="sys-reveal flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="text-[10px] font-mono text-zinc-500 dark:text-white mb-2 uppercase tracking-widest border border-zinc-200/80 dark:border-zinc-800 bg-white/50 dark:bg-transparent backdrop-blur-md w-max px-2.5 py-1 rounded-md dark:rounded-none shadow-sm dark:shadow-none">09 // Notificações</div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight uppercase">Notificações</h1>
              {naoLidas > 0 && (
                <span className="font-mono text-[9px] uppercase font-bold bg-orange-500 text-white dark:bg-yellow-400 dark:text-black px-2.5 py-0.5 rounded-full dark:rounded-none shadow-[0_0_8px_rgba(249,115,22,0.3)] dark:shadow-[0_0_8px_rgba(250,204,21,0.3)]">
                  {naoLidas} nova{naoLidas > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {naoLidas > 0 && (
            <button
              onClick={marcarTodasLidas}
              className="shrink-0 flex items-center justify-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-yellow-400 bg-white/60 dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-yellow-400/30 px-5 py-2.5 rounded-full dark:rounded-none shadow-sm dark:shadow-none hover:-translate-y-0.5 transition-all"
            >
              <iconify-icon icon="solar:check-read-linear" width="14"></iconify-icon>
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* ── Lista ── */}
        {loading ? (
          <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none py-16 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700 animate-pulse">
            Carregando notificações...
          </div>
        ) : notifs.length === 0 ? (
          <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none py-16 text-center">
            <iconify-icon icon="solar:bell-linear" width="36" className="text-zinc-300 dark:text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="bg-white/90 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden sys-reveal sys-delay-100">

            {/* Barra de cabeçalho do card */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black/40">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Recentes</span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">{notifs.length} no total</span>
            </div>

            {notifs.map((n, i) => {
              const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`card-interactive flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.02] group ${
                    i < notifs.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
                  } ${!n.lida ? 'bg-orange-50 dark:bg-yellow-400/[0.04]' : ''}`}
                >
                  {/* Ícone */}
                  <div className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-xl dark:rounded-none ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                    <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium mb-0.5 group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-900 dark:text-white'}`}>
                      {n.titulo}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 truncate">{n.corpo}</div>
                  </div>

                  {/* Data + indicador */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-mono text-[9px] text-zinc-400 dark:text-zinc-600 whitespace-nowrap">{formatarData(n.created_at)}</span>
                    {!n.lida && (
                      <span className="w-1.5 h-1.5 bg-orange-500 dark:bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(249,115,22,0.5)] dark:shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Rodapé do card */}
            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-transparent">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 dark:text-zinc-700">
                {notifs.length} notificaç{notifs.length !== 1 ? 'ões' : 'ão'} · {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
