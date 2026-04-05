import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function ClientesPage() {
  const { profile, session } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  // Fetch clientes from Supabase
  useEffect(() => {
    const empresaId = profile?.empresa_id;
    if (!session || !empresaId) return;

    let isMounted = true;
    let fallbackTimeout;

    async function fetchData(attemptOrEvent) {
      if (!isMounted) return;
      const attempt = typeof attemptOrEvent === 'number' ? attemptOrEvent : 1;
      try {
        setLoadingClientes(true);
        setFetchError(false);

        const { data, error } = await supabase
          .from('clientes')
          .select('*, projetos(id, nome, status, created_at)')
          .eq('empresa_id', empresaId)
          .order('nome');

        if (error) throw error;

        if (data) {
          setClientes(data.map(c => ({
            ...c,
            projetos: (c.projetos ?? []).map(p => ({
              ...p,
              data: p.created_at ? p.created_at.slice(0, 10) : '',
            })),
          })));
        }
      } catch (err) {
        console.error('[fetchData] Erro:', err);
        setFetchError(true);
      } finally {
        if (isMounted) setLoadingClientes(false);
      }
    }

    fallbackTimeout = setTimeout(fetchData, 300);
    return () => { isMounted = false; clearTimeout(fallbackTimeout); };
  }, [session, profile?.empresa_id]);

  // Animation on load
  useEffect(() => {
    const revealElements = document.querySelectorAll('.sys-reveal');
    revealElements.forEach(el => el.classList.add('sys-active'));
  }, [clientes, selectedCliente, isModalOpen]);

  // Handlers
  const handleBusca = (e) => setSearchTerm(e.target.value);
  const filteredClientes = clientes.filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleOpenModal = (cliente = null) => {
    setEditingCliente(cliente);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingCliente(null);
    setIsModalOpen(false);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      nome:      formData.get('nome'),
      telefone:  formData.get('telefone'),
      email:     formData.get('email'),
      endereco:  formData.get('endereco'),
      empresa_id: profile.empresa_id,
    };

    try {
      if (editingCliente) {
        const { data, error } = await supabase.from('clientes').update(payload).eq('id', editingCliente.id).select().single();
        if (error) throw error;
        const atualizado = { ...editingCliente, ...data };
        setClientes(prev => prev.map(c => c.id === editingCliente.id ? atualizado : c));
        if (selectedCliente?.id === editingCliente.id) setSelectedCliente(atualizado);
      } else {
        const { data, error } = await supabase.from('clientes').insert(payload).select().single();
        if (error) throw error;
        setClientes(prev => [...prev, { ...data, projetos: [] }]);
      }
      handleCloseModal();
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Handlers Tríade de Clientes ---
  const handleDuplicateCliente = (e, cli) => {
    e.stopPropagation();
    if (!cli) return;
    
    // Deep Clone conforme solicitado
    const clone = JSON.parse(JSON.stringify(cli));
    clone.id = crypto.randomUUID();
    clone.nome = `${cli.nome} (Cópia)`;
    // Limpar projetos do clone ou duplicar projetos também? (Seguindo lógica de Cópia simples)
    clone.projetos = []; 

    setClientes(prev => {
      const idx = prev.findIndex(c => c.id === cli.id);
      const nova = [...prev];
      if (idx !== -1) nova.splice(idx+1, 0, clone);
      else nova.push(clone);
      return nova;
    });
  };

  const handleDeleteCliente = (e, id) => {
    e.stopPropagation();
    if (!id) return;
    if (window.confirm('Tem certeza que deseja excluir este cliente definitivamente?')) {
      setClientes(prev => prev.filter(c => c.id !== id));
      if (selectedCliente?.id === id) setSelectedCliente(null);
    }
  };

  // --- Handlers Tríade Projetos Vinculados ---
  const handleEditProjetoCli = (e, proj) => {
    e.stopPropagation();
    if (!proj) return;
    const novoNome = window.prompt('Novo nome para o projeto:', proj.nome);
    if (!novoNome || !novoNome.trim()) return;

    const updateProjs = selectedCliente.projetos.map(p => p.id === proj.id ? { ...p, nome: novoNome.trim() } : p);
    setSelectedCliente({ ...selectedCliente, projetos: updateProjs });
    setClientes(prev => prev.map(c => c.id === selectedCliente.id ? { ...c, projetos: updateProjs } : c));
  };

  const handleDuplicateProjetoCli = (e, proj) => {
    e.stopPropagation();
    if (!proj) return;
    
    // Deep Clone
    const clone = JSON.parse(JSON.stringify(proj));
    clone.id = crypto.randomUUID();
    clone.nome = `${proj.nome} (Cópia)`;

    const updateProjs = [...selectedCliente.projetos];
    const idx = updateProjs.findIndex(p => p.id === proj.id);
    if (idx !== -1) updateProjs.splice(idx + 1, 0, clone);
    else updateProjs.push(clone);

    setSelectedCliente({ ...selectedCliente, projetos: updateProjs });
    setClientes(prev => prev.map(c => c.id === selectedCliente.id ? { ...c, projetos: updateProjs } : c));
  };

  const handleDeleteProjetoCli = (e, id) => {
    e.stopPropagation();
    if (!id) return;
    if (window.confirm('Excluir este projeto da ficha do cliente?')) {
      const updateProjs = selectedCliente.projetos.filter(p => p.id !== id);
      setSelectedCliente({ ...selectedCliente, projetos: updateProjs });
      setClientes(prev => prev.map(c => c.id === selectedCliente.id ? { ...c, projetos: updateProjs } : c));
    }
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
      <main className="relative z-10 max-w-[1400px] mx-auto p-6 md:p-12 lg:flex lg:gap-8 h-screen overflow-hidden">
        
        {/* Lista de Clientes */}
        <div className={`flex-1 flex flex-col h-full bg-[#020202] border border-zinc-800 ${selectedCliente ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-6 border-b border-zinc-800 sys-reveal">
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-2">06 // Clientes</div>
                <h1 className="text-3xl font-medium text-white tracking-tighter uppercase">Gerenciar</h1>
              </div>
              <button 
                onClick={() => handleOpenModal()}
                className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 border border-yellow-400 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all flex items-center gap-2"
              >
                <iconify-icon icon="solar:user-plus-linear" width="16"></iconify-icon>
                Novo Cliente
              </button>
            </div>
            
            <div className="relative">
              <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"></iconify-icon>
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                value={searchTerm}
                onChange={handleBusca}
                className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {loadingClientes ? (
              <div className="h-full flex items-center justify-center text-zinc-700 animate-pulse font-mono text-[10px] uppercase">Aguardando dados...</div>
            ) : filteredClientes.map((cliente, index) => (
              <div 
                key={cliente.id}
                onClick={() => setSelectedCliente(cliente)}
                className={`sys-reveal p-4 border transition-all cursor-pointer group ${
                  selectedCliente?.id === cliente.id ? 'border-yellow-400 bg-zinc-900/50' : 'border-zinc-800 hover:border-zinc-500'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className={`font-medium text-lg ${selectedCliente?.id === cliente.id ? 'text-yellow-400' : 'text-white'}`}>{cliente.nome}</h3>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase mt-1 flex items-center gap-3">
                       <span>{cliente.projetos?.length || 0} Projetos</span>
                       <span>•</span>
                       <span>{cliente.telefone || 'Sem Fone'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => handleOpenModal(cliente)} className="p-2 border border-zinc-800 text-zinc-500 hover:border-zinc-400 hover:text-white transition-colors">
                      <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                    </button>
                    <button onClick={(e) => handleDuplicateCliente(e, cliente)} className="p-2 border border-zinc-800 text-zinc-500 hover:border-yellow-400/50 hover:text-yellow-400 transition-colors">
                      <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                    </button>
                    <button onClick={(e) => handleDeleteCliente(e, cliente.id)} className="p-2 border border-zinc-800 text-zinc-500 hover:border-red-400/50 hover:text-red-400 transition-colors">
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ficha Detail */}
        {selectedCliente ? (
          <div className="flex-[1.5] bg-[#020202] border border-zinc-800 flex flex-col h-full overflow-hidden sys-reveal relative">
            <button 
              onClick={() => setSelectedCliente(null)}
              className="lg:hidden absolute top-4 left-4 z-20 text-zinc-500 flex items-center gap-2 font-mono text-[10px] uppercase"
            >
              <iconify-icon icon="solar:arrow-left-linear"></iconify-icon> Voltar
            </button>

            <div className="p-8 border-b border-zinc-800 bg-black/40">
              <div className="flex justify-between items-start mb-6">
                 <div className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2 py-1">ID_{selectedCliente.id.slice(0, 8)}</div>
                 <button onClick={() => handleOpenModal(selectedCliente)} className="text-[10px] font-mono uppercase bg-zinc-900 px-4 py-2 hover:text-white transition-colors">Editar Perfil</button>
              </div>
              <h2 className="text-4xl font-semibold text-white tracking-tighter uppercase mb-8">{selectedCliente.nome}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-zinc-800 bg-black/20">
                   <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Telefone</div>
                   <div className="text-zinc-300 font-mono text-sm">{selectedCliente.telefone || '---'}</div>
                </div>
                <div className="p-4 border border-zinc-800 bg-black/20">
                   <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Email</div>
                   <div className="text-zinc-300 font-mono text-sm truncate">{selectedCliente.email || '---'}</div>
                </div>
                <div className="col-span-2 p-4 border border-zinc-800 bg-black/20">
                   <div className="text-[9px] font-mono text-zinc-600 uppercase mb-2">Endereço</div>
                   <div className="text-zinc-300 font-mono text-sm">{selectedCliente.endereco || 'Não cadastrado'}</div>
                </div>
              </div>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-6 border-l-2 border-yellow-400 pl-4">Projetos Ativos</h3>
              {selectedCliente.projetos?.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-zinc-800 text-zinc-700 font-mono text-[10px] uppercase">Nenhum projeto encontrado</div>
              ) : (
                <div className="space-y-3">
                  {selectedCliente.projetos.map(proj => (
                    <div key={proj.id} className="p-5 border border-zinc-900 bg-zinc-950/20 hover:border-zinc-700 transition-colors flex items-center justify-between group/proj">
                      <div className="flex flex-col">
                         <span className="text-zinc-200 font-medium uppercase text-sm group-hover/proj:text-yellow-400 transition-colors">{proj.nome}</span>
                         <span className="text-[10px] font-mono text-zinc-600 uppercase mt-1">Criado em {proj.data}</span>
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover/proj:opacity-100 transition-opacity">
                            <button onClick={(e) => handleEditProjetoCli(e, proj)} title="Renomear" className="p-2 text-zinc-600 hover:text-white transition-colors">
                               <iconify-icon icon="solar:pen-linear" width="14"></iconify-icon>
                            </button>
                            <button onClick={(e) => handleDuplicateProjetoCli(e, proj)} title="Duplicar" className="p-2 text-zinc-600 hover:text-yellow-400 transition-colors">
                               <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                            </button>
                            <button onClick={(e) => handleDeleteProjetoCli(e, proj.id)} title="Excluir" className="p-2 text-zinc-600 hover:text-red-400 transition-colors">
                               <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                            </button>
                         </div>
                         <div className={`px-2 py-1 text-[9px] font-mono uppercase tracking-tighter border ${statusColors[proj.status] || statusColors.orcado}`}>
                           {statusLabels[proj.status] || 'Orçado'}
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-[1.5] bg-[#020202] border border-zinc-800 items-center justify-center sys-reveal">
            <div className="text-center">
               <iconify-icon icon="solar:users-group-two-rounded-linear" width="48" className="text-zinc-800 mb-4 mx-auto"></iconify-icon>
               <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Selecione um cliente para ver detalhes</p>
            </div>
          </div>
        )}
      </main>

      {/* Modal Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-lg font-bold text-white uppercase mb-8 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-yellow-400"></span>
              {editingCliente ? 'Editar Cadastro' : 'Novo Cliente'}
            </h3>
            <form onSubmit={handleSaveModal} className="space-y-6">
              <div>
                <label className="text-[9px] uppercase font-mono text-zinc-600 mb-2 block">Nome Completo</label>
                <input name="nome" required defaultValue={editingCliente?.nome || ''} className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 outline-none focus:border-yellow-400" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] uppercase font-mono text-zinc-600 mb-2 block">Telefone</label>
                  <input name="telefone" defaultValue={editingCliente?.telefone || ''} className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 outline-none focus:border-zinc-500 font-mono" />
                </div>
                <div>
                  <label className="text-[9px] uppercase font-mono text-zinc-600 mb-2 block">Email</label>
                  <input name="email" type="email" defaultValue={editingCliente?.email || ''} className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 outline-none focus:border-zinc-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="text-[9px] uppercase font-mono text-zinc-600 mb-2 block">Endereço</label>
                <textarea name="endereco" rows="2" defaultValue={editingCliente?.endereco || ''} className="w-full bg-black border border-zinc-800 text-white text-sm px-4 py-3 outline-none focus:border-zinc-500 resize-none" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={handleCloseModal} className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase py-4 hover:text-white">Cancelar</button>
                <button type="submit" className="flex-1 bg-white text-black font-mono font-bold text-[10px] uppercase py-4 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .sys-reveal { opacity: 0; transform: translateY(10px); filter: blur(2px); transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .sys-active { opacity: 1; transform: translate(0); filter: blur(0); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #18181b; }
      `}} />
    </div>
  );
}
