import { formatBRL } from '../../../utils/format';

const COR_ACENTO = {
  verde:    'text-emerald-400',
  vermelho: 'text-red-400',
  ambar:    'text-amber-400',
  neutro:   'text-white',
};

export default function CardResumo({ titulo, valor, icone, corAcento = 'neutro', subtitulo }) {
  const corValor = COR_ACENTO[corAcento] ?? COR_ACENTO.neutro;

  return (
    <div className="bg-[#0a0a0a] p-5 relative group hover:-translate-y-0.5 transition-all">
      <iconify-icon icon={icone} width="16" className="text-zinc-700 absolute top-5 right-5"></iconify-icon>

      <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600 mb-2">{titulo}</div>

      {valor === null ? (
        <div className="h-9 w-36 bg-zinc-800 animate-pulse rounded" />
      ) : (
        <div className={`text-3xl font-bold tracking-tighter mb-1 ${corValor}`}>
          {formatBRL(valor)}
        </div>
      )}

      {subtitulo && (
        <div className="font-mono text-[9px] text-zinc-600">{subtitulo}</div>
      )}
    </div>
  );
}
