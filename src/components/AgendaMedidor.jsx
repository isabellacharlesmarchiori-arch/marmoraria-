import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import { supabase } from '../lib/supabase';
import 'react-calendar/dist/Calendar.css';

function formatHora(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isMesmoDia(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function formatDateISO(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AgendaMedidor({ medidorId, horarioEscolhido, empresaId, onDataChange }) {
  const [mesAtivo,       setMesAtivo]       = useState(new Date());
  const [medicoes,       setMedicoes]       = useState([]);
  const [carregando,     setCarregando]     = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  // Se abrir no modo edição com horário já definido, pré-seleciona o dia
  useEffect(() => {
    if (horarioEscolhido) {
      const d = new Date(horarioEscolhido);
      if (!isNaN(d)) setDiaSelecionado(d);
    }
    // Roda só no mount para não sobrescrever clique do usuário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!medidorId) { setMedicoes([]); return; }

    let ativo = true;
    async function buscar() {
      setCarregando(true);
      const inicio = new Date(mesAtivo.getFullYear(), mesAtivo.getMonth(), 1).toISOString();
      const fim    = new Date(mesAtivo.getFullYear(), mesAtivo.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from('medicoes')
        .select('id, data_medicao, endereco, status, projetos(id, nome, clientes(nome))')
        .eq('medidor_id', medidorId)
        .eq('status', 'agendada')
        .gte('data_medicao', inicio)
        .lte('data_medicao', fim)
        .eq('empresa_id', empresaId)
        .order('data_medicao');

      if (ativo && !error) setMedicoes(data ?? []);
      if (ativo) setCarregando(false);
    }
    buscar();
    return () => { ativo = false; };
  }, [medidorId, mesAtivo, empresaId]);

  const diasComMedicao = new Set(
    medicoes.map(m => {
      const d = new Date(m.data_medicao);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  const medicoesDoDia = diaSelecionado
    ? medicoes.filter(m => isMesmoDia(new Date(m.data_medicao), diaSelecionado))
    : [];

  // Apenas a parte HH:mm do agData do pai
  const horaAtual = horarioEscolhido?.slice(11, 16) || '';

  // Conflito: medição já existe a menos de 1h do horário escolhido
  const conflito = (() => {
    if (!horarioEscolhido) return false;
    const escolhido = new Date(horarioEscolhido);
    return medicoes.some(m => Math.abs(new Date(m.data_medicao) - escolhido) < 60 * 60 * 1000);
  })();

  // Clique no dia — usa onChange do react-calendar v6 (onClickDay não atualiza --active)
  function handleDiaChange(data) {
    const esMesmo = diaSelecionado && isMesmoDia(diaSelecionado, data);
    const novo = esMesmo ? null : data;
    setDiaSelecionado(novo);
    if (novo && onDataChange) {
      const hora = horaAtual || '08:00';
      onDataChange(`${formatDateISO(novo)}T${hora}`);
    }
  }

  // Time input dentro do componente — sincroniza com agData do pai
  function handleHoraChange(hora) {
    if (!diaSelecionado || !onDataChange) return;
    onDataChange(`${formatDateISO(diaSelecionado)}T${hora}`);
  }

  if (!medidorId) return null;

  return (
    <div className="border border-zinc-800 bg-[#050505]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <iconify-icon icon="solar:calendar-search-linear" width="13" className="text-zinc-500"></iconify-icon>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Agenda do Medidor</span>
        {carregando && (
          <iconify-icon icon="solar:spinner-linear" width="12" className="text-zinc-600 animate-spin ml-auto"></iconify-icon>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Calendário */}
        <div className="agenda-calendario">
          <Calendar
            locale="pt-BR"
            activeStartDate={mesAtivo}
            onActiveStartDateChange={({ activeStartDate }) => setMesAtivo(activeStartDate)}
            onChange={handleDiaChange}
            value={diaSelecionado}
            tileClassName={({ date }) => {
              const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
              const temMedicao  = diasComMedicao.has(key);
              const isEscolhido = horarioEscolhido && isMesmoDia(date, new Date(horarioEscolhido));
              if (temMedicao && isEscolhido) return 'dia-ocupado dia-escolhido';
              if (temMedicao)  return 'dia-ocupado';
              if (isEscolhido) return 'dia-escolhido';
              return null;
            }}
          />
        </div>

        {/* Instrução quando nenhum dia selecionado */}
        {!diaSelecionado && (
          <div className="font-mono text-[10px] text-zinc-600 flex items-center gap-1.5">
            <iconify-icon icon="solar:calendar-linear" width="11"></iconify-icon>
            {medicoes.length > 0
              ? `${medicoes.length} medição${medicoes.length > 1 ? 'ões' : ''} agendada${medicoes.length > 1 ? 's' : ''} neste mês — clique num dia para ver`
              : 'Agenda livre — clique num dia para selecionar o horário'
            }
          </div>
        )}

        {/* Dia selecionado */}
        {diaSelecionado && (
          <>
            {/* Cabeçalho do dia */}
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              {diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>

            {/* Medições do dia */}
            {medicoesDoDia.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 border border-zinc-900 bg-black">
                <iconify-icon icon="solar:check-circle-linear" width="12" className="text-green-500"></iconify-icon>
                <span className="font-mono text-[10px] text-green-400/80">Dia livre</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {medicoesDoDia.map(m => {
                  const proj = Array.isArray(m.projetos) ? m.projetos[0] : m.projetos;
                  const cli  = Array.isArray(proj?.clientes) ? proj?.clientes[0] : proj?.clientes;
                  const nome = cli?.nome ?? proj?.nome ?? '—';
                  return (
                    <div key={m.id} className="flex items-start gap-3 px-3 py-2.5 bg-black border border-zinc-900">
                      <div className="font-mono text-[11px] text-yellow-400 font-bold shrink-0 w-10">
                        {formatHora(m.data_medicao)}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm text-white font-medium truncate">{nome}</span>
                        {m.endereco && (
                          <span className="font-mono text-[10px] text-zinc-600 truncate">{m.endereco}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Horário da medição (time input) — atualiza agData no pai via onDataChange */}
            {onDataChange && (
              <div>
                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 block mb-1.5">
                  Horário da medição
                </label>
                <input
                  type="time"
                  value={horaAtual}
                  onChange={e => handleHoraChange(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_8px_rgba(250,204,21,0.15)] font-mono transition-colors"
                />
              </div>
            )}

            {/* Aviso de conflito */}
            {conflito && (
              <div className="flex items-start gap-2 px-3 py-2.5 border border-amber-500/30 bg-amber-400/5">
                <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-amber-400 shrink-0 mt-0.5"></iconify-icon>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 font-semibold leading-none mb-1">
                    Possível Conflito de Horário
                  </div>
                  <div className="text-[11px] text-amber-300/70">
                    O medidor já tem medição agendada próxima a este horário.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Estilos do calendário */}
      <style>{`
        .agenda-calendario .react-calendar {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #27272a;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          line-height: 1.5;
        }
        .agenda-calendario .react-calendar__navigation {
          background: transparent;
          border-bottom: 1px solid #27272a;
          margin-bottom: 0;
          height: 36px;
        }
        .agenda-calendario .react-calendar__navigation button {
          background: transparent;
          color: #a1a1aa;
          font-family: monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          min-width: 28px;
        }
        .agenda-calendario .react-calendar__navigation button:enabled:hover,
        .agenda-calendario .react-calendar__navigation button:enabled:focus {
          background: #18181b;
          color: #fff;
        }
        .agenda-calendario .react-calendar__navigation__label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
        }
        .agenda-calendario .react-calendar__month-view__weekdays {
          border-bottom: 1px solid #18181b;
        }
        .agenda-calendario .react-calendar__month-view__weekdays__weekday {
          text-align: center;
          padding: 6px 0;
        }
        .agenda-calendario .react-calendar__month-view__weekdays__weekday abbr {
          font-family: monospace;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #52525b;
          text-decoration: none;
        }
        .agenda-calendario .react-calendar__tile {
          background: transparent;
          color: #a1a1aa;
          padding: 6px 2px;
          font-size: 11px;
          aspect-ratio: unset;
        }
        .agenda-calendario .react-calendar__tile:enabled:hover,
        .agenda-calendario .react-calendar__tile:enabled:focus {
          background: #18181b;
          color: #fff;
        }
        .agenda-calendario .react-calendar__tile--now {
          background: #27272a !important;
          color: #fbbf24 !important;
        }
        .agenda-calendario .react-calendar__tile--active,
        .agenda-calendario .react-calendar__tile--active:enabled:hover,
        .agenda-calendario .react-calendar__tile--active:enabled:focus {
          background: #292524 !important;
          color: #fbbf24 !important;
          outline: 1px solid #fbbf24;
          outline-offset: -1px;
          font-weight: 700;
        }
        .agenda-calendario .dia-ocupado {
          position: relative;
          color: #ef4444 !important;
          font-weight: 600;
        }
        .agenda-calendario .dia-ocupado::after {
          content: '';
          position: absolute;
          bottom: 3px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #ef4444;
        }
        .agenda-calendario .dia-escolhido {
          background: #fbbf2415 !important;
          outline: 1px solid #fbbf2440 !important;
          color: #fbbf24 !important;
        }
        .agenda-calendario .react-calendar__month-view__days__day--neighboringMonth {
          color: #3f3f46;
        }
      `}</style>
    </div>
  );
}
