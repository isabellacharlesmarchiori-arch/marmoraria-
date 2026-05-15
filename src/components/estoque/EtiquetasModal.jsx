import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';

const EMPRESA_NOME = 'Giani Boutique das Pedras';
const POR_PAGINA = 8; // 2 colunas × 4 linhas

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function StatusLabel({ temTrinca, temMula }) {
  const label = temTrinca ? 'Trinca' : temMula ? 'Mula' : 'OK';
  return (
    <span style={{
      border: '1px solid #000', padding: '0 3px',
      fontWeight: 700, color: '#000', backgroundColor: '#fff',
    }}>
      {label}
    </span>
  );
}

// Renderiza uma etiqueta individual — usada tanto no preview (screen) quanto na impressão
function EtiquetaCard({ item, forPrint = false }) {
  const serial   = item.numero_serie ?? '—';
  const material = item.materiais?.nome ?? 'Material';
  const qrVal    = item.numero_serie ?? item.id;
  const qrSize   = forPrint ? 68 : 58;

  const wrapStyle = forPrint ? {
    width: '9cm', height: '5cm',
    border: '1px solid #000', borderRadius: 3,
    padding: '2.5mm', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace, sans-serif',
    backgroundColor: '#fff', color: '#000',
    pageBreakInside: 'avoid', breakInside: 'avoid',
  } : {
    width: '100%', aspectRatio: '9 / 5',
    border: '1px solid #ccc', borderRadius: 6,
    padding: 8, boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', backgroundColor: '#fff', color: '#000',
  };

  return (
    <div style={wrapStyle}>
      <div style={{ fontSize: forPrint ? 6 : 7, color: '#666', marginBottom: forPrint ? 1 : 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {EMPRESA_NOME}
      </div>
      <div style={{ display: 'flex', gap: forPrint ? 5 : 6, flex: 1, alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0 }}>
          <QRCodeSVG value={qrVal} size={qrSize} level="M" fgColor="#000" bgColor="#fff" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: forPrint ? 2 : 2.5, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ fontSize: forPrint ? 14 : 12, fontWeight: 900, letterSpacing: '0.02em', whiteSpace: 'nowrap', color: '#000' }}>
            {serial}
          </div>
          <div style={{ fontSize: forPrint ? 9 : 9.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000' }}>
            {material}
          </div>
          <div style={{ fontSize: forPrint ? 7.5 : 8, color: '#444' }}>
            {item.largura_cm} × {item.altura_cm} cm · esp. {item.espessura_cm}cm
          </div>
          <div style={{ fontSize: forPrint ? 7.5 : 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusLabel temTrinca={item.tem_trinca} temMula={item.tem_mula} />
            <span style={{ color: '#555' }}>Entrada: {formatDate(item.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Portal de impressão: renderizado no <body> com CSS de print embutido
function PrintArea({ items }) {
  const paginas = chunk(items, POR_PAGINA);

  return createPortal(
    <div id="etiquetas-print-area" style={{ display: 'none' }}>
      <style>{`
        @media print {
          body > *:not(#etiquetas-print-area) { display: none !important; }
          #etiquetas-print-area {
            display: block !important;
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #etiquetas-print-area * {
            color: black !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #etiquetas-print-area svg path,
          #etiquetas-print-area svg rect { fill: revert !important; }
          .etq-pagina { page-break-after: always; break-after: page; padding: 5mm; }
          .etq-pagina:last-child { page-break-after: auto; break-after: auto; }
          .etq-grid { display: grid; grid-template-columns: repeat(2, 9cm); gap: 3mm; }
        }
      `}</style>
      {paginas.map((pagina, pi) => (
        <div key={pi} className="etq-pagina">
          <div className="etq-grid">
            {pagina.map(item => (
              <EtiquetaCard key={item.id} item={item} forPrint />
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function ModeBtn({ current, value, onClick, children }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`w-full text-left px-4 py-2.5 rounded border font-mono text-[11px] transition-colors ${
        active
          ? 'bg-yellow-50 dark:bg-yellow-400/10 border-yellow-400 text-gray-900 dark:text-white'
          : 'bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-600'
      }`}
    >
      {children}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EtiquetasModal({
  open,
  onClose,
  items,         // todos os itens da aba atual (chapas ou pedaceiras), com materiais joined
  tipo,          // 'chapas' | 'pedaceiras'
  contextItem,   // null = aberto pelo botão geral; item = aberto pelo botão individual
  empresaId,
  onMarcadas,    // callback para recarregar após marcar como impressas
}) {
  const unidade = tipo === 'chapas' ? 'chapa' : 'pedaceira';
  const tabela  = tipo === 'chapas' ? 'estoque_chapas' : 'estoque_pedaceiras';

  const [mode, setMode]           = useState('manual');
  const [manualIds, setManualIds] = useState(new Set());
  const [step, setStep]           = useState('select');
  const [showMarcar, setShowMarcar] = useState(false);
  const [marcando, setMarcando]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(contextItem ? 'single' : 'manual');
    setManualIds(new Set());
    setStep('select');
    setShowMarcar(false);
  }, [open, contextItem]);

  const selectedItems = useMemo(() => {
    switch (mode) {
      case 'single':      return contextItem ? [contextItem] : [];
      case 'material':    return items.filter(i => i.materiais?.nome === contextItem?.materiais?.nome);
      case 'categoria':   return items.filter(i => i.categoria === contextItem?.categoria);
      case 'sem_etiqueta':return items.filter(i => !i.etiqueta_impressa);
      case 'todas':       return [...items];
      case 'manual':      return items.filter(i => manualIds.has(i.id));
      default:            return [];
    }
  }, [mode, items, contextItem, manualIds]);

  const porMaterial = useMemo(() => {
    const map = {};
    for (const item of items) {
      const nome = item.materiais?.nome ?? 'Material desconhecido';
      if (!map[nome]) map[nome] = [];
      map[nome].push(item);
    }
    return map;
  }, [items]);

  function toggleItem(id) {
    setManualIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGrupo(nome) {
    const ids = (porMaterial[nome] ?? []).map(i => i.id);
    setManualIds(prev => {
      const next = new Set(prev);
      const todosOn = ids.every(id => next.has(id));
      if (todosOn) ids.forEach(id => next.delete(id));
      else         ids.forEach(id => next.add(id));
      return next;
    });
  }

  function handlePrint() {
    window.print();
    window.addEventListener('afterprint', () => setShowMarcar(true), { once: true });
  }

  async function handleMarcarImpressas() {
    const ids = selectedItems.map(i => i.id);
    setMarcando(true);
    const { error } = await supabase
      .from(tabela)
      .update({ etiqueta_impressa: true })
      .in('id', ids)
      .eq('empresa_id', empresaId);
    setMarcando(false);
    if (!error) {
      onMarcadas?.();
      setShowMarcar(false);
      onClose();
    }
  }

  if (!open) return null;

  const n = selectedItems.length;
  const plural = n !== 1;

  return (
    <>
      {/* Área de impressão (portal no body) */}
      {n > 0 && <PrintArea items={selectedItems} />}

      {/* Confirmação "Marcar como impressas" */}
      {showMarcar && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-2xl p-6">
            <p className="font-mono text-[12px] text-gray-900 dark:text-white font-bold mb-1">
              Marcar como impressas?
            </p>
            <p className="font-mono text-[11px] text-gray-500 dark:text-zinc-400 mb-4">
              {n} etiqueta{plural ? 's' : ''} impresa{plural ? 's' : ''}. Marcar {plural ? `as ${n} ${unidade}s` : `a ${unidade}`} como etiqueta impressa?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleMarcarImpressas}
                disabled={marcando}
                className="flex-1 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded transition-colors"
              >
                {marcando ? 'Marcando...' : 'Sim, marcar'}
              </button>
              <button
                onClick={() => { setShowMarcar(false); onClose(); }}
                className="px-4 py-2 border border-gray-200 dark:border-zinc-700 font-mono text-[11px] text-gray-500 dark:text-zinc-500 hover:text-gray-800 dark:hover:text-zinc-300 rounded transition-colors"
              >
                Não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal principal */}
      {!showMarcar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="relative z-10 w-full max-w-4xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-2xl max-h-[90vh] flex flex-col">

            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
              <span className="font-mono text-[12px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">
                Imprimir Etiquetas
              </span>
              <div className="flex items-center gap-3">
                {step === 'preview' && (
                  <button
                    onClick={() => setStep('select')}
                    className="font-mono text-[11px] text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    ← Voltar
                  </button>
                )}
                <button onClick={onClose} className="text-gray-400 dark:text-zinc-600 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors">
                  <iconify-icon icon="solar:close-circle-linear" width="18" />
                </button>
              </div>
            </div>

            {/* Corpo */}
            <div className="overflow-y-auto flex-1 px-5 py-4">

              {step === 'select' ? (
                <div className="space-y-5">
                  {/* Seleção de modo */}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-3">
                      O que imprimir
                    </p>
                    <div className="space-y-1.5">
                      {contextItem && (
                        <>
                          <ModeBtn current={mode} value="single" onClick={setMode}>
                            Esta {unidade}
                            <span className="ml-1 text-gray-400 dark:text-zinc-500">
                              — {contextItem.numero_serie ?? contextItem.materiais?.nome ?? 'item selecionado'}
                            </span>
                          </ModeBtn>
                          <ModeBtn current={mode} value="material" onClick={setMode}>
                            Todo este material
                            <span className="ml-1 text-gray-400 dark:text-zinc-500">
                              — {contextItem.materiais?.nome} ({items.filter(i => i.materiais?.nome === contextItem.materiais?.nome).length} itens)
                            </span>
                          </ModeBtn>
                          <ModeBtn current={mode} value="categoria" onClick={setMode}>
                            Toda esta categoria
                            <span className="ml-1 text-gray-400 dark:text-zinc-500 capitalize">
                              — {contextItem.categoria} ({items.filter(i => i.categoria === contextItem.categoria).length} itens)
                            </span>
                          </ModeBtn>
                        </>
                      )}
                      <ModeBtn current={mode} value="sem_etiqueta" onClick={setMode}>
                        Sem etiqueta impressa
                        <span className="ml-1 text-gray-400 dark:text-zinc-500">
                          ({items.filter(i => !i.etiqueta_impressa).length} itens)
                        </span>
                      </ModeBtn>
                      <ModeBtn current={mode} value="todas" onClick={setMode}>
                        Todas disponíveis
                        <span className="ml-1 text-gray-400 dark:text-zinc-500">({items.length} itens)</span>
                      </ModeBtn>
                      <ModeBtn current={mode} value="manual" onClick={setMode}>
                        Seleção manual com checkboxes
                      </ModeBtn>
                    </div>
                  </div>

                  {/* Checkboxes manuais */}
                  {mode === 'manual' && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-3">
                        Selecionar itens
                      </p>
                      {Object.keys(porMaterial).length === 0 ? (
                        <p className="font-mono text-[11px] text-gray-400 dark:text-zinc-600">Nenhum item no estoque.</p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(porMaterial).map(([nome, its]) => {
                            const todosOn = its.every(i => manualIds.has(i.id));
                            const algumOn = its.some(i => manualIds.has(i.id));
                            return (
                              <div key={nome}>
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    type="checkbox"
                                    checked={todosOn}
                                    ref={el => { if (el) el.indeterminate = algumOn && !todosOn; }}
                                    onChange={() => toggleGrupo(nome)}
                                    className="w-3.5 h-3.5 accent-yellow-400 cursor-pointer"
                                  />
                                  <span className="font-mono text-[11px] font-bold text-gray-900 dark:text-zinc-200">{nome}</span>
                                  <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">{its.length} item{its.length !== 1 ? 'ns' : ''}</span>
                                </div>
                                <div className="space-y-1 ml-5">
                                  {its.map(item => (
                                    <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        checked={manualIds.has(item.id)}
                                        onChange={() => toggleItem(item.id)}
                                        className="w-3.5 h-3.5 accent-yellow-400"
                                      />
                                      <span className="font-mono text-[11px] text-gray-700 dark:text-zinc-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                        {item.numero_serie ?? '—'}
                                      </span>
                                      <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-500">
                                        {item.largura_cm} × {item.altura_cm} cm
                                      </span>
                                      {item.etiqueta_impressa && (
                                        <span className="font-mono text-[9px] px-1 py-px border border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-zinc-500 rounded">
                                          impressa
                                        </span>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Preview de etiquetas */
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-3">
                    Preview — {n} etiqueta{plural ? 's' : ''}
                    {n > POR_PAGINA && (
                      <span className="ml-2 text-gray-400 dark:text-zinc-600">
                        · {Math.ceil(n / POR_PAGINA)} página{Math.ceil(n / POR_PAGINA) !== 1 ? 's' : ''} ({POR_PAGINA} por página)
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedItems.map(item => (
                      <EtiquetaCard key={item.id} item={item} forPrint={false} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-zinc-800 shrink-0">
              <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-500">
                {n} etiqueta{plural ? 's' : ''} selecionada{plural ? 's' : ''}
              </span>
              <div className="flex gap-2">
                {step === 'select' ? (
                  <button
                    onClick={() => setStep('preview')}
                    disabled={n === 0}
                    className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded transition-colors"
                  >
                    Pré-visualizar →
                  </button>
                ) : (
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-mono text-[11px] uppercase tracking-widest font-bold rounded transition-colors"
                  >
                    <iconify-icon icon="solar:printer-linear" width="14" />
                    Imprimir
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-200 dark:border-zinc-700 font-mono text-[11px] text-gray-500 dark:text-zinc-500 hover:text-gray-800 dark:hover:text-zinc-300 rounded transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
