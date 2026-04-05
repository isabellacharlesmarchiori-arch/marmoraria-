import React, { useState, useEffect } from 'react';

// --- MOCK DATA ---
const MOCK_EMPRESA = {
  nome: 'Marmoraria X',
  email: 'contato@marmorariax.com.br',
  logo: null
};

const MOCK_USUARIOS = [
  { id: 1, nome: 'Ana Vendedora', email: 'ana@marmoraria.com', perfil: 'vendedor', ativo: true },
  { id: 2, nome: 'João Medidor', email: 'joao@marmoraria.com', perfil: 'medidor', ativo: true },
  { id: 3, nome: 'Carlos Admin', email: 'carlos@marmoraria.com', perfil: 'admin', ativo: false },
];

const MOCK_MATERIAIS_AREA = [
  { id: 1, nome: 'Branco Siena', categoria: 'Granito', preco1: 300, preco2: 350, preco3: 450, ativo: true },
  { id: 2, nome: 'Calacatta', categoria: 'Lâmina Cint.', preco1: 1200, preco2: 1500, preco3: 0, ativo: true },
];

const MOCK_MATERIAIS_LINEARES = [
  { id: 1, nome: 'Meia Esquadria', tipo: 'acabamento_aresta', precoml: 65, ativo: true },
  { id: 2, nome: 'Rodapé 10cm', tipo: 'material_linear', precoml: 45, ativo: true },
];

const MOCK_PRODUTOS = [
  { id: 1, nome: 'Cuba Inox Tramontina', subcategoria: 'Cubas', precoUnitario: 350, incluiMaterial: false, ativo: true },
  { id: 2, nome: 'Cola Cuba', subcategoria: 'Insumos', precoUnitario: 45, incluiMaterial: false, ativo: true },
];

