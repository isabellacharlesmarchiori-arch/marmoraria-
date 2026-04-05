import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

// Valida que um valor é um UUID v4 real — rejeita null, undefined, string 'null', string vazia
function isValidUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PECAS = [
  { id: 'p1', nome: 'Bancada Principal',    area_liq: 2.34, acabamento_ml: 3.20, tipo_acabamento: 'meia_esquadria', cortes: 2, espessura: 3, incluida: true,  materiais: [] },
  { id: 'p2', nome: 'Lateral Esquerda',     area_liq: 0.72, acabamento_ml: 1.80, tipo_acabamento: 'reto_simples',  cortes: 1, espessura: 3, incluida: true,  materiais: [] },
  { id: 'p3', nome: 'Lateral Direita',      area_liq: 0.72, acabamento_ml: 1.80, tipo_acabamento: 'reto_simples',  cortes: 1, espessura: 3, incluida: true,  materiais: [] },
  { id: 'p4', nome: 'Cuba Embutida',        area_liq: 0.18, acabamento_ml: 0.00, tipo_acabamento: null,            cortes: 4, espessura: 2, incluida: false, materiais: [] },
  { id: 'p5', nome: 'Splash (Espelho)',     area_liq: 0.48, acabamento_ml: 2.40, tipo_acabamento: 'reto_simples',  cortes: 0, espessura: 1, incluida: true,  materiais: [] },
];

const MOCK_MATERIAIS = [
  { id: 'm1', nome: 'Silestone Eternal Calacatta Gold', categoria: 'quartzito', preco_2cm: 820, preco_3cm: 980,  cor: 'Branco/Dourado' },
  { id: 'm2', nome: 'Granito São Gabriel',              categoria: 'granito',   preco_2cm: 180, preco_3cm: 220,  cor: 'Cinza/Preto'   },
  { id: 'm3', nome: 'Mármore Carrara C',                categoria: 'marmore',   preco_2cm: 560, preco_3cm: 720,  cor: 'Branco/Cinza'  },
  { id: 'm4', nome: 'Dekton Entzo',                     categoria: 'porcelanato', preco_2cm: 650, preco_3cm: null, cor: 'Branco'      },
  { id: 'm5', nome: 'Granito Preto São Gabriel',        categoria: 'granito',   preco_2cm: 200, preco_3cm: 240,  cor: 'Preto'         },
  { id: 'm6', nome: 'Travertino Romano Classico',       categoria: 'marmore',   preco_2cm: 480, preco_3cm: 610,  cor: 'Bege/Ocre'     },
  { id: 'm7', nome: 'Quartzito Taj Mahal',              categoria: 'quartzito', preco_2cm: 890, preco_3cm: 1080, cor: 'Branco/Dourado' },
  { id: 'm8', nome: 'Porcelanato Cemento Grigio',       categoria: 'porcelanato', preco_2cm: 310, preco_3cm: null, cor: 'Cinza'       },
];

