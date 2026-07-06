import React from 'react';
import AgendaMedidor from '../AgendaMedidor';
import { buscarCepPorLogradouro, buscarEnderecoPorCep } from '../../utils/endereco';

const maskCep = (v) => {
    const d = (v || '').replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

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
    agCep, setAgCep,
    agEstado, setAgEstado,
    agObservacoes, setAgObservacoes,
    agendando,
    clienteSemEndereco,
    endSugestoes, setEndSugestoes,
    endBuscando, setEndBuscando,
    endConfirmado, setEndConfirmado,
    endDebounceRef,
    enderecoCompleto,
    medidores,
    profile,
    onConfirmar,
}) {
    const [buscandoCep, setBuscandoCep] = React.useState(false);
    const cepDebounceRef = React.useRef(null);

    // CEP → endereço (ViaCEP direto)
    const handleCepChange = (e) => {
        const masked = maskCep(e.target.value);
        setAgCep?.(masked);
        const digits = masked.replace(/\D/g, '');
        clearTimeout(cepDebounceRef.current);
        if (digits.length !== 8) return;
        cepDebounceRef.current = setTimeout(async () => {
            setBuscandoCep(true);
            const found = await buscarEnderecoPorCep(digits);
            setBuscandoCep(false);
            if (!found) return; // CEP inexistente → não bloqueia, mantém o digitado
            if (found.rua)    setAgRua(found.rua);
            if (found.bairro) setAgBairro(found.bairro);
            if (found.cidade) setAgCidade(found.cidade);
            if (found.estado) setAgEstado?.(found.estado);
            setEndSugestoes([]);
            setEndConfirmado(true);
        }, 300);
    };

    // Rua → CEP (ViaCEP por logradouro, considerando UF + cidade)
    const handleRuaChange = (e) => {
        const val = e.target.value;
        setAgRua(val);
        setEndConfirmado(false);
        setEndSugestoes([]);
        clearTimeout(endDebounceRef.current);
        const uf     = (agEstado || '').trim();
        const cidade = (agCidade || '').trim();
        if (val.trim().length < 3 || uf.length !== 2 || cidade.length < 3) {
            setEndBuscando(false);
            return;
        }
        setEndBuscando(true);
        endDebounceRef.current = setTimeout(async () => {
            const results = await buscarCepPorLogradouro(uf, cidade, val);
            setEndBuscando(false);
            if (results.length === 0) return;        // nada encontrado → mantém digitado
            if (results.length === 1) { preencherEndereco(results[0]); return; } // único → preenche
            setEndSugestoes(results);                // vários → dropdown para escolher
        }, 500);
    };

    const preencherEndereco = (r) => {
        if (r.cep)    setAgCep?.(r.cep);
        if (r.rua)    setAgRua(r.rua);
        if (r.bairro) setAgBairro(r.bairro);
        if (r.cidade) setAgCidade(r.cidade);
        if (r.estado) setAgEstado?.(r.estado);
        setEndSugestoes([]);
        setEndConfirmado(true);
    };

    if (!modalAgendar) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAll}></div>
            <div className="relative bg-white/95 dark:bg-[#0a0a0a] backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xl shadow-zinc-200/40 dark:shadow-none rounded-2xl dark:rounded-none w-full max-w-[480px] z-10 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-600 mb-0.5">
                            {editingMedicaoId ? '[ EDITAR_MEDIÇÃO ]' : '[ AGENDAR_MEDIÇÃO ]'}
                        </div>
                        <div className="text-zinc-900 dark:text-white font-semibold">
                            {editingMedicaoId ? 'Editar medição' : 'Nova medição'}
                        </div>
                    </div>
                    <button onClick={closeAll} className="text-zinc-500 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors p-1">
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

                    {/* Cliente sem endereço no cadastro — preencher aqui salva no cliente também */}
                    {clienteSemEndereco && !editingMedicaoId && (
                        <div className="border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-400/5 px-3 py-2.5 flex items-start gap-2 rounded-md dark:rounded-none">
                            <iconify-icon icon="solar:info-circle-linear" width="14" className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"></iconify-icon>
                            <span className="font-mono text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                                Este cliente ainda não tem endereço cadastrado. Preencha o endereço abaixo — ele será salvo também no cadastro do cliente.
                            </span>
                        </div>
                    )}

                    {/* Medidor */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Medidor</label>
                        <div className="relative">
                            <iconify-icon icon="solar:user-check-rounded-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <select
                                value={agMedidor}
                                onChange={e => setAgMedidor(e.target.value)}
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors appearance-none"
                            >
                                <option value="">Selecionar medidor</option>
                                {medidores.map(m => (
                                    <option key={m.id} value={m.id}>{m.nome}</option>
                                ))}
                            </select>
                            <iconify-icon icon="solar:alt-arrow-down-linear" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-600 pointer-events-none" width="14"></iconify-icon>
                        </div>
                        {medidores.length === 0 && (
                            <p className="font-mono text-[9px] text-zinc-400 dark:text-zinc-700 mt-1">Nenhum medidor cadastrado na empresa</p>
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
                        <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">Data e hora</label>
                        <div className="relative">
                            <iconify-icon icon="solar:calendar-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-600" width="16"></iconify-icon>
                            <input
                                type="datetime-local"
                                value={agData}
                                onChange={e => setAgData(e.target.value)}
                                className="w-full bg-zinc-100 dark:bg-black [color-scheme:light] dark:[color-scheme:dark] border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm pl-9 pr-4 py-3 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors font-mono"
                            />
                        </div>
                    </div>

                    {/* Endereço */}
                    <div className="space-y-3">
                        <div className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 mb-1">
                            Endereço da medição{' '}
                            <span className="text-zinc-400 dark:text-zinc-700 normal-case tracking-normal text-[9px]">opcional</span>
                        </div>

                        {/* Cidade + UF — necessários para buscar o CEP pelo nome da rua */}
                        <div className="grid grid-cols-[1fr_72px] gap-3">
                            <div>
                                <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">Cidade</label>
                                <input
                                    type="text"
                                    value={agCidade}
                                    onChange={e => setAgCidade(e.target.value)}
                                    placeholder="Ex: São Paulo"
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">UF</label>
                                <input
                                    type="text"
                                    value={agEstado}
                                    onChange={e => setAgEstado?.(e.target.value.toUpperCase().slice(0, 2))}
                                    placeholder="SP"
                                    maxLength={2}
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700 uppercase"
                                />
                            </div>
                        </div>

                        {/* Rua — busca ViaCEP por logradouro (rua → CEP), considerando cidade + UF */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">Rua / Logradouro</label>
                            <div className="relative">
                                <iconify-icon
                                    icon={endConfirmado ? 'solar:check-circle-linear' : 'solar:map-point-linear'}
                                    className={`absolute left-3 top-3.5 ${endConfirmado ? 'text-green-500 dark:text-green-400' : 'text-zinc-500 dark:text-zinc-600'}`}
                                    width="14"
                                ></iconify-icon>
                                {endBuscando && (
                                    <iconify-icon
                                        icon="solar:spinner-linear"
                                        className="absolute right-3 top-3.5 text-zinc-500 dark:text-zinc-600 animate-spin"
                                        width="13"
                                    ></iconify-icon>
                                )}
                                <input
                                    type="text"
                                    value={agRua}
                                    onChange={handleRuaChange}
                                    onBlur={() => setTimeout(() => setEndSugestoes([]), 150)}
                                    onKeyDown={e => { if (e.key === 'Escape') { setEndSugestoes([]); setEndBuscando(false); } }}
                                    placeholder="Ex: Rua das Flores"
                                    autoComplete="off"
                                    className={`w-full bg-zinc-100 dark:bg-black border text-zinc-900 dark:text-white text-sm pl-8 pr-8 py-2.5 rounded-md dark:rounded-none focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                        endConfirmado
                                            ? 'border-green-500/50 focus:border-green-500 dark:focus:border-green-400'
                                            : 'border-zinc-200/80 dark:border-zinc-800 focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)]'
                                    }`}
                                />

                                {/* Dropdown de sugestões (ViaCEP por logradouro) — dispensável */}
                                {endSugestoes.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-[#0a0a0a] border border-zinc-200/80 dark:border-zinc-700 border-t-0 shadow-2xl max-h-60 overflow-y-auto">
                                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200/80 dark:border-zinc-800 sticky top-0 bg-zinc-50 dark:bg-[#0a0a0a]">
                                            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
                                                {endSugestoes.length} endereços — escolha um
                                            </span>
                                            <button
                                                type="button"
                                                onMouseDown={e => { e.preventDefault(); setEndSugestoes([]); }}
                                                className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                                title="Fechar sugestões"
                                            >
                                                <iconify-icon icon="solar:close-linear" width="13"></iconify-icon>
                                            </button>
                                        </div>
                                        {endSugestoes.map((r, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onMouseDown={e => { e.preventDefault(); preencherEndereco(r); }}
                                                className="w-full text-left px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border-b border-zinc-200/60 dark:border-zinc-800/60 last:border-0 transition-colors group"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <iconify-icon icon="solar:map-point-linear" width="11" className="text-zinc-500 dark:text-zinc-600 shrink-0 mt-0.5"></iconify-icon>
                                                    <div className="min-w-0">
                                                        <div className="text-xs text-zinc-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-yellow-400 transition-colors leading-snug truncate">
                                                            {r.rua || '—'}
                                                        </div>
                                                        <div className="font-mono text-[9px] text-zinc-500 dark:text-zinc-600 uppercase mt-0.5 truncate">
                                                            {[r.bairro, [r.cidade, r.estado].filter(Boolean).join('/'), r.cep].filter(Boolean).join(' • ')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {endConfirmado && agRua && (
                                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-green-600 dark:text-green-400">
                                    <iconify-icon icon="solar:check-circle-linear" width="10"></iconify-icon>
                                    Endereço confirmado — editável
                                </div>
                            )}
                            {!endConfirmado && agRua.trim().length >= 3 && ((agEstado || '').trim().length !== 2 || (agCidade || '').trim().length < 3) && (
                                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-zinc-500 dark:text-zinc-600">
                                    <iconify-icon icon="solar:info-circle-linear" width="10"></iconify-icon>
                                    Preencha Cidade e UF para buscar o CEP pelo nome da rua
                                </div>
                            )}
                        </div>

                        {/* Número */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">Número</label>
                            <input
                                type="text"
                                value={agNumero}
                                onChange={e => setAgNumero(e.target.value)}
                                placeholder="Ex: 142"
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                            />
                        </div>

                        {/* Bairro */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">Bairro</label>
                            <input
                                type="text"
                                value={agBairro}
                                onChange={e => setAgBairro(e.target.value)}
                                placeholder="Ex: Centro"
                                className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700"
                            />
                        </div>

                        {/* CEP — busca ViaCEP direta (CEP → endereço); preenchido pela busca por rua */}
                        <div>
                            <label className="text-[9px] uppercase font-mono text-zinc-500 dark:text-zinc-600 block mb-1">CEP</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={agCep}
                                    onChange={handleCepChange}
                                    placeholder="00000-000"
                                    maxLength={9}
                                    inputMode="numeric"
                                    className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-2.5 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_10px_rgba(250,204,21,0.15)] transition-colors placeholder:text-zinc-700 font-mono"
                                />
                                {buscandoCep && (
                                    <iconify-icon icon="solar:spinner-linear" width="13" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-600 animate-spin pointer-events-none"></iconify-icon>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-500 block mb-2">
                            Observações de Acesso
                            <span className="text-zinc-400 dark:text-zinc-700 normal-case tracking-normal text-[9px] ml-1">opcional</span>
                        </label>
                        <textarea
                            value={agObservacoes}
                            onChange={e => setAgObservacoes(e.target.value)}
                            rows={3}
                            placeholder="Ex: Interfone estragado, usar portão lateral. Casa de esquina com a Rua das Flores. Avisar 30min antes."
                            className="w-full bg-zinc-100 dark:bg-black border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm px-4 py-3 rounded-md dark:rounded-none focus:outline-none focus:border-orange-500 dark:focus:border-yellow-400 transition-colors placeholder:text-zinc-700 resize-none"
                        />
                        <div className="mt-1 font-mono text-[9px] text-zinc-400 dark:text-zinc-700">
                            Ponto de referência, instruções de entrada, outra cidade, etc.
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 shrink-0">
                    <button
                        onClick={closeAll}
                        className="flex-1 border border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-widest py-3 rounded-md dark:rounded-none hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirmar}
                        disabled={agendando || !agMedidor || !agData}
                        className="flex-1 bg-orange-500 text-white dark:bg-yellow-400 dark:text-black text-[11px] font-bold uppercase tracking-widest py-3 rounded-md dark:rounded-none flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] dark:hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
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
