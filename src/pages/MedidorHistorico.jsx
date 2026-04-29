import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { parseSvgUrl } from '../utils/projetoUtils';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function toDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHora(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tipoLabel(json_medicao) {
  const tipo = json_medicao?.ambientes?.[0]?.tipo_medicao;
  return tipo === 'producao' ? 'Produção' : 'Preliminar';
}

function gerarCelulas(mesBase) {
  const ano = mesBase.getFullYear();
  const mes = mesBase.getMonth();
  const inicioDaSemana = new Date(ano, mes, 1).getDay(); // 0 = Dom
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < inicioDaSemana; i++) {
    cells.push({ date: new Date(ano, mes, 1 - (inicioDaSemana - i)), fora: true });
  }
  for (let d = 1; d <= totalDias; d++) {
    cells.push({ date: new Date(ano, mes, d), fora: false });
  }
  const resto = cells.length % 7;
  if (resto > 0) {
    for (let i = 1; i <= 7 - resto; i++) {
      cells.push({ date: new Date(ano, mes + 1, i), fora: true });
    }
  }
  return cells;
}

// ── Painel de medições do dia selecionado ─────────────────────────────────────
function PainelDia({ diaKey, medicoes, onClose }) {
  const dataFormatada = new Date(diaKey + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  return (
    <div className="mt-4 border border-zinc-700 bg-[#0a0a0a]">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 capitalize">
          {dataFormatada} · {medicoes.length} medição{medicoes.length !== 1 ? 'ões' : ''}
        </span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-white transition-colors"
        >
          <iconify-icon icon="solar:close-linear" width="13"></iconify-icon>
        </button>
      </div>

      <div className="divide-y divide-zinc-800/60">
        {medicoes.map(m => {
          const tipo = tipoLabel(m.json_medicao);
          const hora = formatHora(m.data_enviada);
          const proj = m.projetos ?? {};
          const isProducao = tipo === 'Produção';

          return (
            <div key={m.id} className="px-4 py-3 space-y-2.5">
              {/* Projeto + tipo + hora */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{proj.nome ?? '—'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest border ${
                      isProducao
                        ? 'text-purple-400 border-purple-400/30 bg-purple-400/5'
                        : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5'
                    }`}>
                      {tipo}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-600">{hora}</span>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2">
                {/* Ver Desenho */}
                {(() => {
                  const svgUrl = parseSvgUrl(m.svg_url);
                  return svgUrl ? (
                    <a
                      href={svgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2.5 py-1.5 transition-colors"
                    >
                      <iconify-icon icon="solar:map-linear" width="11"></iconify-icon>
                      Ver Desenho
                    </a>
                  ) : (
                    <span
                      title="Desenho não disponível"
                      className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-700 border border-zinc-900 px-2.5 py-1.5 cursor-not-allowed"
                    >
                      <iconify-icon icon="solar:map-linear" width="11"></iconify-icon>
                      Ver Desenho
                    </span>
                  );
                })()}

                {/* Abrir no App */}
                <button
                  onClick={() => window.open(`smartstone://medicao/${m.id}`, '_blank')}
                  className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2.5 py-1.5 transition-colors"
                >
                  <iconify-icon icon="solar:smartphone-linear" width="11"></iconify-icon>
                  Abrir no App
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MedidorHistorico() {
  const { session } = useAuth();
  const [medicoes,       setMedicoes]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [mesBase,        setMesBase]        = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    supabase
      .from('medicoes')
      .select(`
        id, data_medicao, data_enviada, status, json_medicao, svg_url,
        projetos(id, nome, clientes(nome))
      `)
      .eq('medidor_id', session.user.id)
      .eq('status', 'enviada')
      .order('data_enviada', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[MedidorHistorico] Erro:', error);
        if (data) setMedicoes(data);
        setLoading(false);
      });
  }, [session?.user?.id]);

  // Agrupa por chave de dia (usando data_enviada)
  const porDia = useMemo(() => {
    const map = new Map();
    for (const m of medicoes) {
      const key = m.data_enviada ? toDateKey(m.data_enviada) : null;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [medicoes]);

  const celulas = useMemo(() => gerarCelulas(mesBase), [mesBase]);
  const hojeKey = toDateKey(new Date());

  function navMes(delta) {
    setMesBase(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setDiaSelecionado(null);
  }

  function handleDiaClick(key, temMedicao) {
    if (!temMedicao) return;
    setDiaSelecionado(prev => prev === key ? null : key);
  }

  const mesLabel = mesBase.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen">

      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
        <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">
          Histórico
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Medições Realizadas</h1>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto">
        {loading ? (
          <div className="py-16 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 animate-pulse">
            Carregando histórico...
          </div>
        ) : (
          <>
            {/* Navegação de mês */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => navMes(-1)}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <iconify-icon icon="solar:alt-arrow-left-linear" width="14"></iconify-icon>
              </button>
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-300 capitalize">
                {mesLabel}
              </span>
              <button
                onClick={() => navMes(1)}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <iconify-icon icon="solar:alt-arrow-right-linear" width="14"></iconify-icon>
              </button>
            </div>

            {/* Grade do calendário */}
            <div className="border border-zinc-800">

              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 border-b border-zinc-800">
                {DIAS_SEMANA.map(d => (
                  <div key={d} className="py-2 text-center font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                    {d}
                  </div>
                ))}
              </div>

              {/* Células */}
              <div className="grid grid-cols-7">
                {celulas.map(({ date, fora }, idx) => {
                  const key        = toDateKey(date);
                  const count      = porDia.get(key)?.length ?? 0;
                  const temMedicao = count > 0 && !fora;
                  const isHoje     = key === hojeKey && !fora;
                  const isSel      = key === diaSelecionado;
                  const naoUltLinha = idx < celulas.length - 7;
                  const naoUltCol   = idx % 7 !== 6;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleDiaClick(key, temMedicao)}
                      disabled={!temMedicao}
                      className={[
                        'relative flex flex-col items-center justify-start pt-2 pb-2 min-h-[52px] transition-colors',
                        naoUltLinha ? 'border-b border-zinc-800' : '',
                        naoUltCol   ? 'border-r border-zinc-800' : '',
                        temMedicao  ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default',
                        isSel       ? 'bg-[#1D9E75]/10' : '',
                      ].join(' ')}
                    >
                      {/* Número do dia */}
                      <span className={[
                        'w-6 h-6 flex items-center justify-center font-mono text-[11px] rounded-full',
                        fora    ? 'text-zinc-700'
                          : isHoje  ? 'bg-[#1D9E75] text-white font-bold'
                          : isSel   ? 'text-white'
                          : 'text-zinc-400',
                      ].join(' ')}>
                        {date.getDate()}
                      </span>

                      {/* Badge de contagem */}
                      {temMedicao && (
                        <span className={[
                          'mt-1 font-mono text-[8px] px-1.5 rounded-sm leading-4',
                          isSel
                            ? 'bg-[#1D9E75] text-white'
                            : 'bg-[#1D9E75]/20 text-[#1D9E75]',
                        ].join(' ')}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contador total do mês visível */}
            {(() => {
              const doMes = celulas
                .filter(c => !c.fora)
                .reduce((acc, c) => acc + (porDia.get(toDateKey(c.date))?.length ?? 0), 0);
              return doMes > 0 ? (
                <div className="mt-2 font-mono text-[10px] text-zinc-700 text-right">
                  {doMes} medição{doMes !== 1 ? 'ões' : ''} em {mesLabel}
                </div>
              ) : null;
            })()}

            {/* Painel do dia selecionado */}
            {diaSelecionado && porDia.has(diaSelecionado) && (
              <PainelDia
                diaKey={diaSelecionado}
                medicoes={porDia.get(diaSelecionado)}
                onClose={() => setDiaSelecionado(null)}
              />
            )}

            {/* Estado vazio */}
            {medicoes.length === 0 && (
              <div className="py-12 text-center">
                <iconify-icon icon="solar:history-linear" width="36" className="text-zinc-800 block mx-auto mb-3"></iconify-icon>
                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-700">Nenhuma medição enviada ainda</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
