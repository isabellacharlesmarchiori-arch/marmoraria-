import { useState, useEffect } from 'react';
import { formatBRL } from '../../../utils/format';

// ─── helpers de data ────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr, n) {
  const [y, m, d]   = dateStr.split('-').map(Number);
  const totalMeses   = (m - 1) + n;
  const anoAlvo      = y + Math.floor(totalMeses / 12);
  const mesAlvo      = totalMeses % 12; // 0-indexed
  const maxDia       = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
  const diaReal      = Math.min(d, maxDia);
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;
}

function calcularData(dataBase, offsetIndex, intervalo) {
  if (!dataBase) return '';
  if (intervalo === 'semanal')   return addDays(dataBase, offsetIndex * 7);
  if (intervalo === 'quinzenal') return addDays(dataBase, offsetIndex * 14);
  if (intervalo === '30dias')    return addDays(dataBase, offsetIndex * 30);
  return addMonths(dataBase, offsetIndex); // mensal
}

function distribuirValores(n, valorTotal) {
  const centavos = Math.round(valorTotal * 100);
  const baseC    = Math.floor(centavos / n);
  const remanC   = centavos - baseC * n;
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valor:  (baseC + (i === n - 1 ? remanC : 0)) / 100,
    data_vencimento: '',
  }));
}

function gerarParcelas(n, valorTotal, dataPrimeira, intervalo) {
  const base = distribuirValores(n, valorTotal);
  return base.map((p, i) => ({
    ...p,
    data_vencimento: calcularData(dataPrimeira, i, intervalo),
  }));
}

// ─── constantes visuais ─────────────────────────────────────────────────────

const INTERVALOS = [
  { v: 'semanal',   l: 'Semanal'   },
  { v: 'quinzenal', l: 'Quinzenal' },
  { v: 'mensal',    l: 'Mensal'    },
  { v: '30dias',    l: '30 dias'   },
];

const INPUT = 'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-yellow-400 transition-colors w-full';
const TH    = 'px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-left';

// ─── componente ─────────────────────────────────────────────────────────────

export default function CamposParcelamento({
  parcelas,
  setParcelas,
  valorTotal,
  dataPrimeiraParcela,
}) {
  const [numeroParcelas, setNumeroParcelas] = useState(Math.max(parcelas.length, 2));
  const [intervalo,      setIntervalo]      = useState('mensal');

  // Gera parcelas iniciais quando o componente monta (parcelado acabou de ser marcado)
  useEffect(() => {
    if (parcelas.length === 0 && dataPrimeiraParcela && valorTotal > 0) {
      setParcelas(gerarParcelas(2, valorTotal, dataPrimeiraParcela, 'mensal'));
      setNumeroParcelas(2);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNumero(e) {
    const n = Math.max(2, Math.min(48, parseInt(e.target.value, 10) || 2));
    setNumeroParcelas(n);
    setParcelas(gerarParcelas(n, valorTotal, dataPrimeiraParcela, intervalo));
  }

  function handleDistribuir() {
    const valores = distribuirValores(parcelas.length, valorTotal);
    setParcelas(parcelas.map((p, i) => ({ ...p, valor: valores[i].valor })));
  }

  function handleAplicarIntervalo() {
    setParcelas(
      parcelas.map((p, i) => ({
        ...p,
        data_vencimento: calcularData(dataPrimeiraParcela, i, intervalo),
      }))
    );
  }

  function handleEditarParcela(index, campo, valor) {
    setParcelas(
      parcelas.map((p, i) =>
        i !== index ? p : {
          ...p,
          [campo]: campo === 'valor' ? (parseFloat(valor) || 0) : valor,
        }
      )
    );
  }

  const somaTotal = parcelas.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);
  const somaBate  = Math.abs(somaTotal - valorTotal) < 0.01;

  return (
    <div className="border border-zinc-800 flex flex-col gap-4 p-4">

      {/* Número de parcelas + intervalo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            Número de parcelas
          </span>
          <input
            type="number"
            min="2"
            max="48"
            value={numeroParcelas}
            onChange={handleNumero}
            className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            Intervalo
          </span>
          <div className="flex gap-4 flex-wrap pt-1.5">
            {INTERVALOS.map(({ v, l }) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="intervalo-parcelas"
                  value={v}
                  checked={intervalo === v}
                  onChange={() => setIntervalo(v)}
                  className="accent-yellow-400"
                />
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  {l}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleDistribuir}
          className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors border border-zinc-800 px-3 py-1.5"
        >
          Distribuir igualmente
        </button>
        <button
          type="button"
          onClick={handleAplicarIntervalo}
          className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 hover:text-yellow-400 transition-colors border border-zinc-800 px-3 py-1.5"
        >
          Aplicar intervalo
        </button>
      </div>

      {/* Tabela de parcelas */}
      {parcelas.length > 0 && (
        <div className="border border-zinc-800 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className={TH + ' w-10'}>#</th>
                <th className={TH}>Valor (R$)</th>
                <th className={TH}>Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p, i) => (
                <tr key={i} className="border-b border-zinc-900">
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] text-zinc-500">{i + 1}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={p.valor}
                      onChange={e => handleEditarParcela(i, 'valor', e.target.value)}
                      className={INPUT}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={p.data_vencimento}
                      onChange={e => handleEditarParcela(i, 'data_vencimento', e.target.value)}
                      className={INPUT + ' [color-scheme:dark]'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rodapé — total vs valor */}
      {parcelas.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            Total das parcelas: {formatBRL(somaTotal)}
          </span>
          {somaBate ? (
            <iconify-icon icon="lucide:check-circle" width="14" className="text-emerald-400"></iconify-icon>
          ) : (
            <span className="font-mono text-[9px] text-red-400">
              — diverge do valor total ({formatBRL(valorTotal)})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
