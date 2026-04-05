import React, { useState, useEffect } from 'react';

// Mock Data
const MOCK_CLIENTES = [
  {
    id: 1,
    nome: 'Empresa Alpha Ltda',
    telefone: '(11) 98765-4321',
    email: 'contato@alpha.com.br',
    endereco: 'Av. Paulista, 1000 - São Paulo, SP',
    projetos: [
      { id: 101, nome: 'Sede Corporativa Alpha', status: 'entregue', data: '2026-01-15' },
      { id: 102, nome: 'Reforma Recepção', status: 'aprovado', data: '2026-03-20' },
    ],
  },
  {
    id: 2,
    nome: 'Construtora Beta',
    telefone: '(11) 91234-5678',
    email: 'projetos@beta.eng.br',
    endereco: 'Rua Augusta, 500 - São Paulo, SP',
    projetos: [
      { id: 103, nome: 'Edifício Beta Tower', status: 'produzindo', data: '2026-02-10' },
    ],
  },
  {
    id: 3,
    nome: 'Carlos Eduardo Silva',
    telefone: '(19) 99888-7777',
    email: 'carlos.eduardo@email.com',
    endereco: 'Rua das Flores, 123 - Campinas, SP',
    projetos: [
      { id: 104, nome: 'Casa Condemínio - Cozinha', status: 'orcado', data: '2026-04-01' },
      { id: 105, nome: 'Área Gourmet', status: 'perdido', data: '2025-11-05' },
    ],
  },
  {
    id: 4,
    nome: 'Design & Interiores',
    telefone: '(21) 97777-6666',
    email: 'contato@designinteriores.arq.br',
    endereco: 'Av. Rio Branco, 200 - Rio de Janeiro, RJ',
    projetos: [],
  }
];

