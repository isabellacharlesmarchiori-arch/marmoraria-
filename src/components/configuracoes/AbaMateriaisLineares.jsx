import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CATEGORIAS } from './AbaMateriaisArea';

export default function AbaMateriaisLineares({
  materiaisLineares, setMateriaisLineares,
  materiaisArea,
  precosMaterial, setPrecosMaterial,
  acabamentosUnitarios, setAcabamentosUnitarios,
  loadingMateriais,
  openModal,
  handleToggle,
  empresaId,
}) {
  const [acabamentoSubAba,    setAcabamentoSubAba]    = useState('lineares');
  const [expandedAcabamentos, setExpandedAcabamentos] = useState(new Set());
  const [novoPrecosForm,      setNovoPrecosForm]      = useState({});

  const toggleExpandAcabamento = (id) =>
    setExpandedAcabamentos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDeleteMaterialLinear = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Excluir este material definitivamente?')) return;
    const { error } = await supabase.from('materiais_lineares').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setMateriaisLineares(prev => prev.filter(m => m.id !== id));
    setPrecosMaterial(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleAddPrecoMaterial = async (materialLinearId) => {
    const form = novoPrecosForm[materialLinearId] ?? {};
    if (!form.preco) return;

    if (form.modo === 'material') {
      if (!form.materialId) return;
      const { data, error } = await supabase
        .from('acabamento_precos_material')
        .insert({ empresa_id: empresaId, material_linear_id: materialLinearId, material_id: form.materialId, categoria: null, preco_ml: Number(form.preco) })
        .select('id, material_linear_id, categoria, preco_ml, material_id, materiais(nome)')
        .single();
      if (error) { alert(error.message); return; }
      setPrecosMaterial(prev => ({
        ...prev,
        [materialLinearId]: [...(prev[materialLinearId] ?? []), data],
      }));
    } else {
      const cats = form.categorias ?? [];
      if (cats.length === 0) return;
      const rows = cats.map(cat => ({ empresa_id: empresaId, material_linear_id: materialLinearId, categoria: cat, material_id: null, preco_ml: Number(form.preco) }));
      const { data, error } = await supabase
        .from('acabamento_precos_material')
        .insert(rows)
        .select('id, material_linear_id, categoria, preco_ml, material_id, materiais(nome)');
      if (error) { alert(error.message); return; }
      setPrecosMaterial(prev => ({
        ...prev,
        [materialLinearId]: [...(prev[materialLinearId] ?? []), ...(data ?? [])],
      }));
    }

    setNovoPrecosForm(prev => ({ ...prev, [materialLinearId]: { modo: form.modo, categorias: [], preco: '', materialId: '' } }));
  };

  const handleRemovePrecoMaterial = async (materialLinearId, precoId) => {
    const { error } = await supabase.from('acabamento_precos_material').delete().eq('id', precoId);
    if (error) { alert(error.message); return; }
    setPrecosMaterial(prev => ({
      ...prev,
      [materialLinearId]: (prev[materialLinearId] ?? []).filter(p => p.id !== precoId),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="flex gap-px bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 w-max mb-6">
        {[
          { id: 'lineares',  label: 'Acabamentos Lineares'  },
          { id: 'unitarios', label: 'Acabamentos Unitários' },
        ].map(s => (
          <button key={s.id} onClick={() => setAcabamentoSubAba(s.id)}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              acabamentoSubAba === s.id
                ? 'bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none'
                : 'bg-white dark:bg-[#020202] text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {acabamentoSubAba === 'lineares' && (
        <>
          <div className="flex justify-between items-end border-b border-zinc-200/80 dark:border-zinc-800 pb-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white uppercase flex items-center gap-2">
              <iconify-icon icon="solar:sort-from-bottom-to-top-linear" class="text-orange-600 dark:text-yellow-400"></iconify-icon> Acabamentos Lineares
            </h2>
            <button onClick={() => openModal('material_linear')} className="bg-orange-500 hover:bg-orange-600 text-white dark:bg-yellow-400 dark:hover:bg-yellow-300 dark:text-black rounded-xl dark:rounded-none text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_6px_20px_rgba(249,115,22,0.23)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2">
              <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
            </button>
          </div>
          <div className="bg-white/90 dark:bg-[#020202] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500">
              <div>Descrição</div><div>Tipo</div><div>Preço por ml</div><div>Status</div><div className="text-right">Ações</div>
            </div>
            {loadingMateriais ? (
              <div className="p-8 text-center font-mono text-[10px] uppercase text-zinc-400 dark:text-zinc-700 animate-pulse">Carregando...</div>
            ) : materiaisLineares.map(m => {
              const isExpanded = expandedAcabamentos.has(m.id);
              const precos = precosMaterial[m.id] ?? [];
              const form = novoPrecosForm[m.id] ?? { modo: 'categoria', categorias: [], preco: '', materialId: '' };
              return (
                <div key={m.id} className="border-b border-zinc-200/80 dark:border-zinc-800/50">
                  <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 items-center hover:bg-zinc-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
                    <div className="text-zinc-900 dark:text-white uppercase font-medium">{m.nome}</div>
                    <div><span className="text-[10px] font-mono border border-zinc-200/80 dark:border-zinc-700 bg-white dark:bg-black px-2 py-1 uppercase text-zinc-500 dark:text-zinc-400">{m.tipo?.replace('_', ' ')}</span></div>
                    <div className="font-mono text-zinc-600 dark:text-zinc-300">R$ {Number(m.preco_ml).toFixed(2)}</div>
                    <div>
                      <button onClick={() => handleToggle(setMateriaisLineares, materiaisLineares, m.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-500 dark:text-zinc-600'}`}>
                        <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                        {m.ativo ? 'Ativo' : 'Oculto'}
                      </button>
                    </div>
                    <div className="text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleExpandAcabamento(m.id)}
                        title="Preços por material"
                        className={`text-[10px] font-mono uppercase flex items-center gap-1 border px-3 py-1 transition-colors ${isExpanded ? 'bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none border-orange-500 dark:border-yellow-400' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-black border-zinc-200/80 dark:border-zinc-800'}`}
                      >
                        <iconify-icon icon="solar:layers-minimalistic-linear" width="14"></iconify-icon>
                        {precos.length > 0 && <span>{precos.length}</span>}
                      </button>
                      <button onClick={() => openModal('material_linear', m)} className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                      <button onClick={e => handleDeleteMaterialLinear(e, m.id)} className="text-zinc-500 dark:text-zinc-500 hover:text-red-400 bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/40 px-6 py-4">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-3">Preços especiais por material</p>
                      {precos.length === 0 && (
                        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mb-3">Nenhum preço especial. Usando preço base para todos os materiais.</p>
                      )}
                      <div className="space-y-1 mb-4">
                        {precos.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-zinc-200/80 dark:border-zinc-800/60 text-sm">
                            <div className="flex items-center gap-2">
                              {p.material_id ? (
                                <span className="text-[9px] font-mono uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5">mat</span>
                              ) : (
                                <span className="text-[9px] font-mono uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5">cat</span>
                              )}
                              <span className="text-zinc-700 dark:text-zinc-300 uppercase font-mono text-xs">
                                {p.material_id ? (p.materiais?.nome ?? p.material_id) : p.categoria}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-zinc-600 dark:text-zinc-400 text-xs">R$ {Number(p.preco_ml).toFixed(2)}/ml</span>
                              <button onClick={() => handleRemovePrecoMaterial(m.id, p.id)} className="text-zinc-400 hover:text-red-400 transition-colors">
                                <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-px mb-3">
                        <button
                          onClick={() => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, modo: 'categoria' } }))}
                          className={`text-[10px] font-mono uppercase px-3 py-1.5 border transition-colors ${form.modo === 'categoria' ? 'bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none border-orange-500 dark:border-yellow-400' : 'bg-white dark:bg-black text-zinc-500 dark:text-zinc-500 border-zinc-200/80 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white'}`}
                        >Por categoria</button>
                        <button
                          onClick={() => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, modo: 'material' } }))}
                          className={`text-[10px] font-mono uppercase px-3 py-1.5 border transition-colors ${form.modo === 'material' ? 'bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none border-orange-500 dark:border-yellow-400' : 'bg-white dark:bg-black text-zinc-500 dark:text-zinc-500 border-zinc-200/80 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white'}`}
                        >Material específico</button>
                      </div>

                      {form.modo === 'categoria' ? (
                        <div className="grid grid-cols-2 gap-1 mb-3">
                          {CATEGORIAS.map(cat => {
                            const jaExiste = precos.some(p => p.categoria === cat && !p.material_id);
                            const checked = (form.categorias ?? []).includes(cat);
                            return (
                              <label key={cat} className={`flex items-center gap-2 text-xs font-mono cursor-pointer select-none py-1 px-2 rounded ${jaExiste ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                <input
                                  type="checkbox"
                                  disabled={jaExiste}
                                  checked={checked}
                                  onChange={e => {
                                    const next = e.target.checked
                                      ? [...(form.categorias ?? []), cat]
                                      : (form.categorias ?? []).filter(c => c !== cat);
                                    setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, categorias: next } }));
                                  }}
                                />
                                <span className={jaExiste ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300'}>{cat}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <select
                          value={form.materialId}
                          onChange={e => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, materialId: e.target.value } }))}
                          className="w-full bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none mb-3"
                        >
                          <option value="">Selecionar material...</option>
                          {materiaisArea.filter(mat => !precos.some(p => p.material_id === mat.id)).map(mat => (
                            <option key={mat.id} value={mat.id}>{mat.nome}</option>
                          ))}
                        </select>
                      )}

                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.preco}
                          onChange={e => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, preco: e.target.value } }))}
                          placeholder="Preço/ml"
                          className="w-28 bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-700 text-zinc-900 dark:text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 rounded-md dark:rounded-none"
                        />
                        <button
                          onClick={() => handleAddPrecoMaterial(m.id)}
                          disabled={!form.preco || (form.modo === 'categoria' ? (form.categorias ?? []).length === 0 : !form.materialId)}
                          className="bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-orange-600 dark:hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          <iconify-icon icon="solar:add-square-linear" width="14"></iconify-icon>
                          {form.modo === 'categoria' && (form.categorias ?? []).length > 1 ? `Adicionar (${form.categorias.length})` : 'Adicionar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {acabamentoSubAba === 'unitarios' && (
        <div className="space-y-6">
          <div className="flex justify-between items-end border-b border-zinc-200/80 dark:border-zinc-800 pb-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white uppercase flex items-center gap-2">
              <iconify-icon icon="solar:box-linear" class="text-orange-600 dark:text-yellow-400"></iconify-icon>
              Acabamentos Unitários
            </h2>
            <button onClick={() => openModal('acabamento_unitario')}
              className="bg-orange-500 hover:bg-orange-600 text-white dark:bg-yellow-400 dark:hover:bg-yellow-300 dark:text-black rounded-xl dark:rounded-none text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_6px_20px_rgba(249,115,22,0.23)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2">
              <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
            </button>
          </div>
          <div className="bg-white/90 dark:bg-[#020202] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500">
              <div>Nome</div><div>Subcategoria</div><div>Preço</div><div>Status</div><div className="text-right">Ações</div>
            </div>
            {acabamentosUnitarios.length === 0 ? (
              <div className="p-8 text-center">
                <iconify-icon icon="solar:box-linear" width="28" className="text-zinc-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Nenhum acabamento cadastrado</p>
              </div>
            ) : acabamentosUnitarios.map(a => (
              <div key={a.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800/50 items-center hover:bg-zinc-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
                <div className="text-zinc-900 dark:text-white uppercase font-medium">{a.nome}</div>
                <div><span className="text-[10px] font-mono border border-zinc-200/80 dark:border-zinc-700 bg-white dark:bg-black px-2 py-1 uppercase text-zinc-500 dark:text-zinc-400">{a.subcategoria}</span></div>
                <div className="font-mono text-zinc-600 dark:text-zinc-300">R$ {Number(a.preco_unitario).toFixed(2)}</div>
                <div>
                  <button onClick={() => handleToggle(setAcabamentosUnitarios, acabamentosUnitarios, a.id)}
                    className={`flex items-center gap-2 text-[10px] font-mono uppercase ${a.ativo ? 'text-orange-600 dark:text-yellow-400' : 'text-zinc-500 dark:text-zinc-600'}`}>
                    <iconify-icon icon={a.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                    {a.ativo ? 'Ativo' : 'Oculto'}
                  </button>
                </div>
                <div className="text-right flex items-center justify-end gap-2">
                  <button onClick={() => openModal('acabamento_unitario', a)}
                    className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-800 px-3 py-1">
                    <iconify-icon icon="solar:pen-linear"></iconify-icon>
                  </button>
                  <button onClick={async e => {
                    e.stopPropagation();
                    if (!window.confirm('Excluir este acabamento?')) return;
                    const { error } = await supabase.from('produtos_avulsos').delete().eq('id', a.id);
                    if (error) { alert(error.message); return; }
                    setAcabamentosUnitarios(prev => prev.filter(x => x.id !== a.id));
                  }} className="text-zinc-500 dark:text-zinc-500 hover:text-red-400 bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-800 px-3 py-1">
                    <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
