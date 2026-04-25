import React from 'react';
import { STATUS_CONFIG } from '../../utils/projetoUtils';

const STEPS = [
    { key: 'orcado',     icon: 'solar:document-text-linear'       },
    { key: 'aprovado',   icon: 'solar:check-circle-linear'         },
    { key: 'produzindo', icon: 'solar:settings-minimalistic-linear' },
    { key: 'entregue',   icon: 'solar:box-linear'                  },
];

const ProjetoTimeline = React.memo(function ProjetoTimeline({ projeto, medicoes }) {
    if (!projeto) return null;

    const currentIdx = STEPS.findIndex(s => s.key === projeto.status);
    const isPerdido   = projeto.status === 'perdido';
    const temMedicao  = (medicoes?.length ?? 0) > 0;

    return (
        <div className="sys-reveal sys-delay-50 mb-6">
            <div className="bg-[#0a0a0a] border border-zinc-800 px-5 py-4">
                {isPerdido ? (
                    <div className="flex items-center gap-3 text-red-400">
                        <iconify-icon icon="solar:close-circle-bold" width="16" className="shrink-0"></iconify-icon>
                        <span className="font-mono text-[10px] uppercase tracking-widest font-semibold">Projeto Perdido</span>
                        {projeto.motivo_perda && (
                            <span className="font-mono text-[10px] text-red-400/60 truncate">— {projeto.motivo_perda}</span>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-0">
                        {STEPS.map((step, idx) => {
                            const cfg      = STATUS_CONFIG[step.key];
                            const isActive = idx === currentIdx;
                            const isDone   = idx < currentIdx;
                            const isNext   = idx > currentIdx;

                            return (
                                <React.Fragment key={step.key}>
                                    <div className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${
                                        isActive ? `${cfg.bg} border ${cfg.border}` : ''
                                    }`}>
                                        <iconify-icon
                                            icon={isDone ? 'solar:check-circle-bold' : step.icon}
                                            width="12"
                                            className={isDone ? 'text-green-500' : isActive ? cfg.color : 'text-zinc-700'}
                                        ></iconify-icon>
                                        <span className={`font-mono text-[9px] uppercase tracking-widest ${
                                            isActive ? cfg.color + ' font-semibold'
                                            : isDone ? 'text-zinc-500'
                                            : 'text-zinc-700'
                                        }`}>
                                            {cfg.label}
                                        </span>
                                    </div>
                                    {idx < STEPS.length - 1 && (
                                        <iconify-icon
                                            icon="solar:alt-arrow-right-linear"
                                            width="9"
                                            className={idx < currentIdx ? 'text-zinc-600' : 'text-zinc-800'}
                                        ></iconify-icon>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        {temMedicao && (
                            <div className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                                <iconify-icon icon="solar:ruler-pen-linear" width="10" className="text-zinc-700"></iconify-icon>
                                {medicoes.length} medição{medicoes.length !== 1 ? 'ões' : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default ProjetoTimeline;
