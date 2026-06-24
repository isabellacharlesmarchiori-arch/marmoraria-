import React from 'react';

export default function AbaUsuarios({ usuarios, openModal, handleToggleUsuario }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-zinc-200/80 dark:border-zinc-800 pb-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white uppercase flex items-center gap-2">
          <iconify-icon icon="solar:users-group-rounded-linear" class="text-orange-600 dark:text-yellow-400"></iconify-icon> Controle de Usuários
        </h2>
        <button onClick={() => openModal('usuario')} className="bg-orange-500 hover:bg-orange-600 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-black rounded-xl dark:rounded-none text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2">
          <iconify-icon icon="solar:user-plus-linear"></iconify-icon> Convidar
        </button>
      </div>
      <div className="bg-white/90 dark:bg-[#020202] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-[2rem] dark:rounded-none overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-black text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500">
          <div>Nome / E-mail</div><div>Perfil</div><div>Status</div><div className="text-right">Ações</div>
        </div>
        {usuarios.length === 0 && (
          <div className="p-8 text-center">
            <iconify-icon icon="solar:users-group-two-rounded-linear" width="28" className="text-zinc-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">Nenhum usuário cadastrado</p>
          </div>
        )}
        {usuarios.map(u => (
          <div key={u.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800/50 items-center hover:bg-zinc-200/30 dark:hover:bg-zinc-900/30 transition-colors">
            <div>
              <div className="text-zinc-900 dark:text-white font-medium text-sm">{u.nome}</div>
              <div className="text-xs font-mono text-zinc-500 dark:text-zinc-500">{u.email}</div>
            </div>
            <div><span className="text-[10px] border border-zinc-200/80 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 uppercase font-mono">{u.perfil}</span></div>
            <div>
              <button onClick={() => handleToggleUsuario(u.id, u.ativo)} className={`flex items-center gap-2 text-xs font-mono uppercase ${u.ativo ? 'text-green-400' : 'text-zinc-500 dark:text-zinc-600'}`}>
                <iconify-icon icon={u.ativo ? 'solar:toggle-on-bold' : 'solar:toggle-off-linear'} width="24"></iconify-icon>
                {u.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
            <div className="text-right">
              <button onClick={() => openModal('usuario', u)} className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-black border border-zinc-200/80 dark:border-zinc-800 px-3 py-1">
                <iconify-icon icon="solar:pen-linear"></iconify-icon>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
