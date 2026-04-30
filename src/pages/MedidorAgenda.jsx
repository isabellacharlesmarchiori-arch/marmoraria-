import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

/*
  MIGRAÇÃO — execute no Supabase SQL Editor (uma vez):

  ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS notas_tecnicas text;
  ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS medidas jsonb DEFAULT '[]';
*/

const EMPRESA_ID_FALLBACK = 'a1b2c3d4-0000-0000-0000-000000000001';

const ACABAMENTOS = [
  'Polido', 'Levigado', 'Apicoado', 'Jateado', 'Escovado',
  'Meia-esquadria', 'Reto simples', 'Boleado', 'Chanfrado',
];

const ESPESSURAS = ['2 cm', '3 cm', '4 cm', '6 cm'];

function formatarDataCurta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString())   return `Hoje · ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `Amanhã · ${hora}`;
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ` · ${hora}`;
}

function mapsUrl(endereco) {
  return `https://maps.google.com/?q=${encodeURIComponent(endereco)}`;
}

// ── Card de medição pendente ──────────────────────────────────────────────────
function CardAgenda({ m, onRealizarClick }) {
  const proj = m.projetos ?? {};
  const cli  = proj.clientes ?? {};

  return (
    <div className="mb-3 border border-zinc-700 bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-white truncate">{proj.nome ?? '—'}</div>
          <div className="font-mono text-[10px] text-zinc-600 mt-0.5">
            {formatarDataCurta(m.data_medicao)}
          </div>
        </div>
        <span className="px-2 py-0.5 border border-yellow-400/30 text-[9px] font-mono uppercase text-yellow-400 bg-yellow-400/5 flex items-center gap-1 shrink-0">
          <span className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse"></span>Agendada
        </span>
      </div>

      {/* Contato e localização */}
      <div className="px-4 py-3 space-y-2.5">
        {cli.nome && (
          <div className="flex items-center gap-2.5">
            <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600 shrink-0"></iconify-icon>
            <span className="text-sm text-zinc-300">{cli.nome}</span>
          </div>
        )}
        {cli.telefone && (
          <div className="flex items-center gap-2.5">
            <iconify-icon icon="solar:phone-linear" width="13" className="text-zinc-600 shrink-0"></iconify-icon>
            <a href={`tel:${cli.telefone}`} className="font-mono text-[11px] text-yellow-400 hover:underline">
              {cli.telefone}
            </a>
          </div>
        )}
        {m.endereco && (
          <div className="flex items-start gap-2.5">
            <iconify-icon icon="solar:map-point-linear" width="13" className="text-zinc-600 shrink-0 mt-0.5"></iconify-icon>
            <a
              href={mapsUrl(m.endereco)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-blue-400 hover:underline leading-snug"
            >
              {m.endereco}
              <iconify-icon icon="solar:arrow-right-up-linear" width="10" className="ml-1 inline"></iconify-icon>
            </a>
          </div>
        )}
      </div>

      {/* Observações de Acesso — destaque para o medidor */}
      {m.observacoes_acesso && (
        <div className="mx-4 mb-3 px-3 py-2.5 bg-yellow-400/5 border border-yellow-400/20">
          <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-yellow-400 mb-1.5">
            <iconify-icon icon="solar:info-circle-bold" width="11"></iconify-icon>
            Observações de Acesso
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">{m.observacoes_acesso}</p>
        </div>
      )}

      {/* Botão */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onRealizarClick(m)}
          className="w-full py-3 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest font-bold hover:bg-yellow-300 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <iconify-icon icon="solar:ruler-pen-linear" width="14"></iconify-icon>
          Realizar Medição
        </button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MedidorAgenda() {
  const { session, profile } = useAuth();

  const [medicoes,   setMedicoes]   = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Modal
  const [modalAberto,  setModalAberto]  = useState(false);
  const [medicaoAtiva, setMedicaoAtiva] = useState(null);
  const [medidas,      setMedidas]      = useState([]);
  const [notas,        setNotas]        = useState('');
  const [salvando,     setSalvando]     = useState(false);
  const [erroModal,    setErroModal]    = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchMedicoes = React.useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('medicoes')
      .select(`
        id, data_medicao, endereco, observacoes_acesso, status,
        projetos(id, nome, vendedor_id, empresa_id, clientes(nome, telefone))
      `)
      .eq('medidor_id', session.user.id)
      .neq('status', 'enviada')
      .neq('status', 'aprovada')
      .neq('status', 'concluida')
      .neq('status', 'cancelada')
      .order('data_medicao', { ascending: true });

    if (error) console.error('[MedidorAgenda] Erro:', error);
    if (data) setMedicoes(data);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { fetchMedicoes(); }, [fetchMedicoes]);

  // ── Deep link ────────────────────────────────────────────────────────────
  function handleRealizarClick(m) {
    window.location.href = `smartstone://medicao?id=${m.id}`;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function handleAbrirModal(m) {
    setMedicaoAtiva(m);
    setMedidas([{ id: crypto.randomUUID(), peca: '', altura: '', largura: '', qtd: '1', acabamento: '', espessura: '' }]);
    setNotas('');
    setErroModal('');
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setMedicaoAtiva(null);
  }

  function addMedida() {
    setMedidas(p => [...p, { id: crypto.randomUUID(), peca: '', altura: '', largura: '', qtd: '1', acabamento: '', espessura: '' }]);
  }

  function removeMedida(id) {
    setMedidas(p => p.filter(r => r.id !== id));
  }

  function changeMedida(id, field, value) {
    setMedidas(p => p.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function handleSalvar() {
    if (!medicaoAtiva) return;
    setErroModal('');
    setSalvando(true);

    const medidasFiltradas = medidas.filter(r => r.peca || r.altura || r.largura);

    const { error: updErr } = await supabase
      .from('medicoes')
      .update({
        status:         'aprovada',
        notas_tecnicas: notas.trim() || null,
        medidas:        medidasFiltradas,
      })
      .eq('id', medicaoAtiva.id);

    if (updErr) {
      setErroModal(`Erro ao salvar: ${updErr.message}`);
      setSalvando(false);
      return;
    }

    // Notifica vendedor e admins sobre medição enviada para orçamento
    const vendedorId     = medicaoAtiva.projetos?.vendedor_id;
    const usuarioAtualId = session?.user?.id;
    const empresaId      = medicaoAtiva.projetos?.empresa_id ?? EMPRESA_ID_FALLBACK;
    const projetoId      = medicaoAtiva.projetos?.id ?? null;
    const projetoNome    = medicaoAtiva.projetos?.nome ?? '';

    if (vendedorId && vendedorId !== usuarioAtualId) {
      await supabase.from('notificacoes').insert({
        empresa_id: empresaId,
        usuario_id: vendedorId,
        projeto_id: projetoId,
        tipo:       'medicao_processada',
        titulo:     'Medição enviada para orçamento',
        corpo:      `A medição do projeto "${projetoNome}" foi finalizada e está aguardando orçamento.`,
        lida:       false,
      });
    }

    const { data: admins } = await supabase
      .from('usuarios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('perfil', 'admin')
      .eq('ativo', true);
    if (admins?.length) {
      await supabase.from('notificacoes').insert(
        admins.map(a => ({
          empresa_id: empresaId,
          usuario_id: a.id,
          projeto_id: projetoId,
          tipo:       'medicao_processada',
          titulo:     'Medição enviada para orçamento',
          corpo:      `O medidor enviou os dados do projeto "${projetoNome}". Aguardando orçamento do vendedor.`,
          lida:       false,
        }))
      );
    }

    await fetchMedicoes();
    fecharModal();
    setSalvando(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#050505] text-[#a1a1aa] min-h-screen">

      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
        <div className="text-[10px] font-mono text-white mb-1 uppercase tracking-widest border border-zinc-800 w-max px-2 py-0.5">
          Agenda de Medições
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Agenda</h1>
        <p className="font-mono text-[10px] text-zinc-600 mt-0.5 capitalize">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {/* Lista */}
      <div className="px-4 py-4 max-w-xl mx-auto">
        {loading ? (
          <div className="py-16 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-700 animate-pulse">
            Carregando agenda...
          </div>
        ) : medicoes.length === 0 ? (
          <div className="py-16 text-center">
            <iconify-icon icon="solar:calendar-mark-linear" width="36" className="text-zinc-800 block mx-auto mb-3"></iconify-icon>
            <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-700">Nenhuma medição agendada</p>
          </div>
        ) : medicoes.map(m => (
          <CardAgenda key={m.id} m={m} onRealizarClick={handleRealizarClick} />
        ))}
      </div>


      {/* ── Modal Realizar Medição ────────────────────────────────────────── */}
      {modalAberto && medicaoAtiva && (
        <div className="modal-backdrop fixed inset-0 z-50 bg-black/80 flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full sm:max-w-lg max-h-[94vh] flex flex-col">

            {/* Cabeçalho modal */}
            <div className="px-4 py-3 border-b border-zinc-800 flex items-start justify-between gap-3 shrink-0">
              <div>
                <div className="text-[10px] font-mono text-yellow-400 uppercase tracking-widest mb-0.5">Realizar Medição</div>
                <div className="text-sm font-semibold text-white">{medicaoAtiva.projetos?.nome}</div>
                <div className="font-mono text-[10px] text-zinc-600">{medicaoAtiva.projetos?.clientes?.nome}</div>
              </div>
              <button
                onClick={fecharModal}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-white transition-colors shrink-0"
              >
                <iconify-icon icon="solar:close-linear" width="14"></iconify-icon>
              </button>
            </div>

            {/* Corpo */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">

              {/* Tabela de Medidas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Medidas</span>
                  <button
                    onClick={addMedida}
                    className="font-mono text-[9px] uppercase tracking-widest text-yellow-400 border border-yellow-400/30 px-2 py-1 hover:bg-yellow-400/10 transition-colors flex items-center gap-1"
                  >
                    <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                    Adicionar peça
                  </button>
                </div>

                <div className="space-y-2">
                  {medidas.map((row, idx) => (
                    <div key={row.id} className="border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                      {/* Linha 1: Peça + botão remover */}
                      <div className="flex gap-2 items-center">
                        <input
                          value={row.peca}
                          onChange={e => changeMedida(row.id, 'peca', e.target.value)}
                          placeholder={`Peça ${idx + 1} (ex: Bancada Cozinha)`}
                          className="flex-1 bg-transparent border border-zinc-800 text-white text-xs font-mono px-2 py-1.5 outline-none focus:border-yellow-400 placeholder:text-zinc-700"
                        />
                        <button
                          onClick={() => removeMedida(row.id)}
                          disabled={medidas.length === 1}
                          className="w-7 h-[30px] flex items-center justify-center border border-zinc-800 text-zinc-700 hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-30"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                        </button>
                      </div>

                      {/* Linha 2: Altura, Largura, Qtd */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { field: 'altura',  label: 'Altura' },
                          { field: 'largura', label: 'Largura' },
                          { field: 'qtd',     label: 'Qtd' },
                        ].map(({ field, label }) => (
                          <div key={field}>
                            <div className="font-mono text-[8px] uppercase tracking-widest text-zinc-700 mb-1">{label}</div>
                            <input
                              value={row[field]}
                              onChange={e => changeMedida(row.id, field, e.target.value)}
                              placeholder={field === 'qtd' ? '1' : '0,00 m'}
                              className="w-full bg-transparent border border-zinc-800 text-white text-xs font-mono px-2 py-1.5 outline-none focus:border-yellow-400 placeholder:text-zinc-700 text-center"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Linha 3: Acabamento + Espessura */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="font-mono text-[8px] uppercase tracking-widest text-zinc-700 mb-1">Acabamento de face</div>
                          <select
                            value={row.acabamento}
                            onChange={e => changeMedida(row.id, 'acabamento', e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs font-mono px-2 py-1.5 outline-none focus:border-yellow-400 appearance-none"
                          >
                            <option value="">— Selecionar —</option>
                            {ACABAMENTOS.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <div>
                          <div className="font-mono text-[8px] uppercase tracking-widest text-zinc-700 mb-1">Espessura</div>
                          <select
                            value={row.espessura}
                            onChange={e => changeMedida(row.id, 'espessura', e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs font-mono px-2 py-1.5 outline-none focus:border-yellow-400 appearance-none"
                          >
                            <option value="">— Selecionar —</option>
                            {ESPESSURAS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notas Técnicas */}
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">
                  Notas Técnicas
                </label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={3}
                  placeholder="Ex: Parede fora de prumo, tomada no meio da bancada..."
                  className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs font-mono px-3 py-2.5 outline-none focus:border-yellow-400 placeholder:text-zinc-700 resize-none"
                />
              </div>

              {erroModal && (
                <div className="bg-red-400/10 border border-red-400/30 px-3 py-2 font-mono text-[10px] text-red-400">
                  {erroModal}
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="px-4 py-3 border-t border-zinc-800 flex gap-2 shrink-0">
              <button
                onClick={fecharModal}
                disabled={salvando}
                className="flex-1 py-3 font-mono text-[10px] uppercase tracking-widest border border-zinc-800 text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                className="flex-[2] py-3 font-mono text-[10px] uppercase tracking-widest bg-yellow-400 text-black font-bold hover:bg-yellow-300 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvando ? (
                  <>
                    <iconify-icon icon="solar:spinner-linear" width="13" className="animate-spin"></iconify-icon>
                    Salvando...
                  </>
                ) : (
                  <>
                    <iconify-icon icon="solar:check-circle-linear" width="13"></iconify-icon>
                    Concluir Medição
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
