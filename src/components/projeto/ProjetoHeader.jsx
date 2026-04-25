import React from 'react';
import { StatusPill } from '../../utils/projetoUtils';

const ProjetoHeader = React.memo(function ProjetoHeader({ projeto, onAtualizarStatus, onMarcarPerdido }) {
    return (
        <section className="sys-reveal mb-8">
            <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-bold text-white tracking-tighter">{projeto?.nome ?? '—'}</h1>
                            <StatusPill status={projeto?.status ?? 'aprovado'} />
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                            <iconify-icon icon="solar:user-linear" width="13" className="text-zinc-600"></iconify-icon>
                            <a href={`/clientes/${projeto?.clientes?.id}`} className="hover:text-yellow-400 transition-colors">
                                {projeto?.clientes?.nome ?? '—'}
                            </a>
                            <span className="text-zinc-700">·</span>
                            <iconify-icon icon="solar:calendar-linear" width="13" className="text-zinc-600"></iconify-icon>
                            <span>{projeto?.criado_em ?? '—'}</span>
                            {projeto?.arquitetos?.nome && (
                                <>
                                    <span className="text-zinc-700">·</span>
                                    <iconify-icon icon="solar:pen-linear" width="13" className="text-zinc-600"></iconify-icon>
                                    <span className="text-amber-500/80">{projeto.arquitetos.nome}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={onAtualizarStatus}
                            className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors"
                        >
                            <iconify-icon icon="solar:refresh-linear" width="13"></iconify-icon>
                            Atualizar status
                        </button>
                        <button
                            onClick={onMarcarPerdido}
                            className="flex items-center gap-2 border border-red-500/30 bg-red-400/5 text-red-400 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-red-400 transition-colors"
                        >
                            <iconify-icon icon="solar:close-circle-linear" width="13"></iconify-icon>
                            Marcar como perdido
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
});

export default ProjetoHeader;
