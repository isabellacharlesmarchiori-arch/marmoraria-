import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ModalImportarPDF({ projetoId, onClose }) {
  const navigate   = useNavigate();
  const [files,    setFiles]    = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function addFiles(incoming) {
    const pdfs = Array.from(incoming).filter(f => f.type === 'application/pdf');
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !existing.has(f.name))];
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function handleContinuar() {
    navigate(`/projetos/${projetoId}/importar-pdf`, { state: { files } });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-700 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-mono text-[13px] font-bold uppercase tracking-widest text-white">
              Importar projeto
            </h2>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
              Selecione um ou mais PDFs do projeto
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <iconify-icon icon="solar:close-linear" width="16" />
          </button>
        </div>

        {/* Drop zone */}
        <div className="p-5">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed cursor-pointer transition-colors ${
              dragOver
                ? 'border-yellow-400 bg-yellow-400/5'
                : 'border-zinc-700 hover:border-zinc-500'
            }`}
          >
            <iconify-icon icon="solar:upload-linear" width="28" class="text-zinc-500" />
            <div className="text-center">
              <p className="font-mono text-[11px] text-zinc-300">
                Arraste PDFs aqui
              </p>
              <p className="font-mono text-[10px] text-zinc-600 mt-1">
                ou <span className="text-yellow-400">clique para selecionar</span>
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={e => addFiles(e.target.files)}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <iconify-icon icon="solar:file-text-bold" width="13" class="text-yellow-400 shrink-0" />
                    <span className="font-mono text-[10px] text-zinc-300 truncate">{f.name}</span>
                  </div>
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <iconify-icon icon="solar:close-circle-linear" width="13" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleContinuar}
            disabled={files.length === 0}
            className="flex-1 py-2.5 bg-yellow-400 text-black font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
