import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function Section({ title, subtitle, children }) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="font-mono text-xs uppercase tracking-widest text-gray-900 dark:text-white font-bold">{title}</h2>
        {subtitle && <p className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Btn({ onClick, variant = 'default', disabled, children, className = '' }) {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border transition-colors disabled:opacity-40'
  const variants = {
    default: 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-yellow-400 dark:hover:border-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-400',
    primary: 'bg-yellow-400 border-yellow-400 text-black hover:bg-yellow-300',
    danger:  'bg-white dark:bg-zinc-900 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
    green:   'bg-white dark:bg-zinc-900 border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Input({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-3 py-1.5 outline-none focus:border-yellow-400 dark:focus:border-yellow-400 placeholder:text-gray-300 dark:placeholder:text-zinc-700"
      />
    </label>
  )
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-300 dark:border-zinc-800 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
          <span className="font-mono text-[10px] uppercase tracking-widest text-gray-900 dark:text-white font-bold">{title}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            <iconify-icon icon="solar:close-linear" width="14" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Seção 1: Visão Geral do Sistema ────────────────────────────────────────

function VisaoGeral() {
  const { enterImpersonation } = useAuth()
  const navigate = useNavigate()
  const [empresas, setEmpresas]   = useState([])
  const [usuarios, setUsuarios]   = useState([])
  const [projetos, setProjetos]   = useState([])
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: e }, { data: u }, { data: p }] = await Promise.all([
        supabase.from('empresas').select('id, nome, created_at').order('created_at'),
        supabase.from('usuarios').select('id, empresa_id').neq('perfil', 'superadmin'),
        supabase.from('projetos').select('id, empresa_id'),
      ])
      setEmpresas(e ?? [])
      setUsuarios(u ?? [])
      setProjetos(p ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const countFor = (list, id) => list.filter(x => x.empresa_id === id).length

  const handleEntrarComo = (emp) => {
    enterImpersonation(emp.id, 'admin')
    navigate('/admin')
  }

  if (loading) return (
    <div className="font-mono text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest py-8 text-center">
      Carregando...
    </div>
  )

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Empresas',  value: empresas.length },
          { label: 'Usuários',  value: usuarios.length },
          { label: 'Projetos',  value: projetos.length },
        ].map(({ label, value }) => (
          <div key={label} className="border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3">
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 mb-1">{label}</div>
            <div className="font-mono text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-gray-200 dark:border-zinc-800 overflow-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-normal">Empresa</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-normal">Usuários</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-normal">Projetos</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-normal">Criada em</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {empresas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-zinc-600 text-[10px] uppercase">Nenhuma empresa</td></tr>
            )}
            {empresas.map(emp => (
              <tr key={emp.id} className="border-b border-gray-100 dark:border-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">{emp.nome}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-400">{countFor(usuarios, emp.id)}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-400">{countFor(projetos, emp.id)}</td>
                <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-600">{fmtDate(emp.created_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Btn variant="green" onClick={() => handleEntrarComo(emp)}>
                    <iconify-icon icon="solar:login-2-linear" width="12" />
                    Entrar como
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Seção 2: Materiais Globais ──────────────────────────────────────────────

const CATEGORIAS = ['Granito', 'Mármore', 'Quartzito', 'Porcelanato', 'Silestone', 'Outro']

function MateriaisGlobais() {
  const [materiais, setMateriais] = useState([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null) // id do material expandido
  const [modal, setModal]         = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [nome, setNome]           = useState('')
  const [categoria, setCategoria] = useState('Granito')
  const [variacoes, setVariacoes] = useState([])
  const [salvando, setSalvando]   = useState(false)
  const [err, setErr]             = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('materiais')
      .select('*, variacoes_precos(*)')
      .is('empresa_id', null)
      .order('nome')
    setMateriais(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function abrirNovo() {
    setEditItem(null)
    setNome('')
    setCategoria('Granito')
    setVariacoes([{ acabamento: 'Polido', espessura: '2cm' }])
    setErr(null)
    setModal(true)
  }

  function abrirEditar(mat) {
    setEditItem(mat)
    setNome(mat.nome)
    setCategoria(mat.categoria ?? 'Granito')
    setVariacoes((mat.variacoes_precos ?? []).map(v => ({
      id: v.id,
      acabamento: v.acabamento,
      espessura: v.espessura ?? '',
    })))
    setErr(null)
    setModal(true)
  }

  function addVariacao() {
    setVariacoes(prev => [...prev, { acabamento: '', espessura: '2cm' }])
  }

  function updateVariacao(i, field, val) {
    setVariacoes(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }

  function removeVariacao(i) {
    setVariacoes(prev => prev.filter((_, idx) => idx !== i))
  }

  async function salvar() {
    if (!nome.trim()) { setErr('Informe o nome.'); return }
    setSalvando(true)
    setErr(null)
    try {
      let materialId
      if (editItem) {
        const { error } = await supabase.from('materiais')
          .update({ nome: nome.trim(), categoria })
          .eq('id', editItem.id)
        if (error) throw error
        materialId = editItem.id
        await supabase.from('variacoes_precos').delete().eq('material_id', materialId)
      } else {
        const { data, error } = await supabase.from('materiais')
          .insert({ nome: nome.trim(), categoria, empresa_id: null, ativo: true })
          .select().single()
        if (error) throw error
        materialId = data.id
      }
      const varValidas = variacoes.filter(v => v.acabamento?.trim())
      if (varValidas.length) {
        const { error } = await supabase.from('variacoes_precos').insert(
          varValidas.map(v => ({
            material_id:  materialId,
            acabamento:   v.acabamento.trim(),
            espessura:    v.espessura?.trim() || null,
          }))
        )
        if (error) throw error
      }
      setModal(false)
      fetch()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(mat) {
    if (!confirm(`Excluir "${mat.nome}" do catálogo global?`)) return
    await supabase.from('variacoes_precos').delete().eq('material_id', mat.id)
    await supabase.from('materiais').delete().eq('id', mat.id)
    fetch()
  }

  if (loading) return <div className="font-mono text-[10px] text-gray-400 uppercase py-8 text-center">Carregando...</div>

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Btn variant="primary" onClick={abrirNovo}>
          <iconify-icon icon="solar:add-circle-linear" width="12" />
          Novo material global
        </Btn>
      </div>

      <div className="border border-gray-200 dark:border-zinc-800">
        {materiais.length === 0 && (
          <div className="px-4 py-8 text-center font-mono text-[10px] text-gray-400 dark:text-zinc-600 uppercase">
            Nenhum material no catálogo global
          </div>
        )}
        {materiais.map(mat => (
          <div key={mat.id} className="border-b border-gray-100 dark:border-zinc-900 last:border-0">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/30"
              onClick={() => setExpanded(prev => prev === mat.id ? null : mat.id)}
            >
              <iconify-icon
                icon={expanded === mat.id ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'}
                width="12"
                className="text-gray-400 dark:text-zinc-600"
              />
              <span className="font-mono text-xs text-gray-900 dark:text-white font-medium flex-1">{mat.nome}</span>
              <span className="font-mono text-[9px] uppercase px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500">{mat.categoria}</span>
              <span className="font-mono text-[9px] text-gray-400 dark:text-zinc-600">{(mat.variacoes_precos ?? []).length} variações</span>
              <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                <Btn onClick={() => abrirEditar(mat)}>
                  <iconify-icon icon="solar:pen-linear" width="11" />
                  Editar
                </Btn>
                <Btn variant="danger" onClick={() => excluir(mat)}>
                  <iconify-icon icon="solar:trash-bin-2-linear" width="11" />
                </Btn>
              </div>
            </div>
            {expanded === mat.id && (mat.variacoes_precos ?? []).length > 0 && (
              <div className="px-8 pb-3">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">
                      <th className="text-left pb-1 pr-4 font-normal">Acabamento</th>
                      <th className="text-left pb-1 font-normal">Espessura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mat.variacoes_precos ?? []).map(v => (
                      <tr key={v.id} className="border-t border-gray-100 dark:border-zinc-900">
                        <td className="py-1 pr-4 text-gray-700 dark:text-zinc-300">{v.acabamento}</td>
                        <td className="py-1 text-gray-500 dark:text-zinc-500">{v.espessura ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={modal} title={editItem ? 'Editar material global' : 'Novo material global'} onClose={() => setModal(false)}>
        <div className="flex flex-col gap-3">
          <Input label="Nome" value={nome} onChange={setNome} required placeholder="Ex: Marmore Branco Carrara" />
          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-1 block">Categoria</span>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-3 py-1.5 outline-none focus:border-yellow-400 dark:focus:border-yellow-400"
            >
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500">Variações</span>
              <button onClick={addVariacao} className="font-mono text-[9px] uppercase text-yellow-600 dark:text-yellow-400 hover:underline">+ Adicionar</button>
            </div>
            {variacoes.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_24px] gap-1.5 mb-1.5">
                <input
                  placeholder="Acabamento"
                  value={v.acabamento}
                  onChange={e => updateVariacao(i, 'acabamento', e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-xs font-mono px-2 py-1 text-gray-900 dark:text-white outline-none focus:border-yellow-400"
                />
                <input
                  placeholder="Esp."
                  value={v.espessura}
                  onChange={e => updateVariacao(i, 'espessura', e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-xs font-mono px-2 py-1 text-gray-900 dark:text-white outline-none focus:border-yellow-400"
                />
                <button onClick={() => removeVariacao(i)} className="text-red-400 hover:text-red-600 flex items-center justify-center">
                  <iconify-icon icon="solar:close-linear" width="12" />
                </button>
              </div>
            ))}
          </div>

          {err && <p className="font-mono text-[10px] text-red-500">{err}</p>}

          <div className="flex gap-2 pt-1">
            <Btn variant="primary" onClick={salvar} disabled={salvando} className="flex-1 justify-center">
              {salvando ? 'Salvando...' : 'Salvar'}
            </Btn>
            <Btn onClick={() => setModal(false)}>Cancelar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Seção 3: Acabamentos Globais ────────────────────────────────────────────

function AcabamentosGlobais() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [nome, setNome]       = useState('')
  const [tipo, setTipo]       = useState('linear')
  const [salvando, setSalvando] = useState(false)
  const [err, setErr]         = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('materiais_lineares')
      .select('*')
      .is('empresa_id', null)
      .order('nome')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function abrirNovo() {
    setEditItem(null)
    setNome('')
    setTipo('linear')
    setErr(null)
    setModal(true)
  }

  function abrirEditar(item) {
    setEditItem(item)
    setNome(item.nome)
    setTipo(item.tipo ?? 'linear')
    setErr(null)
    setModal(true)
  }

  async function salvar() {
    if (!nome.trim()) { setErr('Informe o nome.'); return }
    setSalvando(true)
    setErr(null)
    try {
      const payload = { nome: nome.trim(), tipo, empresa_id: null, ativo: true }
      if (editItem) {
        const { error } = await supabase.from('materiais_lineares').update(payload).eq('id', editItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('materiais_lineares').insert(payload)
        if (error) throw error
      }
      setModal(false)
      fetch()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(item) {
    if (!confirm(`Excluir "${item.nome}" do catálogo global?`)) return
    await supabase.from('materiais_lineares').delete().eq('id', item.id)
    fetch()
  }

  if (loading) return <div className="font-mono text-[10px] text-gray-400 uppercase py-8 text-center">Carregando...</div>

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Btn variant="primary" onClick={abrirNovo}>
          <iconify-icon icon="solar:add-circle-linear" width="12" />
          Novo acabamento global
        </Btn>
      </div>

      <div className="border border-gray-200 dark:border-zinc-800 overflow-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Nome</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Tipo</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Ativo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-zinc-600 text-[10px] uppercase">Nenhum acabamento global</td></tr>
            )}
            {items.map(item => (
              <tr key={item.id} className="border-b border-gray-100 dark:border-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-900/30">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white">{item.nome}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-400">{item.tipo ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 ${item.ativo ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}>
                    {item.ativo ? 'sim' : 'não'}
                  </span>
                </td>
                <td className="px-4 py-2.5 flex items-center gap-1 justify-end">
                  <Btn onClick={() => abrirEditar(item)}>
                    <iconify-icon icon="solar:pen-linear" width="11" />
                    Editar
                  </Btn>
                  <Btn variant="danger" onClick={() => excluir(item)}>
                    <iconify-icon icon="solar:trash-bin-2-linear" width="11" />
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} title={editItem ? 'Editar acabamento global' : 'Novo acabamento global'} onClose={() => setModal(false)}>
        <div className="flex flex-col gap-3">
          <Input label="Nome" value={nome} onChange={setNome} required placeholder="Ex: Rodapé em L" />
          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-1 block">Tipo</span>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white text-xs font-mono px-3 py-1.5 outline-none focus:border-yellow-400"
            >
              <option value="linear">Linear</option>
              <option value="perimetro">Perímetro</option>
              <option value="rodape">Rodapé</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          {err && <p className="font-mono text-[10px] text-red-500">{err}</p>}

          <div className="flex gap-2 pt-1">
            <Btn variant="primary" onClick={salvar} disabled={salvando} className="flex-1 justify-center">
              {salvando ? 'Salvando...' : 'Salvar'}
            </Btn>
            <Btn onClick={() => setModal(false)}>Cancelar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Seção 3b: Serviços e Furos Globais ──────────────────────────────────────

function ServicosGlobais() {
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(false)
  const [editItem, setEditItem]       = useState(null)
  const [nome, setNome]               = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [salvando, setSalvando]       = useState(false)
  const [err, setErr]                 = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('produtos_avulsos')
      .select('*')
      .is('empresa_id', null)
      .order('nome')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  function abrirNovo() {
    setEditItem(null); setNome(''); setSubcategoria(''); setErr(null); setModal(true)
  }

  function abrirEditar(item) {
    setEditItem(item)
    setNome(item.nome)
    setSubcategoria(item.subcategoria ?? '')
    setErr(null)
    setModal(true)
  }

  async function salvar() {
    if (!nome.trim()) { setErr('Informe o nome.'); return }
    setSalvando(true); setErr(null)
    try {
      const payload = {
        nome:         nome.trim(),
        subcategoria: subcategoria.trim() || null,
        empresa_id:   null,
        ativo:        true,
      }
      if (editItem) {
        const { error } = await supabase.from('produtos_avulsos').update(payload).eq('id', editItem.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('produtos_avulsos').insert(payload)
        if (error) throw error
      }
      setModal(false)
      fetchItems()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(item) {
    if (!confirm(`Excluir "${item.nome}" do catálogo global?`)) return
    await supabase.from('produtos_avulsos').delete().eq('id', item.id)
    fetchItems()
  }

  if (loading) return <div className="font-mono text-[10px] text-gray-400 uppercase py-8 text-center">Carregando...</div>

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Btn variant="primary" onClick={abrirNovo}>
          <iconify-icon icon="solar:add-circle-linear" width="12" />
          Novo serviço global
        </Btn>
      </div>

      <div className="border border-gray-200 dark:border-zinc-800 overflow-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Nome</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Subcategoria</th>
              <th className="px-4 py-2 text-[9px] uppercase tracking-widest text-gray-500 font-normal">Ativo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-zinc-600 text-[10px] uppercase">Nenhum serviço global</td></tr>
            )}
            {items.map(item => (
              <tr key={item.id} className="border-b border-gray-100 dark:border-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-900/30">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white">{item.nome}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-400">{item.subcategoria ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 ${item.ativo ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}>
                    {item.ativo ? 'sim' : 'não'}
                  </span>
                </td>
                <td className="px-4 py-2.5 flex items-center gap-1 justify-end">
                  <Btn onClick={() => abrirEditar(item)}>
                    <iconify-icon icon="solar:pen-linear" width="11" />
                    Editar
                  </Btn>
                  <Btn variant="danger" onClick={() => excluir(item)}>
                    <iconify-icon icon="solar:trash-bin-2-linear" width="11" />
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} title={editItem ? 'Editar serviço global' : 'Novo serviço global'} onClose={() => setModal(false)}>
        <div className="flex flex-col gap-3">
          <Input label="Nome" value={nome} onChange={setNome} required placeholder="Ex: Furo para torneira" />
          <Input label="Subcategoria" value={subcategoria} onChange={setSubcategoria} placeholder="Ex: furo, recorte, escavação" />
          {err && <p className="font-mono text-[10px] text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <Btn variant="primary" onClick={salvar} disabled={salvando} className="flex-1 justify-center">
              {salvando ? 'Salvando...' : 'Salvar'}
            </Btn>
            <Btn onClick={() => setModal(false)}>Cancelar</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}


// ─── Seção 4: Modo de Teste ──────────────────────────────────────────────────

const PERFIS_TESTE = [
  { value: 'admin',            label: 'Administrador',      desc: 'Menu admin, financeiro, configurações' },
  { value: 'vendedor',         label: 'Vendedor',           desc: 'Menu vendedor, projetos próprios' },
  { value: 'medidor',          label: 'Medidor',            desc: 'Menu medidor, agenda, histórico' },
  { value: 'admin_medidor',    label: 'Admin + Medidor',    desc: 'Menu admin com seção de medidor' },
  { value: 'vendedor_medidor', label: 'Vendedor + Medidor', desc: 'Menu vendedor com seção de medidor' },
]

function ModoTeste() {
  const { impersonation, enterImpersonation, exitImpersonation } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(impersonation?.perfil ?? 'admin')

  const isTesting = !!impersonation

  function ativar() {
    enterImpersonation(impersonation?.empresaId ?? null, selected)
    const dest = selected.includes('medidor') && !selected.includes('admin') && !selected.includes('vendedor')
      ? '/medidor/agenda'
      : selected.includes('admin') || selected === 'admin_medidor'
      ? '/admin'
      : '/dashboard'
    navigate(dest)
  }

  return (
    <div className="max-w-lg">
      <div className="border border-yellow-200 dark:border-yellow-400/20 bg-yellow-50 dark:bg-yellow-400/5 px-4 py-3 mb-6">
        <p className="font-mono text-[10px] text-yellow-800 dark:text-yellow-400 uppercase tracking-widest">
          Simula como o sistema se comporta para cada perfil. Dados reais não são alterados.
          Nenhuma empresa impersonada será necessária para testes de UI.
        </p>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        {PERFIS_TESTE.map(p => (
          <label
            key={p.value}
            className={`flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors ${
              selected === p.value
                ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-400/5'
                : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
            }`}
          >
            <input
              type="radio"
              name="perfil_teste"
              value={p.value}
              checked={selected === p.value}
              onChange={() => setSelected(p.value)}
              className="mt-0.5 accent-yellow-400"
            />
            <div>
              <div className="font-mono text-xs text-gray-900 dark:text-white font-medium">{p.label}</div>
              <div className="font-mono text-[9px] text-gray-400 dark:text-zinc-600 mt-0.5">{p.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <Btn variant="primary" onClick={ativar}>
          <iconify-icon icon="solar:play-circle-linear" width="12" />
          Ativar modo teste — {PERFIS_TESTE.find(p => p.value === selected)?.label}
        </Btn>
        {isTesting && (
          <Btn variant="danger" onClick={() => { exitImpersonation(); navigate('/superadmin') }}>
            <iconify-icon icon="solar:stop-circle-linear" width="12" />
            Sair do modo teste
          </Btn>
        )}
      </div>

      {isTesting && (
        <div className="mt-4 border border-yellow-300 dark:border-yellow-400/30 px-4 py-2.5 bg-yellow-50 dark:bg-yellow-400/5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
            Modo ativo: {impersonation.perfil}
            {impersonation.empresaId ? ` · empresa impersonada` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Página principal SuperAdmin ─────────────────────────────────────────────

const TABS = [
  { key: 'overview',    label: 'Visão Geral',     icon: 'solar:chart-linear' },
  { key: 'materiais',   label: 'Materiais',        icon: 'solar:layers-linear' },
  { key: 'acabamentos', label: 'Acabamentos',      icon: 'solar:settings-linear' },
  { key: 'teste',       label: 'Modo de Teste',    icon: 'solar:test-tube-linear' },
]

export default function SuperAdmin() {
  const [tab, setTab] = useState('overview')
  const { impersonation, exitImpersonation } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-[#050505]">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 bg-purple-500" />
          <h1 className="font-mono text-xs uppercase tracking-widest text-gray-900 dark:text-white font-bold">
            Painel SuperAdmin
          </h1>
        </div>
        <p className="font-mono text-[10px] text-gray-400 dark:text-zinc-600">
          Administração global do sistema SmartStone
        </p>
      </div>

      {/* Banner impersonação ativa */}
      {impersonation && (
        <div className="flex items-center justify-between px-6 py-2 bg-yellow-400 text-black">
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold">
            MODO TESTE — Perfil: {impersonation.perfil}
            {impersonation.empresaId ? ' · Empresa impersonada' : ''}
          </span>
          <button
            onClick={() => exitImpersonation()}
            className="font-mono text-[9px] uppercase tracking-widest underline hover:no-underline"
          >
            Sair do modo
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-zinc-800 px-6 bg-white dark:bg-[#050505]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors ${
              tab === t.key
                ? 'border-yellow-400 text-yellow-700 dark:text-yellow-400'
                : 'border-transparent text-gray-400 dark:text-zinc-600 hover:text-gray-700 dark:hover:text-zinc-300'
            }`}
          >
            <iconify-icon icon={t.icon} width="12" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 p-6 overflow-auto">
        {tab === 'overview' && (
          <Section title="Visão Geral do Sistema" subtitle="Todas as empresas e suas métricas">
            <VisaoGeral />
          </Section>
        )}
        {tab === 'materiais' && (
          <Section title="Materiais Globais" subtitle="Catálogo de materiais disponível para todas as empresas (empresa_id = NULL)">
            <MateriaisGlobais />
          </Section>
        )}
        {tab === 'acabamentos' && (
          <Section title="Acabamentos Globais" subtitle="Catálogos de acabamentos e serviços disponíveis para todas as empresas">
            <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 border-b border-gray-200 dark:border-zinc-800 pb-2 mb-4">
              Acabamentos Lineares
            </p>
            <AcabamentosGlobais />
            <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 border-b border-gray-200 dark:border-zinc-800 pb-2 mb-4 mt-8">
              Serviços e Furos
            </p>
            <ServicosGlobais />
          </Section>
        )}
        {tab === 'teste' && (
          <Section title="Modo de Teste" subtitle="Simula o comportamento do sistema para cada perfil de usuário">
            <ModoTeste />
          </Section>
        )}
      </div>
    </div>
  )
}
