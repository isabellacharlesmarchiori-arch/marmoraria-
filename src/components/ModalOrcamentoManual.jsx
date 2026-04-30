import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const fmtBRL = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function novoItem() {
  return {
    _id:            Math.random(),
    nome_peca:      '',
    tipo:           'area',
    material_id:    '',
    acabamento:     '',
    espessura:      '',
    quantidade:     '',
    preco_unitario: 0,
    total:          0,
  };
}

const LETRAS = 'ABCDEFGHIJ';
function novaVersao(idx = 0) {
  return {
    _id:  Math.random(),
    nome: `Versão ${LETRAS[idx] ?? idx + 1}`,
    itens: [novoItem()],
  };
}

export default function ModalOrcamentoManual({ projetoId, onClose, onSalvo }) {
  const { session, profile } = useAuth();
  // Recupera sempre do auth — nunca depende de props que podem vir undefined
  const empresaId  = profile?.empresa_id  ?? null;
  const vendedorId = session?.user?.id    ?? null;

  const [loadingCat, setLoadingCat] = useState(true);
  const [salvando,   setSalvando]   = useState(false);

  // Form — ambiente pré-preenchido como 'Geral'
  const [ambNome, setAmbNome] = useState('Geral');
  const [versoes, setVersoes] = useState([novaVersao(0)]);

  // Catálogos
  const [materiais,   setMateriais]   = useState([]);
  const [matLineares, setMatLineares] = useState([]);

  useEffect(() => {
    if (!empresaId) return;
    async function load() {
      setLoadingCat(true);
      const [{ data: mats }, { data: lins }] = await Promise.all([
        supabase
          .from('materiais')
          .select('id, nome, categoria, variacoes_precos(id, acabamento, espessura, preco_venda)')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('materiais_lineares')
          .select('id, nome, tipo, preco_ml')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .order('nome'),
      ]);
      setMateriais(mats ?? []);
      setMatLineares(lins ?? []);
      setLoadingCat(false);
    }
    load();
  }, [empresaId]);

  const variacoesDe = (materialId) =>
    (materiais.find(m => m.id === materialId)?.variacoes_precos ?? []);

  // ── Helpers de versão ──────────────────────────────────────────────
  const addVersao = () =>
    setVersoes(prev => [...prev, novaVersao(prev.length)]);

  const removeVersao = (vi) =>
    setVersoes(prev => prev.filter((_, i) => i !== vi));

  const updateVersaoNome = (vi, nome) =>
    setVersoes(prev => prev.map((v, i) => i !== vi ? v : { ...v, nome }));

  // ── Helpers de item ────────────────────────────────────────────────
  const computeItem = (item, patch, mats, lins) => {
    const next = { ...item, ...patch };
    if (next.tipo === 'area') {
      const variacoes = (mats ?? materiais).find(m => m.id === next.material_id)?.variacoes_precos ?? [];
      const variacao  = variacoes.find(v => v.acabamento === next.acabamento && v.espessura === next.espessura);
      next.preco_unitario = variacao?.preco_venda ?? 0;
    } else {
      next.preco_unitario = (lins ?? matLineares).find(m => m.id === next.material_id)?.preco_ml ?? 0;
    }
    next.total = (parseFloat(next.quantidade) || 0) * next.preco_unitario;
    return next;
  };

  const updateItem = (vi, ii, patch) =>
    setVersoes(prev => prev.map((v, vi2) => {
      if (vi2 !== vi) return v;
      return { ...v, itens: v.itens.map((item, ii2) =>
        ii2 !== ii ? item : computeItem(item, patch)
      )};
    }));

  const addItem = (vi) =>
    setVersoes(prev => prev.map((v, i) =>
      i !== vi ? v : { ...v, itens: [...v.itens, novoItem()] }
    ));

  const removeItem = (vi, ii) =>
    setVersoes(prev => prev.map((v, vi2) => {
      if (vi2 !== vi) return v;
      return { ...v, itens: v.itens.filter((_, ii2) => ii2 !== ii) };
    }));

  const duplicateItem = (vi, ii) =>
    setVersoes(prev => prev.map((v, vi2) => {
      if (vi2 !== vi) return v;
      const clone = { ...v.itens[ii], _id: Math.random() };
      const newItens = [...v.itens];
      newItens.splice(ii + 1, 0, clone);
      return { ...v, itens: newItens };
    }));

  const totalVersao = (v) => v.itens.reduce((s, i) => s + (i.total || 0), 0);
  const totalGeral  = versoes.reduce((s, v) => s + totalVersao(v), 0);

  // ── Salvar ─────────────────────────────────────────────────────────
  async function handleSalvar() {
    if (!empresaId)  { alert('Erro: empresa não identificada. Faça login novamente.'); return; }
    if (!vendedorId) { alert('Erro: usuário não identificado. Faça login novamente.'); return; }
    if (!projetoId)  { alert('Erro: projeto não identificado.'); return; }
    if (!ambNome.trim()) { alert('Informe o nome do ambiente.'); return; }
    for (const v of versoes) {
      if (!v.itens.some(i => i.material_id)) {
        alert(`A ${v.nome} precisa de pelo menos um item com material selecionado.`);
        return;
      }
    }

    setSalvando(true);
    try {
      // 1. Criar ambiente vinculado ao projeto com empresa_id correto
      const { data: novoAmb, error: errAmb } = await supabase
        .from('ambientes')
        .insert({ nome: ambNome.trim(), projeto_id: projetoId, empresa_id: empresaId })
        .select('id')
        .single();
      if (errAmb) throw new Error('Erro ao criar ambiente: ' + errAmb.message);

      // 2. Criar um orcamento por versão
      const inserts = versoes.map(v => ({
        ambiente_id:    novoAmb.id,
        empresa_id:     empresaId,
        vendedor_id:    vendedorId,
        nome_versao:    v.nome.trim() || 'Versão Manual',
        status:         'rascunho',
        valor_total:    totalVersao(v),
        desconto_total: 0,
        itens_manuais:  v.itens
          .filter(i => i.material_id)
          .map(i => ({
            nome_peca:      i.nome_peca.trim() || null,
            tipo:           i.tipo,
            material_id:    i.material_id,
            acabamento:     i.acabamento  || null,
            espessura:      i.espessura   || null,
            quantidade:     parseFloat(i.quantidade) || 0,
            preco_unitario: i.preco_unitario,
            total:          i.total,
          })),
      }));

      const { error: errOrc } = await supabase.from('orcamentos').insert(inserts);
      if (errOrc) throw errOrc;

      onSalvo();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#0a0a0a] border border-zinc-800 border-t-2 border-t-yellow-400 w-full max-w-2xl z-10 shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-800 shrink-0 gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
              [ ORÇAMENTO_MANUAL ]
            </div>
            <h3 className="text-base font-bold text-white uppercase tracking-tight">
              Gerar Orçamento Manual
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors shrink-0 mt-0.5 p-1">
            <iconify-icon icon="solar:close-square-linear" width="20"></iconify-icon>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 px-6 pt-5 pb-4 space-y-5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a #0a0a0a' }}>

          {loadingCat ? (
            <div className="py-16 text-center font-mono text-[10px] uppercase text-zinc-700 animate-pulse">
              Carregando catálogos...
            </div>
          ) : (
            <>
              {/* Nome do Ambiente */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono text-zinc-500">
                  Nome do Ambiente
                </label>
                <input
                  type="text"
                  value={ambNome}
                  onChange={e => setAmbNome(e.target.value)}
                  placeholder="Ex: Cozinha, Banheiro..."
                  className="w-full bg-black border border-zinc-800 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-yellow-400 transition-colors"
                />
              </div>

              {/* ── Versões ── */}
              <div className="space-y-5">
                {versoes.map((versao, vi) => {
                  const tvTotal = totalVersao(versao);
                  return (
                    <div key={versao._id} className="border border-zinc-800 bg-zinc-950">

                      {/* Header da versão */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-black">
                        <div className="flex items-center gap-3">
                          <iconify-icon icon="solar:layers-linear" width="13" className="text-yellow-400/60"></iconify-icon>
                          <input
                            type="text"
                            value={versao.nome}
                            onChange={e => updateVersaoNome(vi, e.target.value)}
                            className="bg-transparent border-none text-yellow-400/90 text-xs font-mono font-semibold focus:outline-none w-32"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-zinc-400">
                            {tvTotal > 0 ? fmtBRL(tvTotal) : '—'}
                          </span>
                          {versoes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeVersao(vi)}
                              className="text-zinc-700 hover:text-red-400 transition-colors p-1"
                              title="Remover versão"
                            >
                              <iconify-icon icon="solar:close-circle-linear" width="14"></iconify-icon>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Itens da versão */}
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-mono text-zinc-600 tracking-widest">
                            {versao.itens.length} {versao.itens.length === 1 ? 'peça' : 'peças'}
                          </span>
                          <button
                            type="button"
                            onClick={() => addItem(vi)}
                            className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-yellow-400/70 border border-yellow-400/20 bg-yellow-400/5 px-2.5 py-1 hover:bg-yellow-400/10 transition-colors"
                          >
                            <iconify-icon icon="solar:add-square-linear" width="11"></iconify-icon>
                            Adicionar Peça
                          </button>
                        </div>

                        {versao.itens.map((item, ii) => {
                          const variacoes   = variacoesDe(item.material_id);
                          const acabamentos = [...new Set(variacoes.map(v => v.acabamento))];
                          const espessuras  = variacoes
                            .filter(v => v.acabamento === item.acabamento)
                            .map(v => v.espessura)
                            .filter(Boolean);

                          return (
                            <div key={item._id} className="border border-zinc-800 bg-black p-3 space-y-2.5">

                              {/* Nome da Peça + ações */}
                              <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/60">
                                <iconify-icon icon="solar:tag-linear" width="12" className="text-yellow-400/60 shrink-0"></iconify-icon>
                                <input
                                  type="text"
                                  value={item.nome_peca}
                                  onChange={e => updateItem(vi, ii, { nome_peca: e.target.value })}
                                  placeholder="Nome da peça — ex: Bancada, Ilha, Rodapé..."
                                  className="flex-1 bg-transparent border-none text-yellow-400/90 text-xs font-mono font-semibold placeholder:text-zinc-700 focus:outline-none"
                                />
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => duplicateItem(vi, ii)}
                                    title="Duplicar peça"
                                    className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-blue-400 transition-colors"
                                  >
                                    <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(vi, ii)}
                                    disabled={versao.itens.length === 1}
                                    title="Remover peça"
                                    className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                  >
                                    <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                  </button>
                                </div>
                              </div>

                              {/* Tipo + Material */}
                              <div className="flex gap-2 items-end">
                                <div className="space-y-1 w-[110px] shrink-0">
                                  <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">Tipo</div>
                                  <select
                                    value={item.tipo}
                                    onChange={e => updateItem(vi, ii, {
                                      tipo: e.target.value,
                                      material_id: '', acabamento: '', espessura: '',
                                      preco_unitario: 0, total: 0,
                                    })}
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                                  >
                                    <option value="area">Área (m²)</option>
                                    <option value="linear">Linear (ML)</option>
                                  </select>
                                </div>

                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">
                                    {item.tipo === 'area' ? 'Material (Chapa)' : 'Acabamento Linear'}
                                  </div>
                                  {item.tipo === 'area' ? (
                                    <select
                                      value={item.material_id}
                                      onChange={e => updateItem(vi, ii, { material_id: e.target.value, acabamento: '', espessura: '' })}
                                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                                    >
                                      <option value="">— Selecionar material —</option>
                                      {materiais.map(m => (
                                        <option key={m.id} value={m.id}>{m.nome} · {m.categoria}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <select
                                      value={item.material_id}
                                      onChange={e => updateItem(vi, ii, { material_id: e.target.value })}
                                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                                    >
                                      <option value="">— Selecionar acabamento —</option>
                                      {matLineares.map(m => (
                                        <option key={m.id} value={m.id}>{m.nome}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>

                              {/* Acabamento + Espessura (só área com material selecionado) */}
                              {item.tipo === 'area' && item.material_id && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">Acabamento</div>
                                    <select
                                      value={item.acabamento}
                                      onChange={e => updateItem(vi, ii, { acabamento: e.target.value, espessura: '' })}
                                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                                    >
                                      <option value="">— Selecionar —</option>
                                      {acabamentos.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">Espessura</div>
                                    <select
                                      value={item.espessura}
                                      onChange={e => updateItem(vi, ii, { espessura: e.target.value })}
                                      disabled={!item.acabamento}
                                      className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono disabled:opacity-40"
                                    >
                                      <option value="">— Selecionar —</option>
                                      {espessuras.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                  </div>
                                </div>
                              )}

                              {/* Quantidade + Preço + Total */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">
                                    {item.tipo === 'area' ? 'Área (m²)' : 'Metros (ML)'}
                                  </div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.quantidade}
                                    onChange={e => updateItem(vi, ii, { quantidade: e.target.value })}
                                    placeholder="0,00"
                                    className="w-full bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">
                                    Preço {item.tipo === 'area' ? 'R$/m²' : 'R$/ML'}
                                  </div>
                                  <div className="w-full bg-zinc-950 border border-zinc-800/50 text-zinc-500 text-xs px-2 py-2 font-mono text-center">
                                    {item.preco_unitario > 0 ? fmtBRL(item.preco_unitario) : '—'}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[8px] uppercase font-mono text-zinc-700 tracking-widest">Total</div>
                                  <div className={`w-full text-xs px-2 py-2 font-mono text-center border ${
                                    item.total > 0
                                      ? 'border-yellow-400/30 bg-yellow-400/5 text-yellow-400'
                                      : 'border-zinc-800/50 text-zinc-600'
                                  }`}>
                                    {item.total > 0 ? fmtBRL(item.total) : '—'}
                                  </div>
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Adicionar Versão */}
                <button
                  type="button"
                  onClick={addVersao}
                  className="w-full flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500 border border-zinc-800 border-dashed py-3 hover:border-yellow-400/30 hover:text-yellow-400/70 transition-colors"
                >
                  <iconify-icon icon="solar:layers-minimalistic-add-linear" width="13"></iconify-icon>
                  Adicionar Versão
                </button>
              </div>

              {/* Total geral */}
              <div className="flex items-center justify-between border border-zinc-700 bg-black px-4 py-3">
                <span className="text-[10px] uppercase font-mono text-zinc-500 tracking-widest">
                  Total do Orçamento
                </span>
                <span className="font-mono font-bold text-lg text-yellow-400">
                  {fmtBRL(totalGeral)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-zinc-700 text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || loadingCat}
            className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {salvando
              ? <><iconify-icon icon="solar:spinner-linear" class="animate-spin" width="14"></iconify-icon> Salvando...</>
              : <><iconify-icon icon="solar:diskette-linear" width="14"></iconify-icon> Salvar {versoes.length > 1 ? `${versoes.length} Versões` : 'Orçamento'}</>}
          </button>
        </div>

      </div>
    </div>
  );
}
