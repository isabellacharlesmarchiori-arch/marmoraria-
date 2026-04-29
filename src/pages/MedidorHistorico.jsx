import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CardHistorico({ m }) {
  const proj = m.projetos ?? {};
  const cli  = proj.clientes ?? {};
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="mb-3 border border-zinc-800 bg-[#0a0a0a]">
      {/* Header clicável */}
      <button
        onClick={() => setExpandido(p => !p)}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left hover:bg-white/[0.01] transition-colors"
      >
        <div className="min-w-0">
          <div className="font-semibold text-sm text-zinc-300 truncate">{proj.nome ?? '—'}</div>
          <div className="font-mono text-[10px] text-zinc-600 mt-0.5">{formatarData(m.data_medicao)}</div>
          {cli.nome && (
            <div className="font-mono text-[10px] text-zinc-600 mt-0.5">{cli.nome}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 border border-green-500/30 text-[9px] font-mono uppercase text-green-400 bg-green-400/5 flex items-center gap-1">
            <span className="w-1 h-1 bg-green-400 rounded-full"></span>Concluída
          </span>
          <iconify-icon
            icon={expandido ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
            width="14"
            className="text-zinc-600"
          ></iconify-icon>
        </div>
      </button>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-4">

          {/* Medidas */}
          {Array.isArray(m.medidas) && m.medidas.length > 0 && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Medidas registradas</div>
              <div className="space-y-2">
                {m.medidas.map((row, i) => (
                  <div key={i} className="border border-zinc-800/60 bg-zinc-950 px-3 py-2 space-y-1">
                    <div className="text-xs font-semibold text-zinc-300">{row.peca || `Peça ${i + 1}`}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
                      {row.altura    && <span>Altura: <span className="text-zinc-300">{row.altura}</span></span>}
                      {row.largura   && <span>Largura: <span className="text-zinc-300">{row.largura}</span></span>}
                      {row.qtd       && <span>Qtd: <span className="text-zinc-300">{row.qtd}</span></span>}
                      {row.acabamento && <span>Acabamento: <span className="text-zinc-300">{row.acabamento}</span></span>}
                      {row.espessura  && <span>Espessura: <span className="text-zinc-300">{row.espessura}</span></span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas técnicas */}
          {m.notas_tecnicas && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1">Notas técnicas</div>
              <p className="text-xs text-zinc-400 leading-relaxed">{m.notas_tecnicas}</p>
            </div>
          )}

          {/* Sem dados */}
          {(!m.medidas || m.medidas.length === 0) && !m.notas_tecnicas && (
            <p className="font-mono text-[10px] text-zinc-700">Nenhum detalhe registrado.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MedidorHistorico() {
  const { session } = useAuth();
  const [medicoes, setMedicoes] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    supabase
      .from('medicoes')
      .select(`
        id, data_medicao, status, notas_tecnicas, medidas,
        projetos(id, nome, clientes(nome))
      `)
      .eq('medidor_id', session.user.id)
      .eq('status', 'enviada')
      .order('data_medicao', { ascending: false })
      .then(({ data, error }) => {
        console.log('🔍 [Histórico] query result:', { data, error, medidor_id: session?.user?.id });
        if (error) console.error('[MedidorHistorico] Erro:', error);
        if (data) setMedicoes(data);
        setLoading(false);
      });
  }, [session?.user?.id]);

  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen">
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
        <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">
          Histórico
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Medições Concluídas</h1>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto">
        {loading ? (
          <div className="py-16 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 animate-pulse">
            Carregando histórico...
          </div>
        ) : medicoes.length === 0 ? (
          <div className="py-16 text-center">
            <iconify-icon icon="solar:history-linear" width="36" className="text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-700">Nenhuma medição concluída</p>
          </div>
        ) : (
          <>
            <div className="mb-3 font-mono text-[10px] text-zinc-700">
              {medicoes.length} medição{medicoes.length !== 1 ? 'ões' : ''} concluída{medicoes.length !== 1 ? 's' : ''} · clique para ver detalhes
            </div>
            {medicoes.map(m => <CardHistorico key={m.id} m={m} />)}
          </>
        )}
      </div>
    </div>
  );
}
