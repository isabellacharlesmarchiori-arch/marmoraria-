import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

import AbaEmpresa             from '../components/configuracoes/AbaEmpresa';
import AbaUsuarios            from '../components/configuracoes/AbaUsuarios';
import AbaMateriaisArea       from '../components/configuracoes/AbaMateriaisArea';
import AbaMateriaisLineares   from '../components/configuracoes/AbaMateriaisLineares';
import AbaProdutos            from '../components/configuracoes/AbaProdutos';

export default function ConfiguracoesPage() {
  const { profile, session, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('empresa');
  const empresaId = profile?.empresa_id ?? null;

  // ── Materiais ──
  const [materiaisArea,     setMateriaisArea]     = useState([]);
  const [materiaisLineares, setMateriaisLineares] = useState([]);
  const [loadingMateriais,  setLoadingMateriais]  = useState(false);
  const [produtos,          setProdutos]          = useState([]);
  const [pagamentos,        setPagamentos]        = useState([]);
  const [precosMaterial,    setPrecosMaterial]    = useState({});
  const [acabamentosUnitarios, setAcabamentosUnitarios] = useState([]);

  // ── Usuários ──
  const [usuarios, setUsuarios] = useState([]);

  // ── Modal genérico (não-materiais) ──
  const [modalState,   setModalState]   = useState({ isOpen: false, type: null, item: null });
  const [novaSenha,    setNovaSenha]    = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // ── Fetch materiais ──
  const fetchMateriais = useCallback(async () => {
    if (!session || !empresaId) return;
    setLoadingMateriais(true);
    const [{ data: area, error: errArea }, { data: linear, error: errLinear }] = await Promise.all([
      supabase.from('materiais')
        .select('*, variacoes_precos(*)')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase.from('materiais_lineares')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]);
    if (errArea)   console.error('Erro materiais área:', errArea);
    if (errLinear) console.error('Erro materiais lineares:', errLinear);
    if (area)   setMateriaisArea(area);
    if (linear) setMateriaisLineares(linear);
    const { data: precos } = await supabase
      .from('acabamento_precos_material')
      .select('id, material_linear_id, categoria, preco_ml, material_id, materiais(nome)')
      .eq('empresa_id', empresaId);
    const grouped = {};
    for (const p of precos ?? []) {
      if (!grouped[p.material_linear_id]) grouped[p.material_linear_id] = [];
      grouped[p.material_linear_id].push(p);
    }
    setPrecosMaterial(grouped);
    const { data: unitarios } = await supabase
      .from('produtos_avulsos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (unitarios) setAcabamentosUnitarios(unitarios);
    setLoadingMateriais(false);
  }, [session, empresaId]);

  useEffect(() => { fetchMateriais(); }, [fetchMateriais]);

  // ── Fetch usuários ──
  const fetchUsuarios = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, ativo')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (error) console.error(error);
    if (data) setUsuarios(data);
  }, [empresaId]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  useEffect(() => {
    document.querySelectorAll('.sys-reveal').forEach(el => {
      el.classList.remove('sys-active');
      setTimeout(() => el.classList.add('sys-active'), 10);
    });
  }, [activeTab]);

  // ── Helpers modal genérico ──
  const openModal  = (type, item = null) => setModalState({ isOpen: true, type, item });
  const closeModal = () => setModalState({ isOpen: false, type: null, item: null });
  const handleToggle = (setter, list, id) =>
    setter(list.map(item => item.id === id ? { ...item, ativo: !item.ativo } : item));

  const handleToggleUsuario = async (id, ativoAtual) => {
    const { error } = await supabase
      .from('usuarios')
      .update({ ativo: !ativoAtual })
      .eq('id', id);
    if (error) { alert(error.message); return; }
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ativo: !ativoAtual } : u));
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const { type, item } = modalState;

    if (type === 'material_linear') {
      const payload = { nome: data.nome, tipo: data.tipo, preco_ml: Number(data.preco_ml), empresa_id: profile.empresa_id };
      if (item) {
        const { data: updated, error } = await supabase.from('materiais_lineares').update(payload).eq('id', item.id).select().single();
        if (error) { alert(error.message); return; }
        setMateriaisLineares(prev => prev.map(m => m.id === item.id ? updated : m));
      } else {
        const { data: inserted, error } = await supabase.from('materiais_lineares').insert({ ...payload, ativo: true }).select().single();
        if (error) { alert(error.message); return; }
        setMateriaisLineares(prev => [...prev, inserted]);
      }
    } else if (type === 'usuario') {
      const { nome, email, perfil } = data;
      if (item) {
        const { error } = await supabase
          .from('usuarios')
          .update({ nome, perfil })
          .eq('id', item.id);
        if (error) { alert('Erro ao atualizar: ' + error.message); return; }
        setUsuarios(prev => prev.map(u => u.id === item.id ? { ...u, nome, perfil } : u));
        if (item.id === session?.user?.id) await refreshProfile();
        alert('Usuário atualizado com sucesso!');
      } else {
        if (!novaSenha || novaSenha.length < 8) {
          alert('A senha deve ter no mínimo 8 caracteres.');
          return;
        }

        // Cliente temporário sem persistência de sessão: cria auth user
        // sem deslogar o admin atual nem tocar no localStorage.
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email,
          password: novaSenha,
          options: { data: { nome } }
        });

        if (authError) { alert('Erro ao criar acesso: ' + authError.message); return; }

        const userId = authData.user?.id;
        if (!userId) { alert('Erro: ID do usuário não foi gerado pelo Auth.'); return; }

        const { data: novoUser, error: errInsert } = await supabase
          .from('usuarios')
          .insert([{ id: userId, nome, email, perfil, empresa_id: profile.empresa_id, ativo: true }])
          .select()
          .single();
        if (errInsert) { alert('Erro ao cadastrar: ' + errInsert.message); return; }

        const credenciais = `Email: ${email}\nSenha: ${novaSenha}`;
        try {
          await navigator.clipboard.writeText(credenciais);
          alert(`✅ Usuário criado com sucesso!\n\nEmail: ${email}\nSenha: ${novaSenha}\n\n📋 Credenciais copiadas para a área de transferência.`);
        } catch {
          alert(`✅ Usuário criado com sucesso!\n\nEmail: ${email}\nSenha: ${novaSenha}\n\nAnote ou envie essas credenciais para o usuário.`);
        }

        setNovaSenha('');
        setMostrarSenha(false);
        setUsuarios(prev => [...prev, novoUser]);
      }
    } else if (type === 'produto') {
      const isNew = !item;
      const novoId = isNew ? (produtos.length > 0 ? Math.max(...produtos.map(p => p.id)) + 1 : 1) : item.id;
      const nd = { id: novoId, ...data, precoUnitario: Number(data.precoUnitario), incluiMaterial: !!data.incluiMaterial, ativo: isNew ? true : item.ativo };
      setProdutos(isNew ? [...produtos, nd] : produtos.map(p => p.id === item.id ? nd : p));
    } else if (type === 'pagamento') {
      const isNew = !item;
      const novoId = isNew ? (pagamentos.length > 0 ? Math.max(...pagamentos.map(p => p.id)) + 1 : 1) : item.id;
      const nd = { id: novoId, ...data, campos: data.campos.split(',').map(c => c.trim()), ativo: isNew ? true : item.ativo };
      setPagamentos(isNew ? [...pagamentos, nd] : pagamentos.map(p => p.id === item.id ? nd : p));
    } else if (type === 'acabamento_unitario') {
      const payload = { nome: data.nome, subcategoria: data.subcategoria, preco_unitario: Number(data.preco_unitario), empresa_id: profile.empresa_id };
      if (item) {
        const { data: updated, error } = await supabase.from('produtos_avulsos').update(payload).eq('id', item.id).select().single();
        if (error) { alert(error.message); return; }
        setAcabamentosUnitarios(prev => prev.map(a => a.id === item.id ? updated : a));
      } else {
        const { data: inserted, error } = await supabase.from('produtos_avulsos').insert({ ...payload, ativo: true }).select().single();
        if (error) { alert(error.message); return; }
        setAcabamentosUnitarios(prev => [...prev, inserted]);
      }
    }
    closeModal();
  };

  const tabs = [
    { id: 'empresa',            label: 'Dados da Empresa',    icon: 'solar:buildings-linear' },
    { id: 'usuarios',           label: 'Usuários',            icon: 'solar:users-group-rounded-linear' },
    { id: 'materiais_area',     label: 'Matéria Prima',       icon: 'solar:slider-minimalistic-horizontal-linear' },
    { id: 'materiais_lineares', label: 'Acabamentos',         icon: 'solar:sort-from-bottom-to-top-linear' },
    { id: 'produtos',           label: 'Produtos de Revenda', icon: 'solar:box-linear' },
  ];

  return (
    <div className="flex-1 min-h-0 bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-zinc-400 font-sans selection:bg-gray-200 dark:selection:bg-white selection:text-black flex">
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>

      {/* Sidebar Nav */}
      <div className="w-64 bg-gray-50 dark:bg-[#020202] border-r border-gray-300 dark:border-zinc-800 p-6 flex flex-col relative z-10 h-screen sticky top-0 shrink-0">
        <div className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-6">
          09 // System
        </div>
        <h1 className="text-2xl font-medium text-gray-900 dark:text-white tracking-tighter uppercase mb-8">Configurações</h1>
        <nav className="flex flex-col gap-2 flex-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-mono uppercase tracking-widest transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.2)] font-bold'
                  : 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 border border-transparent hover:border-gray-300 dark:hover:border-zinc-800'
              }`}
            >
              <iconify-icon icon={tab.icon}></iconify-icon>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto relative z-10 custom-scrollbar min-h-0">
        <div className="sys-reveal">

          {activeTab === 'empresa' && <AbaEmpresa />}

          {activeTab === 'usuarios' && (
            <AbaUsuarios
              usuarios={usuarios}
              openModal={openModal}
              handleToggleUsuario={handleToggleUsuario}
            />
          )}

          {activeTab === 'materiais_area' && (
            <AbaMateriaisArea
              materiaisArea={materiaisArea}
              setMateriaisArea={setMateriaisArea}
              loadingMateriais={loadingMateriais}
              fetchMateriais={fetchMateriais}
              profile={profile}
              handleToggle={handleToggle}
            />
          )}

          {activeTab === 'materiais_lineares' && (
            <AbaMateriaisLineares
              materiaisLineares={materiaisLineares}
              setMateriaisLineares={setMateriaisLineares}
              materiaisArea={materiaisArea}
              precosMaterial={precosMaterial}
              setPrecosMaterial={setPrecosMaterial}
              acabamentosUnitarios={acabamentosUnitarios}
              setAcabamentosUnitarios={setAcabamentosUnitarios}
              loadingMateriais={loadingMateriais}
              openModal={openModal}
              handleToggle={handleToggle}
              empresaId={empresaId}
            />
          )}

          {activeTab === 'produtos' && (
            <AbaProdutos
              produtos={produtos}
              setProdutos={setProdutos}
              openModal={openModal}
              handleToggle={handleToggle}
            />
          )}

        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020202; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        @media (prefers-reduced-motion: no-preference) {
          .sys-reveal { opacity: 0; transition: opacity 0.5s ease; }
          .sys-active.sys-reveal { opacity: 1; }
        }
      `}} />

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL GENÉRICO — Usuário, Linear, Produto, Pagamento
      ════════════════════════════════════════════════════════════════════════ */}
      {modalState.isOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="bg-gray-50 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 border-t-yellow-400 border-t-2 w-full max-w-lg relative z-10 shadow-2xl sys-reveal sys-active flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-300 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">
                {modalState.item ? 'Editar ' : 'Novo '}
                {modalState.type === 'usuario'             && 'Usuário'}
                {modalState.type === 'material_linear'     && 'Material/Acabamento Linear'}
                {modalState.type === 'produto'             && 'Produto Avulso'}
                {modalState.type === 'pagamento'           && 'Método de Pagamento'}
                {modalState.type === 'acabamento_unitario' && 'Acabamento Unitário'}
              </h3>
              <button onClick={closeModal} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <iconify-icon icon="solar:close-square-linear" width="24"></iconify-icon>
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">

              {modalState.type === 'usuario' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  {!modalState.item && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">E-mail (Login)</label>
                        <input type="email" name="email" required className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Senha Inicial</label>
                        <div className="relative">
                          <input
                            type={mostrarSenha ? 'text' : 'password'}
                            value={novaSenha}
                            onChange={(e) => setNovaSenha(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            minLength={8}
                            required
                            className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 pr-12 text-sm focus:outline-none focus:border-yellow-400 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setMostrarSenha(!mostrarSenha)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-white transition-colors"
                          >
                            <iconify-icon icon={mostrarSenha ? 'solar:eye-closed-linear' : 'solar:eye-linear'} className="text-lg"></iconify-icon>
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-600">O usuário poderá alterar depois no primeiro acesso.</p>
                      </div>
                    </>
                  )}
                  {modalState.item && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">E-mail</label>
                      <div className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 px-4 py-3 text-sm font-mono">{modalState.item.email}</div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Perfil de Acesso</label>
                    <select name="perfil" defaultValue={modalState.item?.perfil || 'vendedor'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono uppercase">
                      <option value="vendedor">Vendedor(a)</option>
                      <option value="medidor">Medidor(a)</option>
                      <option value="admin">Administrador</option>
                      <option value="admin_medidor">Admin + Medidor</option>
                      <option value="vendedor_medidor">Vendedor + Medidor</option>
                    </select>
                  </div>
                </>
              )}

              {modalState.type === 'material_linear' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Descrição</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Tipo da Cobrança</label>
                      <select name="tipo" defaultValue={modalState.item?.tipo || 'acabamento_aresta'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                        <option value="acabamento_aresta">Acabamento de Aresta</option>
                        <option value="material_linear">Material Linear Físico</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço / metro linear</label>
                      <input type="number" step="0.01" name="preco_ml" required defaultValue={modalState.item?.preco_ml || ''} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'produto' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Produto</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Subcategoria</label>
                      <input type="text" name="subcategoria" required defaultValue={modalState.item?.subcategoria} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço Unitário (UN)</label>
                      <input type="number" step="0.01" name="precoUnitario" required defaultValue={modalState.item?.precoUnitario || ''} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'acabamento_unitario' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Acabamento</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome}
                      placeholder="Ex: Rodameio, Soleira, Cuba"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Subcategoria</label>
                      <input type="text" name="subcategoria" defaultValue={modalState.item?.subcategoria || ''}
                        placeholder="Ex: Cuba, Soleira, Rodameio"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço</label>
                      <input type="number" step="0.01" name="preco_unitario" required defaultValue={modalState.item?.preco_unitario || ''}
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'pagamento' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Identificação Comercial</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} placeholder="Ex: Cartão de Crédito - Stone" className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Tipo Base</label>
                    <select name="tipo" defaultValue={modalState.item?.tipo || 'Pix'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                      <option value="Pix">Pix / Transferência</option>
                      <option value="Crédito">Cartão de Crédito</option>
                      <option value="Débito">Cartão de Débito</option>
                      <option value="Boleto">Boleto Bancário</option>
                      <option value="Dinheiro">Dinheiro Físico</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Campos Dinâmicos (Separar por vírgula)</label>
                    <input type="text" name="campos" required defaultValue={modalState.item?.campos?.join(', ')} placeholder="bandeira, maquininha, n_parcelas" className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    <div className="text-[10px] text-gray-500 dark:text-zinc-600 font-mono">Campos que o vendedor precisa preencher no fechamento.</div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-gray-300 dark:border-zinc-800 mt-auto">
                <button type="button" onClick={closeModal} className="flex-1 bg-transparent border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest py-4 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-white text-black text-xs font-bold uppercase tracking-widest py-4 border border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all flex items-center justify-center gap-2">
                  <iconify-icon icon="solar:diskette-linear"></iconify-icon> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
