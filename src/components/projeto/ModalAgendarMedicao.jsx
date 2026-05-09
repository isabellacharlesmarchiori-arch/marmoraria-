import React from 'react';
import AgendaMedidor from '../AgendaMedidor';

export default function ModalAgendarMedicao({
    modalAgendar,
    closeAll,
    editingMedicaoId,
    erroAgendar,
    agMedidor, setAgMedidor,
    agData, setAgData,
    agRua, setAgRua,
    agNumero, setAgNumero,
    agBairro, setAgBairro,
    agCidade, setAgCidade,
    agObservacoes, setAgObservacoes,
    agendando,
    endSugestoes, setEndSugestoes,
    endBuscando, setEndBuscando,
    endConfirmado, setEndConfirmado,
    endDebounceRef,
    enderecoCompleto,
    medidores,
    profile,
    onConfirmar,
}) {
    if (!modalAgendar) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
            <div className="relative bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-[480px] z-10 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">
                            {editingMedicaoId ? '[ EDITAR_MEDIÇÃO ]' : '[ AGENDAR_MEDIÇÃO ]'}
                        </div>
                        <div className="text-gray-900 dark:text-white font-semibold">
                            {editingMedicaoId ? 'Editar medição' : 'Nova medição'}
                        </div>
                    </div>
                    <button onClick={closeAll} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                {/* Form */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-5">
                    {erroAgendar && (
                        <div className="border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-400/5 px-3 py-2 flex items-center gap-2">
                            <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-red-700 dark:text-red-400 shrink-0"></iconify-icon>
                            <span className="font-mono text-[10px] text-red-700 dark:text-red-400">{erroAgendar}</span>
                        </div>
                    )}

                    {/* Medidor */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Medidor</label>
                        <div className="relative">
                            <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <select
                                value={agMedidor}
                                onChange={e => setAgMedidor(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                            >
                                <option value="">Selecionar medidor</option>
                                {medidores.map(m => (
                                    <option key={m.id} value={m.id}>{m.nome}</option>
                                ))}
                            </select>
                            <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                        </div>
                        {medidores.length === 0 && (
                            <p className="font-mono text-[9px] text-gray-400 dark:text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
                        )}
                    </div>

                    {/* Agenda do medidor */}
                    {agMedidor && (
                        <AgendaMedidor
                            medidorId={agMedidor}
                            horarioEscolhido={agData || null}
                            empresaId={profile?.empresa_id}
                            onDataChange={val => setAgData(val)}
                        />
                    )}

                    {/* Data e hora */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">Data e hora</label>
                        <div className="relative">
                            <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <input
                                type="datetime-local"
                                value={agData}
                                onChange={e => setAgData(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                            />
                        </div>
                    </div>

                    {/* Endereço */}
                    <div className="space-y-3">
                        <div className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 mb-1">
                            Endereço da medição{' '}
                            <span className="text-gray-400 dark:text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                        </div>

                        {/* Rua — autocomplete Nominatim */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Rua / Logradouro</label>
                            <div className="relative">
                                <iconify-icon
                                    icon={endConfirmado ? 'solar:check-circle-linear' : 'solar:map-point-linear'}
                                    className={`absolute left-3 top-3.5 ${endConfirmado ? 'text-green-400' : 'text-gray-500 dark:text-zinc-600'}`}
                                    width="14"
                                ></iconify-icon>
                                {endBuscando && (
                                    <iconify-icon
                                        icon="solar:spinner-linear"
                                        className="absolute right-3 top-3.5 text-gray-500 dark:text-zinc-600 animate-spin"
                                        width="13"
                                    ></iconify-icon>
                                )}
                                <input
                                    type="text"
                                    value={agRua}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setAgRua(val);
                                        setEndConfirmado(false);
                                        setEndSugestoes([]);
                                        clearTimeout(endDebounceRef.current);
                                        if (val.trim().length < 4) { setEndBuscando(false); return; }
                                        setEndBuscando(true);
                                        endDebounceRef.current = setTimeout(async () => {
                                            try {
                                                const res = await fetch(
                                                    `https://nominatim.openstreetmap.org/search?` +
                                                    new URLSearchParams({
                                                        q:              val,
                                                        format:         'jsonv2',
                                                        addressdetails: '1',
                                                        limit:          '6',
                                                        countrycodes:   'br',
                                                        'accept-language': 'pt-BR',
                                                    }),
                                                    { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
                                                );
                                                const data = await res.json();
                                                setEndSugestoes(data);
                                            } catch {
                                                setEndSugestoes([]);
                                            } finally {
                                                setEndBuscando(false);
                                            }
                                        }, 450);
                                    }}
                                    onKeyDown={e => { if (e.key === 'Escape') { setEndSugestoes([]); setEndBuscando(false); } }}
                                    placeholder="Ex: Rua das Flores"
                                    autoComplete="off"
                                    className={`w-full bg-gray-100 dark:bg-black border text-gray-900 dark:text-white text-sm pl-8 pr-8 py-2.5 rounded-none focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                        endConfirmado
                                            ? 'border-green-500/50 focus:border-green-400'
                                            : 'border-gray-300 dark:border-zinc-800 focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)]'
                                    }`}
                                />

                                {/* Dropdown de sugestões */}
                                {endSugestoes.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-50 bg-gray-100 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-700 border-t-0 shadow-2xl max-h-56 overflow-y-auto">
                                        {endSugestoes.map((s, i) => {
                                            const a = s.address ?? {};
                                            const rua = a.road || '';
                                            const bairro = a.suburb || a.neighbourhood || a.quarter || '';
                                            const cidade = a.city || a.town || a.village || a.municipality || '';
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onMouseDown={e => {
                                                        e.preventDefault();
                                                        setAgRua(rua || s.display_name);
                                                        setAgBairro(bairro);
                                                        setAgCidade(cidade);
                                                        setEndSugestoes([]);
                                                        setEndConfirmado(true);
                                                    }}
                                                    className="w-full text-left px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border-b border-gray-300/60 dark:border-zinc-800/60 last:border-0 transition-colors group"
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <iconify-icon icon="solar:map-point-linear" width="11" className="text-gray-500 dark:text-zinc-600 shrink-0 mt-0.5"></iconify-icon>
                                                        <div className="min-w-0">
                                                            <div className="text-xs text-gray-900 dark:text-white group-hover:text-yellow-400 transition-colors leading-snug truncate">
                                                                {[rua, bairro, cidade].filter(Boolean).join(', ') || s.display_name}
                                                            </div>
                                                            {s.type && (
                                                                <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase mt-0.5">
                                                                    {s.type}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {endConfirmado && agRua && (
                                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-green-400">
                                    <iconify-icon icon="solar:check-circle-linear" width="10"></iconify-icon>
                                    {editingMedicaoId ? 'Endereço confirmado' : 'Preenchido do cadastro do cliente — editável'}
                                </div>
                            )}
                            {!endConfirmado && agRua.trim().length > 0 && endSugestoes.length === 0 && !endBuscando && (
                                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-gray-500 dark:text-zinc-600">
                                    <iconify-icon icon="solar:info-circle-linear" width="10"></iconify-icon>
                                    Nenhuma sugestão — endereço será salvo como digitado
                                </div>
                            )}
                        </div>

                        {/* Número */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Número</label>
                            <input
                                type="text"
                                value={agNumero}
                                onChange={e => setAgNumero(e.target.value)}
                                placeholder="Ex: 142"
                                className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                            />
                        </div>

                        {/* Bairro + Cidade */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Bairro</label>
                                <input
                                    type="text"
                                    value={agBairro}
                                    onChange={e => setAgBairro(e.target.value)}
                                    placeholder="Ex: Centro"
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] uppercase font-mono text-gray-500 dark:text-zinc-600 block mb-1">Cidade</label>
                                <input
                                    type="text"
                                    value={agCidade}
                                    onChange={e => setAgCidade(e.target.value)}
                                    placeholder="Ex: São Paulo"
                                    className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-3 py-2.5 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 block mb-2">
                            Observações de Acesso
                            <span className="text-gray-400 dark:text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                        </label>
                        <textarea
                            value={agObservacoes}
                            onChange={e => setAgObservacoes(e.target.value)}
                            rows={3}
                            placeholder="Ex: Interfone estragado, usar portão lateral. Casa de esquina com a Rua das Flores. Avisar 30min antes."
                            className="w-full bg-gray-100 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm px-4 py-3 rounded-none focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                        />
                        <div className="mt-1 font-mono text-[9px] text-gray-400 dark:text-zinc-700">
                            Ponto de referência, instruções de entrada, outra cidade, etc.
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
                    <button
                        onClick={closeAll}
                        className="flex-1 border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirmar}
                        disabled={agendando || !agMedidor || !agData}
                        className="flex-1 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                    >
                        {agendando
                            ? <><iconify-icon icon="solar:spinner-linear" width="14" className="animate-spin"></iconify-icon>Agendando...</>
                            : <><iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>Confirmar</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
