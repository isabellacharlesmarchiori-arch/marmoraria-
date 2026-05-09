import { lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const AbaImportarPDF = lazy(() => import('../components/projeto/AbaImportarPDF'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#050505]">
      <div style={{
        width: 24, height: 24,
        border: '2px solid #27272a',
        borderTopColor: '#facc15',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function ImportarPDFPage() {
  const { id }       = useParams();
  const { state }    = useLocation();
  const navigate     = useNavigate();
  const initialFiles = state?.files ?? [];

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050505] overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-zinc-800 bg-[#0a0a0a]">
        <button
          onClick={() => navigate(`/projetos/${id}`)}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <iconify-icon icon="solar:alt-arrow-left-linear" width="13" />
          Voltar ao projeto
        </button>
        <div className="w-px h-4 bg-zinc-800" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-white">
          Importar PDF
        </span>
        {initialFiles.length > 0 && (
          <span className="font-mono text-[10px] text-zinc-500">
            {initialFiles.length} {initialFiles.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<PageLoader />}>
          <AbaImportarPDF projetoId={id} initialFiles={initialFiles} fullscreen />
        </Suspense>
      </div>
    </div>
  );
}
