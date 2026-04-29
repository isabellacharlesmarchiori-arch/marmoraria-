import React, { useState } from 'react';
import { parseSvgUrls, normalizarJsonMedicao } from '../../utils/projetoUtils';

function sanitizeFilename(str) {
    return (str || 'sem_nome')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

async function downloadDesenho(url, medicao, ambNome) {
    try {
        const tipo        = medicao?.json_medicao?.ambientes?.[0]?.tipo_medicao === 'orcamento' ? 'preliminar' : 'producao';
        const nomeProjeto = sanitizeFilename(medicao?.projetos?.nome);
        const nomeAmb     = sanitizeFilename(ambNome);
        const filename    = `desenho_${tipo}_${nomeProjeto}_${nomeAmb}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha ao baixar');
        const svgText      = await res.text();
        const svgBlob      = new Blob([svgText], { type: 'image/svg+xml' });
        const svgObjectUrl = URL.createObjectURL(svgBlob);
        const img          = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = 2400;
            canvas.height = Math.round(2400 * (img.naturalHeight / img.naturalWidth));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(pngBlob => {
                const pngUrl = URL.createObjectURL(pngBlob);
                const a = document.createElement('a');
                a.href     = pngUrl;
                a.download = `${filename}.png`;
                a.click();
                URL.revokeObjectURL(pngUrl);
                URL.revokeObjectURL(svgObjectUrl);
            }, 'image/png');
        };
        img.src = svgObjectUrl;
    } catch (err) {
        console.error('[download] Erro ao baixar desenho:', err);
    }
}

function formatDataLabel(medicao) {
    if (medicao?.data) return medicao.data;
    const raw = medicao?.data_enviada ?? medicao?.data_medicao;
    if (!raw) return '—';
    return new Date(raw).toLocaleString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// Retorna a obs de acesso referente a um ambiente específico.
// Formato esperado: "Ambiente 1: texto\nAmbiente 2: texto" ou texto livre.
function parseObsAcesso(text, ambIndex, totalAmbientes) {
    if (!text) return null;
    if (totalAmbientes <= 1) return text.trim() || null;
    const regex = new RegExp(
        `Ambiente\\s+${ambIndex + 1}\\s*:[\\s]*([^\\r\\n]*(?:[\\r\\n](?!Ambiente\\s+\\d)[^\\r\\n]*)*)`,
        'i'
    );
    const match = text.match(regex);
    return match ? match[1].trim() || null : null;
}

// Retorna a URL da foto para um ambiente, tentando por id e por nome.
function getFotoParaAmbiente(fotos, ambId, ambNome) {
    if (!fotos || typeof fotos !== 'object') return null;
    const val = fotos[ambId] ?? fotos[ambNome] ?? null;
    if (!val) return null;
    return Array.isArray(val) ? val[0] : val;
}

// ─── DesenhoAmbiente — SVG por ambiente com loading/error/zoom ───────────────
function DesenhoAmbiente({ svgUrl, medicao, ambNome, onZoom }) {
    const [loading, setLoading] = useState(!!svgUrl);
    const [error,   setError]   = useState(false);

    if (!svgUrl) return (
        <div className="flex flex-col items-center justify-center py-6 gap-2 border border-zinc-900 bg-black">
            <iconify-icon icon="solar:ruler-pen-linear" width="20" className="text-zinc-700"></iconify-icon>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Desenho não disponível</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-2">
            <div
                className="relative border border-zinc-800 bg-black overflow-hidden cursor-zoom-in group"
                onClick={() => !error && onZoom(svgUrl)}
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black z-10 min-h-[160px]">
                        <div className="w-5 h-5 border-2 border-zinc-700 border-t-yellow-400 rounded-full animate-spin"></div>
                    </div>
                )}
                {error ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 min-h-[100px]">
                        <iconify-icon icon="solar:image-broken-linear" width="24" className="text-zinc-700"></iconify-icon>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Imagem indisponível</span>
                    </div>
                ) : (
                    <>
                        <img
                            src={svgUrl}
                            alt={`Desenho técnico — ${ambNome}`}
                            className={`w-full h-auto max-h-[280px] object-contain transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
                            onLoad={() => setLoading(false)}
                            onError={() => { setLoading(false); setError(true); }}
                        />
                        {!loading && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 pointer-events-none">
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/80 border border-zinc-700">
                                    <iconify-icon icon="solar:magnifer-zoom-in-linear" width="13" className="text-white"></iconify-icon>
                                    <span className="font-mono text-[9px] uppercase tracking-widest text-white">Ampliar</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            {!error && !loading && (
                <button
                    onClick={() => downloadDesenho(svgUrl, medicao, ambNome)}
                    className="flex items-center justify-center gap-2 w-full border border-zinc-700 text-zinc-400 hover:border-white hover:text-white transition-colors text-[10px] font-mono uppercase tracking-widest py-2.5"
                >
                    <iconify-icon icon="solar:download-linear" width="13"></iconify-icon>
                    Baixar Desenho
                </button>
            )}
        </div>
    );
}

// ─── SecaoLabel — cabeçalho de seção dentro do card de ambiente ──────────────
function SecaoLabel({ icon, label }) {
    return (
        <div className="flex items-center gap-1.5 mb-2">
            <iconify-icon icon={icon} width="11" className="text-zinc-500 shrink-0"></iconify-icon>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</span>
        </div>
    );
}

// ─── PecasAmbiente — lista de peças de um ambiente com recortes inline ────────
function PecasAmbiente({ pecas }) {
    if (!pecas || pecas.length === 0) return null;

    // Group by item_nome
    const itensOrdem = [];
    const itensMapa  = new Map();
    pecas.forEach(r => {
        const k = r.item_nome ?? '__sem_item__';
        if (!itensMapa.has(k)) { itensMapa.set(k, []); itensOrdem.push(k); }
        itensMapa.get(k).push(r);
    });

    return (
        <div className="bg-black border border-zinc-900 px-4 py-3">
            <SecaoLabel icon="solar:ruler-pen-linear" label={`Peças (${pecas.length})`} />
            <div className="flex flex-col gap-2">
                {itensOrdem.map(itemKey => {
                    const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                    return (
                        <div key={itemKey}>
                            {nomeItem && (
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1.5 ml-1 flex items-center gap-1.5">
                                    <iconify-icon icon="solar:folder-linear" width="10" className="text-zinc-700 shrink-0"></iconify-icon>
                                    {nomeItem}
                                </div>
                            )}
                            <div className={`flex flex-col gap-1.5 ${nomeItem ? 'ml-2' : ''}`}>
                                {itensMapa.get(itemKey).map((r, i) => (
                                    <div key={i} className="border border-zinc-900 px-3 py-2.5 bg-zinc-950">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-semibold text-sm">{r.nome ?? 'Peça'}</span>
                                            <span className="font-mono text-sm text-yellow-400 font-bold">{r.area_liquida_m2 ?? 0} m²</span>
                                        </div>
                                        {/* Dimensões do retângulo */}
                                        {Array.isArray(r.segmentos) && r.segmentos.length >= 2 && r.type === 'retangulo' && (() => {
                                            const medidas = r.segmentos.map(s => parseFloat(s?.medida_cm)).filter(n => Number.isFinite(n) && n > 0);
                                            if (medidas.length < 2) return null;
                                            return <div className="font-mono text-[10px] text-zinc-500 mt-1">{Math.max(...medidas)} × {Math.min(...medidas)} cm</div>;
                                        })()}
                                        {Array.isArray(r.segmentos) && r.segmentos.length >= 2 && r.type !== 'retangulo' && (
                                            <div className="font-mono text-[10px] text-zinc-500 mt-1">{r.segmentos.map(s => s.medida_cm).join(' × ')} cm</div>
                                        )}
                                        {/* Recortes inline */}
                                        {Array.isArray(r.recortes) && r.recortes.length > 0 && (
                                            <div className="mt-2 flex flex-col gap-1 pl-2 border-l border-zinc-800">
                                                {r.recortes.map((rc, j) => {
                                                    const label = rc.funcao_label ?? rc.description ?? rc.funcao
                                                        ?? (rc.formato === 'circular' || rc.type === 'circular' ? 'Furo circular' : 'Recorte retangular');
                                                    const hasDim = rc.diametro_cm || rc.diameter_cm || rc.largura_cm || rc.dimX_cm;
                                                    let dim = null;
                                                    if (hasDim) {
                                                        dim = (rc.formato === 'circular' || rc.type === 'circular')
                                                            ? `∅ ${rc.diametro_cm ?? rc.diameter_cm} cm`
                                                            : `${rc.largura_cm ?? rc.dimX_cm} × ${rc.altura_cm ?? rc.dimY_cm} cm`;
                                                    } else if (rc.formato) {
                                                        dim = rc.formato;
                                                    }
                                                    return (
                                                        <div key={j} className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <iconify-icon icon="solar:scissors-linear" width="10" className="text-zinc-600"></iconify-icon>
                                                                <span className="font-mono text-[10px] text-zinc-400">{label}</span>
                                                            </div>
                                                            {dim && <span className="font-mono text-[9px] text-zinc-600">{dim}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── InfoMedicao — exportada para uso legado externo ─────────────────────────
export function InfoMedicao({ ambientes }) {
    if (!Array.isArray(ambientes) || ambientes.length === 0) return null;
    const temInfo = ambientes.some(amb => {
        const infoAmb      = (amb.extras?.info_adicional ?? '').trim();
        const itensComInfo = (amb.itens ?? []).some(it => (it.info_adicional ?? '').trim() !== '');
        const gruposComInfo = (amb.grupos ?? []).some(g => (g.info ?? '').trim() !== '');
        return infoAmb !== '' || itensComInfo || gruposComInfo;
    });
    if (!temInfo) return null;
    return (
        <div>
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                Informações da Medição
            </div>
            <div className="flex flex-col gap-4">
                {ambientes.map((amb, i) => {
                    const infoAmb       = (amb.extras?.info_adicional ?? '').trim();
                    const itensComInfo  = (amb.itens ?? []).filter(it => (it.info_adicional ?? '').trim() !== '');
                    const gruposComInfo = (amb.grupos ?? []).filter(g => (g.info ?? '').trim() !== '');
                    const nomeAmb       = amb.ambiente ?? amb.nome ?? `Ambiente ${i + 1}`;
                    const hasContent    = infoAmb !== '' || itensComInfo.length > 0 || gruposComInfo.length > 0;
                    if (!hasContent) return null;
                    return (
                        <div key={i} className="flex flex-col gap-2.5">
                            {ambientes.length > 1 && (
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                    <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                    {nomeAmb}
                                </div>
                            )}
                            {infoAmb !== '' && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <iconify-icon icon="solar:document-text-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações do Ambiente</span>
                                    </div>
                                    <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{infoAmb}</p>
                                </div>
                            )}
                            {itensComInfo.length > 0 && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <iconify-icon icon="solar:list-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações por Item</span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {itensComInfo.map((item, j) => (
                                            <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">{item.nome}</span>
                                                <span className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{item.info_adicional.trim()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {gruposComInfo.length > 0 && (
                                <div className="bg-black border border-zinc-900 px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <iconify-icon icon="solar:list-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações de Campo</span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {gruposComInfo.map((g, j) => (
                                            <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">{g.nome}</span>
                                                <span className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{g.info.trim()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── PainelDetalhesMedicao ────────────────────────────────────────────────────
// Props:
//   medicao  — objeto da medição
//   onClose  — callback ao fechar
//   footer   — nó React opcional renderizado no rodapé fixo (ex: botão "Criar orçamento")
export function PainelDetalhesMedicao({ medicao, onClose, footer }) {
    const [zoomedUrl, setZoomedUrl] = useState(null);

    const svgUrls      = parseSvgUrls(medicao?.svg_url);
    const dataLabel    = formatDataLabel(medicao);
    const rawAmbientes = medicao?.json_medicao?.ambientes ?? [];
    const jsonNorm     = normalizarJsonMedicao(medicao?.json_medicao);
    const pecas        = jsonNorm?.resumo_por_peca ?? [];
    const isFlutter    = jsonNorm?._fonte === 'flutter' || jsonNorm?._fonte === 'flutter2';


    // Tipo global: usa o primeiro ambiente como referência
    const tipoGlobal = rawAmbientes[0]?.tipo_medicao ?? rawAmbientes[0]?.extras?.tipo_medicao ?? 'producao';

    // Totais gerais
    const totalArea = Math.round(pecas.reduce((s, p) => s + (p.area_liquida_m2 ?? 0), 0) * 10000) / 10000;
    const totalME   = jsonNorm?.totais_acabamentos?.meia_esquadria_ml
        ?? Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.meia_esquadria_ml ?? 0), 0) * 100) / 100;
    const totalRS   = jsonNorm?.totais_acabamentos?.reto_simples_ml
        ?? Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.reto_simples_ml ?? 0), 0) * 100) / 100;

    function handleClose() { onClose(); setZoomedUrl(null); }

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={handleClose} />

            {/* Painel lateral */}
            <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">

                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                    <div className="flex flex-col gap-1.5">
                        {/* Badge tipo global */}
                        {tipoGlobal === 'orcamento' ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-400/10 border border-orange-400/30 w-max">
                                <iconify-icon icon="solar:danger-triangle-linear" width="11" className="text-orange-400 shrink-0"></iconify-icon>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-orange-400 font-semibold">Preliminar</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-400/10 border border-green-400/30 w-max">
                                <iconify-icon icon="solar:check-circle-linear" width="11" className="text-green-400 shrink-0"></iconify-icon>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-green-400 font-semibold">Produção</span>
                            </div>
                        )}
                        <div className="text-white font-semibold text-sm">{dataLabel}</div>
                    </div>
                    <button onClick={handleClose} className="text-zinc-600 hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                {/* Corpo scrollável */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

                    {isFlutter && (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-yellow-400/5 border border-yellow-400/20">
                            <iconify-icon icon="solar:smartphone-linear" width="11" className="text-yellow-400 shrink-0"></iconify-icon>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-400">Enviado pelo app SmartStone</span>
                        </div>
                    )}

                    {rawAmbientes.length === 0 && (
                        <div className="text-center py-10 px-4 border border-zinc-900 bg-black">
                            <iconify-icon icon="solar:document-text-linear" width="24" className="text-zinc-700 mb-2"></iconify-icon>
                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Nenhum dado processado ainda</div>
                        </div>
                    )}

                    {/* ── Seção por ambiente ── */}
                    {rawAmbientes.map((amb, i) => {
                        const ambNome   = amb.nome ?? amb.ambiente ?? `Ambiente ${i + 1}`;
                        const svgUrl    = svgUrls[i] ?? null;
                        const fotoUrl   = getFotoParaAmbiente(medicao?.fotos, amb.ambiente_id ?? amb.id, ambNome);
                        const obsAcesso = parseObsAcesso(medicao?.observacoes_acesso, i, rawAmbientes.length);
                        const infoAmb   = (amb.extras?.info_adicional ?? '').trim();
                        const itensComInfo  = (amb.itens ?? []).filter(it => (it.info_adicional ?? '').trim() !== '');
                        const faixasDoAmb   = amb.faixas ?? [];
                        const gruposDoAmb   = (amb.grupos ?? []).filter(g =>
                            (g.info ?? '').trim() !== '' || g.vai_descer || g.vai_embutir
                        );

                        // Associação por ambiente_index (robusto) com fallback por nome.
                        const pecasDoAmb = pecas.filter(p => {
                            if (p.type === 'faixa') return false;
                            if (p.ambiente_index != null) return p.ambiente_index === i;
                            if (p.ambiente_nome === ambNome) return true;
                            return rawAmbientes.length === 1 && (p.ambiente_nome == null || p.ambiente_nome === '');
                        });

                        return (
                            <div key={i} className="flex flex-col gap-3">
                                {/* Título do ambiente */}
                                <div className="flex items-center gap-2">
                                    <div className="w-0.5 h-4 bg-[#1D9E75] shrink-0"></div>
                                    <span className="font-mono text-[10px] uppercase tracking-widest text-white font-semibold">{ambNome}</span>
                                </div>

                                {/* Desenho Técnico */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Desenho Técnico</div>
                                    <DesenhoAmbiente
                                        svgUrl={svgUrl}
                                        medicao={medicao}
                                        ambNome={ambNome}
                                        onZoom={setZoomedUrl}
                                    />
                                </div>

                                {/* Foto da Obra */}
                                {fotoUrl && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:camera-linear" label="Foto da Obra" />
                                        <a href={fotoUrl} target="_blank" rel="noopener noreferrer"
                                            className="block border border-zinc-800 overflow-hidden hover:border-yellow-400/50 transition-colors">
                                            <img src={fotoUrl} alt={`Foto — ${ambNome}`} className="w-full h-40 object-cover" />
                                        </a>
                                    </div>
                                )}

                                {/* Grupos / Observações de campo */}
                                {gruposDoAmb.length > 0 && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:chat-round-dots-linear" label="Grupos / Observações" />
                                        <div className="flex flex-col gap-2">
                                            {gruposDoAmb.map((g, j) => (
                                                <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-1">
                                                    <div className="flex items-center flex-wrap gap-1.5">
                                                        <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">{g.nome}</span>
                                                        {g.vai_descer && (
                                                            <span className="font-mono text-[9px] px-1.5 py-0.5 border border-blue-400/40 text-blue-400 bg-blue-400/5">
                                                                ↓ Vai Descer
                                                            </span>
                                                        )}
                                                        {g.vai_embutir && (
                                                            <span className="font-mono text-[9px] px-1.5 py-0.5 border border-violet-400/40 text-violet-400 bg-violet-400/5">
                                                                ⬛ Vai Embutir {g.embutir_cm != null ? `${g.embutir_cm} cm` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(g.info ?? '').trim() !== '' && (
                                                        <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{g.info.trim()}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Peças (com recortes inline) */}
                                <PecasAmbiente pecas={pecasDoAmb} />

                                {/* Faixas */}
                                {faixasDoAmb.length > 0 && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:ruler-linear" label={`Faixas (${faixasDoAmb.length})`} />
                                        <div className="flex flex-col gap-1.5">
                                            {faixasDoAmb.map((f, j) => {
                                                const area = f.area_m2 != null ? parseFloat(f.area_m2) : null;
                                                const dim = [f.largura_cm, f.comprimento_cm, f.espessura_cm]
                                                    .filter(v => v != null)
                                                    .join('×');
                                                return (
                                                    <div key={j} className="font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-2">
                                                        <span>{dim ? `${dim} cm` : (f.nome ?? `Faixa ${j + 1}`)}</span>
                                                        {area != null && (
                                                            <span className="text-yellow-400 font-bold shrink-0">{area} m²</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Observações de Acesso */}
                                {obsAcesso && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:map-point-linear" label="Observações de Acesso" />
                                        <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{obsAcesso}</p>
                                    </div>
                                )}

                                {/* Observações do ambiente (campo extras.info_adicional) */}
                                {infoAmb && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:document-text-linear" label="Observações do Ambiente" />
                                        <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{infoAmb}</p>
                                    </div>
                                )}

                                {/* Observações por item */}
                                {itensComInfo.length > 0 && (
                                    <div className="bg-black border border-zinc-900 px-4 py-3">
                                        <SecaoLabel icon="solar:list-linear" label="Observações por Item" />
                                        <div className="flex flex-col gap-2.5">
                                            {itensComInfo.map((item, j) => (
                                                <div key={j} className="border-l-2 border-yellow-400/40 pl-3 flex flex-col gap-0.5">
                                                    <span className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80">{item.nome}</span>
                                                    <span className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{item.info_adicional.trim()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ── Resumo Total ── */}
                    {pecas.length > 0 && (
                        <div className="border-t border-zinc-800 pt-4">
                            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                                Resumo Total
                            </div>
                            <div className="bg-black border border-zinc-900 px-4 py-3 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[11px] text-zinc-300">Peças</span>
                                    <span className="font-mono text-[11px] text-white font-bold">{pecas.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[11px] text-zinc-300">Área total</span>
                                    <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalArea} m²</span>
                                </div>
                                {totalME > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] text-zinc-300">Meia-Esquadria</span>
                                        <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalME} ml</span>
                                    </div>
                                )}
                                {totalRS > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] text-zinc-300">Reto Simples</span>
                                        <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalRS} ml</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer opcional (ex: botão "Criar orçamento") */}
                {footer && (
                    <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
                        {footer}
                    </div>
                )}
            </div>

            {/* Zoom fullscreen */}
            {zoomedUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out"
                    onClick={() => setZoomedUrl(null)}
                >
                    <button
                        onClick={() => setZoomedUrl(null)}
                        className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors p-2 z-10"
                    >
                        <iconify-icon icon="solar:close-linear" width="22"></iconify-icon>
                    </button>
                    <img
                        src={zoomedUrl}
                        alt="Desenho técnico (ampliado)"
                        className="max-w-full max-h-full object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
