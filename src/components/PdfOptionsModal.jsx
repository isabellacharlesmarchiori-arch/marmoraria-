import { useState } from 'react';

export default function PdfOptionsModal({ tipo, defaults, onConfirm, onClose }) {
  const [opts, setOpts]               = useState({ ...defaults });
  const [open, setOpen]               = useState({ '01': true, '02': false, '03': false, '04': false });
  const [incluirContrato, setIncluir] = useState(false);

  const set = (field, value) => setOpts(prev => ({ ...prev, [field]: value }));
  const tog = key => setOpen(s => ({ ...s, [key]: !s[key] }));

  const labelTipo = tipo === 'orcamento' ? 'ORÇAMENTO' : 'PEDIDO FECHADO';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#050505] border border-zinc-800 border-t-2 border-t-yellow-400
                      w-full sm:max-w-lg z-10 shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
              Opções do documento
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">{labelTipo}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-square-linear" width="20" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-1" style={{ scrollbarWidth: 'thin' }}>

          {/* 01 // Identidade visual */}
          <div className="border border-zinc-800">
            <button onClick={() => tog('01')}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#020202] hover:bg-zinc-900/60 transition-colors text-left">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">01 // Identidade visual</span>
              <iconify-icon icon={open['01'] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="12" class="text-zinc-600 shrink-0" />
            </button>
            {open['01'] && (
              <div className="px-4 py-4 bg-[#020202] border-t border-zinc-800">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Cor primária</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={opts.cor_primaria}
                        onChange={e => set('cor_primaria', e.target.value)}
                        className="w-10 h-10 border border-zinc-700 bg-black cursor-pointer rounded-none" />
                      <input type="text" value={opts.cor_primaria}
                        onChange={e => set('cor_primaria', e.target.value)}
                        className="bg-black border border-zinc-800 text-white px-3 py-2 font-mono text-sm w-32 focus:outline-none focus:border-yellow-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Preview</label>
                    <div className="h-10 border border-zinc-800 flex items-center px-3 font-mono text-xs font-bold"
                      style={{ backgroundColor: opts.cor_primaria, color: '#000' }}>
                      {labelTipo} — SmartStone
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 02 // Nível de detalhe */}
          <div className="border border-zinc-800">
            <button onClick={() => tog('02')}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#020202] hover:bg-zinc-900/60 transition-colors text-left">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">02 // Nível de detalhe dos itens</span>
              <iconify-icon icon={open['02'] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="12" class="text-zinc-600 shrink-0" />
            </button>
            {open['02'] && (
              <div className="px-4 py-4 bg-[#020202] border-t border-zinc-800 space-y-3">
                <p className="text-[10px] font-mono text-zinc-600">Estrutura: Ambiente → Item → Peças. Escolha até onde detalhar.</p>
                <div className="flex flex-col gap-1">
                  {[
                    { id: 'so_ambientes',      label: 'Só totais por ambiente',         desc: 'Ex: Cozinha ........... R$ 4.200' },
                    { id: 'ambientes_e_itens', label: 'Ambientes + itens',              desc: 'Ex: Cozinha > Bancada .. R$ 2.100' },
                    { id: 'tudo',              label: 'Tudo (ambientes, itens, peças)', desc: 'Exibe cada peça com medidas e materiais' },
                  ].map(op => (
                    <button key={op.id} onClick={() => set('nivel_detalhe', op.id)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 border text-left transition-colors ${
                        opts.nivel_detalhe === op.id ? 'border-yellow-400 bg-yellow-400/5' : 'border-zinc-800 hover:border-zinc-600'
                      }`}>
                      <div className={`w-3.5 h-3.5 rounded-full border-2 mt-0.5 shrink-0 ${
                        opts.nivel_detalhe === op.id ? 'border-yellow-400 bg-yellow-400' : 'border-zinc-600'
                      }`} />
                      <div>
                        <div className={`font-mono text-[11px] uppercase tracking-widest ${
                          opts.nivel_detalhe === op.id ? 'text-yellow-400' : 'text-zinc-300'
                        }`}>{op.label}</div>
                        <div className="font-mono text-[10px] text-zinc-600 mt-0.5">{op.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 03 // Informações visíveis */}
          <div className="border border-zinc-800">
            <button onClick={() => tog('03')}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#020202] hover:bg-zinc-900/60 transition-colors text-left">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">03 // Informações visíveis no PDF</span>
              <iconify-icon icon={open['03'] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="12" class="text-zinc-600 shrink-0" />
            </button>
            {open['03'] && (
              <div className="px-4 py-4 bg-[#020202] border-t border-zinc-800">
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { field: 'mostrar_materiais',    label: 'Material'         },
                    { field: 'mostrar_medidas',       label: 'Medidas (m²)'    },
                    { field: 'mostrar_acabamentos',   label: 'Acabamentos'     },
                    { field: 'mostrar_vendedor',      label: 'Vendedor'        },
                    { field: 'mostrar_validade',      label: 'Validade'        },
                    { field: 'mostrar_prazo_entrega', label: 'Prazo entrega'   },
                    { field: 'mostrar_valores_pecas', label: 'Valores por peça' },
                  ].map(({ field, label }) => {
                    const on = opts[field] ?? true;
                    return (
                      <button key={field} onClick={() => set(field, !on)}
                        className={`flex items-center gap-2 px-3 py-2 border font-mono text-[10px] uppercase tracking-widest transition-colors ${
                          on ? 'border-yellow-400/40 bg-yellow-400/5 text-yellow-400' : 'border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                        }`}>
                        <iconify-icon icon={on ? 'solar:check-square-bold' : 'solar:square-linear'} width="13" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {tipo === 'pedido' && (
                  <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-zinc-800">
                    {[
                      { field: 'mostrar_cronograma',      label: 'Cronograma de parcelas' },
                      { field: 'mostrar_dados_bancarios', label: 'Dados bancários / Pix'  },
                      { field: 'mostrar_assinaturas',     label: 'Bloco de assinaturas'   },
                    ].map(({ field, label }) => {
                      const on = opts[field] ?? true;
                      return (
                        <button key={field} onClick={() => set(field, !on)}
                          className={`flex items-center gap-2 px-3 py-2 border font-mono text-[10px] uppercase tracking-widest transition-colors ${
                            on ? 'border-yellow-400/40 bg-yellow-400/5 text-yellow-400' : 'border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                          }`}>
                          <iconify-icon icon={on ? 'solar:check-square-bold' : 'solar:square-linear'} width="13" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 04 // Textos do documento */}
          <div className="border border-zinc-800">
            <button onClick={() => tog('04')}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#020202] hover:bg-zinc-900/60 transition-colors text-left">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">04 // Textos do documento</span>
              <iconify-icon icon={open['04'] ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width="12" class="text-zinc-600 shrink-0" />
            </button>
            {open['04'] && (
              <div className="px-4 py-4 bg-[#020202] border-t border-zinc-800 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">Observações (aparece antes do total)</label>
                  <textarea value={opts.observacoes ?? ''}
                    onChange={e => set('observacoes', e.target.value)}
                    rows={3}
                    placeholder="Ex: Medições sujeitas a confirmação em visita técnica."
                    className="w-full bg-black border border-zinc-800 text-white px-4 py-3 font-mono text-xs focus:outline-none focus:border-yellow-400 resize-none placeholder:text-zinc-700" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-zinc-500">Termos e condições comerciais</label>
                  <textarea value={opts.termos ?? ''}
                    onChange={e => set('termos', e.target.value)}
                    rows={5}
                    className="w-full bg-black border border-zinc-800 text-white px-4 py-3 font-mono text-xs focus:outline-none focus:border-yellow-400 resize-none" />
                  <p className="text-[10px] font-mono text-zinc-700">Aparece no rodapé como "Condições Comerciais".</p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-4 shrink-0 flex items-center justify-between gap-3">
          {tipo === 'pedido' ? (
            <>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={incluirContrato}
                  onChange={e => setIncluir(e.target.checked)}
                  className="accent-yellow-400 w-4 h-4" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Anexar contrato em PDF separado</span>
              </label>
              <button
                onClick={() => onConfirm(opts, incluirContrato ? 'pedido_contrato' : 'pedido')}
                className="bg-yellow-400 text-black text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-shadow shrink-0">
                Gerar Pedido
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onConfirm(opts, 'bw')}
                className="border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-zinc-500 hover:text-white transition-colors">
                Imprimir (P&B)
              </button>
              <button
                onClick={() => onConfirm(opts, 'color')}
                className="bg-yellow-400 text-black text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 hover:shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-shadow">
                Gerar Orçamento
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
