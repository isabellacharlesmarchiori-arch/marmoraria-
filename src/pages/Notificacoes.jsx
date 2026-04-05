import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const TIPO_CONFIG = {
  medicao_processada: { icon: 'solar:ruler-pen-linear',      cor: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
  medicao_agendada:   { icon: 'solar:calendar-linear',       cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  projeto_aprovado:   { icon: 'solar:check-circle-linear',   cor: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20'  },
  status_atualizado:  { icon: 'solar:layers-linear',         cor: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20'   },
  novo_fechamento:    { icon: 'solar:wallet-money-linear',   cor: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  projeto_perdido:    { icon: 'solar:close-circle-linear',   cor: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20'    },
};

const MOCK_NOTIFICACOES = [
  { id: '1', tipo: 'medicao_processada', titulo: 'Medição processada pela IA', descricao: 'Bancada Cozinha Silestone — dados disponíveis para orçamento', data: 'Hoje, 14:32', lida: false, projeto_id: '1' },
  { id: '2', tipo: 'projeto_aprovado',   titulo: 'Projeto aprovado',           descricao: 'Lavabo Travertino Romano foi aprovado pelo cliente',         data: 'Hoje, 09:15', lida: false, projeto_id: '2' },
  { id: '3', tipo: 'medicao_agendada',   titulo: 'Medição agendada',           descricao: 'Ilha Gourmet Dekton Entzo — 05/04 às 10h com João Medidor',  data: 'Ontem, 16:48', lida: false, projeto_id: '3' },
  { id: '4', tipo: 'status_atualizado',  titulo: 'Status atualizado',          descricao: 'Piso Sala Quartzo Branco — Em produção',                     data: 'Ontem, 11:20', lida: true,  projeto_id: '4' },
  { id: '5', tipo: 'novo_fechamento',    titulo: 'Novo fechamento registrado', descricao: 'Escada Granito São Gabriel — R$ 9.200 via Cartão Crédito',   data: '30 mar',       lida: true,  projeto_id: '5' },
  { id: '6', tipo: 'projeto_perdido',    titulo: 'Projeto marcado como perdido','descricao': 'Bancada Banheiro Mármore — motivo: "Preço acima do orçamento"', data: '28 mar', lida: true,  projeto_id: '6' },
];

export default function Notificacoes() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState(MOCK_NOTIFICACOES);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { threshold: 0.05 }
    );
    document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const naoLidas = notifs.filter(n => !n.lida).length;

  function marcarLida(id) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  }

  function marcarTodasLidas() {
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
  }

  function handleClick(notif) {
    marcarLida(notif.id);
    if (notif.projeto_id) navigate(`/projetos/${notif.projeto_id}`);
  }

  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen font-sans">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div className="sys-reveal px-6 pt-6 pb-4 border-b border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">09 // Notificações</div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Notificações</h1>
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
            className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 border border-zinc-800 hover:border-yellow-400/30 px-3 py-2 transition-colors shrink-0 flex items-center gap-2"
          >
            <iconify-icon icon="solar:check-read-linear" width="13"></iconify-icon>
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* ── Lista ───────────────────────────────────────── */}
      <div className="px-6 py-4">
        {notifs.length === 0 ? (
          <div className="py-16 text-center">
            <iconify-icon icon="solar:bell-linear" width="36" className="text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-700">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="bg-[#0a0a0a] border border-zinc-800 sys-reveal sys-delay-100">
            {notifs.map((n, i) => {
              const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.status_atualizado;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-4 px-4 py-4 cursor-pointer hover:bg-white/[0.015] group transition-colors ${
                    i < notifs.length - 1 ? 'border-b border-zinc-900' : ''
                  } ${!n.lida ? 'bg-white/[0.01]' : ''}`}
                >
                  {/* Ícone */}
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border} ${cfg.cor}`}>
                    <iconify-icon icon={cfg.icon} width="16"></iconify-icon>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium mb-0.5 group-hover:text-yellow-400 transition-colors ${n.lida ? 'text-zinc-300' : 'text-white'}`}>
                      {n.titulo}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-600 truncate">{n.descricao}</div>
                  </div>

                  {/* Data + indicador */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-mono text-[9px] text-zinc-600 whitespace-nowrap">{n.data}</span>
                    {!n.lida && (
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.5)]"></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 sys-reveal sys-delay-200">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700">
            {notifs.length} notificaç{notifs.length !== 1 ? 'ões' : 'ão'} · {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
