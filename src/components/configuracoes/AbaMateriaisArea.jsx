import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export const CATEGORIAS = [
  'Granito', 'Mármore', 'Quartzito', 'Limestone', 'Dolomítico',
  'Quartzo', 'Lâmina ultra compacta', 'Ardósia', 'Nanoglass', 'Outros',
];

// null  = Nanoglass: sem espessura
// false = Outros: campo de texto livre
// array = opções fixas
export const ESPESSURAS_POR_CATEGORIA = {
  'Granito':               ['2cm', '3cm'],
  'Mármore':               ['2cm', '3cm'],
  'Quartzito':             ['2cm', '3cm'],
  'Limestone':             ['2cm', '3cm'],
  'Dolomítico':            ['2cm', '3cm'],
  'Quartzo':               ['1.8cm', '2cm'],
  'Lâmina ultra compacta': ['0.6cm', '0.9cm', '1.2cm'],
  'Ardósia':               ['2.2cm', '3cm'],
  'Nanoglass':             null,
  'Outros':                false,
};

export const ACABAMENTOS = [
  'Polido', 'Bipolido', 'Levigado', 'Escovado',
  'Bi-escovado', 'Flameado', 'Jateado', 'Apicoado', 'Acetinado',
];

function novaVariacao(espessuraDefault = '') {
  return {
    _id:        Math.random(),
    acabamento: 'Polido',
    espessura:  espessuraDefault,
    precoCusto: '',
    frete:      '',
    precoVenda: '',
  };
}