const MOCK_PAGAMENTOS = [
  { id: 1, nome: 'Pix Banco Inter', tipo: 'Pix', campos: ['chave', 'nome_cliente'], ativo: true },
  { id: 2, nome: 'Cartão de Crédito - Rede', tipo: 'Crédito', campos: ['maquininha', 'bandeira'], ativo: true },
];

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState('empresa');

  // States
  const [empresa, setEmpresa] = useState(MOCK_EMPRESA);
  const [usuarios, setUsuarios] = useState(MOCK_USUARIOS);
  const [materiaisArea, setMateriaisArea] = useState(MOCK_MATERIAIS_AREA);
  const [materiaisLineares, setMateriaisLineares] = useState(MOCK_MATERIAIS_LINEARES);
  const [produtos, setProdutos] = useState(MOCK_PRODUTOS);
  const [pagamentos, setPagamentos] = useState(MOCK_PAGAMENTOS);

  // Modals
  const [modalState, setModalState] = useState({ isOpen: false, type: null, item: null });

  useEffect(() => {
    const revealElements = document.querySelectorAll('.sys-reveal');
    revealElements.forEach(el => {
      el.classList.remove('sys-active');
      setTimeout(() => el.classList.add('sys-active'), 10);
    });
  }, [activeTab]);

  const openModal = (type, item = null) => {
    setModalState({ isOpen: true, type, item });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, type: null, item: null });
  };

  const handleToggle = (setter, list, id) => {
    setter(list.map(item => item.id === id ? { ...item, ativo: !item.ativo } : item));
  };

  // Shared Modal Save Handler
  const handleSaveModal = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const { type, item } = modalState;

    if (type === 'usuario') {
      const isNew = !item;
      const novoId = isNew ? Math.max(...usuarios.map(u => u.id), 0) + 1 : item.id;
      const newData = { id: novoId, ...data, ativo: isNew ? true : item.ativo };
      setUsuarios(isNew ? [...usuarios, newData] : usuarios.map(u => u.id === item.id ? newData : u));
    } else if (type === 'material_area') {
      const isNew = !item;
      const novoId = isNew ? Math.max(...materiaisArea.map(m => m.id), 0) + 1 : item.id;
      const newData = { 
        id: novoId, 
        ...data, 
        preco1: Number(data.preco1), preco2: Number(data.preco2), preco3: Number(data.preco3),
        ativo: isNew ? true : item.ativo 
      };
      setMateriaisArea(isNew ? [...materiaisArea, newData] : materiaisArea.map(m => m.id === item.id ? newData : m));
    } else if (type === 'material_linear') {
      const isNew = !item;
      const novoId = isNew ? Math.max(...materiaisLineares.map(m => m.id), 0) + 1 : item.id;
      const newData = { id: novoId, ...data, precoml: Number(data.precoml), ativo: isNew ? true : item.ativo };
      setMateriaisLineares(isNew ? [...materiaisLineares, newData] : materiaisLineares.map(m => m.id === item.id ? newData : m));
    } else if (type === 'produto') {
      const isNew = !item;
      const novoId = isNew ? Math.max(...produtos.map(p => p.id), 0) + 1 : item.id;
      const newData = { id: novoId, ...data, precoUnitario: Number(data.precoUnitario), incluiMaterial: !!data.incluiMaterial, ativo: isNew ? true : item.ativo };
      setProdutos(isNew ? [...produtos, newData] : produtos.map(p => p.id === item.id ? newData : p));
    } else if (type === 'pagamento') {
      const isNew = !item;
      const novoId = isNew ? Math.max(...pagamentos.map(p => p.id), 0) + 1 : item.id;
      const newData = { id: novoId, ...data, campos: data.campos.split(',').map(c => c.trim()), ativo: isNew ? true : item.ativo };
      setPagamentos(isNew ? [...pagamentos, newData] : pagamentos.map(p => p.id === item.id ? newData : p));
    }

    closeModal();
  };

  const tabs = [
    { id: 'empresa', label: 'Dados da Empresa', icon: 'solar:buildings-linear' },
    { id: 'usuarios', label: 'Usuários', icon: 'solar:users-group-rounded-linear' },
    { id: 'materiais_area', label: 'Materiais de Área', icon: 'solar:slider-minimalistic-horizontal-linear' },
    { id: 'materiais_lineares', label: 'Materiais Lineares', icon: 'solar:sort-from-bottom-to-top-linear' },
    { id: 'produtos', label: 'Produtos Avulsos', icon: 'solar:box-linear' },
    { id: 'pagamentos', label: 'Formas de Pag.', icon: 'solar:wallet-money-linear' },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 font-sans selection:bg-white selection:text-black flex">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      {/* Sidebar Nav */}
      <div className="w-64 bg-[#020202] border-r border-zinc-800 p-6 flex flex-col relative z-10 h-screen sticky top-0 shrink-0">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-6">
          09 // System
        </div>
        <h1 className="text-2xl font-medium text-white tracking-tighter uppercase mb-8">Configurações</h1>
        
        <nav className="flex flex-col gap-2 flex-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-mono uppercase tracking-widest transition-all text-left ${
                activeTab === tab.id 
                  ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.2)] font-bold' 
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800'
              }`}
            >
              <iconify-icon icon={tab.icon}></iconify-icon>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-12 h-screen overflow-y-auto relative z-10 custom-scrollbar">
        <div className="max-w-5xl mx-auto sys-reveal">
          
          {/* CONTENT: Dados da Empresa */}
          {activeTab === 'empresa' && (
            <div className="bg-[#020202] border border-zinc-800 p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <iconify-icon icon="solar:buildings-linear" width="120"></iconify-icon>
              </div>
              <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                <iconify-icon icon="solar:buildings-linear" class="text-yellow-400"></iconify-icon> Dados da Empresa
              </h2>
              <form className="space-y-6 max-w-xl" onSubmit={e => e.preventDefault()}>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">Logo da Empresa</label>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-24 h-24 border border-zinc-800 bg-black flex items-center justify-center relative overflow-hidden group">
                      <iconify-icon icon="solar:camera-linear" class="text-zinc-600 text-2xl group-hover:text-yellow-400 transition-colors"></iconify-icon>
                    </div>
                    <button type="button" className="text-xs font-mono uppercase bg-transparent border border-zinc-700 hover:border-white text-white px-4 py-2 transition-colors">
                      Selecionar Imagem
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">Razão Social / Nome</label>
                  <input type="text" value={empresa.nome} onChange={e => setEmpresa({...empresa, nome: e.target.value})} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">E-mail de Contato</label>
                  <input type="email" value={empresa.email} onChange={e => setEmpresa({...empresa, email: e.target.value})} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                </div>
                <button className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow w-max flex items-center gap-2">
                  <iconify-icon icon="solar:diskette-linear"></iconify-icon> Salvar Alterações
                </button>
              </form>
            </div>
          )}

          {/* CONTENT: Usuários */}
          {activeTab === 'usuarios' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:users-group-rounded-linear" class="text-yellow-400"></iconify-icon> Controle de Usuários
                </h2>
                <button onClick={() => openModal('usuario')} className="bg-yellow-400 text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:user-plus-linear"></iconify-icon> Convidar
                </button>
              </div>
              
              <div className="bg-[#020202] border border-zinc-800">
                <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-black text-[10px] uppercase font-mono text-zinc-500">
                  <div>Nome / E-mail</div>
                  <div>Perfil</div>
                  <div>Status</div>
                  <div className="text-right">Ações</div>
                </div>
                {usuarios.map(u => (
                  <div key={u.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800/50 items-center hover:bg-zinc-900/30 transition-colors">
                    <div>
                      <div className="text-white font-medium text-sm">{u.nome}</div>
                      <div className="text-xs font-mono text-zinc-500">{u.email}</div>
                    </div>
                    <div>
                      <span className="text-[10px] border border-zinc-700 bg-zinc-900 px-2 py-1 uppercase font-mono">{u.perfil}</span>
                    </div>
                    <div>
                      <button onClick={() => handleToggle(setUsuarios, usuarios, u.id)} className={`flex items-center gap-2 text-xs font-mono uppercase ${u.ativo ? 'text-green-400' : 'text-zinc-600'}`}>
                        <iconify-icon icon={u.ativo ? 'solar:toggle-on-bold' : 'solar:toggle-off-linear'} width="24"></iconify-icon>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                    <div className="text-right">
                      <button onClick={() => openModal('usuario', u)} className="text-zinc-500 hover:text-white bg-black border border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT: Materiais de Área */}
          {activeTab === 'materiais_area' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:slider-minimalistic-horizontal-linear" class="text-yellow-400"></iconify-icon> Materiais de Área (Chapas)
                </h2>
                <button onClick={() => openModal('material_area')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                </button>
              </div>
              
              <div className="bg-[#020202] border border-zinc-800 overflow-x-auto">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-black text-[10px] uppercase font-mono text-zinc-500 min-w-[800px]">
                  <div>Material</div>
                  <div>Categoria</div>
                  <div>R$/m² (1cm)</div>
                  <div>R$/m² (2cm)</div>
                  <div>R$/m² (3cm)</div>
                  <div>Status</div>
                  <div className="text-right flex-shrink-0 w-16">Ações</div>
                </div>
                {materiaisArea.map(m => (
                  <div key={m.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800/50 items-center hover:bg-zinc-900/30 transition-colors min-w-[800px] text-sm">
                    <div className="text-white uppercase font-medium">{m.nome}</div>
                    <div className="text-zinc-400 font-mono">{m.categoria}</div>
                    <div className="font-mono text-zinc-300">R$ {m.preco1.toFixed(2)}</div>
                    <div className="font-mono text-zinc-300">R$ {m.preco2.toFixed(2)}</div>
                    <div className="font-mono text-zinc-300">R$ {m.preco3.toFixed(2)}</div>
                    <div>
                      <button onClick={() => handleToggle(setMateriaisArea, materiaisArea, m.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                        {m.ativo ? 'Ativo' : 'Oculto'}
                      </button>
                    </div>
                    <div className="text-right flex-shrink-0 w-16">
                      <button onClick={() => openModal('material_area', m)} className="text-zinc-500 hover:text-white bg-black border border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT: Materiais Lineares */}
          {activeTab === 'materiais_lineares' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:sort-from-bottom-to-top-linear" class="text-yellow-400"></iconify-icon> Materiais Lineares & Acabamentos
                </h2>
                <button onClick={() => openModal('material_linear')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                </button>
              </div>
              
              <div className="bg-[#020202] border border-zinc-800">
                <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-black text-[10px] uppercase font-mono text-zinc-500">
                  <div>Descrição</div>
                  <div>Tipo</div>
                  <div>Preço por ml</div>
                  <div>Status</div>
                  <div className="text-right">Ações</div>
                </div>
                {materiaisLineares.map(m => (
                  <div key={m.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800/50 items-center hover:bg-zinc-900/30 transition-colors text-sm">
                    <div className="text-white uppercase font-medium">{m.nome}</div>
                    <div><span className="text-[10px] font-mono border border-zinc-700 bg-black px-2 py-1 uppercase text-zinc-400">{m.tipo.replace('_', ' ')}</span></div>
                    <div className="font-mono text-zinc-300">R$ {m.precoml.toFixed(2)}</div>
                    <div>
                      <button onClick={() => handleToggle(setMateriaisLineares, materiaisLineares, m.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                        {m.ativo ? 'Ativo' : 'Oculto'}
                      </button>
                    </div>
                    <div className="text-right">
                      <button onClick={() => openModal('material_linear', m)} className="text-zinc-500 hover:text-white bg-black border border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT: Produtos Avulsos */}
          {activeTab === 'produtos' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:box-linear" class="text-yellow-400"></iconify-icon> Produtos Avulsos / Insumos
                </h2>
                <button onClick={() => openModal('produto')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                </button>
              </div>
              
              <div className="bg-[#020202] border border-zinc-800">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800 bg-black text-[10px] uppercase font-mono text-zinc-500">
                  <div>Produto</div>
                  <div>Preço Unit.</div>
                  <div>Exclusões / Acresc.</div>
                  <div>Status</div>
                  <div className="text-right">Ações</div>
                </div>
                {produtos.map(p => (
                  <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-800/50 items-center hover:bg-zinc-900/30 transition-colors text-sm">
                    <div>
                      <div className="text-white uppercase font-medium">{p.nome}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-1">{p.subcategoria}</div>
                    </div>
                    <div className="font-mono text-zinc-300">R$ {p.precoUnitario.toFixed(2)}</div>
                    <div>
                      {p.incluiMaterial ? <span className="text-[10px] text-yellow-400 border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 font-mono uppercase">Deduz Área</span> : <span className="text-zinc-600">-</span>}
                    </div>
                    <div>
                      <button onClick={() => handleToggle(setProdutos, produtos, p.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${p.ativo ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        <iconify-icon icon={p.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                        {p.ativo ? 'Ativo' : 'Oculto'}
                      </button>
                    </div>
                    <div className="text-right">
                      <button onClick={() => openModal('produto', p)} className="text-zinc-500 hover:text-white bg-black border border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTENT: Formas de Pagamento */}
          {activeTab === 'pagamentos' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:wallet-money-linear" class="text-yellow-400"></iconify-icon> Formas de Pagamento
                </h2>
                <button onClick={() => openModal('pagamento')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pagamentos.map(p => (
                  <div key={p.id} className="bg-[#020202] border border-zinc-800 p-5 flex flex-col hover:border-zinc-500 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-white font-medium uppercase text-lg">{p.nome}</div>
                        <div className="text-[10px] font-mono border border-zinc-700 bg-black text-zinc-400 px-2 py-0.5 w-max mt-2">Tipo: {p.tipo}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleToggle(setPagamentos, pagamentos, p.id)} className={`text-xl ${p.ativo ? 'text-green-400' : 'text-zinc-600'}`}>
                           <iconify-icon icon={p.ativo ? 'solar:toggle-on-bold' : 'solar:toggle-off-linear'}></iconify-icon>
                        </button>
                        <button onClick={() => openModal('pagamento', p)} className="text-zinc-500 hover:text-white border border-zinc-800 bg-black px-2 py-1 flex items-center">
                          <iconify-icon icon="solar:pen-linear"></iconify-icon>
                        </button>
                      </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-zinc-800">
                      <div className="text-[10px] uppercase font-mono text-zinc-600 mb-2">Campos Dinâmicos Requeridos:</div>
                      <div className="flex flex-wrap gap-2">
                        {p.campos.map(c => (
                          <span key={c} className="text-[10px] font-mono text-zinc-400 bg-black border border-zinc-800 px-2 py-1">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODALS */}
      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="bg-[#050505] border border-zinc-800 border-t-yellow-400 border-t-2 w-full max-w-lg relative z-10 shadow-2xl sys-reveal sys-active flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tighter">
                {modalState.item ? 'Editar ' : 'Novo '}
                {modalState.type === 'usuario' && 'Usuário'}
                {modalState.type === 'material_area' && 'Material (Chapa)'}
                {modalState.type === 'material_linear' && 'Material/Acabamento Linear'}
                {modalState.type === 'produto' && 'Produto Avulso'}
                {modalState.type === 'pagamento' && 'Método de Pagamento'}
              </h3>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-square-linear" width="24"></iconify-icon>
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">
              
              {modalState.type === 'usuario' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Nome</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">E-mail (Login)</label>
                    <input type="email" name="email" required defaultValue={modalState.item?.email} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Perfil de Acesso</label>
                    <select name="perfil" defaultValue={modalState.item?.perfil || 'vendedor'} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono uppercase">
                      <option value="vendedor">Vendedor(a)</option>
                      <option value="medidor">Medidor(a)</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </>
              )}

              {modalState.type === 'material_area' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <label className="text-[10px] uppercase font-mono text-zinc-500">Nome do Material</label>
                      <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <label className="text-[10px] uppercase font-mono text-zinc-500">Categoria</label>
                      <input type="text" name="categoria" required defaultValue={modalState.item?.categoria} placeholder="Granito, Mármore..." className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border border-zinc-800 p-4 bg-[#020202]">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">R$/m² (1cm)</label>
                      <input type="number" step="0.01" name="preco1" required defaultValue={modalState.item?.preco1 || ''} className="w-full bg-black border border-zinc-800 text-white p-2 font-mono text-center focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">R$/m² (2cm)</label>
                      <input type="number" step="0.01" name="preco2" required defaultValue={modalState.item?.preco2 || ''} className="w-full bg-black border border-zinc-800 text-white p-2 font-mono text-center focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">R$/m² (3cm)</label>
                      <input type="number" step="0.01" name="preco3" required defaultValue={modalState.item?.preco3 || ''} className="w-full bg-black border border-zinc-800 text-white p-2 font-mono text-center focus:outline-none focus:border-yellow-400" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'material_linear' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Descrição</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-zinc-500">Tipo da Cobrança</label>
                      <select name="tipo" defaultValue={modalState.item?.tipo || 'acabamento_aresta'} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                        <option value="acabamento_aresta">Acabamento de Aresta</option>
                        <option value="material_linear">Material Linear Físico</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço / metro linear</label>
                      <input type="number" step="0.01" name="precoml" required defaultValue={modalState.item?.precoml || ''} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'produto' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Nome do Produto</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-zinc-500">Subcategoria</label>
                      <input type="text" name="subcategoria" required defaultValue={modalState.item?.subcategoria} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço Unitário (UN)</label>
                      <input type="number" step="0.01" name="precoUnitario" required defaultValue={modalState.item?.precoUnitario || ''} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                  <div className="border border-zinc-800 p-4 bg-black flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Deduzir Área da Chapa?</div>
                      <div className="text-[10px] text-zinc-500 font-mono uppercase mt-1">Ex: Furo de cuba diminui a área cobrada de pedra do cliente</div>
                    </div>
                    <input type="checkbox" name="incluiMaterial" defaultChecked={modalState.item?.incluiMaterial} className="w-5 h-5 accent-yellow-400" />
                  </div>
                </>
              )}

              {modalState.type === 'pagamento' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Identificação Comercial</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} placeholder="Ex: Cartão de Crédito - Stone" className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Tipo Base</label>
                    <select name="tipo" defaultValue={modalState.item?.tipo || 'Pix'} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                      <option value="Pix">Pix / Transferência</option>
                      <option value="Crédito">Cartão de Crédito</option>
                      <option value="Débito">Cartão de Débito</option>
                      <option value="Boleto">Boleto Bancário</option>
                      <option value="Dinheiro">Dinheiro Físico</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-zinc-500">Campos Dinâmicos (Separar por vírgula)</label>
                    <input type="text" name="campos" required defaultValue={modalState.item?.campos?.join(', ')} placeholder="bandeira, maquininha, n_parcelas" className="w-full bg-black border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    <div className="text-[10px] text-zinc-600 font-mono">São os campos que vendedor precisa preencher no formulário de fechamento.</div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-zinc-800 mt-auto">
                <button type="button" onClick={closeModal} className="flex-1 bg-transparent border border-zinc-800 text-white text-xs font-bold uppercase tracking-widest py-4 hover:bg-zinc-900 transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-white text-black text-xs font-bold uppercase tracking-widest py-4 border border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all flex items-center justify-center gap-2">
                  <iconify-icon icon="solar:diskette-linear"></iconify-icon> Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global CSS for scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020202; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        
        .sys-reveal { 
          opacity: 0; 
          transform: translateY(10px); 
          transition: opacity 0.4s ease-out, transform 0.4s ease-out; 
        }
        .sys-active { 
          opacity: 1; 
          transform: translate(0); 
        }
      `}} />
    </div>
  );
}