export default function ClientesPage() {
  const [clientes, setClientes] = useState(MOCK_CLIENTES);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  
  // Animation on load
  useEffect(() => {
    const revealElements = document.querySelectorAll('.sys-reveal');
    revealElements.forEach(el => el.classList.add('sys-active'));
  }, [clientes, selectedCliente, isModalOpen]);

  // Handlers
  const handleBusca = (e) => {
    setSearchTerm(e.target.value);
  };

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (cliente = null) => {
    setEditingCliente(cliente);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingCliente(null);
    setIsModalOpen(false);
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newClienteData = {
      nome: formData.get('nome'),
      telefone: formData.get('telefone'),
      email: formData.get('email'),
      endereco: formData.get('endereco'),
    };

    if (editingCliente) {
      // Editar
      setClientes(clientes.map(c => c.id === editingCliente.id ? { ...c, ...newClienteData } : c));
      if (selectedCliente && selectedCliente.id === editingCliente.id) {
        setSelectedCliente({ ...selectedCliente, ...newClienteData });
      }
    } else {
      // Novo
      const novoId = clientes.length ? Math.max(...clientes.map(c => c.id)) + 1 : 1;
      setClientes([...clientes, { id: novoId, projetos: [], ...newClienteData }]);
    }
    
    handleCloseModal();
  };

  const statusColors = {
    orcado: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    aprovado: 'bg-[#020202] text-white border-white',
    produzindo: 'bg-zinc-900 text-yellow-400 border-yellow-400',
    entregue: 'bg-[#050505] text-zinc-400 border-zinc-600',
    perdido: 'bg-zinc-950 text-zinc-500 border-zinc-800 line-through'
  };

  const statusLabels = {
    orcado: 'Orçado',
    aprovado: 'Aprovado',
    produzindo: 'Produzindo',
    entregue: 'Entregue',
    perdido: 'Perdido'
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 font-sans selection:bg-white selection:text-black">
      {/* Background Assets */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      <div className="fixed inset-0 pointer-events-none z-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.01),rgba(255,255,255,0.01))] bg-[size:100%_2px,3px_100%] mix-blend-overlay"></div>
      
      <main className="relative z-10 max-w-[1400px] mx-auto p-6 md:p-12 lg:flex lg:gap-8 h-screen overflow-hidden">
        
        {/* Lado Esquerdo: Lista de Clientes */}
        <div className={`flex-1 flex flex-col h-full bg-[#020202] border border-zinc-800 ${selectedCliente ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header Lista */}
          <div className="p-6 border-b border-zinc-800 sys-reveal">
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-2">06 // Database</div>
                <h1 className="text-3xl font-medium text-white tracking-tighter uppercase">Clientes</h1>
              </div>
              <button 
                onClick={() => handleOpenModal()}
                className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] transition-shadow rounded-none flex items-center gap-2"
              >
                <iconify-icon icon="solar:user-plus-linear" width="16"></iconify-icon>
                Novo
              </button>
            </div>
            
            <div className="relative">
              <iconify-icon icon="solar:magnifer-linear" class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 w-5 h-5"></iconify-icon>
              <input 
                type="text" 
                placeholder="Buscar cliente por nome..." 
                value={searchTerm}
                onChange={handleBusca}
                className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-600 font-mono"
              />
            </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-3 custom-scrollbar">
            {filteredClientes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 sys-reveal">
                <iconify-icon icon="solar:ghost-linear" width="48" class="animate-pulse"></iconify-icon>
                <p className="font-mono text-xs uppercase tracking-widest text-center">Nenhum registro encontrado</p>
              </div>
            ) : (
              filteredClientes.map((cliente, index) => (
                <div 
                  key={cliente.id}
                  onClick={() => setSelectedCliente(cliente)}
                  className={`sys-reveal p-4 border transition-all duration-300 cursor-pointer rounded-none group ${
                    selectedCliente?.id === cliente.id 
                    ? 'border-yellow-400 bg-zinc-900 shadow-[0_0_15px_rgba(250,204,21,0.1)]' 
                    : 'border-zinc-800 bg-[#050505] hover:border-zinc-500 hover:bg-zinc-950'
                  }`}
                  style={{ transitionDelay: `${Math.min(index * 50, 500)}ms` }}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-medium text-lg flex items-center gap-2 ${selectedCliente?.id === cliente.id ? 'text-yellow-400' : 'text-white group-hover:text-white'}`}>
                      {cliente.nome}
                    </h3>
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 bg-black border border-zinc-800 px-2 py-1">
                      <iconify-icon icon="solar:folder-linear"></iconify-icon>
                      {cliente.projetos.length}
                    </div>
                  </div>
                  
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500 font-mono">
                    <div className="flex items-center gap-2">
                      <iconify-icon icon="solar:phone-linear" width="14"></iconify-icon>
                      {cliente.telefone || '---'}
                    </div>
                    <div className="flex items-center gap-2">
                      <iconify-icon icon="solar:letter-linear" width="14"></iconify-icon>
                      {cliente.email || '---'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lado Direito: Ficha do Cliente */}
        {selectedCliente ? (
          <div className="flex-[1.5] bg-[#020202] border border-zinc-800 flex flex-col h-full overflow-y-auto sys-reveal">
            
            {/* Mobile Header: Voltar */}
            <div className="lg:hidden p-4 border-b border-zinc-800 flex items-center">
              <button 
                onClick={() => setSelectedCliente(null)}
                className="flex items-center gap-2 text-xs font-mono uppercase text-zinc-400 hover:text-white transition-colors"
              >
                <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
                Voltar à lista
              </button>
            </div>

            {/* Ficha Header */}
            <div className="p-8 border-b border-zinc-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity">
                <iconify-icon icon="solar:user-id-linear" width="120"></iconify-icon>
              </div>
              
              <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 bg-black px-2 py-1">
                  ID_{selectedCliente.id.toString().padStart(4, '0')}
                </div>
                <button 
                  onClick={() => handleOpenModal(selectedCliente)}
                  className="text-xs font-mono uppercase text-white bg-transparent border border-zinc-600 hover:border-yellow-400 hover:text-yellow-400 px-4 py-2 transition-colors flex items-center gap-2"
                >
                  <iconify-icon icon="solar:pen-linear"></iconify-icon>
                  Editar Ficha
                </button>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-semibold text-white tracking-tighter uppercase mt-6 relative z-10 flex items-center gap-4">
                {selectedCliente.nome}
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 relative z-10">
                <div className="bg-black border border-zinc-800 p-4 flex items-start gap-4 hover:border-zinc-700 transition-colors">
                  <iconify-icon icon="solar:phone-linear" class="text-zinc-500 text-xl mt-1"></iconify-icon>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-zinc-600 mb-1">Contato Telefônico</div>
                    <div className="text-white font-mono text-sm">{selectedCliente.telefone || 'Não informado'}</div>
                  </div>
                </div>
                
                <div className="bg-black border border-zinc-800 p-4 flex items-start gap-4 hover:border-zinc-700 transition-colors">
                  <iconify-icon icon="solar:letter-linear" class="text-zinc-500 text-xl mt-1"></iconify-icon>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-zinc-600 mb-1">Correio Eletrônico</div>
                    <div className="text-white font-mono text-sm">{selectedCliente.email || 'Não informado'}</div>
                  </div>
                </div>

                <div className="bg-black border border-zinc-800 p-4 flex items-start gap-4 md:col-span-2 hover:border-zinc-700 transition-colors">
                  <iconify-icon icon="solar:map-point-linear" class="text-zinc-500 text-xl mt-1"></iconify-icon>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-zinc-600 mb-1">Localização Física</div>
                    <div className="text-white font-mono text-sm">{selectedCliente.endereco || 'Não informado'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Projetos Vinculados */}
            <div className="p-8 flex-1">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                  <iconify-icon icon="solar:layers-linear" class="text-yellow-400"></iconify-icon>
                  Projetos Vinculados
                </h3>
              </div>

              {selectedCliente.projetos.length === 0 ? (
                <div className="border border-zinc-800 bg-black p-12 flex flex-col items-center justify-center text-zinc-600">
                  <iconify-icon icon="solar:box-minimalistic-linear" width="48" class="mb-4"></iconify-icon>
                  <p className="font-mono text-sm uppercase tracking-widest">Nenhum projeto associado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedCliente.projetos.map(proj => (
                    <div key={proj.id} className="border border-zinc-800 bg-black p-5 hover:border-zinc-600 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-white font-medium group-hover:text-yellow-400 transition-colors uppercase">{proj.nome}</h4>
                        </div>
                        <div className="text-xs font-mono text-zinc-500 flex items-center gap-4">
                          <span className="flex items-center gap-1"><iconify-icon icon="solar:calendar-linear"></iconify-icon> {proj.data}</span>
                          <span className="flex items-center gap-1"><iconify-icon icon="solar:hashtag-linear"></iconify-icon> {proj.id.toString().padStart(4, '0')}</span>
                        </div>
                      </div>
                      <div className={`px-3 py-1 border text-[10px] font-mono uppercase flex items-center gap-2 w-max ${statusColors[proj.status]}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${proj.status === 'produzindo' ? 'bg-yellow-400 animate-pulse' : 'bg-current'}`}></div>
                        {statusLabels[proj.status]}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>
        ) : (
          <div className="hidden lg:flex flex-[1.5] bg-[#020202] border border-zinc-800 items-center justify-center relative overflow-hidden sys-reveal">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.02),transparent_60%)] pointer-events-none"></div>
            <div className="flex flex-col items-center text-zinc-600 relative z-10">
              <div className="w-24 h-24 border-2 border-dashed border-zinc-800 rounded-full flex items-center justify-center mb-6 animate-[spin_10s_linear_infinite]">
                <iconify-icon icon="solar:user-rounded-linear" width="32" class="animate-[spin_10s_linear_infinite_reverse]"></iconify-icon>
              </div>
              <p className="font-mono text-sm uppercase tracking-widest">Aguardando Seleção de Entidade</p>
              <div className="mt-4 px-3 py-1 bg-black border border-zinc-800 text-[10px] font-mono text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.1)]">
                SYS_STANDBY
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Novo/Editar Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCloseModal}></div>
          <div className="bg-[#050505] border border-zinc-800 border-t-yellow-400 border-t-2 w-full max-w-lg relative z-10 shadow-2xl sys-reveal sys-active flex flex-col max-h-[90vh]">
            
            <div className="flex justify-between items-center p-6 border-b border-zinc-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tighter">
                {editingCliente ? 'Atualizar Entidade' : 'Nova Entidade'}
              </h3>
              <button onClick={handleCloseModal} className="text-zinc-500 hover:text-white transition-colors">
                <iconify-icon icon="solar:close-square-linear" width="24"></iconify-icon>
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">
              
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-2">
                  <iconify-icon icon="solar:user-linear"></iconify-icon> Razão Social / Nome <span className="text-yellow-400">*</span>
                </label>
                <input 
                  type="text" 
                  name="nome"
                  required
                  defaultValue={editingCliente?.nome || ''}
                  placeholder="Ex: Marmoraria X" 
                  className="w-full bg-[#020202] border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-2">
                    <iconify-icon icon="solar:phone-linear"></iconify-icon> Telefone
                  </label>
                  <input 
                    type="tel" 
                    name="telefone"
                    defaultValue={editingCliente?.telefone || ''}
                    placeholder="(00) 00000-0000" 
                    className="w-full bg-[#020202] border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-white transition-colors placeholder:text-zinc-700 font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-2">
                    <iconify-icon icon="solar:letter-linear"></iconify-icon> E-mail
                  </label>
                  <input 
                    type="email" 
                    name="email"
                    defaultValue={editingCliente?.email || ''}
                    placeholder="contato@empresa.com" 
                    className="w-full bg-[#020202] border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-white transition-colors placeholder:text-zinc-700 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-mono text-zinc-500 flex items-center gap-2">
                  <iconify-icon icon="solar:map-point-linear"></iconify-icon> Endereço Completo
                </label>
                <textarea 
                  name="endereco"
                  rows="3"
                  defaultValue={editingCliente?.endereco || ''}
                  placeholder="Rua, Número, Bairro, Cidade - UF" 
                  className="w-full bg-[#020202] border border-zinc-800 text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-white transition-colors placeholder:text-zinc-700 resize-none font-mono custom-scrollbar"
                ></textarea>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-zinc-800 mt-auto">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="flex-1 bg-transparent border border-zinc-800 text-white text-xs font-bold uppercase tracking-widest py-4 hover:bg-zinc-900 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-white text-black text-xs font-bold uppercase tracking-widest py-4 border border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all flex justify-center items-center gap-2"
                >
                  <iconify-icon icon="solar:diskette-linear"></iconify-icon>
                  {editingCliente ? 'Salvar Edições' : 'Gravar Registro'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Global Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          color-scheme: dark;
        }
        
        .sys-reveal { 
          opacity: 0; 
          transform: translateY(10px); 
          filter: blur(2px); 
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), filter 0.6s ease-out; 
        }
        .sys-active { 
          opacity: 1; 
          transform: translate(0) scale(1); 
          filter: blur(0); 
        }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020202; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}} />
    </div>
  );
}
