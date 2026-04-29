import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { normalizarJsonMedicao } from '../utils/projetoUtils';

// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}



const CATEGORIAS = [
  { key: 'todos',       label: 'Todos'        },
  { key: 'granito',     label: 'Granito'      },
  { key: 'marmore',     label: 'Mármore'      },
  { key: 'quartzito',   label: 'Quartzito'    },
  { key: 'porcelanato', label: 'Porcelanato'  },
];

const ACABAMENTO_LABEL = {
  meia_esquadria: 'Meia-Esquadria',
  reto_simples:   'Reto Simples',
};

// Calcula o preço de um acabamento linear
function precoAcabamento(ml, matLinearId, matLineares) {
  if (!ml || !matLinearId) return 0;
  const m = matLineares.find(x => x.id === matLinearId);
  return Number(ml) * Number(m?.precoml ?? 0);
}

// Gera as linhas de acabamento derivadas de uma peça de pedra
function criarAcabamentosParaPeca(p, stoneUid) {
  const rows = [];
  if ((p.meia_esquadria_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-me-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'meia_esquadria',
      nome:            'Meia Esquadria',
      ml:              p.meia_esquadria_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  if ((p.reto_simples_ml ?? 0) > 0) {
    rows.push({
      uid:             `ac-rs-${stoneUid}-${Math.random()}`,
      idBase:          p.id,
      idPedraUid:      stoneUid,
      tipo:            'acabamento',
      tipoAcabamento:  'reto_simples',
      nome:            'Reto Simples',
      ml:              p.reto_simples_ml,
      matLinearId:     null,
      ambiente_nome:   p.ambiente_nome ?? null,
      item_nome:       p.item_nome ?? null,
    });
  }
  return rows;
}

// Palavras-chave de busca por tipoAcabamento no nome do material linear
const ACABAMENTO_KEYWORDS = {
  meia_esquadria: ['meia esquadria', 'meia-esquadria', 'meia'],
  reto_simples:   ['reto simples', 'reto-simples', 'reto'],
};

// Busca o melhor material linear para um acabamento.
// 1. Filtra candidatos cujo nome contém as palavras-chave do tipo.
// 2. Se único candidato → retorna direto.
// 3. Se múltiplos → tenta desambiguar pelo material/categoria da pedra mãe.
// 4. Fallback: primeiro candidato.
function autoMatchLinear(tipoAcabamento, pedraMatId, todosM, matLineares) {
  const keywords = ACABAMENTO_KEYWORDS[tipoAcabamento] ?? [];
  if (keywords.length === 0 || matLineares.length === 0) return null;

  const candidatos = matLineares.filter(m => {
    const n = m.nome.toLowerCase();
    return keywords.some(kw => n.includes(kw));
  });

  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0].id;

  // Múltiplos: tenta match pela categoria / nome do material da pedra
  if (pedraMatId) {
    const mat = todosM.find(m => m.id === pedraMatId);
    if (mat) {
      const categoria = (mat.categoria ?? mat.cor ?? '').toLowerCase();
      const nomeMat   = mat.nome.toLowerCase();
      // Tenta categoria exata, depois primeira palavra do nome
      const byCategoria = candidatos.find(c => categoria && c.nome.toLowerCase().includes(categoria));
      if (byCategoria) return byCategoria.id;
      const primeiraPalavra = nomeMat.split(' ')[0];
      const byNome = candidatos.find(c => primeiraPalavra && c.nome.toLowerCase().includes(primeiraPalavra));
      if (byNome) return byNome.id;
    }
  }

  return candidatos[0].id; // fallback: primeiro candidato
}

// Aplica auto-match de matLinearId em todos os acabamentos com matLinearId === null
// dentro de uma pecasList. Não sobrescreve seleções manuais (matLinearId !== null).
function aplicarAutoMatchNaLista(pecasList, todosM, matLineares) {
  let changed = false;
  const nova = pecasList.map(pw => {
    if (pw.tipo !== 'acabamento' || pw.matLinearId !== null) return pw;
    const pedra = pecasList.find(p => p.uid === pw.idPedraUid);
    const match = autoMatchLinear(pw.tipoAcabamento, pedra?.matId ?? null, todosM, matLineares);
    if (!match) return pw;
    changed = true;
    return { ...pw, matLinearId: match };
  });
  return changed ? nova : pecasList;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function precoPeca(peca, materialId, todosM) {
  if (!peca || !materialId) return 0;
  const m = (todosM || []).find(x => x.id === materialId);
  if (!m) return 0;
  const espessura = Number(peca.espessura ?? 2);
  const areaLiq   = Number(peca.area_liq   ?? 0);
  let preco;
  if (espessura <= 1)      preco = m.preco_1cm ?? m.preco_2cm ?? 0;
  else if (espessura <= 2) preco = m.preco_2cm ?? 0;
  else                     preco = m.preco_3cm ?? m.preco_2cm ?? 0;
  return areaLiq * preco;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PecaRow({ peca, onToggle, onAbrirMaterial, onDuplicar, todosM }) {
  const temMaterial = peca.materiais.length > 0;
  return (
    <div className={`grid grid-cols-12 items-center px-4 py-3.5 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 group transition-colors ${peca.incluida ? '' : 'opacity-40'}`}>
      {/* Toggle */}
      <div className="col-span-1 flex items-center">
        <button
          onClick={() => onToggle(peca.id)}
          className={`w-4 h-4 border flex items-center justify-center transition-colors ${peca.incluida ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-700 hover:border-zinc-500'}`}
          title={peca.incluida ? 'Excluir peça' : 'Incluir peça'}
        >
          {peca.incluida && <iconify-icon icon="solar:check-read-linear" width="8"></iconify-icon>}
        </button>
      </div>

      {/* Nome */}
      <div className="col-span-3 min-w-0 pr-2">
        <span className="text-sm text-gray-900 dark:text-white font-medium truncate block">{peca.nome}</span>
        {peca.meia_esquadria_ml > 0 && (
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 block">Meia-Esquadria · {peca.meia_esquadria_ml.toFixed(2)}ml</span>
        )}
        {peca.reto_simples_ml > 0 && (
          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 block">Reto Simples · {peca.reto_simples_ml.toFixed(2)}ml</span>
        )}
      </div>

      {/* Área / espessura */}
      <div className="col-span-2 pr-2">
        <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{peca.area_liq.toFixed(2)} m²</span>
        <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{peca.espessura}cm · {peca.cortes} corte{peca.cortes !== 1 ? 's' : ''}</div>
      </div>

      {/* Material(is) selecionado(s) */}
      <div className="col-span-4 pr-2">
        {peca.materiais.length === 0 ? (
          <span className="font-mono text-[10px] text-gray-400 dark:text-zinc-700 italic">Nenhum material</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {peca.materiais.map(mid => {
              const m = todosM.find(x => x.id === mid);
              return m ? (
                <span key={mid} className="font-mono text-[10px] text-gray-600 dark:text-zinc-300 truncate">{m.nome}</span>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Botão selecionar material e duplicar */}
      <div className="col-span-2 flex justify-end gap-1.5 items-center">
        {peca.incluida && (
          <button
            onClick={() => onDuplicar(peca.id)}
            title="Duplicar peça na medição"
            className="font-mono text-[9px] uppercase tracking-widest px-2 py-1.5 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 transition-colors flex items-center justify-center shrink-0"
          >
            <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
          </button>
        )}
        {peca.incluida && (
          <button
            onClick={() => onAbrirMaterial(peca.id)}
            className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 ${
              temMaterial
                ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
            }`}
          >
            <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
            {temMaterial ? `${peca.materiais.length} mat.` : 'Material'}
          </button>
        )}
      </div>
    </div>
  );
}

function PainelMaterial({ pecaId, pecaNome, selecionados, onConfirmar, onFechar, todosM, single = false }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [sel, setSel] = useState(selecionados);

  const filtrados = useMemo(() => todosM.filter(m => {
    const matchBusca = busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase()) || (m.cor ?? '').toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoria === 'todos' || m.categoria === categoria;
    return matchBusca && matchCat;
  }), [busca, categoria, todosM]);

  function toggle(id) {
    if (single) {
      setSel(prev => prev.includes(id) ? [] : [id]);
    } else {
      setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>

      {/* Painel lateral direito */}
      <div className="w-full max-w-sm bg-gray-50 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-300 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ SELECIONAR_MATERIAL ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">{pecaNome}</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-200 dark:border-zinc-900">
          <div className="relative flex items-center mb-3">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar material..."
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:text-zinc-700 transition-colors"
            />
          </div>
          {/* Categorias */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIAS.map(c => (
              <button
                key={c.key}
                onClick={() => setCategoria(c.key)}
                className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                  categoria === c.key
                    ? 'border-yellow-400/40 text-yellow-400 bg-yellow-400/5'
                    : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum material</p>
            </div>
          ) : (
            filtrados.map(m => {
              const ativo = sel.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-gray-200 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-yellow-400/[0.03]' : ''}`}
                >
                  {/* Checkbox / Radio */}
                  {single ? (
                    <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                      {ativo && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
                    </div>
                  ) : (
                    <div className={`w-4 h-4 border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400 bg-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                      {ativo && <iconify-icon icon="solar:check-read-linear" width="8" className="text-black"></iconify-icon>}
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 dark:text-white font-medium truncate">{m.nome}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{m.cor} · {m.categoria}</div>
                  </div>
                  {/* Preço */}
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(m.preco_2cm)}<span className="text-gray-500 dark:text-zinc-600">/m²·2cm</span></div>
                    {m.preco_3cm && (
                      <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{fmt(m.preco_3cm)}<span className="text-gray-400 dark:text-zinc-700">/3cm</span></div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-300 dark:border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 flex-1">
            {single
              ? (sel.length === 0 ? 'Nenhum selecionado' : '1 selecionado')
              : `${sel.length} selecionado${sel.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={onFechar}
            className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(pecaId, sel)}
            className="bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-yellow-300 transition-colors font-bold"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// Painel lateral para selecionar material linear (meia-esquadria, reto simples, etc.)
function PainelMaterialLinear({ label, selecionado, onConfirmar, onFechar, matLineares }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(selecionado ?? null);

  const filtrados = useMemo(() => matLineares.filter(m =>
    busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase())
  ), [busca, matLineares]);

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>
      <div className="w-full max-w-xs bg-gray-50 dark:bg-[#0a0a0a] border-l border-gray-300 dark:border-zinc-800 flex flex-col h-full">
        <div className="px-5 pt-5 pb-4 border-b border-gray-300 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ MATERIAL_LINEAR ]</div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{label}</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-gray-200 dark:border-zinc-900">
          <div className="relative flex items-center">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar acabamento..."
              className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:text-zinc-700 transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Opção para remover seleção */}
          <div onClick={() => setSel(null)}
            className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-gray-200 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${!sel ? 'bg-yellow-400/[0.03]' : ''}`}>
            <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${!sel ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
              {!sel && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
            </div>
            <span className="text-xs text-gray-500 dark:text-zinc-500 italic">Nenhum (sem precificação)</span>
          </div>
          {filtrados.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum acabamento</p>
            </div>
          )}
          {filtrados.map(m => {
            const ativo = sel === m.id;
            return (
              <div key={m.id} onClick={() => setSel(ativo ? null : m.id)}
                className={`flex items-center gap-1.5 px-5 py-3 cursor-pointer border-b border-gray-200 dark:border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-yellow-400/[0.03]' : ''}`}>
                <div className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                  {ativo && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-900 dark:text-white font-medium truncate">{m.nome}</div>
                  <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{m.tipo?.replace('_', ' ')}</div>
                </div>
                <div className="font-mono text-[10px] text-gray-600 dark:text-zinc-300 shrink-0">{fmt(m.precoml)}<span className="text-gray-500 dark:text-zinc-600">/ml</span></div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-gray-300 dark:border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 flex-1">{sel ? '1 selecionado' : 'Nenhum selecionado'}</span>
          <button onClick={onFechar} className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(sel)} className="bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-yellow-300 transition-colors font-bold">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalProdutoAvulso({ onConfirmar, onFechar, produtosCatalogo = [] }) {
  const [busca, setBusca] = useState('');
  const [prodSel, setProdSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [precoCustom, setPrecoCustom] = useState('');

  const catalogo = produtosCatalogo;

  const filtrados = useMemo(() =>
    catalogo.filter(p =>
      busca === '' || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.subcategoria.toLowerCase().includes(busca.toLowerCase())
    ), [busca, catalogo]);

  const preco = precoCustom !== '' ? parseFloat(precoCustom.replace(',', '.')) || 0 : (prodSel?.preco ?? 0);

  function handleSelecionar(p) {
    setProdSel(p);
    setPrecoCustom(p.preco.toFixed(2).replace('.', ','));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!prodSel) return;
    onConfirmar({ ...prodSel, qty, preco });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar}></div>
      <div className="relative bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ PRODUTO_AVULSO ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Adicionar produto</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Busca */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Produto</label>
            <div className="relative flex items-center mb-2">
              <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-gray-500 dark:text-zinc-600 text-xs pointer-events-none"></iconify-icon>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar produto ou categoria..."
                className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-gray-400 dark:text-zinc-700 transition-colors"
              />
            </div>
            <div className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 max-h-36 overflow-y-auto">
              {filtrados.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelecionar(p)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-white/[0.02] transition-colors ${prodSel?.id === p.id ? 'bg-yellow-400/[0.04]' : ''}`}
                >
                  <div>
                    <div className="text-xs text-gray-900 dark:text-white">{p.nome}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{p.subcategoria}</div>
                  </div>
                  <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400">{fmt(p.preco)}</span>
                </div>
              ))}
            </div>
          </div>

          {prodSel && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Qtd.</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 block mb-1.5">Valor unit. (R$)</label>
                <input
                  value={precoCustom}
                  onChange={e => setPrecoCustom(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
            </div>
          )}

          {prodSel && (
            <div className="border border-gray-300 dark:border-zinc-800 bg-gray-200/50 dark:bg-zinc-950/50 px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Subtotal</span>
              <span className="font-mono text-sm text-gray-900 dark:text-white">{fmt(preco * qty)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!prodSel}
              className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-2.5 hover:bg-yellow-300 transition-colors font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalVersoes({ pecas, onCriar, onFechar, todosM }) {
  const [modo, setModo] = useState('pareadas');
  const [versoesManual, setVersoesManual] = useState([
    { nome: 'Versão A', mats: Object.fromEntries(pecas.filter(p => p.incluida).map(p => [p.id, p.materiais[0] ?? ''])) },
  ]);

  const pecasIncluidas = pecas.filter(p => p.incluida && p.materiais.length > 0);

  function addVersaoManual() {
    setVersoesManual(prev => [
      ...prev,
      { nome: `Versão ${String.fromCharCode(65 + prev.length)}`, mats: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.materiais[0] ?? ''])) },
    ]);
  }

  function duplicarVersaoManual(vIdx) {
    setVersoesManual(prev => {
      const novaLista = [...prev];
      novaLista.splice(vIdx + 1, 0, {
        nome: `${prev[vIdx].nome} (Cópia)`,
        mats: { ...prev[vIdx].mats }
      });
      return novaLista;
    });
  }

  function removerVersaoManual(vIdx) {
    setVersoesManual(prev => prev.filter((_, i) => i !== vIdx));
  }

  function setVersaoManualMat(vIdx, pecaId, matId) {
    setVersoesManual(prev => prev.map((v, i) => i === vIdx ? { ...v, mats: { ...v.mats, [pecaId]: matId } } : v));
  }

  function setVersaoManualNome(vIdx, nome) {
    setVersoesManual(prev => prev.map((v, i) => i === vIdx ? { ...v, nome } : v));
  }

  function handleCriar() {
    let versoes = [];

    if (modo === 'pareadas') {
      const maxMats = Math.max(...pecasIncluidas.map(p => p.materiais.length));
      for (let i = 0; i < maxMats; i++) {
        const mat0 = todosM.find(m => m.id === pecasIncluidas[0]?.materiais[i]);
        versoes.push({
          nome: `Versão ${String.fromCharCode(65 + i)} — ${mat0?.nome ?? ''}`,
          mats: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.materiais[i] ?? p.materiais[0] ?? ''])),
        });
      }
    } else if (modo === 'combinacoes') {
      function combinações(arr) {
        if (arr.length === 0) return [[]];
        const [first, ...rest] = arr;
        const sub = combinações(rest);
        return first.materiais.flatMap(m => sub.map(s => [{ pecaId: first.id, matId: m }, ...s]));
      }
      const combos = combinações(pecasIncluidas);
      versoes = combos.map((combo, i) => ({
        nome: `Versão ${i + 1}`,
        mats: Object.fromEntries(combo.map(c => [c.pecaId, c.matId])),
      }));
    } else {
      versoes = versoesManual;
    }

    onCriar(versoes);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onFechar}></div>
      <div className="relative bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-lg z-10 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">[ CRIAR_VERSOES ]</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Criar versões de orçamento</h3>
          </div>
          <button onClick={onFechar} className="text-gray-500 dark:text-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Opções */}
          <div className="flex flex-col gap-2">
            {[
              { key: 'pareadas',    icon: 'solar:layers-minimalistic-linear', titulo: 'Versões pareadas',        desc: 'Cada material vira uma versão separada com a mesma combinação para todas as peças' },
              { key: 'combinacoes', icon: 'solar:widget-5-linear',            titulo: 'Todas as combinações',    desc: 'Gera automaticamente todas as combinações possíveis de materiais' },
              { key: 'manual',      icon: 'solar:pen-linear',                 titulo: 'Definição manual',        desc: 'Você define nome e material de cada peça para cada versão' },
            ].map(opt => (
              <div
                key={opt.key}
                onClick={() => setModo(opt.key)}
                className={`flex items-start gap-1.5 p-3 border cursor-pointer transition-colors ${modo === opt.key ? 'border-yellow-400/40 bg-yellow-400/[0.03]' : 'border-gray-300 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'}`}
              >
                <div className={`w-4 h-4 border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${modo === opt.key ? 'border-yellow-400 bg-yellow-400' : 'border-gray-300 dark:border-zinc-700'}`}>
                  {modo === opt.key && <iconify-icon icon="solar:check-read-linear" width="8" className="text-black"></iconify-icon>}
                </div>
                <div className="flex items-start gap-2 flex-1">
                  <iconify-icon icon={opt.icon} width="14" className={`mt-0.5 shrink-0 ${modo === opt.key ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}></iconify-icon>
                  <div>
                    <div className={`text-xs font-medium transition-colors ${modo === opt.key ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-300'}`}>{opt.titulo}</div>
                    <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-0.5 leading-relaxed">{opt.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Manual: configuração */}
          {modo === 'manual' && (
            <div className="flex flex-col gap-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500">Versões</div>
              {versoesManual.map((v, vIdx) => (
                <div key={vIdx} className="border border-gray-300 dark:border-zinc-800 p-3 flex flex-col gap-2 relative">
                  <div className="flex gap-2 items-center">
                    <input
                      value={v.nome}
                      onChange={e => setVersaoManualNome(vIdx, e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-sm font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-400 transition-colors"
                      placeholder="Nome da versão"
                    />
                    <button
                      type="button"
                      onClick={() => duplicarVersaoManual(vIdx)}
                      className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:text-yellow-400 hover:border-yellow-400 px-3 py-2 transition-colors flex items-center justify-center"
                      title="Duplicar versão"
                    >
                      <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                    </button>
                    {versoesManual.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerVersaoManual(vIdx)}
                        className="border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:text-red-400 hover:border-red-400 px-3 py-2 transition-colors flex items-center justify-center"
                        title="Remover versão"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    )}
                  </div>
                  {pecasIncluidas.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 w-28 shrink-0 truncate">{p.nome}</span>
                      <select
                        value={v.mats[p.id] ?? ''}
                        onChange={e => setVersaoManualMat(vIdx, p.id, e.target.value)}
                        className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                      >
                        <option value="">— Sem material —</option>
                        {p.materiais.map(mid => {
                          const m = todosM.find(x => x.id === mid);
                          return m ? <option key={mid} value={mid}>{m.nome}</option> : null;
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={addVersaoManual}
                className="border border-dashed border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest py-2 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                Adicionar versão
              </button>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3">
            <button type="button" onClick={onFechar} className="flex-1 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-900 dark:hover:text-white transition-colors">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCriar}
              className="flex-1 bg-yellow-400 text-black font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-yellow-300 transition-colors font-bold flex items-center justify-center gap-2"
            >
              <iconify-icon icon="solar:layers-minimalistic-linear" width="13"></iconify-icon>
              Criar versões
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelaVersoes({ versoes: initialVersoes, pecas, produtos, produtosCatalogo, onSalvar, onVoltar, todosM, matLineares = [], salvando = false }) {

  // ── Lista de ambientes (mutável: suporta rename/delete/duplicate) ─
  const [listaAmbientes, setListaAmbientes] = useState(() => {
    const ambs = [];
    const seen = new Set();
    pecas.filter(p => p.incluida).forEach(p => {
      const amb = p.ambiente_nome ?? '';
      if (!seen.has(amb)) { seen.add(amb); ambs.push(amb); }
    });
    return ambs;
  });

  // ── Ambientes ativos no cenário (checkbox por ambiente) ───────────
  const [ambientesAtivos, setAmbientesAtivos] = useState(() => {
    const result = {};
    pecas.filter(p => p.incluida).forEach(p => { result[p.ambiente_nome ?? ''] = true; });
    return result;
  });

  // ── Edição de nome de ambiente ────────────────────────────────────
  const [editandoNomeAmb, setEditandoNomeAmb] = useState(null); // { amb, novo }

  // ── Estado principal: versões independentes por ambiente ─────────
  // ambiVersoes: { [amb]: { id, nome, pecasList, avulsos }[] }
  const [ambiVersoes, setAmbiVersoes] = useState(() => {
    const result = {};
    listaAmbientes.forEach(amb => {
      result[amb] = initialVersoes.map((v, vIdx) => ({
        id: `v-${amb}-${Date.now()}-${vIdx}`,
        nome: v.nome,
        pecasList: pecas.filter(p => p.incluida && (p.ambiente_nome ?? '') === amb).flatMap(p => {
          const stoneUid = `${p.id}-${Math.random()}`;
          const stone = {
            uid: stoneUid,
            idBase: p.id,
            tipo: 'pedra',
            nome: p.nome,
            ambiente_nome: p.ambiente_nome ?? null,
            item_nome: p.item_nome ?? null,
            matId: v.mats[p.id] ?? null,
            area_liq: p.area_liq ?? 0,
            espessura: p.espessura ?? 2,
            meia_esquadria_ml: p.meia_esquadria_ml ?? 0,
            reto_simples_ml: p.reto_simples_ml ?? 0,
            cortes: p.cortes ?? 0,
          };
          return [stone, ...criarAcabamentosParaPeca(p, stoneUid)];
        }),
        avulsos: [],
      }));
    });
    return result;
  });

  // ── Seleção (radio): qual versão está selecionada por ambiente ───
  const [selecoes, setSelecoes] = useState({});

  // Inicializa selecoes com os IDs reais de ambiVersoes (IDs gerados no useState acima)
  useEffect(() => {
    setSelecoes(prev => {
      const next = { ...prev };
      listaAmbientes.forEach(amb => {
        const lista = ambiVersoes[amb] ?? [];
        if (lista.length > 0 && !lista.find(v => v.id === next[amb])) {
          next[amb] = lista[0].id;
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-match: quando matLineares carrega, preenche matLinearId nos acabamentos ─
  // Busca por palavras-chave no nome do material linear; desambigua pelo material da pedra mãe.
  useEffect(() => {
    if (matLineares.length === 0) return;
    setAmbiVersoes(prev => {
      let anyChanged = false;
      const next = {};
      Object.keys(prev).forEach(amb => {
        next[amb] = prev[amb].map(v => {
          const novaLista = aplicarAutoMatchNaLista(v.pecasList, todosM, matLineares);
          if (novaLista !== v.pecasList) anyChanged = true;
          return novaLista !== v.pecasList ? { ...v, pecasList: novaLista } : v;
        });
      });
      return anyChanged ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matLineares]);

  // ── Cenários ─────────────────────────────────────────────────────
  const [cenarios, setCenarios] = useState([]);
  const [editandoNomeCenario, setEditandoNomeCenario] = useState(null); // id do cenário

  // ── UI State ─────────────────────────────────────────────────────
  const [expandido, setExpandido] = useState(null);              // { amb, vId }
  const [editandoNomeVersao, setEditandoNomeVersao] = useState(null); // { amb, vId }
  const [modalAvulsoKey, setModalAvulsoKey] = useState(null);   // { amb, vId }
  const [editandoAvulso, setEditandoAvulso] = useState(null);   // { amb, vId, uid }
  const [editandoNomeItem, setEditandoNomeItem] = useState(null); // { amb, vId, itemKey, novo }
  const [editandoNomePeca, setEditandoNomePeca] = useState(null); // { amb, vId, uid, novo }
  const [painelMatVersao, setPainelMatVersao] = useState(null);  // { amb, vId, uid|null, itemKey|null, atual: matId|null, label }
  const [painelMatLinear, setPainelMatLinear] = useState(null);  // { amb, vId, uid, atual: matLinearId|null, label }

  function confirmarMatLinear(matLinearId) {
    if (!painelMatLinear) return;
    editarAcabamentoMat(painelMatLinear.amb, painelMatLinear.vId, painelMatLinear.uid, matLinearId || null);
    setPainelMatLinear(null);
  }

  function confirmarMatVersao(_, selecionados) {
    const matId = selecionados[0] ?? '';
    if (!painelMatVersao) return;
    if (painelMatVersao.itemKey !== null) {
      editarItemMat(painelMatVersao.amb, painelMatVersao.vId, painelMatVersao.itemKey, matId);
    } else {
      editarPecaMat(painelMatVersao.amb, painelMatVersao.vId, painelMatVersao.uid, matId);
    }
    setPainelMatVersao(null);
  }

  // ── Helpers de peça (dentro de uma versão) ────────────────────────
  function editarNomePeca(amb, vId, uid, novoNome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, nome: novoNome || pw.nome } : pw),
      }),
    }));
  }

  function excluirPecaDaVersao(amb, vId, uid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        // Remove a peça E seus acabamentos filhos
        pecasList: v.pecasList.filter(pw => pw.uid !== uid && pw.idPedraUid !== uid),
      }),
    }));
  }

  function duplicarPecaDaVersao(amb, vId, uid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : (() => {
        const idx = v.pecasList.findIndex(pw => pw.uid === uid);
        if (idx === -1) return v;
        const newStoneUid = `dup-${uid}-${Math.random()}`;
        const newIdBase   = crypto.randomUUID();
        const clone = { ...v.pecasList[idx], uid: newStoneUid, idBase: newIdBase };
        // Clona os acabamentos filhos desta peça
        const acabamentosFilhos = v.pecasList
          .filter(pw => pw.idPedraUid === uid)
          .map(ac => ({ ...ac, uid: `ac-dup-${Math.random()}`, idBase: newIdBase, idPedraUid: newStoneUid }));
        // Insere após o último filho original
        const lastChildIdx = v.pecasList.reduce((last, pw, i) => pw.idPedraUid === uid ? i : last, idx);
        const nova = [...v.pecasList];
        nova.splice(lastChildIdx + 1, 0, clone, ...acabamentosFilhos);
        return { ...v, pecasList: nova };
      })()),
    }));
  }

  // ── Helpers de item ───────────────────────────────────────────────
  function editarItemMat(amb, vId, itemKey, matId) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => {
        if (v.id !== vId) return v;
        // Atualiza matId das pedras do item; zera matLinearId dos acabamentos filhos para re-match
        const comNovoMat = v.pecasList.map(pw => {
          if ((pw.item_nome ?? '__sem_item__') !== itemKey) return pw;
          if (pw.tipo !== 'acabamento') return { ...pw, matId };
          return { ...pw, matLinearId: null }; // reset para re-match
        });
        return { ...v, pecasList: aplicarAutoMatchNaLista(comNovoMat, todosM, matLineares) };
      }),
    }));
  }

  function editarAcabamentoMl(amb, vId, uid, novoMl) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, ml: novoMl } : pw),
      }),
    }));
  }

  function editarAcabamentoMat(amb, vId, uid, matLinearId) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => pw.uid === uid ? { ...pw, matLinearId } : pw),
      }),
    }));
  }

  function editarNomeItem(amb, vId, oldKey, novoNome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.map(pw => (pw.item_nome ?? '__sem_item__') === oldKey ? { ...pw, item_nome: novoNome || oldKey } : pw),
      }),
    }));
  }

  function excluirItem(amb, vId, itemKey) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: v.pecasList.filter(pw => (pw.item_nome ?? '__sem_item__') !== itemKey),
      }),
    }));
  }

  function duplicarItem(amb, vId, itemKey) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id !== vId ? v : {
        ...v,
        pecasList: [
          ...v.pecasList,
          ...v.pecasList
            .filter(pw => (pw.item_nome ?? '__sem_item__') === itemKey)
            .map(pw => ({ ...pw, uid: `${pw.idBase}-dup-${Math.random()}`, idBase: crypto.randomUUID() })),
        ],
      }),
    }));
  }

  // ── IntersectionObserver ─────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => { clearTimeout(t); observer.disconnect(); };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────
  function totalAmbiVersao(amb, vId) {
    const v = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
    if (!v) return 0;
    const tPecas = v.pecasList.reduce((s, pw) => {
      if (pw.tipo === 'acabamento') return s + precoAcabamento(pw.ml, pw.matLinearId, matLineares);
      const pOrig = pecas.find(p => p.id === pw.idBase);
      return s + precoPeca(pOrig, pw.matId, todosM);
    }, 0);
    const tAvulsos = (v.avulsos ?? []).reduce((s, a) => s + a.valorUnit * a.qty, 0);
    return tPecas + tAvulsos;
  }

  function matsResumoAmbi(amb, vId) {
    const v = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
    if (!v) return [];
    const ids = [...new Set(v.pecasList.filter(pw => pw.matId && pw.tipo !== 'acabamento').map(pw => pw.matId))];
    return ids.map(id => todosM.find(m => m.id === id)?.nome).filter(Boolean);
  }

  function subtotalCenario(cen) {
    return Object.keys(cen.selecoes).reduce((s, amb) => s + totalAmbiVersao(amb, cen.selecoes[amb]), 0);
  }

  function descontoCenario(cen) {
    const subtotal = subtotalCenario(cen);
    const val = parseFloat(String(cen.descontoValor ?? '').replace(',', '.')) || 0;
    if (val <= 0) return 0;
    return cen.descontoTipo === '%'
      ? Math.min(subtotal * val / 100, subtotal)
      : Math.min(val, subtotal);
  }

  function totalCenario(cen) {
    return Math.max(0, subtotalCenario(cen) - descontoCenario(cen));
  }

  // ── CRUD versões por ambiente ─────────────────────────────────────
  function adicionarVersao(amb) {
    const existentes = ambiVersoes[amb] ?? [];
    const novaId = `v-${amb}-${Date.now()}`;
    const pecasListRaw = pecas.filter(p => p.incluida && (p.ambiente_nome ?? '') === amb).flatMap(p => {
      const stoneUid = `${p.id}-${Math.random()}`;
      const stone = {
        uid: stoneUid,
        idBase: p.id,
        tipo: 'pedra',
        nome: p.nome,
        ambiente_nome: p.ambiente_nome ?? null,
        item_nome: p.item_nome ?? null,
        matId: null,
        area_liq: p.area_liq ?? 0,
        espessura: p.espessura ?? 2,
        meia_esquadria_ml: p.meia_esquadria_ml ?? 0,
        reto_simples_ml: p.reto_simples_ml ?? 0,
        cortes: p.cortes ?? 0,
      };
      return [stone, ...criarAcabamentosParaPeca(p, stoneUid)];
    });
    const nova = {
      id: novaId,
      nome: `Versão ${existentes.length + 1}`,
      pecasList: aplicarAutoMatchNaLista(pecasListRaw, todosM, matLineares),
      avulsos: [],
    };
    setAmbiVersoes(prev => ({ ...prev, [amb]: [...(prev[amb] ?? []), nova] }));
  }

  function duplicarVersao(amb, vId) {
    setAmbiVersoes(prev => {
      const lista = prev[amb] ?? [];
      const idx = lista.findIndex(v => v.id === vId);
      if (idx === -1) return prev;
      const clone = JSON.parse(JSON.stringify(lista[idx]));
      clone.id = `v-${amb}-${Date.now()}`;
      clone.nome = `${clone.nome} (Cópia)`;
      // Remapeia UIDs e mantém relação idPedraUid entre pedras e seus acabamentos
      const uidMap = {};
      clone.pecasList = clone.pecasList.map(p => {
        const novoUid = `${p.idBase}-${Math.random()}`;
        uidMap[p.uid] = novoUid;
        return { ...p, uid: novoUid };
      }).map(p => p.tipo === 'acabamento' && p.idPedraUid
        ? { ...p, idPedraUid: uidMap[p.idPedraUid] ?? p.idPedraUid }
        : p
      );
      // Preenche acabamentos sem match (caso a fonte tivesse nulls)
      clone.pecasList = aplicarAutoMatchNaLista(clone.pecasList, todosM, matLineares);
      clone.avulsos = (clone.avulsos ?? []).map(a => ({ ...a, uid: `av-${Math.random()}` }));
      const novaLista = [...lista];
      novaLista.splice(idx + 1, 0, clone);
      return { ...prev, [amb]: novaLista };
    });
  }

  function removerVersao(amb, vId) {
    setAmbiVersoes(prev => {
      const lista = prev[amb] ?? [];
      if (lista.length <= 1) return prev;
      const novaLista = lista.filter(v => v.id !== vId);
      setSelecoes(sel => sel[amb] === vId ? { ...sel, [amb]: novaLista[0]?.id ?? null } : sel);
      return { ...prev, [amb]: novaLista };
    });
  }

  function renomearVersao(amb, vId, nome) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => v.id === vId ? { ...v, nome } : v),
    }));
  }

  // ── CRUD ambientes ────────────────────────────────────────────────
  function toggleAmbienteAtivo(amb) {
    setAmbientesAtivos(prev => ({ ...prev, [amb]: !prev[amb] }));
  }

  function confirmarRenomearAmb() {
    if (!editandoNomeAmb) return;
    const { amb, novo } = editandoNomeAmb;
    const novoNome = novo.trim() || amb;
    if (novoNome === amb) { setEditandoNomeAmb(null); return; }
    setListaAmbientes(prev => prev.map(a => a === amb ? novoNome : a));
    setAmbiVersoes(prev => {
      const novoObj = { ...prev };
      novoObj[novoNome] = novoObj[amb];
      delete novoObj[amb];
      return novoObj;
    });
    setSelecoes(prev => {
      const novoSel = { ...prev };
      novoSel[novoNome] = novoSel[amb];
      delete novoSel[amb];
      return novoSel;
    });
    setAmbientesAtivos(prev => {
      const novo2 = { ...prev };
      novo2[novoNome] = novo2[amb];
      delete novo2[amb];
      return novo2;
    });
    setEditandoNomeAmb(null);
  }

  function excluirAmbiente(amb) {
    setListaAmbientes(prev => prev.filter(a => a !== amb));
    setAmbiVersoes(prev => { const n = { ...prev }; delete n[amb]; return n; });
    setSelecoes(prev => { const n = { ...prev }; delete n[amb]; return n; });
    setAmbientesAtivos(prev => { const n = { ...prev }; delete n[amb]; return n; });
  }

  function duplicarAmbiente(amb) {
    const novoNome = `${amb} (Cópia)`;
    const versoesSrc = ambiVersoes[amb] ?? [];
    const novasVersoes = versoesSrc.map(v => {
      const clone = JSON.parse(JSON.stringify(v));
      clone.id = `v-${novoNome}-${Date.now()}-${Math.random()}`;
      clone.pecasList = clone.pecasList.map(p => ({ ...p, uid: `${p.idBase}-${Math.random()}` }));
      clone.avulsos = (clone.avulsos ?? []).map(a => ({ ...a, uid: `av-${Math.random()}` }));
      return clone;
    });
    setListaAmbientes(prev => {
      const idx = prev.indexOf(amb);
      const nova = [...prev];
      nova.splice(idx + 1, 0, novoNome);
      return nova;
    });
    setAmbiVersoes(prev => ({ ...prev, [novoNome]: novasVersoes }));
    setSelecoes(prev => ({ ...prev, [novoNome]: novasVersoes[0]?.id ?? null }));
    setAmbientesAtivos(prev => ({ ...prev, [novoNome]: true }));
  }

  function editarPecaMat(amb, vId, pUid, matId) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v => {
        if (v.id !== vId) return v;
        // Atualiza matId da pedra; em seguida re-aplica auto-match nos acabamentos filhos
        const comNovoMat = v.pecasList.map(p => p.uid === pUid ? { ...p, matId } : p);
        // Re-match apenas dos filhos desta pedra (zera para forçar re-match)
        const comReMatch = comNovoMat.map(p =>
          p.tipo === 'acabamento' && p.idPedraUid === pUid ? { ...p, matLinearId: null } : p
        );
        return { ...v, pecasList: aplicarAutoMatchNaLista(comReMatch, todosM, matLineares) };
      }),
    }));
  }

  // ── Avulsos ───────────────────────────────────────────────────────
  function adicionarAvulso(amb, vId, prod) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: [...(v.avulsos ?? []), {
            uid: `av-${Math.random()}`,
            produtoId: prod.id,
            nome: prod.nome,
            subcategoria: prod.subcategoria ?? '',
            qty: prod.qty ?? 1,
            valorUnit: prod.preco ?? 0,
          }],
        }
      ),
    }));
    setModalAvulsoKey(null);
  }

  function removerAvulso(amb, vId, aUid) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : { ...v, avulsos: (v.avulsos ?? []).filter(a => a.uid !== aUid) }
      ),
    }));
  }

  function editarAvulsoQty(amb, vId, aUid, qty) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, qty: Math.max(1, parseInt(qty) || 1) } : a),
        }
      ),
    }));
  }

  function editarAvulsoValor(amb, vId, aUid, valor) {
    setAmbiVersoes(prev => ({
      ...prev,
      [amb]: (prev[amb] ?? []).map(v =>
        v.id !== vId ? v : {
          ...v,
          avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, valorUnit: parseFloat(valor.replace(',', '.')) || 0 } : a),
        }
      ),
    }));
  }

  // ── Cenários ─────────────────────────────────────────────────────
  function criarCenario() {
    const id = `cen-${Date.now()}`;
    // Inclui apenas ambientes ativos nas selecoes do cenário
    const selAtivos = {};
    listaAmbientes.forEach(amb => {
      if (ambientesAtivos[amb]) selAtivos[amb] = selecoes[amb];
    });
    setCenarios(prev => [...prev, {
      id,
      nome: `Cenário ${prev.length + 1}`,
      selecoes: selAtivos,
      descontoValor: '',
      descontoTipo: '%',
    }]);
  }

  function renomearCenario(id, nome) {
    setCenarios(prev => prev.map(c => c.id === id ? { ...c, nome } : c));
  }

  function atualizarDescontoCenario(id, field, value) {
    setCenarios(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  function duplicarCenario(id) {
    setCenarios(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      const clone = {
        ...JSON.parse(JSON.stringify(prev[idx])),
        id: `cen-${Date.now()}`,
        nome: `${prev[idx].nome} (Cópia)`,
      };
      const nova = [...prev];
      nova.splice(idx + 1, 0, clone);
      return nova;
    });
  }

  function removerCenario(id) {
    setCenarios(prev => prev.filter(c => c.id !== id));
  }

  // ── Salvar ───────────────────────────────────────────────────────
  function handleSalvar() {
    // Cenários existem → salva um orcamento por cenário
    // Sem cenários → salva usando seleção atual (só ambientes ativos) como único orçamento
    const selAtivos = {};
    listaAmbientes.forEach(amb => { if (ambientesAtivos[amb]) selAtivos[amb] = selecoes[amb]; });

    const base = cenarios.length > 0
      ? cenarios
      : [{ id: 'auto', nome: 'Orçamento', selecoes: selAtivos }];

    const versoesFinais = base.map(cen => ({
      nome: cen.nome,
      descontoValor: parseFloat(String(cen.descontoValor ?? '').replace(',', '.')) || 0,
      descontoTipo:  cen.descontoTipo ?? '%',
      pecasList: Object.entries(cen.selecoes).flatMap(([amb, vId]) =>
        (ambiVersoes[amb] ?? []).find(v => v.id === vId)?.pecasList ?? []
      ),
      avulsos: Object.entries(cen.selecoes).flatMap(([amb, vId]) =>
        (ambiVersoes[amb] ?? []).find(v => v.id === vId)?.avulsos ?? []
      ),
    }));

    onSalvar(versoesFinais);
  }

  // ── Render ───────────────────────────────────────────────────────
  const totalSelecaoAtual = useMemo(
    () => listaAmbientes
      .filter(amb => ambientesAtivos[amb])
      .reduce((s, amb) => s + totalAmbiVersao(amb, selecoes[amb]), 0),
    [listaAmbientes, ambientesAtivos, selecoes, ambiVersoes, matLineares]
  );
  const totalVersoes = useMemo(
    () => listaAmbientes.reduce((s, amb) => s + (ambiVersoes[amb]?.length ?? 0), 0),
    [listaAmbientes, ambiVersoes]
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-32">

        {/* ── Header ──────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-3">
                  10 // Versões do Orçamento
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">
                  Versões por ambiente
                </h1>
                <p className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 mt-1">
                  Selecione uma versão por ambiente e adicione cenários combinados
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={onVoltar}
                  className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
                >
                  <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* Seleção por ambiente + cenários na mesma tela             */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-100 flex flex-col gap-8">
          {listaAmbientes.map(amb => {
            const lista = ambiVersoes[amb] ?? [];
            const isAtivo = !!ambientesAtivos[amb];
            const isEditandoAmb = editandoNomeAmb?.amb === amb;
            return (
              <div key={amb} className={!isAtivo ? 'opacity-50' : ''}>
                {/* Cabeçalho do ambiente */}
                <div className="flex items-center gap-1.5 mb-3">
                  {/* Barra colorida */}
                  <div className={`w-1 h-6 shrink-0 transition-colors ${isAtivo ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-zinc-700'}`}></div>

                  {/* Checkbox incluir no cenário */}
                  <button
                    onClick={() => toggleAmbienteAtivo(amb)}
                    title={isAtivo ? 'Excluir do cenário' : 'Incluir no cenário'}
                    className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${isAtivo ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-300 dark:border-zinc-700 text-gray-400 dark:text-zinc-700 hover:border-zinc-500'}`}
                  >
                    {isAtivo && <iconify-icon icon="solar:check-read-linear" width="8"></iconify-icon>}
                  </button>

                  {/* Nome do ambiente (clica para editar) */}
                  {isEditandoAmb ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        autoFocus
                        value={editandoNomeAmb.novo}
                        onChange={e => setEditandoNomeAmb(prev => ({ ...prev, novo: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') confirmarRenomearAmb(); if (e.key === 'Escape') setEditandoNomeAmb(null); }}
                        className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm font-bold outline-none px-1 min-w-0"
                      />
                      <button onClick={confirmarRenomearAmb} className="text-yellow-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-yellow-400/40 hover:bg-yellow-400/10 transition-colors shrink-0">OK</button>
                      <button onClick={() => setEditandoNomeAmb(null)} className="text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-gray-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors shrink-0">✕</button>
                    </div>
                  ) : (
                    <h2
                      className="text-sm font-bold text-gray-900 dark:text-white tracking-tight uppercase cursor-pointer hover:text-yellow-400/80 transition-colors"
                      onClick={() => setEditandoNomeAmb({ amb, novo: amb })}
                      title="Renomear ambiente"
                    >
                      {amb || 'Ambiente'}
                    </h2>
                  )}

                  <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800"></div>

                  {/* Botões de ação do ambiente */}
                  {!isEditandoAmb && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Editar nome */}
                      <button
                        onClick={() => setEditandoNomeAmb({ amb, novo: amb })}
                        title="Renomear ambiente"
                        className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      >
                        <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                      </button>
                      {/* Duplicar ambiente */}
                      <button
                        onClick={() => duplicarAmbiente(amb)}
                        title="Duplicar ambiente (com todas as versões)"
                        className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      >
                        <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                      </button>
                      {/* Excluir ambiente */}
                      {listaAmbientes.length > 1 && (
                        <button
                          onClick={() => excluirAmbiente(amb)}
                          title="Excluir ambiente"
                          className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                        </button>
                      )}
                      {/* Separador */}
                      <div className="w-px h-4 bg-gray-200 dark:bg-zinc-800 mx-0.5"></div>
                      {/* Nova versão */}
                      <button
                        onClick={() => adicionarVersao(amb)}
                        title="Adicionar nova versão para este ambiente"
                        className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2.5 py-1.5 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors"
                      >
                        <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                        Versão
                      </button>
                    </div>
                  )}
                </div>

                {/* Cards de versão */}
                <div className="flex flex-col gap-2">
                  {lista.map((v, vIdx) => {
                    const isSelected  = selecoes[amb] === v.id;
                    const isExp       = expandido?.amb === amb && expandido?.vId === v.id;
                    const isNomeEdit  = editandoNomeVersao?.amb === amb && editandoNomeVersao?.vId === v.id;
                    const subtotal    = totalAmbiVersao(amb, v.id);
                    const nomesMats   = matsResumoAmbi(amb, v.id);
                    const qtdAvulsos  = (v.avulsos ?? []).length;

                    return (
                      <div
                        key={v.id}
                        className={`bg-gray-50 dark:bg-[#0a0a0a] border transition-colors ${isSelected ? 'border-yellow-400/40' : 'border-gray-300 dark:border-zinc-800'}`}
                      >
                        {/* Cabeçalho do card */}
                        <div className="flex items-center gap-1.5 px-4 py-3">

                          {/* Radio / tick de seleção */}
                          <button
                            onClick={() => setSelecoes(prev => ({ ...prev, [amb]: v.id }))}
                            title="Selecionar esta versão"
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'border-yellow-400' : 'border-gray-300 dark:border-zinc-700 hover:border-zinc-500'}`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>}
                          </button>

                          {/* Badge V */}
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 px-2 py-0.5 shrink-0">V{vIdx + 1}</span>

                          {/* Nome (clica para editar) */}
                          {isNomeEdit ? (
                            <input
                              autoFocus
                              value={v.nome}
                              onChange={e => renomearVersao(amb, v.id, e.target.value)}
                              onBlur={() => setEditandoNomeVersao(null)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNomeVersao(null); }}
                              className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm outline-none px-1 min-w-0"
                            />
                          ) : (
                            <button
                              onClick={() => setEditandoNomeVersao({ amb, vId: v.id })}
                              title="Renomear versão"
                              className={`flex-1 text-left text-sm font-medium transition-colors truncate min-w-0 ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                              {v.nome}
                            </button>
                          )}

                          {/* Badges de material */}
                          {nomesMats.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[180px] overflow-hidden">
                              {nomesMats.slice(0, 2).map(n => (
                                <span key={n} className="font-mono text-[9px] text-gray-500 dark:text-zinc-400 border border-gray-300 dark:border-zinc-700 px-1.5 py-0.5 truncate max-w-[85px]">{n}</span>
                              ))}
                              {nomesMats.length > 2 && <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">+{nomesMats.length - 2}</span>}
                            </div>
                          )}

                          {/* Badge avulsos */}
                          {qtdAvulsos > 0 && (
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-800 px-1.5 py-0.5 shrink-0">
                              +{qtdAvulsos} produto{qtdAvulsos !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* Subtotal */}
                          <span className={`font-mono text-sm shrink-0 ${isSelected ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-400'}`}>{fmt(subtotal)}</span>

                          {/* Ações */}
                          <div className="flex items-center gap-0.5 border-l border-gray-300 dark:border-zinc-800 pl-3 shrink-0">
                            <button
                              onClick={() => setExpandido(isExp ? null : { amb, vId: v.id })}
                              title={isExp ? 'Fechar' : 'Editar peças e produtos'}
                              className={`p-1.5 rounded transition-colors ${isExp ? 'text-yellow-400 bg-yellow-400/10' : 'text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                            >
                              <iconify-icon icon={isExp ? 'solar:close-circle-linear' : 'solar:pen-linear'} width="13"></iconify-icon>
                            </button>
                            <button
                              onClick={() => duplicarVersao(amb, v.id)}
                              title="Duplicar versão"
                              className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                            >
                              <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                            </button>
                            {lista.length > 1 && (
                              <button
                                onClick={() => removerVersao(amb, v.id)}
                                title="Remover versão"
                                className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              >
                                <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Área expandida: peças agrupadas por item + avulsos */}
                        {isExp && (
                          <div className="border-t border-gray-300 dark:border-zinc-800">
                            {/* Peças — agrupadas por item_nome quando existir */}
                            {(() => {
                              // Helper: renderiza uma linha de acabamento linear
                              const renderAcabamento = (pw, indent = false) => {
                                const subAc = precoAcabamento(pw.ml, pw.matLinearId, matLineares);
                                return (
                                  <div key={pw.uid} className={`flex items-center gap-2 py-2 border-b border-amber-900/20 last:border-b-0 bg-amber-950/20 group ${indent ? 'pl-10 pr-4' : 'pl-6 pr-4'}`}>
                                    {/* Conector visual "filho da peça acima" */}
                                    <div className="flex flex-col items-center shrink-0 self-stretch justify-center gap-0.5">
                                      <div className="w-px h-2 bg-amber-600/30"></div>
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-600/50"></div>
                                    </div>
                                    <iconify-icon icon="solar:ruler-angular-linear" width="12" className="text-amber-500/70 shrink-0"></iconify-icon>
                                    <span className="font-mono text-[10px] text-amber-400/80 min-w-[100px] shrink-0 uppercase tracking-wide">{pw.nome}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input
                                        type="number" min="0" step="0.01"
                                        value={pw.ml}
                                        onChange={e => editarAcabamentoMl(amb, v.id, pw.uid, parseFloat(e.target.value) || 0)}
                                        className="w-14 bg-gray-50 dark:bg-black border border-amber-900/40 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 outline-none focus:border-amber-500/60 text-right"
                                      />
                                      <span className="font-mono text-[10px] text-amber-700">ml</span>
                                    </div>
                                    <button
                                      onClick={() => setPainelMatLinear({ amb, vId: v.id, uid: pw.uid, atual: pw.matLinearId, label: pw.nome })}
                                      className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-colors flex items-center gap-1 shrink-0 ${
                                        pw.matLinearId
                                          ? 'border-amber-600/40 text-amber-400 hover:bg-amber-600/10'
                                          : 'border-orange-600/60 text-orange-500 hover:bg-orange-700/10 animate-pulse'
                                      }`}
                                    >
                                      <iconify-icon icon="solar:ruler-angular-linear" width="9"></iconify-icon>
                                      {pw.matLinearId ? (matLineares.find(m => m.id === pw.matLinearId)?.nome?.split(' ').slice(0, 2).join(' ') ?? 'Linear') : 'Definir material'}
                                    </button>
                                    <span className="flex-1"></span>
                                    <span className="font-mono text-[11px] text-amber-400 shrink-0 w-20 text-right font-semibold">{subAc > 0 ? fmt(subAc) : '—'}</span>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Remover acabamento" className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors">
                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                      </button>
                                    </div>
                                  </div>
                                );
                              };

                              const temItens = v.pecasList.some(pw => pw.item_nome && pw.tipo !== 'acabamento');
                              if (!temItens) {
                                // Sem itens: lista plana
                                return v.pecasList.map(pw => {
                                  if (pw.tipo === 'acabamento') return renderAcabamento(pw, false);
                                  const pOrig = pecas.find(p => p.id === pw.idBase);
                                  if (!pOrig) return null;
                                  const sub = precoPeca(pOrig, pw.matId, todosM);
                                  const isNomePecaEdit = editandoNomePeca?.amb === amb && editandoNomePeca?.vId === v.id && editandoNomePeca?.uid === pw.uid;
                                  return (
                                    <div key={pw.uid} className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors group">
                                      <div className="w-1 h-4 bg-gray-300 dark:bg-zinc-700 shrink-0"></div>
                                      {isNomePecaEdit ? (
                                        <input
                                          autoFocus
                                          value={editandoNomePeca.novo}
                                          onChange={e => setEditandoNomePeca(prev => ({ ...prev, novo: e.target.value }))}
                                          onBlur={() => { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }}
                                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); } }}
                                          className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                        />
                                      ) : (
                                        <span className="text-xs text-gray-600 dark:text-zinc-300 flex-1 min-w-0 truncate">{pw.nome}</span>
                                      )}
                                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{pOrig.area_liq.toFixed(2)} m²</span>
                                      <button
                                        onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: pw.uid, itemKey: null, atual: pw.matId ?? null, label: pw.nome })}
                                        className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-colors flex items-center gap-1 shrink-0 ${
                                          pw.matId
                                            ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                            : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                        }`}
                                      >
                                        <iconify-icon icon="solar:layers-linear" width="10"></iconify-icon>
                                        {pw.matId ? (todosM.find(m => m.id === pw.matId)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                      </button>
                                      <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 shrink-0 w-16 text-right">{sub > 0 ? fmt(sub) : '—'}</span>
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => setEditandoNomePeca({ amb, vId: v.id, uid: pw.uid, novo: pw.nome })} title="Renomear peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                        </button>
                                        <button onClick={() => duplicarPecaDaVersao(amb, v.id, pw.uid)} title="Duplicar peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                          <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                        </button>
                                        <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Excluir peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                          <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                });
                              }
                              // Com itens: agrupar por item_nome
                              const itMap = new Map();
                              const itOrdem = [];
                              v.pecasList.forEach(pw => {
                                const k = pw.item_nome ?? '__sem_item__';
                                if (!itMap.has(k)) { itMap.set(k, []); itOrdem.push(k); }
                                itMap.get(k).push(pw);
                              });
                              return itOrdem.map(itemKey => {
                                const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                                const pwsItem  = itMap.get(itemKey);
                                // matId do item: considera apenas pedras
                                const matIdItem = pwsItem.find(pw => pw.tipo !== 'acabamento')?.matId ?? '';
                                // Subtotal inclui pedras + acabamentos
                                const subtotalItem = pwsItem.reduce((s, pw) => {
                                  if (pw.tipo === 'acabamento') return s + precoAcabamento(pw.ml, pw.matLinearId, matLineares);
                                  const pOrig = pecas.find(p => p.id === pw.idBase);
                                  return s + precoPeca(pOrig, pw.matId, todosM);
                                }, 0);
                                const isNomeItemEdit = editandoNomeItem?.amb === amb && editandoNomeItem?.vId === v.id && editandoNomeItem?.itemKey === itemKey;
                                return (
                                  <div key={itemKey}>
                                    {/* Cabeçalho do item */}
                                    {nomeItem !== null && (
                                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-200/30 dark:bg-zinc-900/30 border-b border-gray-300 dark:border-zinc-800/50 group">
                                        <div className="w-0.5 h-4 bg-yellow-400/30 shrink-0"></div>
                                        {isNomeItemEdit ? (
                                          <input
                                            autoFocus
                                            value={editandoNomeItem.novo}
                                            onChange={e => setEditandoNomeItem(prev => ({ ...prev, novo: e.target.value }))}
                                            onBlur={() => { editarNomeItem(amb, v.id, itemKey, editandoNomeItem.novo); setEditandoNomeItem(null); }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') { editarNomeItem(amb, v.id, itemKey, editandoNomeItem.novo); setEditandoNomeItem(null); }
                                              if (e.key === 'Escape') setEditandoNomeItem(null);
                                            }}
                                            className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                          />
                                        ) : (
                                          <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-400 flex-1 min-w-0 truncate">{nomeItem}</span>
                                        )}
                                        {/* Material selecionado por item */}
                                        <button
                                          onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: null, itemKey, atual: matIdItem || null, label: nomeItem })}
                                          className={`font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 shrink-0 ${
                                            matIdItem
                                              ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                              : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                          }`}
                                        >
                                          <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
                                          {matIdItem ? (todosM.find(m => m.id === matIdItem)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                        </button>
                                        <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 shrink-0 w-20 text-right">{subtotalItem > 0 ? fmt(subtotalItem) : '—'}</span>
                                        {/* Ações do item */}
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          <button onClick={() => setEditandoNomeItem({ amb, vId: v.id, itemKey, novo: nomeItem })} title="Renomear item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                            <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                          </button>
                                          <button onClick={() => duplicarItem(amb, v.id, itemKey)} title="Duplicar item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                            <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                          </button>
                                          <button onClick={() => excluirItem(amb, v.id, itemKey)} title="Excluir item" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                            <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    {/* Peças do item */}
                                    {pwsItem.map(pw => {
                                      if (pw.tipo === 'acabamento') return renderAcabamento(pw, true);
                                      const pOrig = pecas.find(p => p.id === pw.idBase);
                                      if (!pOrig) return null;
                                      const sub = precoPeca(pOrig, pw.matId, todosM);
                                      const isNomePecaEditItem = editandoNomePeca?.amb === amb && editandoNomePeca?.vId === v.id && editandoNomePeca?.uid === pw.uid;
                                      return (
                                        <div key={pw.uid} className={`flex items-center gap-2 py-2 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors group ${nomeItem ? 'px-7' : 'px-4'}`}>
                                          <div className="w-1 h-4 bg-gray-300 dark:bg-zinc-700 shrink-0"></div>
                                          {isNomePecaEditItem ? (
                                            <input
                                              autoFocus
                                              value={editandoNomePeca.novo}
                                              onChange={e => setEditandoNomePeca(prev => ({ ...prev, novo: e.target.value }))}
                                              onBlur={() => { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }}
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') { editarNomePeca(amb, v.id, pw.uid, editandoNomePeca.novo); setEditandoNomePeca(null); }
                                                if (e.key === 'Escape') setEditandoNomePeca(null);
                                              }}
                                              className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-1 outline-none min-w-0"
                                            />
                                          ) : (
                                            <span className="text-xs text-gray-600 dark:text-zinc-300 flex-1 min-w-0 truncate">{pw.nome}</span>
                                          )}
                                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{pOrig.area_liq.toFixed(2)} m²</span>
                                          <button
                                            onClick={() => setPainelMatVersao({ amb, vId: v.id, uid: pw.uid, itemKey: null, atual: pw.matId ?? null, label: pw.nome })}
                                            className={`font-mono text-[8px] uppercase tracking-widest px-2 py-1 border transition-colors flex items-center gap-1 shrink-0 ${
                                              pw.matId
                                                ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/5'
                                                : 'border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
                                            }`}
                                          >
                                            <iconify-icon icon="solar:layers-linear" width="10"></iconify-icon>
                                            {pw.matId ? (todosM.find(m => m.id === pw.matId)?.nome?.split(' ').slice(0, 2).join(' ') ?? '1 mat.') : 'Material'}
                                          </button>
                                          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 shrink-0 w-16 text-right">{sub > 0 ? fmt(sub) : '—'}</span>
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <button onClick={() => setEditandoNomePeca({ amb, vId: v.id, uid: pw.uid, novo: pw.nome })} title="Renomear peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                              <iconify-icon icon="solar:pen-linear" width="11"></iconify-icon>
                                            </button>
                                            <button onClick={() => duplicarPecaDaVersao(amb, v.id, pw.uid)} title="Duplicar peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors">
                                              <iconify-icon icon="solar:copy-linear" width="11"></iconify-icon>
                                            </button>
                                            <button onClick={() => excluirPecaDaVersao(amb, v.id, pw.uid)} title="Excluir peça" className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors">
                                              <iconify-icon icon="solar:trash-bin-trash-linear" width="11"></iconify-icon>
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              });
                            })()}

                            {/* Avulsos desta versão */}
                            <div className="border-t border-gray-300 dark:border-zinc-800/50">
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-200/40 dark:bg-zinc-950/40">
                                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Produtos avulsos</span>
                                <button
                                  onClick={() => setModalAvulsoKey({ amb, vId: v.id })}
                                  className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 text-[9px] font-mono uppercase tracking-widest hover:text-yellow-400 transition-colors"
                                >
                                  <iconify-icon icon="solar:add-circle-linear" width="10"></iconify-icon>
                                  Adicionar
                                </button>
                              </div>
                              {(v.avulsos ?? []).length === 0 ? (
                                <div className="px-4 py-2.5 text-center">
                                  <span className="font-mono text-[9px] text-zinc-800 italic">Nenhum produto adicionado</span>
                                </div>
                              ) : (
                                (v.avulsos ?? []).map(a => (
                                  <div key={a.uid} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-zinc-900/60 last:border-b-0 group bg-gray-200/20 dark:bg-zinc-950/20">
                                    <div className="w-1 h-3 bg-gray-200 dark:bg-zinc-800 shrink-0"></div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-gray-500 dark:text-zinc-400 truncate">{a.nome}</div>
                                      <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{a.subcategoria}</div>
                                    </div>
                                    {editandoAvulso?.amb === amb && editandoAvulso?.vId === v.id && editandoAvulso?.uid === a.uid ? (
                                      <div className="flex items-center gap-1.5">
                                        <input type="number" min="1" value={a.qty} onChange={e => editarAvulsoQty(amb, v.id, a.uid, e.target.value)} className="w-12 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400 text-center" />
                                        <input value={String(a.valorUnit).replace('.', ',')} onChange={e => editarAvulsoValor(amb, v.id, a.uid, e.target.value)} className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400" />
                                        <button onClick={() => setEditandoAvulso(null)} className="text-yellow-400 p-1 hover:bg-yellow-400/10 transition-colors">
                                          <iconify-icon icon="solar:check-circle-linear" width="13"></iconify-icon>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500">{a.qty}x {fmt(a.valorUnit)}</span>
                                        <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(a.qty * a.valorUnit)}</span>
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => setEditandoAvulso({ amb, vId: v.id, uid: a.uid })} className="p-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 transition-colors"><iconify-icon icon="solar:pen-linear" width="12"></iconify-icon></button>
                                          <button onClick={() => removerAvulso(amb, v.id, a.uid)} className="p-1 text-gray-500 dark:text-zinc-600 hover:text-red-400 transition-colors"><iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon></button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── Botão: Adicionar Cenário ──────────────────────────── */}
          <button
            onClick={criarCenario}
            className="w-full border border-dashed border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-4 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors flex items-center justify-center gap-2"
          >
            <iconify-icon icon="solar:add-circle-linear" width="13"></iconify-icon>
            + Adicionar Cenário
          </button>

          {/* ── Lista de cenários ─────────────────────────────────── */}
          {cenarios.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
                  Cenários criados
                </div>
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-900"></div>
                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">
                  {cenarios.length} cenário{cenarios.length !== 1 ? 's' : ''} — cada um vira um orçamento separado
                </span>
              </div>

              {cenarios.map((cen, cIdx) => {
                const totalCen = totalCenario(cen);
                const isNomeEdit = editandoNomeCenario === cen.id;
                // Resumo: "Cozinha V1 + Banheiro V2"
                const resumo = Object.entries(cen.selecoes)
                  .map(([amb, vId]) => {
                    const lista = ambiVersoes[amb] ?? [];
                    const vIdx = lista.findIndex(x => x.id === vId);
                    return vIdx >= 0 ? `${amb || 'Amb'} V${vIdx + 1}` : null;
                  })
                  .filter(Boolean)
                  .join(' + ');

                return (
                  <div key={cen.id} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
                    {/* Cabeçalho */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-zinc-900">
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 px-2 py-0.5 shrink-0">
                        C{cIdx + 1}
                      </span>

                      {isNomeEdit ? (
                        <input
                          autoFocus
                          value={cen.nome}
                          onChange={e => renomearCenario(cen.id, e.target.value)}
                          onBlur={() => setEditandoNomeCenario(null)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditandoNomeCenario(null); }}
                          className="flex-1 bg-gray-50 dark:bg-black border-b border-yellow-400 text-gray-900 dark:text-white text-sm font-bold outline-none px-1 min-w-0"
                        />
                      ) : (
                        <button
                          onClick={() => setEditandoNomeCenario(cen.id)}
                          title="Renomear cenário"
                          className="flex-1 text-left text-sm font-bold text-gray-900 dark:text-white hover:text-yellow-400/80 transition-colors truncate min-w-0"
                        >
                          {cen.nome}
                        </button>
                      )}

                      <span className="font-mono text-sm text-yellow-400 font-bold shrink-0">{fmt(totalCen)}</span>

                      <div className="flex items-center gap-1 border-l border-gray-300 dark:border-zinc-800 pl-3 shrink-0">
                        <button onClick={() => setEditandoNomeCenario(cen.id)} title="Editar nome" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                          <iconify-icon icon="solar:pen-linear" width="13"></iconify-icon>
                        </button>
                        <button onClick={() => duplicarCenario(cen.id)} title="Duplicar cenário" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                          <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                        </button>
                        <button onClick={() => removerCenario(cen.id)} title="Excluir cenário" className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                        </button>
                      </div>
                    </div>

                    {/* Resumo de ambientes */}
                    <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-500 truncate">{resumo || '—'}</span>
                      <div className="divide-x divide-gray-200 dark:divide-zinc-900 flex shrink-0 flex-wrap">
                        {Object.entries(cen.selecoes).map(([amb, vId]) => {
                          const sub = vId ? totalAmbiVersao(amb, vId) : 0;
                          const v   = (ambiVersoes[amb] ?? []).find(x => x.id === vId);
                          return (
                            <div key={amb} className="flex items-center gap-2 px-3 first:pl-0">
                              <span className="text-[10px] text-gray-500 dark:text-zinc-600 uppercase tracking-wide">{amb || 'Amb'}</span>
                              <span className="text-[10px] text-gray-500 dark:text-zinc-400">{v?.nome ?? '—'}</span>
                              <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{fmt(sub)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desconto */}
                    <div className="px-5 py-3 border-t border-gray-200 dark:border-zinc-900/60 flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 shrink-0">Desconto</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" step="0.01"
                          value={cen.descontoValor ?? ''}
                          onChange={e => atualizarDescontoCenario(cen.id, 'descontoValor', e.target.value)}
                          placeholder="0"
                          className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                        />
                        <button
                          onClick={() => atualizarDescontoCenario(cen.id, 'descontoTipo', (cen.descontoTipo ?? '%') === '%' ? 'R$' : '%')}
                          className="font-mono text-[10px] border border-gray-300 dark:border-zinc-700 px-2 py-1 hover:border-yellow-400 hover:text-yellow-400 text-gray-500 dark:text-zinc-400 transition-colors shrink-0 w-8 text-center"
                        >
                          {cen.descontoTipo ?? '%'}
                        </button>
                      </div>
                      {descontoCenario(cen) > 0 && (
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">Subtotal: {fmt(subtotalCenario(cen))}</span>
                          <span className="font-mono text-[9px] text-red-400/70">− {fmt(descontoCenario(cen))}</span>
                          <span className="font-mono text-[10px] font-bold text-yellow-400">{fmt(totalCenario(cen))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-20">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
            {cenarios.length > 0
              ? `${cenarios.length} cenário${cenarios.length !== 1 ? 's' : ''} — ${fmt(cenarios.reduce((s, c) => s + totalCenario(c), 0))}`
              : `${totalVersoes} versão${totalVersoes !== 1 ? 'ões' : ''} — ${fmt(totalSelecaoAtual)}`
            }
          </div>
          <div className="text-xs text-gray-500 dark:text-zinc-400">
            {cenarios.length > 0 ? 'Cada cenário vira um orçamento separado' : 'Adicione cenários ou salve a seleção atual'}
          </div>
        </div>
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {salvando ? (
            <>
              <iconify-icon icon="solar:spinner-linear" width="14" class="animate-spin"></iconify-icon>
              Salvando...
            </>
          ) : (
            <>
              <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
              Salvar e Enviar
            </>
          )}
        </button>
      </div>

      {/* Modal: adicionar produto avulso */}
      {modalAvulsoKey && (
        <ModalProdutoAvulso
          produtosCatalogo={produtosCatalogo}
          onConfirmar={prod => adicionarAvulso(modalAvulsoKey.amb, modalAvulsoKey.vId, prod)}
          onFechar={() => setModalAvulsoKey(null)}
        />
      )}

      {/* Painel lateral: selecionar material (versões) */}
      {painelMatVersao && (
        <PainelMaterial
          pecaId={painelMatVersao.uid ?? painelMatVersao.itemKey ?? 'versao'}
          pecaNome={painelMatVersao.label ?? 'Selecionar material'}
          selecionados={painelMatVersao.atual ? [painelMatVersao.atual] : []}
          onConfirmar={confirmarMatVersao}
          onFechar={() => setPainelMatVersao(null)}
          todosM={todosM}
          single
        />
      )}

      {/* Painel lateral: selecionar material linear (acabamentos) */}
      {painelMatLinear && (
        <PainelMaterialLinear
          label={painelMatLinear.label ?? 'Acabamento'}
          selecionado={painelMatLinear.atual ?? null}
          onConfirmar={confirmarMatLinear}
          onFechar={() => setPainelMatLinear(null)}
          matLineares={matLineares}
        />
      )}
    </div>
  );
}


// ── Tela principal ────────────────────────────────────────────────────────────

export default function CriarOrcamento() {
  const navigate = useNavigate();
  const { id: projetoId } = useParams();
  const [searchParams] = useSearchParams();
  const { profile, session } = useAuth();

  const [pecas, setPecas] = useState([]);
  const [loadingPecas, setLoadingPecas] = useState(true);
  const [materiais, setMateriais] = useState([]);
  const [matLineares, setMatLineares] = useState([]);
  const [produtos, setProdutos] = useState([]);     // itens avulsos adicionados pelo usuário no passo 1
  const [produtosCatalogo, setProdutosCatalogo] = useState([]); // catálogo bruto do Supabase
  const [bulkMaterialId, setBulkMaterialId] = useState('');     // bulk action: material único
  const [processedMedicaoId, setProcessedMedicaoId] = useState(null);

  // ── Fluxo manual (sem medição) ────────────────────────────────────────────
  const modoManual = searchParams.get('modo') === 'manual';

  const novaPecaManual = (tipo = 'retangulo') => {
    const base = { id: crypto.randomUUID(), nome: '', tipo };
    if (tipo === 'faixa')    return { ...base, largura: '', comprimento: '', espessura: '2' };
    if (tipo === 'poligono') return { ...base, lados: [{ id: crypto.randomUUID(), comprimento: '' }], area_manual: '' };
    return { ...base, largura: '', comprimento: '' }; // retangulo
  };

  const novoAmbienteManual = (idx) => ({
    id: crypto.randomUUID(),
    nome: `Ambiente ${idx}`,
    pecasManual: [novaPecaManual()],
    avulsosManual: [],
    acabamentosManual: [],
  });

  const [ambientesManual, setAmbientesManual] = useState(() => [novoAmbienteManual(1)]);
  const [manualAmbMapping, setManualAmbMapping] = useState({});
  const [avulsoSelectorAmbId, setAvulsoSelectorAmbId] = useState(null);
  const [buscaAvulso, setBuscaAvulso] = useState('');

  function addAmbienteManual() {
    setAmbientesManual(prev => [...prev, novoAmbienteManual(prev.length + 1)]);
  }
  function removeAmbienteManual(ambId) {
    setAmbientesManual(prev => prev.filter(a => a.id !== ambId));
  }
  function duplicarAmbienteManual(ambId) {
    setAmbientesManual(prev => {
      const src = prev.find(a => a.id === ambId);
      if (!src) return prev;
      const clone = {
        ...src,
        id: crypto.randomUUID(),
        nome: `${src.nome} (Cópia)`,
        pecasManual: src.pecasManual.map(p => ({
          ...p, id: crypto.randomUUID(),
          lados: p.lados?.map(l => ({ ...l, id: crypto.randomUUID() })),
        })),
        avulsosManual: src.avulsosManual.map(a => ({ ...a, id: crypto.randomUUID() })),
        acabamentosManual: src.acabamentosManual.map(a => ({ ...a, id: crypto.randomUUID() })),
      };
      return [...prev, clone];
    });
  }
  function updateAmbNome(ambId, nome) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? { ...a, nome } : a));
  }

  // ── Peça helpers ────────────────────────────────────────────────────────────
  function addPecaManual(ambId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId
      ? { ...a, pecasManual: [...a.pecasManual, novaPecaManual()] } : a));
  }
  function removePecaManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId
      ? { ...a, pecasManual: a.pecasManual.filter(p => p.id !== pecaId) } : a));
  }
  function duplicarPecaManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => {
      if (a.id !== ambId) return a;
      const idx = a.pecasManual.findIndex(p => p.id === pecaId);
      if (idx === -1) return a;
      const src = a.pecasManual[idx];
      const clone = { ...src, id: crypto.randomUUID(), nome: `${src.nome} (Cópia)`, lados: src.lados?.map(l => ({ ...l, id: crypto.randomUUID() })) };
      const nl = [...a.pecasManual];
      nl.splice(idx + 1, 0, clone);
      return { ...a, pecasManual: nl };
    }));
  }
  function updatePecaManual(ambId, pecaId, field, value) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => {
        if (p.id !== pecaId) return p;
        if (field === 'tipo') { const f = novaPecaManual(value); return { ...f, id: p.id, nome: p.nome }; }
        return { ...p, [field]: value };
      }),
    } : a));
  }

  // ── Lados helpers (polígono) ─────────────────────────────────────────────────
  function addLadoManual(ambId, pecaId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: [...(p.lados ?? []), { id: crypto.randomUUID(), comprimento: '' }] } : p),
    } : a));
  }
  function removeLadoManual(ambId, pecaId, ladoId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: p.lados.filter(l => l.id !== ladoId) } : p),
    } : a));
  }
  function updateLadoManual(ambId, pecaId, ladoId, comprimento) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, pecasManual: a.pecasManual.map(p => p.id === pecaId
        ? { ...p, lados: p.lados.map(l => l.id === ladoId ? { ...l, comprimento } : l) } : p),
    } : a));
  }

  // ── Acabamentos helpers (por ambiente) ───────────────────────────────────────
  function addAcabamentoManual(ambId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: [...a.acabamentosManual, { id: crypto.randomUUID(), tipo: 'meia_esquadria', ml: '' }],
    } : a));
  }
  function removeAcabamentoManual(ambId, acabId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: a.acabamentosManual.filter(ac => ac.id !== acabId),
    } : a));
  }
  function updateAcabamentoManual(ambId, acabId, field, value) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, acabamentosManual: a.acabamentosManual.map(ac => ac.id === acabId ? { ...ac, [field]: value } : ac),
    } : a));
  }

  // ── Avulsos helpers (por ambiente) ───────────────────────────────────────────
  function addAvulsoManual(ambId, produto) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: [...a.avulsosManual, {
        id: crypto.randomUUID(), produto_id: produto.id, nome: produto.nome,
        subcategoria: produto.subcategoria, preco: produto.preco ?? 0, quantidade: 1,
      }],
    } : a));
    setAvulsoSelectorAmbId(null);
    setBuscaAvulso('');
  }
  function removeAvulsoManual(ambId, avId) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: a.avulsosManual.filter(av => av.id !== avId),
    } : a));
  }
  function updateAvulsoQtd(ambId, avId, quantidade) {
    setAmbientesManual(prev => prev.map(a => a.id === ambId ? {
      ...a, avulsosManual: a.avulsosManual.map(av => av.id === avId ? { ...av, quantidade: parseInt(quantidade) || 1 } : av),
    } : a));
  }

  async function handleContinuarManual() {
    const empresaId = profile?.empresa_id;
    if (!isValidUUID(empresaId)) { alert('Empresa não encontrada.'); return; }

    const novasPecas  = [];
    const novosAvulsos = [];

    ambientesManual.forEach(amb => {
      // Peças regulares
      amb.pecasManual.forEach(pm => {
        if (pm.tipo === 'poligono') {
          const area = parseFloat(pm.area_manual) || 0;
          if (area <= 0) return;
          novasPecas.push({
            id: pm.id, nome: pm.nome || 'Peça', ambiente_nome: amb.nome,
            area_liq: area, espessura: 2,
            meia_esquadria_ml: 0, reto_simples_ml: 0, cortes: 0,
            incluida: true, materiais: [],
          });
        } else {
          const largura     = parseFloat(pm.largura)     || 0;
          const comprimento = parseFloat(pm.comprimento) || 0;
          if (largura <= 0 || comprimento <= 0) return;
          novasPecas.push({
            id: pm.id, nome: pm.nome || 'Peça', ambiente_nome: amb.nome,
            area_liq: Math.round(largura * comprimento * 10000) / 10000,
            espessura: pm.tipo === 'faixa' ? (parseFloat(pm.espessura) || 2) : 2,
            meia_esquadria_ml: 0, reto_simples_ml: 0, cortes: 0,
            incluida: true, materiais: [],
          });
        }
      });
      // Avulsos
      amb.avulsosManual.forEach(av => {
        novosAvulsos.push({ id: av.produto_id, nome: av.nome, subcategoria: av.subcategoria, preco: av.preco, qty: av.quantidade });
      });
    });

    if (novasPecas.length === 0 && novosAvulsos.length === 0) {
      alert('Adicione pelo menos uma peça com dimensões válidas ou um produto avulso.');
      return;
    }

    // Cria ambientes no banco
    const mapping = {};
    for (const amb of ambientesManual) {
      const temConteudo =
        amb.pecasManual.some(pm => pm.tipo === 'poligono' ? parseFloat(pm.area_manual) > 0 : parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0) ||
        amb.avulsosManual.length > 0 ||
        amb.acabamentosManual.some(ac => parseFloat(ac.ml) > 0);
      if (!temConteudo) continue;
      const ambId = crypto.randomUUID();
      const { error } = await supabase.from('ambientes').insert({
        id: ambId, empresa_id: empresaId, projeto_id: projetoId,
        nome: amb.nome, created_at: new Date().toISOString(),
      });
      if (!error) { mapping[amb.nome] = ambId; if (!mapping['']) mapping[''] = ambId; }
      else console.error('[manual] erro ao criar ambiente:', error.message);
    }

    setManualAmbMapping(mapping);
    if (novosAvulsos.length > 0) setProdutos(prev => [...prev, ...novosAvulsos]);
    setPecas(novasPecas);
    setVersoesCriadas([{
      nome: 'Versão 1',
      mats: Object.fromEntries(novasPecas.map(p => [p.id, ''])),
    }]);
  }

  // Busca materiais reais do Supabase onde empresa_id = profile.empresa_id e ativo = true
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    setMateriais([]);
    supabase
      .from('materiais')
      .select('id, nome, categoria, preco_1cm, preco_2cm, preco_3cm')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
          return;
        }
        if (data) setMateriais(data.map(m => ({ ...m, cor: m.categoria })));
      });
  }, [session, profile?.empresa_id]);

  // Busca materiais lineares (acabamentos) do Supabase
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('materiais_linear')
      .select('id, nome, tipo, precoml')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { console.error('[CriarOrcamento] matLineares:', error.message); return; }
        if (data) setMatLineares(data);
      });
  }, [session, profile?.empresa_id]);

  // Busca produtos reais do Supabase
  useEffect(() => {
    if (!session || !profile?.empresa_id) return;
    supabase
      .from('produtos_catalogo')
      .select('id, nome, subcategoria, preco_venda')
      .eq('empresa_id', profile.empresa_id)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          console.error(`ERRO CRÍTICO SUPABASE: ${error.message}`);
          return;
        }
        // Salva catálogo bruto (para o modal de adicionar produto)
        if (data) setProdutosCatalogo(data.map(p => ({ ...p, preco: p.preco_venda })));
      });
  }, [session, profile?.empresa_id]);

  // Busca peças da medição no Supabase.
  // Caminho A (quando medicao_id vem na URL): lê json_medicao diretamente da medição —
  //   funciona tanto para medições do app Flutter (json_medicao preenchido pelo app)
  //   quanto para medições web (json_medicao preenchido pelo trigger).
  // Caminho B (fallback sem medicao_id): busca via tabela `pecas` pela medição mais
  //   recente com status='processada' (fluxo legado de medições web).
  const medicaoIdFromUrl = searchParams.get('medicao_id');

  useEffect(() => {
    setPecas([]);
    setLoadingPecas(true);
    setProcessedMedicaoId(null);

    async function fetchPecas() {
      try {
        const medicaoId = isValidUUID(medicaoIdFromUrl) ? medicaoIdFromUrl : null;

        // ── Caminho A: medicao_id veio na URL ────────────────────────────────
        if (medicaoId) {
          const { data: medRow, error: medErr } = await supabase
            .from('medicoes')
            .select('id, json_medicao')
            .eq('id', medicaoId)
            .single();

          if (medErr || !medRow) {
            setPecas([]);
            return;
          }

          setProcessedMedicaoId(medRow.id);

          const json = medRow.json_medicao;
          let resumo = [];

          const normalizado = normalizarJsonMedicao(json);
          resumo = normalizado?.resumo_por_peca ?? [];

          setPecas(resumo.map(r => ({
            id:                r.peca_id ?? crypto.randomUUID(),
            nome:              r.nome ?? '—',
            ambiente_nome:     r.ambiente_nome ?? null,
            item_nome:         r.item_nome ?? null,
            area_liq:          Number(r.area_liquida_m2 ?? 0),
            espessura:         Number(r.espessura_cm    ?? 2),
            meia_esquadria_ml: Number(r.acabamentos?.meia_esquadria_ml ?? 0),
            reto_simples_ml:   Number(r.acabamentos?.reto_simples_ml   ?? 0),
            cortes:            Number(r.recortes_qty ?? 0),
            incluida:          true,
            materiais:         [],
          })));
          return;
        }

        // ── Caminho B: sem medicao_id na URL — fallback via tabela `pecas` ──
        const { data: medData, error: medError } = await supabase
          .from('medicoes')
          .select('id')
          .eq('projeto_id', projetoId)
          .in('status', ['processada', 'enviada', 'concluida', 'aprovada'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (medError || !medData) {
          setPecas([]);
          return;
        }

        setProcessedMedicaoId(medData.id);

        const { data: ambData, error: ambError } = await supabase
          .from('ambientes')
          .select('id')
          .eq('medicao_id', medData.id);

        if (ambError || !ambData?.length) {
          setPecas([]);
          return;
        }

        const ambienteIds = ambData.map(a => a.id);

        const { data: pecasData, error: pecasError } = await supabase
          .from('pecas')
          .select('id, nome_livre, area_liquida_m2, espessura_cm, dimensoes, arestas, recortes')
          .in('ambiente_id', ambienteIds)
          .eq('incluida', true)
          .order('created_at');

        if (pecasError) {
          console.error('[CriarOrcamento] Erro ao buscar peças:', pecasError.message);
          setPecas([]);
          return;
        }

        setPecas((pecasData ?? []).map(p => {
          const dim       = p.dimensoes ?? {};
          const face      = (p.arestas ?? {}).face ?? '';
          const altura    = Number(dim.altura  ?? 0);
          const largura   = Number(dim.largura ?? 0);
          const qtd       = Number(dim.qtd     ?? 1);
          const perimetro = Math.round((altura + largura) * 2 * qtd * 100) / 100;
          return {
            id:                p.id,
            nome:              p.nome_livre ?? '—',
            area_liq:          Number(p.area_liquida_m2 ?? 0),
            espessura:         Number(p.espessura_cm    ?? 2),
            meia_esquadria_ml: /meia.esquadria/i.test(face) ? perimetro : 0,
            reto_simples_ml:   /reto.simples/i.test(face)   ? perimetro : 0,
            cortes:            Array.isArray(p.recortes) ? p.recortes.length : 0,
            incluida:          true,
            materiais:         [],
          };
        }));

      } catch (err) {
        console.error('[CriarOrcamento] Exceção na busca das peças:', err);
        setPecas([]);
      } finally {
        setLoadingPecas(false);
      }
    }

    if (projetoId && !modoManual) {
      fetchPecas();
    } else {
      setPecas([]);
      setLoadingPecas(false);
    }
  }, [projetoId, medicaoIdFromUrl]);

  const [painelMaterialPecaId, setPainelMaterialPecaId] = useState(null);
  const [modalProduto, setModalProduto] = useState(false);
  const [modalVersoes, setModalVersoes] = useState(false);
  const [versoesCriadas, setVersoesCriadas] = useState(null);
  const [salvandoOrc, setSalvandoOrc] = useState(false);

  // Estado para ações por ambiente
  const [editandoAmbNome, setEditandoAmbNome] = useState(null);     // { amb: string, novo: string }
  const [painelMaterialAmbNome, setPainelMaterialAmbNome] = useState(null); // nome do ambiente aberto no PainelMaterial

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    const t = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [searchParams.get('ambiente_id'), searchParams.get('medicao_id'), versoesCriadas]);

  // ── Derived ────────────────────────────────────

  const pecasIncluidas = pecas.filter(p => p.incluida);
  const totalProdutos  = produtos.reduce((s, p) => s + p.preco * p.qty, 0);
  const pecasComMaterial = pecasIncluidas.filter(p => p.materiais.length > 0);
  const precisaVersoes  = pecasIncluidas.some(p => p.materiais.length > 1);

  const totalPecas = pecasIncluidas.reduce((s, p) => {
    if (p.materiais.length === 0) return s;
    return s + precoPeca(p, p.materiais[0], materiais);
  }, 0);
  const total = totalPecas + totalProdutos;

  // ── Handlers ───────────────────────────────────

  function toggleIncluida(pecaId) {
    setPecas(prev => prev.map(p => p.id === pecaId ? { ...p, incluida: !p.incluida } : p));
  }

  function duplicarPecaPrincipal(pecaId) {
    setPecas(prev => {
      const idx = prev.findIndex(p => p.id === pecaId);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: `clone-${Date.now()}`, nome: `${prev[idx].nome} (Cópia)`, materiais: [...prev[idx].materiais] };
      const newList = [...prev];
      newList.splice(idx + 1, 0, clone);
      return newList;
    });
  }

  function confirmarMaterial(pecaId, materiais) {
    setPecas(prev => prev.map(p => p.id === pecaId ? { ...p, materiais } : p));
    setPainelMaterialPecaId(null);
  }

  // ── Ações por ambiente ──────────────────────────────────────────
  function excluirAmbiente(amb) {
    setPecas(prev => prev.filter(p => p.ambiente_nome !== amb));
  }

  function confirmarRenomearAmbiente() {
    if (!editandoAmbNome) return;
    const { amb, novo } = editandoAmbNome;
    setPecas(prev => prev.map(p => p.ambiente_nome === amb ? { ...p, ambiente_nome: novo.trim() || amb } : p));
    setEditandoAmbNome(null);
  }

  function duplicarAmbiente(amb) {
    const pecasDoAmb = pecas.filter(p => p.ambiente_nome === amb);
    const novoNome = `${amb} (Cópia)`;
    const clones = pecasDoAmb.map(p => ({ ...p, id: crypto.randomUUID(), ambiente_nome: novoNome, materiais: [...p.materiais] }));
    setPecas(prev => [...prev, ...clones]);
  }

  function aplicarMaterialAoAmbiente(ambNome, matIds) {
    setPecas(prev => prev.map(p => p.ambiente_nome === ambNome ? { ...p, materiais: matIds } : p));
    setPainelMaterialAmbNome(null);
  }

  // ── Bulk action: aplicar material a todas as peças incluídas ───
  function aplicarMaterialATodas() {
    if (!bulkMaterialId) return;
    setPecas(prev => prev.map(p =>
      p.incluida ? { ...p, materiais: [bulkMaterialId] } : p
    ));
  }

  function removerProduto(idx) {
    setProdutos(prev => prev.filter((_, i) => i !== idx));
  }

  function adicionarProduto(prod) {
    setProdutos(prev => [...prev, prod]);
    setModalProduto(false);
  }

  function handleContinuar() {
    if (precisaVersoes) {
      setModalVersoes(true);
    } else {
      const versao = {
        nome: 'Orçamento',
        mats: Object.fromEntries(pecasIncluidas.map(p => [p.id, p.materiais[0] ?? ''])),
      };
      setVersoesCriadas([versao]);
    }
  }

  function handleCriarVersoes(versoes) {
    setModalVersoes(false);
    setVersoesCriadas(versoes);
  }

  // ── Garante que existam registros em `ambientes` para esta medição ──
  // Retorna { [ambNome]: ambId } — mapeamento de nome → UUID no banco.
  //
  // Estratégia:
  //   1. Carrega ambientes já existentes (criados pelo trigger ou salvamento anterior)
  //   2. Lê json_medicao para descobrir quais ambientes o JSON menciona
  //   3. Cria apenas os que ainda não existem no banco
  //
  // Suporta ambos os formatos Flutter:
  //   • Antigo: { ambientes: [{ ambiente, pecas }] }
  //   • Novo:   { ambientes: [{ ambiente, itens, pecas_sem_item }] }
  async function garantirAmbientesNoBanco(medicaoId, empresaId, projetoId) {
    const map = {};

    // 1. Carrega ambientes já existentes (trigger ou salvamento anterior)
    const { data: existentes } = await supabase
      .from('ambientes')
      .select('id, nome')
      .eq('medicao_id', medicaoId);

    existentes?.forEach(a => { map[a.nome] = a.id; });
    if (!map[''] && existentes?.[0]) map[''] = existentes[0].id;

    // 2. Lê json_medicao para criar os ambientes ainda ausentes no mapa
    const { data: med } = await supabase
      .from('medicoes')
      .select('json_medicao')
      .eq('id', medicaoId)
      .single();

    const json = med?.json_medicao;
    if (!json) return map;

    // Coleta nomes de ambientes do JSON (suporta formato antigo e novo)
    const nomesDoJson = new Set();
    if (Array.isArray(json.ambientes)) {
      for (const ambJson of json.ambientes) {
        const n = ambJson.ambiente ?? ambJson.nome;
        if (n) nomesDoJson.add(n);
      }
    } else if (Array.isArray(json.resumo_por_peca)) {
      nomesDoJson.add('Medição');
    }

    // Cria apenas os ambientes ausentes
    for (const ambNome of nomesDoJson) {
      if (map[ambNome]) continue;
      const ambId = crypto.randomUUID();
      const { error } = await supabase.from('ambientes').insert({
        id:         ambId,
        empresa_id: empresaId,
        projeto_id: projetoId,
        medicao_id: medicaoId,
        nome:       ambNome,
        created_at: new Date().toISOString(),
      });
      if (!error) {
        map[ambNome] = ambId;
        if (!map['']) map[''] = ambId;
      } else {
        console.error('[garantirAmbientes] Erro ao criar ambiente:', ambNome, error.message);
        // Ambiente pode ter sido criado por corrida paralela — tenta reler do banco
        const { data: recheck } = await supabase
          .from('ambientes').select('id').eq('medicao_id', medicaoId).eq('nome', ambNome).single();
        if (recheck?.id) {
          map[ambNome] = recheck.id;
          if (!map['']) map[''] = recheck.id;
        }
      }
    }

    return map;
  }

  // ── Garante que cada pWrapper de uma versão exista na tabela `pecas` ──
  //
  // Estratégia:
  //   1. Constrói linhas a inserir a partir de versao.pecasList
  //   2. Faz SELECT para descobrir quais já existem no banco
  //   3. Insere apenas as que faltam (sem upsert cego)
  //   4. Retorna Set<string> com todos os IDs confirmados no banco
  //      (existentes + recém-inseridos) para que handleSalvar nunca
  //      referencie um peca_id que não exista — prevenindo FK violation.
  //
  // Suporta nova estrutura Flutter com item_nome (salvo em dimensoes).
  async function garantirPecasNoBanco(versao, ambMapping, empresaId) {
    const fallbackAmbId = Object.values(ambMapping).find(isValidUUID) ?? null;

    // 1. Monta linhas a garantir (apenas peças de pedra; acabamentos não têm linha própria no banco)
    const todasRows = versao.pecasList
      .filter(pw => isValidUUID(pw.idBase) && pw.tipo !== 'acabamento')
      .map(pw => ({
        id:              pw.idBase,
        empresa_id:      empresaId,
        ambiente_id:     ambMapping[pw.ambiente_nome ?? ''] ?? fallbackAmbId,
        tipo:            'retangulo',
        nome_livre:      pw.nome ?? 'Peça sem nome',
        espessura_cm:    pw.espessura ?? 2,
        area_bruta_m2:   pw.area_liq  ?? 0,
        area_liquida_m2: pw.area_liq  ?? 0,
        dimensoes:       pw.item_nome ? { item_nome: pw.item_nome } : {},
        arestas: {
          meia_esquadria_ml: pw.meia_esquadria_ml ?? 0,
          reto_simples_ml:   pw.reto_simples_ml   ?? 0,
        },
        recortes:   [],
        incluida:   true,
        created_at: new Date().toISOString(),
      }));

    // Filtra peças sem ambiente_id válido (jamais podem ser inseridas)
    const rowsValidas = todasRows.filter(r => isValidUUID(r.ambiente_id));

    if (rowsValidas.length === 0) {
      console.error('[garantirPecas] Nenhuma peça com ambiente_id válido. ambMapping:', ambMapping);
      return new Set();
    }

    // 2. Descobre quais já existem no banco (via SELECT)
    const ids = rowsValidas.map(r => r.id);
    const { data: existentes } = await supabase
      .from('pecas')
      .select('id')
      .in('id', ids);

    const existentesSet = new Set(existentes?.map(p => p.id) ?? []);

    // 3. Insere apenas as que faltam
    const novas = rowsValidas.filter(r => !existentesSet.has(r.id));

    if (novas.length > 0) {
      const { error } = await supabase.from('pecas').insert(novas);
      if (error) {
        console.error('[garantirPecas] Erro ao inserir peças:', error.message, error.details);
        // Retorna só as pré-existentes; as novas podem não ter sido inseridas
        return existentesSet;
      }
    }

    // 4. Retorna todos os IDs confirmados (existentes + recém-inseridos)
    return new Set([...existentesSet, ...novas.map(r => r.id)]);
  }

  async function handleSalvar(versoesFinais) {
    let finalAmbienteId = searchParams.get('ambiente_id');
    const medicaoId  = searchParams.get('medicao_id') || processedMedicaoId;
    const vendedorId = session?.user?.id ?? null;
    const empresaId  = profile?.empresa_id ?? null;

    // ── Valida empresa e vendedor antes de qualquer operação assíncrona ──
    if (!isValidUUID(empresaId))  {
      alert("Erro Crítico: empresa_id ausente. Você precisa estar logado em uma empresa válida.");
      return;
    }
    if (!isValidUUID(vendedorId)) {
      alert("Erro Crítico: vendedor_id ausente. Sessão inválida.");
      return;
    }

    // ── Resolve mapeamento ambNome → ambId e garante ambientes no banco ──────
    let ambMapping = {};
    if (modoManual) {
      // Fluxo manual: ambientes foram criados em handleContinuarManual
      ambMapping = manualAmbMapping;
    } else if (isValidUUID(medicaoId)) {
      ambMapping = await garantirAmbientesNoBanco(medicaoId, empresaId, projetoId);
    }

    // finalAmbienteId: prioridade URL → primeiro ambiente criado/existente
    if (!isValidUUID(finalAmbienteId)) {
      const ids = Object.values(ambMapping).filter(isValidUUID);
      if (ids.length > 0) finalAmbienteId = ids[0];
    }

    if (!isValidUUID(finalAmbienteId)) {
      alert("Erro ao salvar: ambiente não encontrado. Verifique se a medição foi enviada corretamente pelo app.");
      return;
    }

    const pecasIncluidas = pecas.filter(p => p.incluida);

    setSalvandoOrc(true);
    try {
      for (const versao of versoesFinais) {
        // 0. Garante que cada peça da versão existe na tabela `pecas` antes de
        //    tentar inserir em orcamento_pecas (que tem FK → pecas.id).
        //    Retorna Set<string> com os IDs confirmados no banco.
        const pecasGarantidas = await garantirPecasNoBanco(versao, ambMapping, empresaId);

        // Agrupa acabamentos por stoneUid para lookup rápido ao montar pecasRows
        const acabamentosPorPedra = new Map();
        versao.pecasList
          .filter(pw => pw.tipo === 'acabamento')
          .forEach(pw => {
            if (!acabamentosPorPedra.has(pw.idPedraUid)) acabamentosPorPedra.set(pw.idPedraUid, []);
            acabamentosPorPedra.get(pw.idPedraUid).push(pw);
          });

        const valorPecas = versao.pecasList.reduce((s, pWrapper) => {
          if (pWrapper.tipo === 'acabamento') {
            return s + precoAcabamento(pWrapper.ml, pWrapper.matLinearId, matLineares);
          }
          const rawMat = pWrapper.matId;
          const matId  = rawMat && typeof rawMat === 'object' ? (rawMat.id ?? null) : (rawMat ?? null);
          const pSrc   = pecas.find(p => p.id === pWrapper.idBase) ?? pWrapper;
          return s + precoPeca(pSrc, matId, materiais);
        }, 0);
        const valorAvulsos = produtos.reduce((s, p) => s + p.preco * p.qty, 0);
        const subtotal     = valorPecas + valorAvulsos;

        // Desconto passado pelo TelaVersoes
        const descVal  = versao.descontoValor ?? 0;
        const descTipo = versao.descontoTipo  ?? '%';
        const descontoAbsoluto = descTipo === '%'
          ? Math.min(subtotal * descVal / 100, subtotal)
          : Math.min(descVal, subtotal);
        const valorTotal = Math.max(0, subtotal - descontoAbsoluto);

        // 1. Insert em orcamentos — colunas em snake_case conforme SPEC
        const dadosOrcamento = {
          empresa_id:     empresaId,
          ambiente_id:    finalAmbienteId,
          vendedor_id:    vendedorId,
          nome_versao:    versao.nome,
          status:         'rascunho',
          desconto_total: descontoAbsoluto,
          valor_total:    valorTotal,
        };

        const { data: orc, error: errOrc } = await supabase
          .from('orcamentos')
          .insert(dadosOrcamento)
          .select('id')
          .single();

        if (errOrc) {
          console.error(`ERRO CRÍTICO SUPABASE: ${errOrc.message} - Detalhes: ${errOrc.details}`);
          return;
        }

        const orcamentoId = orc.id;

        // 2. Insert em orcamento_pecas — apenas peças de pedra confirmadas no banco
        //    Filtra por pecasGarantidas para nunca violar o FK peca_id → pecas.id
        const pecasRows = versao.pecasList
          .filter(pw => pw.tipo !== 'acabamento' && isValidUUID(pw.idBase) && pecasGarantidas.has(pw.idBase))
          .map(pWrapper => {
            const rawMat    = pWrapper.matId;
            const materialId = rawMat && typeof rawMat === 'object'
              ? (rawMat.id ?? null)
              : (typeof rawMat === 'string' ? rawMat : null);

            const pSource   = pecas.find(p => p.id === pWrapper.idBase) ?? pWrapper;
            const valorArea = precoPeca(pSource, materialId, materiais);

            // Agrega acabamentos vinculados a esta pedra
            const filhos = acabamentosPorPedra.get(pWrapper.uid) ?? [];
            const valorAcabamentosTotal = filhos.reduce((s, ac) =>
              s + precoAcabamento(ac.ml, ac.matLinearId, matLineares), 0);
            const acabamentosJson = filhos.map(ac => ({
              tipo:         ac.tipoAcabamento,
              ml:           ac.ml,
              mat_linear_id: ac.matLinearId,
              valor:        precoAcabamento(ac.ml, ac.matLinearId, matLineares),
            }));

            return {
              orcamento_id:      orcamentoId,
              peca_id:           pWrapper.idBase,
              material_id:       materialId,
              item_nome:         pWrapper.item_nome ?? null,
              valor_area:        valorArea,
              valor_acabamentos: valorAcabamentosTotal,
              valor_recortes:    0,
              valor_total:       valorArea + valorAcabamentosTotal,
              acabamentos:       acabamentosJson,
            };
          });

        if (pecasRows.length > 0) {
          const { error: errPecas } = await supabase
            .from('orcamento_pecas')
            .insert(pecasRows);

          if (errPecas) {
            console.error('[CriarOrcamento] ERRO orcamento_pecas:', errPecas.message, '| code:', errPecas.code, '| hint:', errPecas.hint);
            alert('Erro ao salvar peças: ' + errPecas.message);
          }
        }

        // 3. Insert em orcamento_avulsos
        if (produtos.length > 0) {
          const avulsosRows = produtos.map(p => ({
            orcamento_id:   orcamentoId,
            produto_id:     p.id.startsWith('pr') ? null : p.id,
            quantidade:     p.qty,
            valor_unitario: p.preco,
            valor_total:    p.preco * p.qty,
          }));
          const { error: errAvulsos } = await supabase.from('orcamento_avulsos').insert(avulsosRows);
          if (errAvulsos) console.error(`ERRO CRÍTICO SUPABASE: ${errAvulsos.message} - Detalhes: ${errAvulsos.details}`);
        }
      }
    } catch (e) {
      console.error(`ERRO CRÍTICO SUPABASE: ${e.message} - Detalhes: ${e.details ?? ''}`);
      setSalvandoOrc(false);
      return;
    }

    setSalvandoOrc(false);
    navigate(`/projetos/${projetoId ?? '1'}`);
  }

  // ── Se versões já foram criadas, mostrar tela de versões ──

  if (versoesCriadas) {
    return (
      <TelaVersoes
        versoes={versoesCriadas}
        pecas={pecas}
        produtos={produtos}
        onSalvar={handleSalvar}
        onVoltar={() => setVersoesCriadas(null)}
        todosM={materiais}
        matLineares={matLineares}
        salvando={salvandoOrc}
      />
    );
  }

  // ── Fluxo manual: formulário de entrada de peças em branco ────────────────
  if (modoManual) {
    const totalPecasValidas = ambientesManual.reduce((s, a) => s + a.pecasManual.filter(pm =>
      pm.tipo === 'poligono' ? parseFloat(pm.area_manual) > 0 : parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0
    ).length, 0);
    const totalAvulsos = ambientesManual.reduce((s, a) => s + a.avulsosManual.length, 0);

    return (
      <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">
        <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
        <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
        <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

        <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12 pb-32">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-6">
            <a href="/projetos" className="hover:text-yellow-400 transition-colors">Projetos</a>
            <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
            <a href={`/projetos/${projetoId}`} className="hover:text-yellow-400 transition-colors">Projeto</a>
            <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
            <span className="text-gray-500 dark:text-zinc-400">Orçamento manual</span>
          </div>

          {/* Header */}
          <section className="mb-8">
            <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ ORCAMENTO_MANUAL ]</div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">Orçamento manual</h1>
                  <p className="font-mono text-[10px] text-gray-500 dark:text-zinc-600 mt-1">Adicione ambientes e peças manualmente, sem medição do app</p>
                </div>
                <button
                  onClick={() => navigate(`/projetos/${projetoId}`)}
                  className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
                >
                  <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                  Voltar
                </button>
              </div>
            </div>
          </section>

          {/* Ambientes */}
          <div className="flex flex-col gap-6">
            {ambientesManual.map((amb) => (
              <div key={amb.id} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">

                {/* Header do ambiente */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-300 dark:border-zinc-800">
                  <div className="w-1 h-5 bg-yellow-400/60 shrink-0"></div>
                  <input
                    value={amb.nome}
                    onChange={e => updateAmbNome(amb.id, e.target.value)}
                    placeholder="Nome do ambiente"
                    className="flex-1 bg-transparent text-gray-900 dark:text-white text-sm font-semibold outline-none border-b border-transparent focus:border-yellow-400/50 transition-colors min-w-0 pb-0.5"
                  />
                  <button
                    onClick={() => duplicarAmbienteManual(amb.id)}
                    title="Duplicar ambiente"
                    className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <iconify-icon icon="solar:copy-linear" width="13"></iconify-icon>
                  </button>
                  {ambientesManual.length > 1 && (
                    <button
                      onClick={() => removeAmbienteManual(amb.id)}
                      title="Remover ambiente"
                      className="p-1.5 rounded text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    >
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                    </button>
                  )}
                </div>

                {/* ── Peças ─────────────────────────────────────────────── */}
                <div className="divide-y divide-gray-200 dark:divide-zinc-900/60">
                  {amb.pecasManual.map((pm) => (
                    <div key={pm.id} className="px-5 py-3">
                      {/* Row 1: Nome + Tipo + Actions */}
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={pm.nome}
                          onChange={e => updatePecaManual(amb.id, pm.id, 'nome', e.target.value)}
                          placeholder="Tampo, Saia, Peitoril..."
                          className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 outline-none focus:border-yellow-400/50 transition-colors min-w-0"
                        />
                        <select
                          value={pm.tipo}
                          onChange={e => updatePecaManual(amb.id, pm.id, 'tipo', e.target.value)}
                          className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-2 py-1.5 outline-none focus:border-gray-400 dark:border-zinc-600 shrink-0 w-28"
                        >
                          <option value="retangulo">Retângulo</option>
                          <option value="faixa">Faixa</option>
                          <option value="poligono">Polígono</option>
                        </select>
                        <button
                          onClick={() => duplicarPecaManual(amb.id, pm.id)}
                          title="Duplicar peça"
                          className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded transition-colors shrink-0"
                        >
                          <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
                        </button>
                        <button
                          onClick={() => removePecaManual(amb.id, pm.id)}
                          title="Remover peça"
                          className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors shrink-0"
                        >
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                        </button>
                      </div>

                      {/* Row 2: Dimensões (conditional on tipo) */}
                      {pm.tipo === 'retangulo' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Larg.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.largura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'largura', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Comp.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.comprimento}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'comprimento', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          {parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0 && (
                            <span className="font-mono text-[9px] text-yellow-400/60">
                              = {(parseFloat(pm.largura) * parseFloat(pm.comprimento)).toFixed(4)} m²
                            </span>
                          )}
                        </div>
                      )}

                      {pm.tipo === 'faixa' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Larg.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.largura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'largura', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Comp.</span>
                            <input
                              type="number" step="0.01" min="0"
                              value={pm.comprimento}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'comprimento', e.target.value)}
                              placeholder="0.00"
                              className="w-20 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Esp.</span>
                            <select
                              value={pm.espessura}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'espessura', e.target.value)}
                              className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-1 py-1 outline-none focus:border-gray-400 dark:border-zinc-600"
                            >
                              <option value="1">1cm</option>
                              <option value="2">2cm</option>
                              <option value="3">3cm</option>
                            </select>
                          </label>
                          {parseFloat(pm.largura) > 0 && parseFloat(pm.comprimento) > 0 && (
                            <span className="font-mono text-[9px] text-yellow-400/60">
                              = {(parseFloat(pm.largura) * parseFloat(pm.comprimento)).toFixed(4)} m²
                            </span>
                          )}
                        </div>
                      )}

                      {pm.tipo === 'poligono' && (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1.5">
                            {pm.lados?.map((lado, lIdx) => (
                              <div key={lado.id} className="flex items-center gap-2">
                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 w-12 shrink-0">Lado {lIdx + 1}</span>
                                <input
                                  type="number" step="0.1" min="0"
                                  value={lado.comprimento}
                                  onChange={e => updateLadoManual(amb.id, pm.id, lado.id, e.target.value)}
                                  placeholder="0"
                                  className="w-24 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                                />
                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">cm</span>
                                {pm.lados.length > 1 && (
                                  <button
                                    onClick={() => removeLadoManual(amb.id, pm.id, lado.id)}
                                    className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors"
                                  >
                                    <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => addLadoManual(amb.id, pm.id)}
                            className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 font-mono text-[9px] uppercase tracking-widest transition-colors w-max"
                          >
                            <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                            + Adicionar lado
                          </button>
                          <label className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Área total</span>
                            <input
                              type="number" step="0.0001" min="0"
                              value={pm.area_manual}
                              onChange={e => updatePecaManual(amb.id, pm.id, 'area_manual', e.target.value)}
                              placeholder="0.0000"
                              className="w-28 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                            />
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">m²</span>
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botão + Peça */}
                <button
                  onClick={() => addPecaManual(amb.id)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest hover:text-yellow-400 hover:bg-yellow-400/5 border-t border-gray-200 dark:border-zinc-900 transition-colors"
                >
                  <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                  + Peça
                </button>

                {/* ── Produtos Avulsos ──────────────────────────────────── */}
                {amb.avulsosManual.length > 0 && (
                  <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Produtos Avulsos</div>
                    <div className="flex flex-col gap-1.5">
                      {amb.avulsosManual.map(av => (
                        <div key={av.id} className="flex items-center gap-2">
                          <span className="flex-1 text-[11px] text-gray-600 dark:text-zinc-300 font-mono min-w-0 truncate">{av.nome}</span>
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">{av.subcategoria}</span>
                          <input
                            type="number" min="1"
                            value={av.quantidade}
                            onChange={e => updateAvulsoQtd(amb.id, av.id, e.target.value)}
                            className="w-14 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-0.5 outline-none focus:border-yellow-400/50 text-right"
                          />
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 shrink-0">un</span>
                          <span className="font-mono text-[10px] text-gray-500 dark:text-zinc-400 w-20 text-right shrink-0">
                            {(av.preco * av.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <button
                            onClick={() => removeAvulsoManual(amb.id, av.id)}
                            className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                          >
                            <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seletor inline de produto avulso */}
                {avulsoSelectorAmbId === amb.id ? (
                  <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3 bg-gray-50 dark:bg-zinc-950">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Selecionar produto</div>
                    <input
                      value={buscaAvulso}
                      onChange={e => setBuscaAvulso(e.target.value)}
                      placeholder="Buscar produto..."
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1.5 outline-none focus:border-yellow-400/50 mb-2"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {produtosCatalogo
                        .filter(p => !buscaAvulso || p.nome.toLowerCase().includes(buscaAvulso.toLowerCase()) || (p.subcategoria ?? '').toLowerCase().includes(buscaAvulso.toLowerCase()))
                        .map(p => (
                          <button
                            key={p.id}
                            onClick={() => addAvulsoManual(amb.id, p)}
                            className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 text-left transition-colors"
                          >
                            <span className="font-mono text-[10px] text-gray-600 dark:text-zinc-300">{p.nome}</span>
                            <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 ml-2 shrink-0">
                              {p.subcategoria} · {(p.preco ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </button>
                        ))
                      }
                      {produtosCatalogo.filter(p => !buscaAvulso || p.nome.toLowerCase().includes(buscaAvulso.toLowerCase())).length === 0 && (
                        <div className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 py-2 text-center">Nenhum produto encontrado</div>
                      )}
                    </div>
                    <button
                      onClick={() => { setAvulsoSelectorAmbId(null); setBuscaAvulso(''); }}
                      className="mt-2 font-mono text-[9px] text-gray-500 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAvulsoSelectorAmbId(amb.id); setBuscaAvulso(''); }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-gray-500 dark:text-zinc-600 font-mono text-[9px] uppercase tracking-widest hover:text-gray-500 dark:hover:text-zinc-400 hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 border-t border-gray-200 dark:border-zinc-900 transition-colors"
                  >
                    <iconify-icon icon="solar:bag-plus-linear" width="12"></iconify-icon>
                    + Produto Avulso
                  </button>
                )}

                {/* ── Acabamentos ───────────────────────────────────────── */}
                <div className="border-t border-gray-300 dark:border-zinc-800 px-5 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-2">Acabamentos</div>
                  {amb.acabamentosManual.length > 0 && (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {amb.acabamentosManual.map(ac => (
                        <div key={ac.id} className="flex items-center gap-2 flex-wrap">
                          <select
                            value={ac.tipo}
                            onChange={e => updateAcabamentoManual(amb.id, ac.id, 'tipo', e.target.value)}
                            className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 text-[10px] font-mono px-1 py-1 outline-none focus:border-gray-400 dark:border-zinc-600 w-36 shrink-0"
                          >
                            <option value="meia_esquadria">Meia-Esquadria</option>
                            <option value="reto_simples">Reto Simples</option>
                          </select>
                          <input
                            type="number" step="0.01" min="0"
                            value={ac.ml}
                            onChange={e => updateAcabamentoManual(amb.id, ac.id, 'ml', e.target.value)}
                            placeholder="0.00"
                            className="w-24 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-[11px] font-mono px-2 py-1 outline-none focus:border-yellow-400/50 text-right"
                          />
                          <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">ml</span>
                          <button
                            onClick={() => removeAcabamentoManual(amb.id, ac.id)}
                            className="p-1 text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors"
                          >
                            <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => addAcabamentoManual(amb.id)}
                    className="flex items-center gap-1 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 font-mono text-[9px] uppercase tracking-widest transition-colors"
                  >
                    <iconify-icon icon="solar:add-circle-linear" width="11"></iconify-icon>
                    + Acabamento
                  </button>
                </div>
              </div>
            ))}

            {/* Botão + Ambiente */}
            <button
              onClick={addAmbienteManual}
              className="w-full border border-dashed border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 font-mono text-[10px] uppercase tracking-widest py-4 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400 transition-colors flex items-center justify-center gap-2"
            >
              <iconify-icon icon="solar:add-circle-linear" width="13"></iconify-icon>
              + Ambiente
            </button>
          </div>
        </main>

        {/* Footer fixo */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-20">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">
              {totalPecasValidas} peça(s) · {totalAvulsos} avulso(s)
            </div>
            <div className="text-xs text-gray-500 dark:text-zinc-500">Defina materiais na próxima etapa</div>
          </div>
          <button
            onClick={handleContinuarManual}
            className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2"
          >
            Continuar
            <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
          </button>
        </div>
      </div>
    );
  }

  const pecaPainel = pecas.find(p => p.id === painelMaterialPecaId);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#050505] text-[#a1a1aa] selection:bg-gray-200 dark:selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="hidden dark:block fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-6">
          <a href="/projetos" className="hover:text-yellow-400 transition-colors">Projetos</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <a href={`/projetos/${projetoId}`} className="hover:text-yellow-400 transition-colors">Projeto</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-gray-400 dark:text-zinc-700"></iconify-icon>
          <span className="text-gray-500 dark:text-zinc-400">Novo orçamento</span>
        </div>

        {/* ── Header ─────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-1">[ CRIAR_ORCAMENTO ]</div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">Criar orçamento</h1>
              </div>
              <button
                onClick={() => navigate(`/projetos/${projetoId}`)}
                className="flex items-center gap-2 border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors w-max"
              >
                <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                Voltar
              </button>
            </div>
          </div>
        </section>

        {/* ══ Peças da medição ══════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-100 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
              01 // Peças da medição
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700 border border-gray-200 dark:border-zinc-900 px-2 py-0.5">
              {pecasComMaterial.length}/{pecasIncluidas.length} com material
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            {loadingPecas ? (
              <div className="px-4 py-8 flex items-center justify-center gap-2 text-gray-500 dark:text-zinc-600">
                <iconify-icon icon="solar:spinner-linear" width="16" className="animate-spin"></iconify-icon>
                <span className="font-mono text-[10px] uppercase tracking-widest">Carregando peças...</span>
              </div>
            ) : pecas.length === 0 ? (
              <div className="px-4 py-12 text-center border-t border-gray-300 dark:border-zinc-800">
                <iconify-icon icon="solar:document-text-linear" width="32" className="text-gray-400 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">Nenhuma peça encontrada nesta medição</p>
                <p className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 mt-1">Verifique se a medição foi enviada corretamente pelo app.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-700"></span>
                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Peça</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Área / Esp.</span>
                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Material selecionado</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right"></span>
              </div>
              {(() => {
                // Agrupa por ambiente; peças sem ambiente ficam num grupo sem nome
                const grupos = [];
                const mapa = new Map();
                pecas.forEach(p => {
                  const amb = p.ambiente_nome ?? '';
                  if (!mapa.has(amb)) { mapa.set(amb, []); grupos.push(amb); }
                  mapa.get(amb).push(p);
                });
                const temAmbientes = grupos.some(g => g !== '');
                return grupos.map(amb => {
                  const isEditandoEsteAmb = editandoAmbNome?.amb === amb;
                  return (
                    <div key={amb}>
                      {/* ── Cabeçalho do ambiente ── */}
                      {temAmbientes && amb && (
                        <div className="border-b border-gray-300 dark:border-zinc-800 bg-gray-200/40 dark:bg-zinc-900/40">
                          {/* Linha principal: nome + botões */}
                          <div className="flex items-center gap-2 px-4 py-2.5">
                            {isEditandoEsteAmb ? (
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  autoFocus
                                  value={editandoAmbNome.novo}
                                  onChange={e => setEditandoAmbNome(prev => ({ ...prev, novo: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') confirmarRenomearAmbiente(); if (e.key === 'Escape') setEditandoAmbNome(null); }}
                                  className="flex-1 bg-gray-50 dark:bg-black border border-yellow-400/40 text-gray-900 dark:text-white text-xs font-mono px-2 py-1 outline-none min-w-0"
                                />
                                <button onClick={confirmarRenomearAmbiente} className="text-yellow-400 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-yellow-400/40 hover:bg-yellow-400/10 transition-colors shrink-0">OK</button>
                                <button onClick={() => setEditandoAmbNome(null)} className="text-gray-500 dark:text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-gray-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors shrink-0">✕</button>
                              </div>
                            ) : (
                              <span className="font-semibold text-gray-900 dark:text-white text-sm tracking-tight flex-1 min-w-0 truncate">{amb}</span>
                            )}
                            {/* 4 botões de ação */}
                            {!isEditandoEsteAmb && (
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Selecionar material para o ambiente todo — abre o PainelMaterial real */}
                                <button
                                  onClick={() => setPainelMaterialAmbNome(amb)}
                                  title="Aplicar material a todas as peças deste ambiente"
                                  className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-500 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors"
                                >
                                  <iconify-icon icon="solar:layers-linear" width="11"></iconify-icon>
                                  Material
                                </button>
                                {/* Duplicar ambiente */}
                                <button
                                  onClick={() => duplicarAmbiente(amb)}
                                  title="Duplicar ambiente"
                                  className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent hover:border-yellow-400/20 transition-colors"
                                >
                                  <iconify-icon icon="solar:copy-linear" width="12"></iconify-icon>
                                </button>
                                {/* Editar nome */}
                                <button
                                  onClick={() => setEditandoAmbNome({ amb, novo: amb })}
                                  title="Editar nome do ambiente"
                                  className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-yellow-400 hover:bg-yellow-400/10 border border-transparent hover:border-yellow-400/20 transition-colors"
                                >
                                  <iconify-icon icon="solar:pen-linear" width="12"></iconify-icon>
                                </button>
                                {/* Excluir ambiente */}
                                {grupos.length > 1 && (
                                  <button
                                    onClick={() => excluirAmbiente(amb)}
                                    title="Excluir ambiente"
                                    className="p-1.5 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-colors"
                                  >
                                    <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* ── Peças do ambiente, agrupadas por item_nome ── */}
                      {(() => {
                        const pecasDoAmb = mapa.get(amb);
                        const temItens = pecasDoAmb.some(p => p.item_nome);
                        if (!temItens) {
                          return pecasDoAmb.map(p => (
                            <PecaRow key={p.id} peca={p} onToggle={toggleIncluida} onAbrirMaterial={setPainelMaterialPecaId} onDuplicar={duplicarPecaPrincipal} todosM={materiais} />
                          ));
                        }
                        const itMap = new Map();
                        const itOrdem = [];
                        pecasDoAmb.forEach(p => {
                          const k = p.item_nome ?? '__sem_item__';
                          if (!itMap.has(k)) { itMap.set(k, []); itOrdem.push(k); }
                          itMap.get(k).push(p);
                        });
                        return itOrdem.flatMap(itemKey => {
                          const nomeItem = itemKey === '__sem_item__' ? null : itemKey;
                          return [
                            ...(nomeItem ? [
                              <div key={`item-${itemKey}`} className="flex items-center gap-2 px-4 py-1.5 bg-gray-200/20 dark:bg-zinc-900/20 border-b border-gray-200 dark:border-zinc-900/60">
                                <iconify-icon icon="solar:folder-linear" width="10" className="text-gray-400 dark:text-zinc-700 shrink-0"></iconify-icon>
                                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 uppercase tracking-widest">{nomeItem}</span>
                              </div>
                            ] : []),
                            ...itMap.get(itemKey).map(p => (
                              <PecaRow key={p.id} peca={p} onToggle={toggleIncluida} onAbrirMaterial={setPainelMaterialPecaId} onDuplicar={duplicarPecaPrincipal} todosM={materiais} />
                            )),
                          ];
                        });
                      })()}
                    </div>
                  );
                });
              })()}
              </>
            )}
          </div>
        </div>

        {/* ══ Produtos avulsos ══════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-gray-900 dark:text-white uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1">
              02 // Produtos avulsos
            </div>
            <button
              onClick={() => setModalProduto(true)}
              className="flex items-center gap-1.5 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
              Adicionar produto
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800">
            {produtos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <iconify-icon icon="solar:box-linear" width="32" className="text-gray-400 dark:text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-700">Nenhum produto adicionado</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 px-4 py-2.5 border-b border-gray-300 dark:border-zinc-800">
                  <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Produto</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-center">Qtd.</span>
                  <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Valor unit.</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600 text-right">Subtotal</span>
                </div>
                {produtos.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-gray-200 dark:border-zinc-900 last:border-b-0 group hover:bg-white/[0.01] transition-colors">
                    <div className="col-span-5 min-w-0 pr-2">
                      <span className="text-sm text-gray-900 dark:text-white font-medium truncate block">{p.nome}</span>
                      <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600">{p.subcategoria}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{p.qty}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{fmt(p.preco)}</span>
                    </div>
                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="font-mono text-[11px] text-gray-600 dark:text-zinc-300">{fmt(p.preco * p.qty)}</span>
                      <button
                        onClick={() => removerProduto(i)}
                        className="text-gray-400 dark:text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 p-1"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </main>

      {/* ── Footer fluxo normal ──────────────────────────────────── */}
      <div className="mt-auto w-full bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-300 dark:border-zinc-800 px-6 py-4 relative z-20">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Total estimado</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tighter">{fmt(total)}</span>
              {precisaVersoes && (
                <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 border border-gray-300 dark:border-zinc-800 px-1.5 py-0.5">
                  {pecasComMaterial.length} mat. · múltiplas versões
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pecasComMaterial.length < pecasIncluidas.length && (
              <span className="font-mono text-[9px] text-gray-500 dark:text-zinc-600 hidden sm:block">
                {pecasIncluidas.length - pecasComMaterial.length} peça{pecasIncluidas.length - pecasComMaterial.length !== 1 ? 's' : ''} sem material
              </span>
            )}
            <button
              onClick={handleContinuar}
              disabled={pecasComMaterial.length === 0}
              className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {precisaVersoes ? (
                <>
                  <iconify-icon icon="solar:layers-minimalistic-linear" width="14"></iconify-icon>
                  Criar versões
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:arrow-right-linear" width="14"></iconify-icon>
                  Continuar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Painel lateral: material (versões por ambiente) ─ */}
      {/* ── Painel lateral: material por peça ───────── */}
      {painelMaterialPecaId && pecaPainel && (
        <PainelMaterial
          pecaId={pecaPainel.id}
          pecaNome={pecaPainel.nome}
          selecionados={pecaPainel.materiais}
          onConfirmar={confirmarMaterial}
          onFechar={() => setPainelMaterialPecaId(null)}
          todosM={materiais}
        />
      )}

      {/* ── Painel lateral: material por ambiente ────── */}
      {painelMaterialAmbNome && (
        <PainelMaterial
          pecaId={painelMaterialAmbNome}
          pecaNome={`${painelMaterialAmbNome} — todas as peças`}
          selecionados={[...new Set(pecas.filter(p => p.ambiente_nome === painelMaterialAmbNome).flatMap(p => p.materiais))]}
          onConfirmar={(_, sel) => aplicarMaterialAoAmbiente(painelMaterialAmbNome, sel)}
          onFechar={() => setPainelMaterialAmbNome(null)}
          todosM={materiais}
        />
      )}

      {/* ── Modal: produto avulso ────────────────────── */}
      {modalProduto && (
        <ModalProdutoAvulso
          onConfirmar={adicionarProduto}
          onFechar={() => setModalProduto(false)}
        />
      )}

      {/* ── Modal: criar versões ─────────────────────── */}
      {modalVersoes && (
        <ModalVersoes
          pecas={pecas}
          onCriar={handleCriarVersoes}
          onFechar={() => setModalVersoes(false)}
          todosM={materiais}
        />
      )}
    </div>
  );
}
