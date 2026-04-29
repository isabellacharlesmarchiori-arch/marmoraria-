import React, { useState } from 'react';
import { parseSvgUrl, normalizarJsonMedicao } from '../../utils/projetoUtils';

async function downloadDesenho(url, medicaoId) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha ao baixar');
        const blob = await res.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `desenho-medicao-${medicaoId ?? Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
        console.error('[download] Erro ao baixar desenho:', err);
    }
}

function formatDataLabel(medicao) {
    if (medicao?.data) return medicao.data; // já formatado (MedicoesTab)
    const raw = medicao?.data_enviada ?? medicao?.data_medicao;
    if (!raw) return '—';
    return new Date(raw).toLocaleString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── InfoMedicao ─────────────────────────────────────────────────────────────
export function InfoMedicao({ ambientes }) {
    if (!Array.isArray(ambientes) || ambientes.length === 0) return null;
    const temInfo = ambientes.some(amb => {
        const tipo = amb.tipo_medicao ?? amb.extras?.tipo_medicao ?? 'producao';
        const infoAmb = (amb.extras?.info_adicional ?? '').trim();
        const itensComInfo = (amb.itens ?? []).some(it => (it.info_adicional ?? '').trim() !== '');
        const gruposComInfo = (amb.grupos ?? []).some(g => (g.info ?? '').trim() !== '');
        return tipo === 'orcamento' || infoAmb !== '' || itensComInfo || gruposComInfo;
    });
    if (!temInfo) return null;
    return (
        <div>
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                Informações da Medição
            </div>
            <div className="flex flex-col gap-4">
                {ambientes.map((amb, i) => {
                    const tipo          = amb.tipo_medicao ?? amb.extras?.tipo_medicao ?? 'producao';
                    const infoAmb       = (amb.extras?.info_adicional ?? '').trim();
                    const itensComInfo  = (amb.itens ?? []).filter(it => (it.info_adicional ?? '').trim() !== '');
                    const gruposComInfo = (amb.grupos ?? []).filter(g => (g.info ?? '').trim() !== '');
                    const nomeAmb       = amb.ambiente ?? amb.nome ?? `Ambiente ${i + 1}`;
                    const hasContent    = tipo === 'orcamento' || infoAmb !== '' || itensComInfo.length > 0 || gruposComInfo.length > 0;
                    if (!hasContent) return null;
                    return (
                        <div key={i} className="flex flex-col gap-2.5">
                            {ambientes.length > 1 && (
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                    <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                    {nomeAmb}
                                </div>
                            )}
                            {tipo === 'orcamento' ? (
                                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-400/10 border border-orange-400/30">
                                    <iconify-icon icon="solar:danger-triangle-linear" width="13" className="text-orange-400 shrink-0 mt-0.5"></iconify-icon>
                                    <div>
                                        <div className="font-mono text-[10px] uppercase tracking-widest text-orange-400 font-semibold leading-none mb-1">Orçamento Preliminar</div>
                                        <div className="text-[11px] text-orange-300/70">Medição prévia — necessário retornar para medição final</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-green-400/10 border border-green-400/30">
                                    <iconify-icon icon="solar:check-circle-linear" width="13" className="text-green-400 shrink-0"></iconify-icon>
                                    <div className="font-mono text-[10px] uppercase tracking-widest text-green-400 font-semibold">Pronto para Produção</div>
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
// Painel lateral de detalhes de uma medição.
// Props:
//   medicao  — objeto da medição (suporta formato do vendedor com .data pré-formatado
//              e formato direto do Supabase com .data_enviada/.data_medicao)
//   onClose  — callback ao fechar
//   footer   — nó React opcional renderizado abaixo do corpo (ex: botão "Criar orçamento")
export function PainelDetalhesMedicao({ medicao, onClose, footer }) {
    const [imgLoading, setImgLoading] = useState(() => !!parseSvgUrl(medicao?.svg_url));
    const [imgError,   setImgError]   = useState(false);
    const [imgZoomed,  setImgZoomed]  = useState(false);

    const svgUrl    = parseSvgUrl(medicao?.svg_url);
    const dataLabel = formatDataLabel(medicao);
    const ambientes = medicao?.json_medicao?.ambientes;

    function handleClose() { onClose(); setImgZoomed(false); }

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={handleClose} />

            {/* Painel lateral */}
            <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-[#0a0a0a] border-l border-zinc-800 z-50 flex flex-col overflow-hidden">

                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">Dados da medição</div>
                        <div className="text-white font-semibold text-sm">{dataLabel}</div>
                    </div>
                    <button onClick={handleClose} className="text-zinc-600 hover:text-white transition-colors p-1">
                        <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
                    </button>
                </div>

                {/* Corpo scrollável */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

                    {/* Desenho técnico */}
                    <div>
                        <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">Desenho Técnico</div>
                        {svgUrl ? (
                            <div className="flex flex-col gap-2">
                                <div
                                    className="relative border border-zinc-800 bg-black overflow-hidden cursor-zoom-in group"
                                    onClick={() => !imgError && setImgZoomed(true)}
                                >
                                    {imgLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black z-10 min-h-[160px]">
                                            <div className="w-5 h-5 border-2 border-zinc-700 border-t-yellow-400 rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    {imgError ? (
                                        <div className="flex flex-col items-center justify-center py-8 gap-2 min-h-[100px]">
                                            <iconify-icon icon="solar:image-broken-linear" width="24" className="text-zinc-700"></iconify-icon>
                                            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Imagem indisponível</span>
                                        </div>
                                    ) : (
                                        <>
                                            <img
                                                src={svgUrl}
                                                alt="Desenho técnico da medição"
                                                className={`w-full h-auto max-h-[280px] object-contain transition-opacity duration-200 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
                                                onLoad={() => setImgLoading(false)}
                                                onError={() => { setImgLoading(false); setImgError(true); }}
                                            />
                                            {!imgLoading && (
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
                                {!imgError && !imgLoading && (
                                    <button
                                        onClick={() => downloadDesenho(svgUrl, medicao.id)}
                                        className="flex items-center justify-center gap-2 w-full border border-zinc-700 text-zinc-400 hover:border-white hover:text-white transition-colors text-[10px] font-mono uppercase tracking-widest py-2.5"
                                    >
                                        <iconify-icon icon="solar:download-linear" width="13"></iconify-icon>
                                        Baixar Desenho
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-6 gap-2 border border-zinc-900 bg-black">
                                <iconify-icon icon="solar:ruler-pen-linear" width="20" className="text-zinc-700"></iconify-icon>
                                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Desenho não disponível</span>
                            </div>
                        )}
                    </div>

                    {/* Informações da medição (tipo + observações) */}
                    <InfoMedicao ambientes={ambientes} />

                    {/* Observações de acesso */}
                    {medicao?.observacoes_acesso && (
                        <div className="bg-black border border-zinc-900 px-4 py-3">
                            <div className="flex items-center gap-1.5 mb-2">
                                <iconify-icon icon="solar:map-point-linear" width="11" className="text-zinc-500 shrink-0"></iconify-icon>
                                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Observações de Acesso</span>
                            </div>
                            <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{medicao.observacoes_acesso}</p>
                        </div>
                    )}

                    {/* Resumo da medição */}
                    <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-1">Resumo da Medição</div>

                    {(() => {
                        const jsonNorm  = normalizarJsonMedicao(medicao?.json_medicao);
                        const pecas     = jsonNorm?.resumo_por_peca ?? [];
                        const isFlutter = jsonNorm?._fonte === 'flutter' || jsonNorm?._fonte === 'flutter2';
                        if (pecas.length === 0) {
                            return (
                                <div className="text-center py-10 px-4 border border-zinc-900 bg-black">
                                    <iconify-icon icon="solar:document-text-linear" width="24" className="text-zinc-700 mb-2"></iconify-icon>
                                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Nenhum dado processado ainda</div>
                                </div>
                            );
                        }
                        const totalME = jsonNorm?.totais_acabamentos?.meia_esquadria_ml
                            ?? Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.meia_esquadria_ml ?? 0), 0) * 100) / 100;
                        const totalRS = jsonNorm?.totais_acabamentos?.reto_simples_ml
                            ?? Math.round(pecas.reduce((s, p) => s + (p.acabamentos?.reto_simples_ml ?? 0), 0) * 100) / 100;
                        const todosRecortes = pecas.flatMap(p => (p.recortes ?? []).map(r => ({ ...r, pecaNome: p.nome })));
                        const faixas = (medicao?.json_medicao?.ambientes ?? []).flatMap(amb =>
                            (amb.faixas ?? []).map(f => ({ ...f, ambNome: amb.nome ?? amb.ambiente ?? null }))
                        );
                        const grupos = (medicao?.json_medicao?.ambientes ?? []).flatMap(amb =>
                            (amb.grupos ?? []).filter(g => (g.info ?? '').trim() !== '')
                        );

                        return (
                            <>
                                {isFlutter && (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-yellow-400/5 border border-yellow-400/20">
                                        <iconify-icon icon="solar:smartphone-linear" width="11" className="text-yellow-400 shrink-0"></iconify-icon>
                                        <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-400">Enviado pelo app SmartStone</span>
                                    </div>
                                )}

                                {/* [ PEÇAS ] */}
                                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-1 pb-2">[ PEÇAS ]</div>
                                {(() => {
                                    const ambGrupos = [];
                                    const ambMapa = new Map();
                                    pecas.forEach(r => {
                                        const amb = r.ambiente_nome ?? '';
                                        if (!ambMapa.has(amb)) { ambMapa.set(amb, []); ambGrupos.push(amb); }
                                        ambMapa.get(amb).push(r);
                                    });
                                    const temAmb = ambGrupos.some(g => g !== '');
                                    return (
                                        <div className="flex flex-col gap-4">
                                            {ambGrupos.map(amb => {
                                                const pecasDoAmb = ambMapa.get(amb);
                                                const itensOrdem = [];
                                                const itensMapa = new Map();
                                                pecasDoAmb.forEach(r => {
                                                    const k = r.item_nome ?? '__sem_item__';
                                                    if (!itensMapa.has(k)) { itensMapa.set(k, []); itensOrdem.push(k); }
                                                    itensMapa.get(k).push(r);
                                                });
                                                return (
                                                    <div key={amb}>
                                                        {temAmb && amb && (
                                                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mb-2 pl-1 flex items-center gap-2">
                                                                <div className="w-0.5 h-3 bg-yellow-400/50 shrink-0"></div>
                                                                {amb}
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col gap-2">
                                                            {itensOrdem.map(itemKey => {
                                                                const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                                                                return (
                                                                    <div key={itemKey}>
                                                                        {nomeItem && (
                                                                            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-1.5 ml-2 flex items-center gap-1.5">
                                                                                <iconify-icon icon="solar:folder-linear" width="10" className="text-zinc-700 shrink-0"></iconify-icon>
                                                                                {nomeItem}
                                                                            </div>
                                                                        )}
                                                                        <div className={`flex flex-col gap-1.5 ${nomeItem ? 'ml-2' : ''}`}>
                                                                            {itensMapa.get(itemKey).map((r, i) => (
                                                                                <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <span className="text-white font-semibold text-sm">{r.nome ?? 'Peça'}</span>
                                                                                        <span className="font-mono text-sm text-yellow-400 font-bold">{r.area_liquida_m2 ?? 0} m²</span>
                                                                                    </div>
                                                                                    {Array.isArray(r.segmentos) && r.segmentos.length >= 2 && r.type === 'retangulo' && (() => {
                                                                                        const medidas = r.segmentos.map(s => parseFloat(s?.medida_cm)).filter(n => Number.isFinite(n) && n > 0);
                                                                                        if (medidas.length < 2) return null;
                                                                                        return <div className="font-mono text-[10px] text-zinc-500 mt-1">{Math.max(...medidas)} × {Math.min(...medidas)} cm</div>;
                                                                                    })()}
                                                                                    {Array.isArray(r.segmentos) && r.segmentos.length >= 2 && r.type !== 'retangulo' && (
                                                                                        <div className="font-mono text-[10px] text-zinc-500 mt-1">{r.segmentos.map(s => s.medida_cm).join(' × ')} cm</div>
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
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* [ ACABAMENTOS ] */}
                                {(totalME > 0 || totalRS > 0) && (
                                    <>
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ ACABAMENTOS ]</div>
                                        <div className="bg-black border border-zinc-900 px-4 py-3 flex flex-col gap-2">
                                            {totalME > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                        <span className="font-mono text-[11px] text-zinc-300">Meia-Esquadria</span>
                                                    </div>
                                                    <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalME} ml</span>
                                                </div>
                                            )}
                                            {totalRS > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <iconify-icon icon="solar:ruler-cross-pen-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                        <span className="font-mono text-[11px] text-zinc-300">Reto Simples</span>
                                                    </div>
                                                    <span className="font-mono text-[11px] text-yellow-400 font-bold">{totalRS} ml</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* [ RECORTES ] */}
                                {todosRecortes.length > 0 && (
                                    <>
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ RECORTES ]</div>
                                        <div className="flex flex-col gap-2">
                                            {todosRecortes.map((rc, i) => {
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
                                                    <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <iconify-icon icon="solar:scissors-linear" width="12" className="text-zinc-500"></iconify-icon>
                                                                <span className="font-mono text-[11px] text-zinc-300">{label}</span>
                                                            </div>
                                                            {dim && <span className="font-mono text-[10px] text-zinc-500">{dim}</span>}
                                                        </div>
                                                        <div className="font-mono text-[9px] text-zinc-600 mt-1 pl-5">{rc.pecaNome}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {/* [ FAIXAS ] */}
                                {faixas.length > 0 && (
                                    <>
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ FAIXAS ]</div>
                                        <div className="flex flex-col gap-2">
                                            {faixas.map((f, i) => (
                                                <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-mono text-[11px] text-zinc-300">{f.nome ?? `Faixa ${i + 1}`}</span>
                                                        {f.area_m2 != null && <span className="font-mono text-[11px] text-yellow-400 font-bold">{f.area_m2} m²</span>}
                                                    </div>
                                                    <div className="font-mono text-[10px] text-zinc-500 mt-1">
                                                        {f.comprimento_cm ?? '?'} × {f.largura_cm ?? '?'} cm
                                                        {f.espessura_cm ? ` · esp. ${f.espessura_cm} cm` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* [ GRUPOS ] */}
                                {grupos.length > 0 && (
                                    <>
                                        <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 pt-3 pb-2">[ GRUPOS ]</div>
                                        <div className="flex flex-col gap-2">
                                            {grupos.map((g, i) => (
                                                <div key={i} className="bg-black border border-zinc-900 px-4 py-3">
                                                    <div className="font-mono text-[10px] uppercase tracking-widest text-yellow-400/80 mb-1">{g.nome}</div>
                                                    <p className="text-zinc-300 text-[12px] leading-relaxed whitespace-pre-line">{g.info.trim()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Footer opcional (ex: botão "Criar orçamento") */}
                {footer && (
                    <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
                        {footer}
                    </div>
                )}
            </div>

            {/* Zoom fullscreen */}
            {imgZoomed && svgUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out"
                    onClick={() => setImgZoomed(false)}
                >
                    <button
                        onClick={() => setImgZoomed(false)}
                        className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors p-2 z-10"
                    >
                        <iconify-icon icon="solar:close-linear" width="22"></iconify-icon>
                    </button>
                    <img
                        src={svgUrl}
                        alt="Desenho técnico (ampliado)"
                        className="max-w-full max-h-full object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