const MOCK_PRODUTOS_CATALOGO = [
  { id: 'pr1', nome: 'Sifão Válvula Americana Inox',  subcategoria: 'Hidráulico', preco: 89.90  },
  { id: 'pr2', nome: 'Cola Epóxi Bicomponente 400ml', subcategoria: 'Fixação',   preco: 42.00  },
  { id: 'pr3', nome: 'Perfil Alumínio Brilho 3m',     subcategoria: 'Perfil',    preco: 65.00  },
  { id: 'pr4', nome: 'Suporte Oculto 20cm (par)',     subcategoria: 'Suporte',   preco: 38.50  },
  { id: 'pr5', nome: 'Frete e Instalação',            subcategoria: 'Serviço',   preco: 350.00 },
];

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function precoPeca(peca, materialId, todosM) {
  if (!materialId) return 0;
  const m = todosM.find(x => x.id === materialId);
  if (!m) return 0;
  const preco = peca.espessura >= 3 ? (m.preco_3cm ?? m.preco_2cm) : m.preco_2cm;
  return peca.area_liq * preco;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PecaRow({ peca, onToggle, onAbrirMaterial, onDuplicar, todosM }) {
  const temMaterial = peca.materiais.length > 0;
  return (
    <div className={`grid grid-cols-12 items-center px-4 py-3.5 border-b border-zinc-900 last:border-b-0 group transition-colors ${peca.incluida ? '' : 'opacity-40'}`}>
      {/* Toggle */}
      <div className="col-span-1 flex items-center">
        <button
          onClick={() => onToggle(peca.id)}
          className={`w-4 h-4 border flex items-center justify-center transition-colors ${peca.incluida ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-zinc-700 text-zinc-700 hover:border-zinc-500'}`}
          title={peca.incluida ? 'Excluir peça' : 'Incluir peça'}
        >
          {peca.incluida && <iconify-icon icon="solar:check-read-linear" width="10"></iconify-icon>}
        </button>
      </div>

      {/* Nome */}
      <div className="col-span-3 min-w-0 pr-2">
        <span className="text-sm text-white font-medium truncate block">{peca.nome}</span>
        {peca.tipo_acabamento && (
          <span className="font-mono text-[9px] text-zinc-600">{ACABAMENTO_LABEL[peca.tipo_acabamento]} · {peca.acabamento_ml.toFixed(2)}ml</span>
        )}
      </div>

      {/* Área / espessura */}
      <div className="col-span-2 pr-2">
        <span className="font-mono text-[11px] text-zinc-300">{peca.area_liq.toFixed(2)} m²</span>
        <div className="font-mono text-[9px] text-zinc-600">{peca.espessura}cm · {peca.cortes} corte{peca.cortes !== 1 ? 's' : ''}</div>
      </div>

      {/* Material(is) selecionado(s) */}
      <div className="col-span-4 pr-2">
        {peca.materiais.length === 0 ? (
          <span className="font-mono text-[10px] text-zinc-700 italic">Nenhum material</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {peca.materiais.map(mid => {
              const m = todosM.find(x => x.id === mid);
              return m ? (
                <span key={mid} className="font-mono text-[10px] text-zinc-300 truncate">{m.nome}</span>
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
            className="font-mono text-[9px] uppercase tracking-widest px-2 py-1.5 border border-zinc-700 text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 transition-colors flex items-center justify-center shrink-0"
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
                : 'border-zinc-700 text-zinc-500 hover:border-yellow-400/30 hover:text-yellow-400'
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

function PainelMaterial({ pecaId, pecaNome, selecionados, onConfirmar, onFechar, todosM }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [sel, setSel] = useState(selecionados);

  const filtrados = useMemo(() => todosM.filter(m => {
    const matchBusca = busca === '' || m.nome.toLowerCase().includes(busca.toLowerCase()) || (m.cor ?? '').toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoria === 'todos' || m.categoria === categoria;
    return matchBusca && matchCat;
  }), [busca, categoria, todosM]);

  function toggle(id) {
    setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/60" onClick={onFechar}></div>

      {/* Painel lateral direito */}
      <div className="w-full max-w-sm bg-[#0a0a0a] border-l border-zinc-800 flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-1">[ SELECIONAR_MATERIAL ]</div>
            <h3 className="text-base font-semibold text-white leading-tight">{pecaNome}</h3>
          </div>
          <button onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors mt-0.5 shrink-0">
            <iconify-icon icon="solar:close-circle-linear" width="18"></iconify-icon>
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 pt-4 pb-3 border-b border-zinc-900">
          <div className="relative flex items-center mb-3">
            <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-600 text-xs pointer-events-none"></iconify-icon>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar material..."
              className="w-full bg-black border border-zinc-800 text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-zinc-700 transition-colors"
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
                    : 'border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400'
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
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum material</p>
            </div>
          ) : (
            filtrados.map(m => {
              const ativo = sel.includes(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b border-zinc-900 transition-colors hover:bg-white/[0.02] ${ativo ? 'bg-yellow-400/[0.03]' : ''}`}
                >
                  {/* Checkbox */}
                  <div className={`w-3.5 h-3.5 border shrink-0 flex items-center justify-center transition-colors ${ativo ? 'border-yellow-400 bg-yellow-400' : 'border-zinc-700'}`}>
                    {ativo && <iconify-icon icon="solar:check-read-linear" width="9" className="text-black"></iconify-icon>}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-medium truncate">{m.nome}</div>
                    <div className="font-mono text-[9px] text-zinc-600">{m.cor} · {m.categoria}</div>
                  </div>
                  {/* Preço */}
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[10px] text-zinc-300">{fmt(m.preco_2cm)}<span className="text-zinc-600">/m²·2cm</span></div>
                    {m.preco_3cm && (
                      <div className="font-mono text-[9px] text-zinc-600">{fmt(m.preco_3cm)}<span className="text-zinc-700">/3cm</span></div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600 flex-1">{sel.length} selecionado{sel.length !== 1 ? 's' : ''}</span>
          <button
            onClick={onFechar}
            className="border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:border-zinc-600 hover:text-white transition-colors"
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

function ModalProdutoAvulso({ onConfirmar, onFechar, produtosCatalogo = [] }) {
  const [busca, setBusca] = useState('');
  const [prodSel, setProdSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [precoCustom, setPrecoCustom] = useState('');

  const catalogo = produtosCatalogo.length > 0 ? produtosCatalogo : MOCK_PRODUTOS_CATALOGO;

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
      <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ PRODUTO_AVULSO ]</div>
            <h3 className="text-base font-semibold text-white">Adicionar produto</h3>
          </div>
          <button onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors p-1">
            <iconify-icon icon="solar:close-linear" width="18"></iconify-icon>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Busca */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1.5">Produto</label>
            <div className="relative flex items-center mb-2">
              <iconify-icon icon="solar:magnifer-linear" className="absolute left-3 text-zinc-600 text-xs pointer-events-none"></iconify-icon>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar produto ou categoria..."
                className="w-full bg-black border border-zinc-800 text-white text-[12px] font-mono pl-8 pr-3 py-2 rounded-none outline-none focus:border-yellow-400 placeholder:text-zinc-700 transition-colors"
              />
            </div>
            <div className="bg-black border border-zinc-800 max-h-36 overflow-y-auto">
              {filtrados.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelecionar(p)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-zinc-900 last:border-b-0 hover:bg-white/[0.02] transition-colors ${prodSel?.id === p.id ? 'bg-yellow-400/[0.04]' : ''}`}
                >
                  <div>
                    <div className="text-xs text-white">{p.nome}</div>
                    <div className="font-mono text-[9px] text-zinc-600">{p.subcategoria}</div>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400">{fmt(p.preco)}</span>
                </div>
              ))}
            </div>
          </div>

          {prodSel && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1.5">Qtd.</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-black border border-zinc-800 text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1.5">Valor unit. (R$)</label>
                <input
                  value={precoCustom}
                  onChange={e => setPrecoCustom(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-white text-sm font-mono px-3 py-2.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                />
              </div>
            </div>
          )}

          {prodSel && (
            <div className="border border-zinc-800 bg-zinc-950/50 px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Subtotal</span>
              <span className="font-mono text-sm text-white">{fmt(preco * qty)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onFechar} className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-2.5 hover:border-zinc-600 hover:text-white transition-colors">
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
      <div className="relative bg-[#0a0a0a] border border-zinc-800 w-full max-w-lg z-10 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">[ CRIAR_VERSOES ]</div>
            <h3 className="text-base font-semibold text-white">Criar versões de orçamento</h3>
          </div>
          <button onClick={onFechar} className="text-zinc-600 hover:text-white transition-colors p-1">
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
                className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${modo === opt.key ? 'border-yellow-400/40 bg-yellow-400/[0.03]' : 'border-zinc-800 hover:border-zinc-700'}`}
              >
                <div className={`w-5 h-5 border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${modo === opt.key ? 'border-yellow-400 bg-yellow-400' : 'border-zinc-700'}`}>
                  {modo === opt.key && <iconify-icon icon="solar:check-read-linear" width="10" className="text-black"></iconify-icon>}
                </div>
                <div className="flex items-start gap-2 flex-1">
                  <iconify-icon icon={opt.icon} width="14" className={`mt-0.5 shrink-0 ${modo === opt.key ? 'text-yellow-400' : 'text-zinc-600'}`}></iconify-icon>
                  <div>
                    <div className={`text-xs font-medium transition-colors ${modo === opt.key ? 'text-white' : 'text-zinc-300'}`}>{opt.titulo}</div>
                    <div className="font-mono text-[9px] text-zinc-600 mt-0.5 leading-relaxed">{opt.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Manual: configuração */}
          {modo === 'manual' && (
            <div className="flex flex-col gap-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Versões</div>
              {versoesManual.map((v, vIdx) => (
                <div key={vIdx} className="border border-zinc-800 p-3 flex flex-col gap-2 relative">
                  <div className="flex gap-2 items-center">
                    <input
                      value={v.nome}
                      onChange={e => setVersaoManualNome(vIdx, e.target.value)}
                      className="flex-1 bg-black border border-zinc-800 text-white text-sm font-mono px-3 py-2 rounded-none outline-none focus:border-yellow-400 transition-colors"
                      placeholder="Nome da versão"
                    />
                    <button
                      type="button"
                      onClick={() => duplicarVersaoManual(vIdx)}
                      className="border border-zinc-800 text-zinc-500 hover:text-yellow-400 hover:border-yellow-400 px-3 py-2 transition-colors flex items-center justify-center"
                      title="Duplicar versão"
                    >
                      <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                    </button>
                    {versoesManual.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerVersaoManual(vIdx)}
                        className="border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-400 px-3 py-2 transition-colors flex items-center justify-center"
                        title="Remover versão"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                      </button>
                    )}
                  </div>
                  {pecasIncluidas.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-zinc-500 w-28 shrink-0 truncate">{p.nome}</span>
                      <select
                        value={v.mats[p.id] ?? ''}
                        onChange={e => setVersaoManualMat(vIdx, p.id, e.target.value)}
                        className="flex-1 bg-black border border-zinc-800 text-white text-[11px] font-mono px-2 py-1.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
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
                className="border border-dashed border-zinc-800 text-zinc-600 font-mono text-[9px] uppercase tracking-widest py-2 hover:border-zinc-600 hover:text-zinc-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
                Adicionar versão
              </button>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3">
            <button type="button" onClick={onFechar} className="flex-1 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-zinc-600 hover:text-white transition-colors">
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

function TelaVersoes({ versoes: initialVersoes, pecas, produtos, produtosCatalogo, onSalvar, onVoltar, todosM }) {
  // Convert initial props to state so we can mutate versions and pieces independently
  const [versoes, setVersoes] = useState(() => {
    return initialVersoes.map((v, vIdx) => ({
      id: `v-${Date.now()}-${vIdx}`,
      nome: v.nome,
      pecasList: pecas.filter(p => p.incluida).map(p => ({
        uid: `${p.id}-${Math.random()}`,
        idBase: p.id,
        nome: p.nome,
        matId: v.mats[p.id],
      })),
      // Cada versão inicia com cópia dos avulsos globais — pode divergir depois
      avulsos: (produtos ?? []).map(p => ({
        uid: `av-${Math.random()}`,
        produtoId: p.id,
        nome: p.nome,
        subcategoria: p.subcategoria ?? '',
        qty: p.qty ?? 1,
        valorUnit: p.preco ?? 0,
      })),
    }));
  });

  // versão em modo edição expandida (nome/material por peça)
  const [versaoEditandoId, setVersaoEditandoId] = useState(null);
  // qual versão está com o modal de + produto aberto
  const [modalAvulsoPorVersaoId, setModalAvulsoPorVersaoId] = useState(null);
  // avulso sendo editado inline por versão: { versaoId, uid }
  const [editandoAvulso, setEditandoAvulso] = useState(null);

  function totalVersao(v) {
    const pecasTotal = v.pecasList.reduce((s, pWrapper) => {
      const pOriginal = pecas.find(p => p.id === pWrapper.idBase);
      if (!pOriginal) return s;
      return s + precoPeca(pOriginal, pWrapper.matId, todosM);
    }, 0);
    const avulsosTotal = (v.avulsos ?? []).reduce((s, a) => s + (a.valorUnit * a.qty), 0);
    return pecasTotal + avulsosTotal;
  }

  function atualizaNome(idx, nome) {
    setVersoes(prev => prev.map((v, i) => i === idx ? { ...v, nome } : v));
  }

  function duplicarVersao(idx) {
    setVersoes(prev => {
      const clone = JSON.parse(JSON.stringify(prev[idx]));
      clone.id = `v-${Date.now()}`;
      clone.nome = `${clone.nome} (Cópia)`;
      clone.pecasList = clone.pecasList.map(p => ({ ...p, uid: `${p.idBase}-${Math.random()}` }));
      clone.avulsos = (clone.avulsos ?? []).map(a => ({ ...a, uid: `av-${Math.random()}` }));
      const novaLista = [...prev];
      novaLista.splice(idx + 1, 0, clone);
      return novaLista;
    });
  }

  function removerVersao(idx) {
    setVersoes(prev => prev.filter((_, i) => i !== idx));
  }

  function duplicarPeca(vId, pUid) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      const pecaIndex = v.pecasList.findIndex(p => p.uid === pUid);
      if (pecaIndex === -1) return v;
      const clone = { ...v.pecasList[pecaIndex], uid: `${v.pecasList[pecaIndex].idBase}-${Math.random()}`, nome: `${v.pecasList[pecaIndex].nome} (Cópia)` };
      const newList = [...v.pecasList];
      newList.splice(pecaIndex + 1, 0, clone);
      return { ...v, pecasList: newList };
    }));
  }

  function removerPeca(vId, pUid) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, pecasList: v.pecasList.filter(p => p.uid !== pUid) };
    }));
  }

  // ── Edição por peça dentro de uma versão ───────────────────────
  function editarPecaNome(vId, pUid, nome) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, pecasList: v.pecasList.map(p => p.uid === pUid ? { ...p, nome } : p) };
    }));
  }

  function editarPecaMat(vId, pUid, matId) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, pecasList: v.pecasList.map(p => p.uid === pUid ? { ...p, matId } : p) };
    }));
  }

  // ── Avulsos por versão ──────────────────────────────────────────
  function adicionarAvulsoVersao(vId, prod) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      const novoAvulso = {
        uid: `av-${Math.random()}`,
        produtoId: prod.id,
        nome: prod.nome,
        subcategoria: prod.subcategoria ?? '',
        qty: prod.qty ?? 1,
        valorUnit: prod.preco ?? 0,
      };
      return { ...v, avulsos: [...(v.avulsos ?? []), novoAvulso] };
    }));
    setModalAvulsoPorVersaoId(null);
  }

  function removerAvulsoVersao(vId, aUid) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, avulsos: (v.avulsos ?? []).filter(a => a.uid !== aUid) };
    }));
  }

  function editarAvulsoQty(vId, aUid, qty) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, qty: Math.max(1, parseInt(qty) || 1) } : a) };
    }));
  }

  function editarAvulsoValor(vId, aUid, valor) {
    setVersoes(prev => prev.map(v => {
      if (v.id !== vId) return v;
      return { ...v, avulsos: (v.avulsos ?? []).map(a => a.uid === aUid ? { ...a, valorUnit: parseFloat(valor.replace(',', '.')) || 0 } : a) };
    }));
  }

  // 🔥 Fix: IntersectionObserver para a tela de versões
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('sys-active'); }),
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    const timeout = setTimeout(() => {
      document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
    }, 10);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

        {/* ── Header ──────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
                  10 // Versões do Orçamento
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tighter">Versões geradas</h1>
              </div>
              <button
                onClick={onVoltar}
                className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors w-max"
              >
                <iconify-icon icon="solar:arrow-left-linear" width="13"></iconify-icon>
                Voltar
              </button>
            </div>
          </div>
        </section>

        {/* ── Versões ──────────────────────────────────────────────── */}
        <div className="sys-reveal sys-delay-100">
          <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1 mb-3">
            01 // Versões
          </div>

          <div className="flex flex-col gap-4">
            {versoes.map((v, idx) => {
              const isEditando = versaoEditandoId === v.id;
              return (
              <div key={v.id} className={`bg-[#0a0a0a] border transition-colors ${isEditando ? 'border-yellow-400/30' : 'border-zinc-800'}`}>
                {/* Cabeçalho da versão */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                  <span className="font-mono text-[9px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-2 py-0.5 shrink-0">V{idx + 1}</span>
                  <input
                    value={v.nome}
                    onChange={e => atualizaNome(idx, e.target.value)}
                    className="flex-1 bg-transparent border-b border-zinc-800 focus:border-yellow-400 text-white text-sm font-medium outline-none py-0.5 transition-colors min-w-0"
                  />
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm text-yellow-400 hidden sm:block">{fmt(totalVersao(v))}</span>
                    <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
                      <button
                        onClick={() => setVersaoEditandoId(isEditando ? null : v.id)}
                        title={isEditando ? 'Fechar edição' : 'Editar versão'}
                        className={`p-1.5 transition-colors flex items-center justify-center rounded ${isEditando ? 'text-yellow-400 bg-yellow-400/10' : 'text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                      >
                        <iconify-icon icon={isEditando ? 'solar:close-circle-linear' : 'solar:pen-linear'} width="14"></iconify-icon>
                      </button>
                      <button onClick={() => duplicarVersao(idx)} title="Duplicar versão" className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors flex items-center justify-center rounded">
                        <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                      </button>
                      {versoes.length > 1 && (
                        <button onClick={() => removerVersao(idx)} title="Remover versão" className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center rounded">
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Peças */}
                <div className="p-4 flex flex-col gap-2 bg-[#0a0a0a]">
                  {isEditando && (
                    <div className="text-[9px] font-mono uppercase tracking-widest text-yellow-400/70 mb-1 flex items-center gap-1.5">
                      <iconify-icon icon="solar:pen-linear" width="10"></iconify-icon>
                      Modo edição — altere o nome e material de cada peça
                    </div>
                  )}
                  {v.pecasList.map(pWrapper => {
                    const pOriginal = pecas.find(p => p.id === pWrapper.idBase);
                    if (!pOriginal) return null;
                    const matId = pWrapper.matId;
                    const mat = todosM.find(m => m.id === matId);
                    const subtotal = precoPeca(pOriginal, matId, todosM);

                    return (
                      <div key={pWrapper.uid} className={`flex flex-col gap-2 p-3 border bg-black transition-colors ${isEditando ? 'border-yellow-400/20 bg-yellow-400/[0.01]' : 'border-zinc-800 hover:border-zinc-700'}`}>
                        {isEditando ? (
                          /* ── Modo edição ── */
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-5 bg-yellow-400/30 shrink-0"></div>
                              <input
                                value={pWrapper.nome}
                                onChange={e => editarPecaNome(v.id, pWrapper.uid, e.target.value)}
                                className="flex-1 bg-black border border-zinc-800 focus:border-yellow-400 text-white text-xs font-mono px-2 py-1.5 outline-none transition-colors"
                                placeholder="Nome da peça"
                              />
                              <span className="font-mono text-xs text-zinc-500 shrink-0">{subtotal > 0 ? fmt(subtotal) : '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 pl-3">
                              <span className="font-mono text-[9px] text-zinc-600 w-20 shrink-0">Material</span>
                              <select
                                value={pWrapper.matId ?? ''}
                                onChange={e => editarPecaMat(v.id, pWrapper.uid, e.target.value)}
                                className="flex-1 bg-black border border-zinc-800 text-white text-[11px] font-mono px-2 py-1.5 rounded-none outline-none focus:border-yellow-400 transition-colors"
                              >
                                <option value="">— Sem material —</option>
                                {todosM.map(m => (
                                  <option key={m.id} value={m.id}>{m.nome}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          /* ── Modo visualização ── */
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-1 h-5 bg-zinc-800"></div>
                              <div>
                                <div className="text-xs text-white font-medium">{pWrapper.nome}</div>
                                <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{mat?.nome ?? <span className="italic text-zinc-700">Sem material</span>}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                              <span className="font-mono text-xs text-zinc-400">{subtotal > 0 ? fmt(subtotal) : '—'}</span>
                              <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-4">
                                <button onClick={() => duplicarPeca(v.id, pWrapper.uid)} title="Duplicar peça" className="p-1.5 text-zinc-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors flex items-center justify-center">
                                  <iconify-icon icon="solar:copy-linear" width="14"></iconify-icon>
                                </button>
                                <button onClick={() => removerPeca(v.id, pWrapper.uid)} title="Remover peça" className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors flex items-center justify-center">
                                  <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Produtos avulsos por versão ── */}
                <div className="border-t border-zinc-900 px-4 pb-4 pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Produtos avulsos</span>
                    <button
                      onClick={() => setModalAvulsoPorVersaoId(v.id)}
                      className="flex items-center gap-1 border border-zinc-800 text-zinc-500 text-[9px] font-mono uppercase tracking-widest px-2 py-1 hover:border-yellow-400/40 hover:text-yellow-400 transition-colors"
                    >
                      <iconify-icon icon="solar:add-circle-linear" width="10"></iconify-icon>
                      Produto
                    </button>
                  </div>
                  {(v.avulsos ?? []).length === 0 ? (
                    <div className="text-center py-3">
                      <span className="font-mono text-[9px] text-zinc-700 italic">Nenhum produto avulso</span>
                    </div>
                  ) : (
                    (v.avulsos ?? []).map(a => (
                      <div key={a.uid} className="flex items-center gap-2 p-2 border border-zinc-900 bg-black group">
                        <div className="w-1 h-4 bg-zinc-800 shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-300 truncate">{a.nome}</div>
                          <div className="font-mono text-[9px] text-zinc-600">{a.subcategoria}</div>
                        </div>
                        {editandoAvulso?.versaoId === v.id && editandoAvulso?.uid === a.uid ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min="1" value={a.qty}
                              onChange={e => editarAvulsoQty(v.id, a.uid, e.target.value)}
                              className="w-14 bg-black border border-zinc-700 text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400 text-center"
                            />
                            <input
                              value={String(a.valorUnit).replace('.', ',')}
                              onChange={e => editarAvulsoValor(v.id, a.uid, e.target.value)}
                              className="w-24 bg-black border border-zinc-700 text-white text-xs font-mono px-2 py-1 outline-none focus:border-yellow-400"
                              placeholder="0,00"
                            />
                            <button onClick={() => setEditandoAvulso(null)} className="text-yellow-400 p-1 hover:bg-yellow-400/10 transition-colors">
                              <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-zinc-400">{a.qty}x {fmt(a.valorUnit)}</span>
                            <span className="font-mono text-[10px] text-white">{fmt(a.qty * a.valorUnit)}</span>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditandoAvulso({ versaoId: v.id, uid: a.uid })} title="Editar" className="p-1 text-zinc-600 hover:text-yellow-400 transition-colors">
                                <iconify-icon icon="solar:pen-linear" width="12"></iconify-icon>
                              </button>
                              <button onClick={() => removerAvulsoVersao(v.id, a.uid)} title="Remover" className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
                                <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* Footer fluxo normal */}
      <div className="mt-auto w-full bg-[#0a0a0a] border-t border-zinc-800 px-6 py-4 flex items-center justify-between relative z-20">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{versoes.length} versão{versoes.length !== 1 ? 'ões' : ''}</div>
          <div className="text-xs text-zinc-400">Renomeie e salve o orçamento</div>
        </div>
        <button
          onClick={() => onSalvar(versoes)}
          className="bg-yellow-400 text-black font-mono text-[11px] uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all font-bold flex items-center gap-2 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <iconify-icon icon="solar:check-circle-linear" width="14"></iconify-icon>
          Salvar orçamento
        </button>
      </div>

      {/* Modal: adicionar produto avulso por versão */}
      {modalAvulsoPorVersaoId && (
        <ModalProdutoAvulso
          produtosCatalogo={produtosCatalogo}
          onConfirmar={(prod) => adicionarAvulsoVersao(modalAvulsoPorVersaoId, prod)}
          onFechar={() => setModalAvulsoPorVersaoId(null)}
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
  const [produtos, setProdutos] = useState([]);     // itens avulsos adicionados pelo usuário no passo 1
  const [produtosCatalogo, setProdutosCatalogo] = useState([]); // catálogo bruto do Supabase
  const [bulkMaterialId, setBulkMaterialId] = useState('');     // bulk action: material único 

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

  // Busca peças reais do Supabase, com fallback para mock
  useEffect(() => {
    const ambienteId = searchParams.get('ambiente_id');
    const medicaoId  = searchParams.get('medicao_id');
    
    setPecas([]);
    setLoadingPecas(true);

    async function fetchPecas() {
      try {
        console.log("DEBUG: Iniciando fetchPecas() com URL Params:", { ambienteId, medicaoId });
        let query = supabase
          .from('pecas')
          .select('id, nome_livre, area_liquida_m2, espessura_cm, arestas, recortes, incluida, ambientes(id, nome)')
          .order('created_at');

        if (ambienteId) {
          query = query.eq('ambiente_id', ambienteId);
        } else if (medicaoId) {
          query = query.eq('ambientes.medicao_id', medicaoId);
        }

        const { data, error } = await query;

        if (error) {
          console.error(`ERRO CRÍTICO SUPABASE: ${error.message} - Detalhes: ${error.details}`);
        }
        
        console.log("DEBUG: Dados retornados do banco:", data);

        const fetchedPecas = (data ?? []).map(p => {
          const arestas = p.arestas ?? {};
          let acabamento_ml = 0;
          let tipo_acabamento = null;
          for (const a of Object.values(arestas)) {
            if (a.acabamento && a.acabamento !== 'sem_acabamento') {
              acabamento_ml += (a.comprimento_cm ?? 0) / 100;
              if (!tipo_acabamento) tipo_acabamento = a.acabamento;
            }
          }
          return {
            id:              p.id,
            nome:            p.nome_livre,
            area_liq:        p.area_liquida_m2 ?? 0,
            acabamento_ml:   parseFloat(acabamento_ml.toFixed(2)),
            tipo_acabamento,
            cortes:          Array.isArray(p.recortes) ? p.recortes.length : 0,
            espessura:       p.espessura_cm ?? 2,
            incluida:        p.incluida ?? true,
            materiais:       [],
          };
        });
        
        const pecasFinais = fetchedPecas.length > 0 ? fetchedPecas : MOCK_PECAS;
        console.log("DEBUG: Peças que serão exibidas na tela:", pecasFinais);
        setPecas(pecasFinais);
      } catch (err) {
        console.error("DEBUG: Exceção JS detectada dentro de fetchPecas():", err);
        setPecas(MOCK_PECAS);
      } finally {
        setLoadingPecas(false);
      }
    }

    if (ambienteId || medicaoId) {
      fetchPecas();
    } else {
      setPecas(MOCK_PECAS);
      setLoadingPecas(false);
    }
  }, [searchParams.get('ambiente_id'), searchParams.get('medicao_id'), projetoId]);

  const [painelMaterialPecaId, setPainelMaterialPecaId] = useState(null);
  const [modalProduto, setModalProduto] = useState(false);
  const [modalVersoes, setModalVersoes] = useState(false);
  const [versoesCriadas, setVersoesCriadas] = useState(null);

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

  async function handleSalvar(versoesFinais) {
    const isUsingMockData = pecas.some(p => p.id === 'p1');
    if (isUsingMockData) {
      alert("Aviso: As peças exibidas são temporárias (MOCK) e não existem no banco de dados. O orçamento não salvará no banco de dados para evitar inconsistências, mas o projeto será redirecionado para concluir o teste visual do fluxo.");
      navigate(`/projetos/${projetoId ?? '1'}`);
      return;
    }

    let finalAmbienteId = searchParams.get('ambiente_id');
    const medicaoId  = searchParams.get('medicao_id');
    const vendedorId = session?.user?.id ?? null;
    const empresaId  = profile?.empresa_id ?? null;

    if (!isValidUUID(finalAmbienteId) && isValidUUID(medicaoId)) {
      const { data: ambData } = await supabase.from('ambientes').select('id').eq('medicao_id', medicaoId).single();
      if (ambData) finalAmbienteId = ambData.id;
    }

    // ── Validação estrita de UUIDs antes de qualquer insert ─────────────────
    if (!isValidUUID(empresaId))  { 
      alert("Erro Crítico: empresa_id ausente. Você precisa estar logado em uma empresa válida.");
      return; 
    }
    if (!isValidUUID(vendedorId)) { 
      alert("Erro Crítico: vendedor_id ausente. Sessão inválida.");
      return; 
    }
    if (!isValidUUID(finalAmbienteId)) { 
      alert("Erro Crítico: ambiente_id ausente. Este orçamento não pode ser gerado porque a medição atual não está vinculada a um ambiente válido no banco.");
      return; 
    }

    const pecasIncluidas = pecas.filter(p => p.incluida);

    try {
      for (const versao of versoesFinais) {
        const valorPecas   = versao.pecasList.reduce((s, pWrapper) => {
          const pOrig = pecas.find(p => p.id === pWrapper.idBase);
          return s + (pOrig ? precoPeca(pOrig, pWrapper.matId, materiais) : 0);
        }, 0);
        const valorAvulsos = produtos.reduce((s, p) => s + p.preco * p.qty, 0);
        const valorTotal   = valorPecas + valorAvulsos;

        // 1. Insert em orcamentos — colunas em snake_case conforme SPEC
        const dadosOrcamento = {
          empresa_id:     empresaId,
          ambiente_id:    finalAmbienteId,
          vendedor_id:    vendedorId,
          nome_versao:    versao.nome,
          status:         'rascunho',
          desconto_total: 0,
          valor_total:    valorTotal,
        };
        console.log('DADOS ENVIADOS (orcamentos):', dadosOrcamento);

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

        // 2. Insert em orcamento_pecas
        const pecasRows = [];
        for (const pWrapper of versao.pecasList) {
          const pOriginal = pecas.find(p => p.id === pWrapper.idBase);
          if (!pOriginal) continue;
          
          const materialId = pWrapper.matId;
          const valorArea  = precoPeca(pOriginal, materialId, materiais);
          pecasRows.push({
            orcamento_id:      orcamentoId,
            peca_id:           pOriginal.id,
            material_id:       materialId,
            incluida:          true,
            valor_area:        valorArea,
            valor_acabamentos: 0,
            valor_recortes:    0,
            valor_total:       valorArea,
          });
        }

        if (pecasRows.length > 0) {
          const { error: errPecas } = await supabase.from('orcamento_pecas').insert(pecasRows);
          if (errPecas) console.error(`ERRO CRÍTICO SUPABASE: ${errPecas.message} - Detalhes: ${errPecas.details}`);
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
      return;
    }

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
      />
    );
  }

  const pecaPainel = pecas.find(p => p.id === painelMaterialPecaId);

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-[#a1a1aa] selection:bg-white selection:text-black antialiased relative overflow-x-hidden font-sans">

      {/* Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-100 bg-grid"></div>
      <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"></div>

      <main className="relative z-10 w-full flex-1 max-w-[1200px] mx-auto p-4 md:p-8 pt-12">

        {/* ── Breadcrumb ─────────────────────────────────────────── */}
        <div className="sys-reveal flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-6">
          <a href="/projetos" className="hover:text-yellow-400 transition-colors">Projetos</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
          <a href={`/projetos/${projetoId}`} className="hover:text-yellow-400 transition-colors">Projeto</a>
          <iconify-icon icon="solar:alt-arrow-right-linear" width="10" className="text-zinc-700"></iconify-icon>
          <span className="text-zinc-400">Novo orçamento</span>
        </div>

        {/* ── Header ─────────────────────────────────────────────── */}
        <section className="sys-reveal mb-8">
          <div className="bg-[#0a0a0a] border border-zinc-800 p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">[ CRIAR_ORCAMENTO ]</div>
                <h1 className="text-2xl font-bold text-white tracking-tighter">Criar orçamento</h1>
              </div>
              <button
                onClick={() => navigate(`/projetos/${projetoId}`)}
                className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] font-mono uppercase tracking-widest px-4 py-2.5 hover:border-white hover:text-white transition-colors w-max"
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
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
              01 // Peças da medição
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-700 border border-zinc-900 px-2 py-0.5">
              {pecasComMaterial.length}/{pecasIncluidas.length} com material
            </span>
          </div>

          <div className="bg-[#0a0a0a] border border-zinc-800">
            {loadingPecas ? (
              <div className="px-4 py-8 flex items-center justify-center gap-2 text-zinc-600">
                <iconify-icon icon="solar:spinner-linear" width="16" className="animate-spin"></iconify-icon>
                <span className="font-mono text-[10px] uppercase tracking-widest">Carregando peças...</span>
              </div>
            ) : pecas.length === 0 ? (
              <div className="px-4 py-12 text-center border-t border-zinc-800">
                <iconify-icon icon="solar:ruler-cross-pen-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Nenhuma peça encontrada</p>
                <p className="font-mono text-[9px] text-zinc-600 mt-1">Gere o desenho técnico da medição antes para cadastrar peças neste ambiente.</p>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                <span className="col-span-1 font-mono text-[9px] uppercase tracking-widest text-zinc-700"></span>
                <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Peça</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Área / Esp.</span>
                <span className="col-span-4 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Material selecionado</span>
                <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right"></span>
              </div>
              {pecas.map(p => (
                <PecaRow
                  key={p.id}
                  peca={p}
                  onToggle={toggleIncluida}
                  onAbrirMaterial={setPainelMaterialPecaId}
                  onDuplicar={duplicarPecaPrincipal}
                  todosM={materiais}
                />
              ))}
              </>
            )}
          </div>
        </div>

        {/* ══ Produtos avulsos ══════════════════════════════════════ */}
        <div className="sys-reveal sys-delay-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-white uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">
              02 // Produtos avulsos
            </div>
            <button
              onClick={() => setModalProduto(true)}
              className="flex items-center gap-1.5 border border-zinc-700 text-zinc-400 text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:border-white hover:text-white transition-colors"
            >
              <iconify-icon icon="solar:add-circle-linear" width="12"></iconify-icon>
              Adicionar produto
            </button>
          </div>

          <div className="bg-[#0a0a0a] border border-zinc-800">
            {produtos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <iconify-icon icon="solar:box-linear" width="32" className="text-zinc-800 mb-3 block mx-auto"></iconify-icon>
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">Nenhum produto adicionado</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 px-4 py-2.5 border-b border-zinc-800">
                  <span className="col-span-5 font-mono text-[9px] uppercase tracking-widest text-zinc-600">Produto</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-center">Qtd.</span>
                  <span className="col-span-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Valor unit.</span>
                  <span className="col-span-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 text-right">Subtotal</span>
                </div>
                {produtos.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 items-center px-4 py-3.5 border-b border-zinc-900 last:border-b-0 group hover:bg-white/[0.01] transition-colors">
                    <div className="col-span-5 min-w-0 pr-2">
                      <span className="text-sm text-white font-medium truncate block">{p.nome}</span>
                      <span className="font-mono text-[9px] text-zinc-600">{p.subcategoria}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-mono text-[11px] text-zinc-300">{p.qty}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-mono text-[11px] text-zinc-300">{fmt(p.preco)}</span>
                    </div>
                    <div className="col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="font-mono text-[11px] text-zinc-300">{fmt(p.preco * p.qty)}</span>
                      <button
                        onClick={() => removerProduto(i)}
                        className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 p-1"
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
      <div className="mt-auto w-full bg-[#0a0a0a] border-t border-zinc-800 px-6 py-4 relative z-20">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Total estimado</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-white tracking-tighter">{fmt(total)}</span>
              {precisaVersoes && (
                <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5">
                  {pecasComMaterial.length} mat. · múltiplas versões
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pecasComMaterial.length < pecasIncluidas.length && (
              <span className="font-mono text-[9px] text-zinc-600 hidden sm:block">
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

      {/* ── Painel lateral: selecionar material ─────── */}
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