export default function AbaMateriaisArea({
  materiaisArea, setMateriaisArea,
  loadingMateriais,
  fetchMateriais,
  profile,
  handleToggle,
}) {
  // ── Busca / Filtro / Ordenação ──
  const [matBusca,           setMatBusca]           = useState('');
  const [matOrdem,           setMatOrdem]           = useState('az');
  const [matFiltroCategoria, setMatFiltroCategoria] = useState('');

  // ── Modal material (controlado) ──
  const [matModal,     setMatModal]     = useState(false);
  const [matItem,      setMatItem]      = useState(null);
  const [matNome,      setMatNome]      = useState('');
  const [matCategoria, setMatCategoria] = useState('Granito');
  const [matVariacoes, setMatVariacoes] = useState([novaVariacao('2cm')]);
  const [matSalvando,  setMatSalvando]  = useState(false);

  // Quando a categoria muda, redefine espessura nas variações
  useEffect(() => {
    if (!matModal) return;
    const espessuras = ESPESSURAS_POR_CATEGORIA[matCategoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';
    setMatVariacoes(prev => prev.map(v => ({ ...v, espessura: defaultEsp })));
  }, [matCategoria]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirMatModal(item = null) {
    const rawCategoria = item?.categoria ?? 'Granito';
    const categoria = rawCategoria in ESPESSURAS_POR_CATEGORIA ? rawCategoria : 'Granito';
    const espessuras = ESPESSURAS_POR_CATEGORIA[categoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';

    setMatItem(item);
    setMatNome(item?.nome ?? '');
    setMatCategoria(categoria);
    setMatVariacoes(
      item?.variacoes_precos?.length
        ? item.variacoes_precos.map(v => ({
            _id:        Math.random(),
            acabamento: v.acabamento ?? 'Polido',
            espessura:  v.espessura  ?? '',
            precoCusto: v.preco_custo ?? '',
            frete:      v.frete       ?? '',
            precoVenda: v.preco_venda ?? '',
          }))
        : [novaVariacao(defaultEsp)]
    );
    setMatModal(true);
  }

  function fecharMatModal() {
    setMatModal(false);
    setMatItem(null);
    setMatNome('');
    setMatCategoria('Granito');
    setMatVariacoes([novaVariacao('2cm')]);
  }

  async function handleSalvarMaterial() {
    if (!matNome.trim()) { alert('Informe o nome do material.'); return; }
    if (!profile?.empresa_id) { alert('Sessão inválida. Recarregue a página.'); return; }
    setMatSalvando(true);
    try {
      const eId = profile.empresa_id;
      let materialId;

      if (matItem) {
        const { error } = await supabase.from('materiais')
          .update({ nome: matNome.trim(), categoria: matCategoria })
          .eq('id', matItem.id);
        if (error) throw error;
        materialId = matItem.id;
        await supabase.from('variacoes_precos').delete().eq('material_id', materialId);
      } else {
        const { data, error } = await supabase.from('materiais')
          .insert({ nome: matNome.trim(), categoria: matCategoria, empresa_id: eId, ativo: true })
          .select().single();
        if (error) throw error;
        materialId = data.id;
      }

      const variacoesValidas = matVariacoes.filter(v => v.acabamento?.trim());
      if (variacoesValidas.length > 0) {
        const { error } = await supabase.from('variacoes_precos').insert(
          variacoesValidas.map(v => ({
            material_id: materialId,
            acabamento:  v.acabamento,
            espessura:   v.espessura.trim() || null,
            preco_custo: parseFloat(v.precoCusto) || 0,
            frete:       parseFloat(v.frete) || 0,
            preco_venda: parseFloat(v.precoVenda) || 0,
          }))
        );
        if (error) throw error;
      }

      await fetchMateriais();
      fecharMatModal();
    } catch (err) {
      alert(err.message);
    } finally {
      setMatSalvando(false);
    }
  }

  const handleDeleteMaterialArea = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Excluir este material e todas as suas variações de preço?')) return;
    const { error } = await supabase.from('materiais').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setMateriaisArea(prev => prev.filter(m => m.id !== id));
  };

  const updateVariacao = (idx, field, value) =>
    setMatVariacoes(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));

  const addVariacao = () => {
    const espessuras = ESPESSURAS_POR_CATEGORIA[matCategoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';
    setMatVariacoes(prev => [...prev, novaVariacao(defaultEsp)]);
  };

  const removeVariacao = (idx) => setMatVariacoes(prev => prev.filter((_, i) => i !== idx));

  // null = Nanoglass (sem espessura), false = Outros/campo livre, array = opções fixas
  const espessurasDisponiveis = matCategoria in ESPESSURAS_POR_CATEGORIA
    ? ESPESSURAS_POR_CATEGORIA[matCategoria]
    : false;

  const materiaisAreaFiltrados = materiaisArea
    .filter(m => {
      const buscaOk = matBusca === '' || m.nome.toLowerCase().includes(matBusca.toLowerCase());
      const catOk = matFiltroCategoria === '' ||
        m.categoria?.toLowerCase().trim() === matFiltroCategoria?.toLowerCase().trim();
      return buscaOk && catOk;
    })
    .sort((a, b) => {
      if (matOrdem === 'az')        return a.nome.localeCompare(b.nome);
      if (matOrdem === 'za')        return b.nome.localeCompare(a.nome);
      if (matOrdem === 'recente')   return new Date(b.created_at) - new Date(a.created_at);
      if (matOrdem === 'antigo')    return new Date(a.created_at) - new Date(b.created_at);
      if (matOrdem === 'mais_var')  return (b.variacoes_precos?.length ?? 0) - (a.variacoes_precos?.length ?? 0);
      if (matOrdem === 'menos_var') return (a.variacoes_precos?.length ?? 0) - (b.variacoes_precos?.length ?? 0);
      return 0;
    });

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
              <iconify-icon icon="solar:slider-minimalistic-horizontal-linear" class="text-yellow-400"></iconify-icon> Matéria Prima
            </h2>
            <p className="text-[10px] font-mono text-gray-500 dark:text-zinc-600 mt-1 uppercase tracking-widest">
              Matriz de preços por acabamento e espessura
            </p>
          </div>
          <button
            onClick={() => abrirMatModal()}
            className="bg-yellow-400 text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2"
          >
            <iconify-icon icon="solar:add-square-linear"></iconify-icon> Novo Material
          </button>
        </div>

        {/* Busca e Ordenação */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <iconify-icon icon="solar:magnifer-linear" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-500" width="14"></iconify-icon>
            <input
              type="text"
              value={matBusca}
              onChange={e => setMatBusca(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white pl-9 pr-4 py-2 text-xs font-mono focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-400 dark:text-zinc-700"
            />
          </div>
          <select
            value={matOrdem}
            onChange={e => setMatOrdem(e.target.value)}
            className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 px-3 py-2 text-[10px] font-mono uppercase focus:outline-none focus:border-yellow-400 transition-colors"
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="recente">Mais recente</option>
            <option value="antigo">Mais antigo</option>
            <option value="mais_var">Mais variações</option>
            <option value="menos_var">Menos variações</option>
          </select>
        </div>

        {/* Filtro por categoria */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setMatFiltroCategoria('')}
            className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 border transition-colors ${
              matFiltroCategoria === ''
                ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
            }`}
          >
            Todas
          </button>
          {CATEGORIAS.map(cat => (
            <button
              key={cat}
              onClick={() => setMatFiltroCategoria(cat === matFiltroCategoria ? '' : cat)}
              className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                matFiltroCategoria === cat
                  ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                  : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 overflow-x-auto">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 min-w-[640px]">
            <div>Material</div>
            <div>Categoria</div>
            <div>Variações</div>
            <div>Status</div>
            <div className="text-right">Ações</div>
          </div>

          {loadingMateriais ? (
            <div className="p-8 text-center font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700 animate-pulse">Carregando...</div>
          ) : materiaisAreaFiltrados.length === 0 ? (
            <div className="p-8 text-center font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700">
              {materiaisArea.length === 0 ? 'Nenhum material cadastrado' : 'Nenhum material encontrado'}
            </div>
          ) : materiaisAreaFiltrados.map(m => {
            const nVar = m.variacoes_precos?.length ?? 0;
            return (
              <div key={m.id} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 px-4 py-3 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors min-w-[640px]">
                <div className="text-gray-900 dark:text-white uppercase font-medium text-sm">{m.nome}</div>
                <div>
                  <span className="text-[10px] font-mono border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-black text-gray-500 dark:text-zinc-400 px-2 py-0.5">
                    {m.categoria}
                  </span>
                </div>
                <div>
                  {nVar > 0 ? (
                    <span className="text-[10px] font-mono text-yellow-400">
                      {nVar} {nVar !== 1 ? 'variações' : 'variação'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-gray-500 dark:text-zinc-600">Sem preços</span>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => handleToggle(setMateriaisArea, materiaisArea, m.id)}
                    className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}
                  >
                    <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                    {m.ativo ? 'Ativo' : 'Oculto'}
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => abrirMatModal(m)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                    <iconify-icon icon="solar:pen-linear"></iconify-icon>
                  </button>
                  <button onClick={e => handleDeleteMaterialArea(e, m.id)} className="text-gray-500 dark:text-zinc-500 hover:text-red-400 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                    <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Material de Área (controlado, com matriz de preços)
      ════════════════════════════════════════════════════════════════════════ */}
      {matModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={fecharMatModal}></div>
          <div className="relative bg-gray-50 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 border-t-2 border-t-yellow-400 w-full max-w-3xl z-10 shadow-2xl flex flex-col max-h-[92vh]">

            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0 gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">
                  [ {matItem ? 'EDITAR' : 'NOVO'}_MATERIAL ]
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                  {matItem ? 'Editar Material' : 'Cadastrar Material'}
                </h3>
              </div>
              <button onClick={fecharMatModal} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors p-1 shrink-0 mt-0.5">
                <iconify-icon icon="solar:close-square-linear" width="22"></iconify-icon>
              </button>
            </div>

            <div className="overflow-y-auto overflow-x-visible flex-1 custom-scrollbar px-6 pt-6 pb-4 space-y-6">

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Material</label>
                  <input
                    type="text"
                    value={matNome}
                    onChange={e => setMatNome(e.target.value)}
                    placeholder="Ex: Preto Absoluto"
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Categoria</label>
                  <select
                    value={matCategoria}
                    onChange={e => setMatCategoria(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                  >
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-gray-200/50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800">
                <iconify-icon icon="solar:info-circle-linear" class="text-gray-500 dark:text-zinc-500" width="13"></iconify-icon>
                <span className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest">
                  Espessuras disponíveis para {matCategoria}:{' '}
                  <span className="text-gray-600 dark:text-zinc-300">
                    {espessurasDisponiveis === null
                      ? 'Sem espessura (opção única)'
                      : espessurasDisponiveis === false
                      ? 'Campo livre'
                      : espessurasDisponiveis.join(' · ')}
                  </span>
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-400 tracking-widest">
                    Variações de Acabamento & Preço
                  </label>
                  <button
                    type="button"
                    onClick={addVariacao}
                    className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400 border border-yellow-400/30 bg-yellow-400/5 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors"
                  >
                    <iconify-icon icon="solar:add-square-linear" width="13"></iconify-icon>
                    Adicionar Variação
                  </button>
                </div>

                <div className="border border-gray-300 dark:border-zinc-800">
                  <div
                    className="grid gap-3 bg-black/70 px-4 py-2 text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 border-b border-gray-300 dark:border-zinc-800"
                    style={{ gridTemplateColumns: espessurasDisponiveis === null ? '2fr 1fr 1fr 1fr 32px' : '2fr 1.2fr 1fr 1fr 1fr 32px' }}
                  >
                    <div>Acabamento</div>
                    {espessurasDisponiveis !== null && <div>Espessura</div>}
                    <div className="text-center">Custo (R$/m²)</div>
                    <div className="text-center">Frete (R$/m²)</div>
                    <div className="text-center">Venda (R$/m²)</div>
                    <div></div>
                  </div>

                  {(matVariacoes ?? []).map((v, idx) => (
                    <div
                      key={v._id}
                      className="grid gap-3 items-center px-4 py-2.5 bg-gray-50 dark:bg-zinc-950 border-b border-gray-300 dark:border-zinc-800/60 last:border-b-0 hover:bg-gray-200/40 dark:hover:bg-zinc-900/40 transition-colors"
                      style={{ gridTemplateColumns: espessurasDisponiveis === null ? '2fr 1fr 1fr 1fr 32px' : '2fr 1.2fr 1fr 1fr 1fr 32px' }}
                    >
                      <select
                        value={v.acabamento}
                        onChange={e => updateVariacao(idx, 'acabamento', e.target.value)}
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                      >
                        {ACABAMENTOS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>

                      {espessurasDisponiveis === null ? null :
                       espessurasDisponiveis === false ? (
                         <input
                           type="text"
                           value={v.espessura}
                           onChange={e => updateVariacao(idx, 'espessura', e.target.value)}
                           placeholder="Ex: 2cm"
                           className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                         />
                       ) : (
                         <select
                           value={v.espessura}
                           onChange={e => updateVariacao(idx, 'espessura', e.target.value)}
                           className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                         >
                           {espessurasDisponiveis.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                         </select>
                       )}

                      <input type="number" step="0.01" min="0" value={v.precoCusto}
                        onChange={e => updateVariacao(idx, 'precoCusto', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      <input type="number" step="0.01" min="0" value={v.frete}
                        onChange={e => updateVariacao(idx, 'frete', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      <input type="number" step="0.01" min="0" value={v.precoVenda}
                        onChange={e => updateVariacao(idx, 'precoVenda', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-yellow-400 text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      <button
                        type="button"
                        onClick={() => removeVariacao(idx)}
                        disabled={matVariacoes.length === 1}
                        className="w-8 h-8 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={fecharMatModal}
                className="flex-1 bg-transparent border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest py-3 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarMaterial}
                disabled={matSalvando}
                className="flex-1 bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {matSalvando
                  ? <><iconify-icon icon="solar:spinner-linear" class="animate-spin" width="14"></iconify-icon> Salvando...</>
                  : <><iconify-icon icon="solar:diskette-linear" width="14"></iconify-icon> Salvar Material</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
