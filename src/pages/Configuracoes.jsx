import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { maskCNPJ, maskTelefone } from '../utils/masks';
import { CONTRATO_PADRAO } from '../utils/contratoPadrao';
import { TEMPLATE_DEFAULTS } from '../utils/pdfOptions';

// ── Constantes de materiais ───────────────────────────────────────────────────
const CATEGORIAS = [
  'Granito', 'Mármore', 'Quartzito', 'Limestone', 'Dolomítico',
  'Quartzo', 'Lâmina ultra compacta', 'Ardósia', 'Nanoglass', 'Outros',
];

// null  = Nanoglass: sem espessura
// false = Outros: campo de texto livre
// array = opções fixas
const ESPESSURAS_POR_CATEGORIA = {
  'Granito':               ['2cm', '3cm'],
  'Mármore':               ['2cm', '3cm'],
  'Quartzito':             ['2cm', '3cm'],
  'Limestone':             ['2cm', '3cm'],
  'Dolomítico':            ['2cm', '3cm'],
  'Quartzo':               ['1.8cm', '2cm'],
  'Lâmina ultra compacta': ['0.6cm', '0.9cm', '1.2cm'],
  'Ardósia':               ['2.2cm', '3cm'],
  'Nanoglass':             null,
  'Outros':                false,
};

const ACABAMENTOS = [
  'Polido', 'Bipolido', 'Levigado', 'Escovado',
  'Bi-escovado', 'Flameado', 'Jateado', 'Apicoado', 'Acetinado',
];

function novaVariacao(espessuraDefault = '') {
  return {
    _id:        Math.random(),
    acabamento: 'Polido',
    espessura:  espessuraDefault,
    precoCusto: '',
    frete:      '',
    precoVenda: '',
  };
}

// TODO: SEGURANÇA [V004] — sem guard de perfil. Vendedor acessa lista de usuários e
// dados da empresa (incluindo dados_bancarios no estado React via DevTools).
// Adicionar: if (profile && profile.perfil !== 'admin') return <AccessDenied />
// ── Componente principal ──────────────────────────────────────────────────────
export default function ConfiguracoesPage() {
  const { profile, session, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('empresa');
  const empresaId = profile?.empresa_id ?? null;

  // ── States ──
  const [empresa,           setEmpresa]           = useState({
    nome: '', email_contato: '', logo_url: null, cnpj: '',
    inscricao_estadual: '', telefone: '', whatsapp: '',
    endereco: '', website: '',
    dados_bancarios: { banco: '', agencia: '', conta: '', titular: '', pix_chave: '', pix_tipo: 'CNPJ' },
  });
  const [usuarios,          setUsuarios]          = useState([]);
  const [materiaisArea,     setMateriaisArea]     = useState([]);
  const [materiaisLineares, setMateriaisLineares] = useState([]);
  const [loadingMateriais,  setLoadingMateriais]  = useState(false);
  const [produtos,          setProdutos]          = useState([]);
  const [pagamentos,        setPagamentos]        = useState([]);
  const [templates,         setTemplates]         = useState({ orcamento: null, pedido: null, contrato: null });
  const [contratoSaving,    setContratoSaving]    = useState(false);

  // ── Logo upload ──
  const fileInputRef       = useRef(null);
  const [logoPreview,      setLogoPreview]      = useState(null);   // data-URL ou URL pública
  const [fileToUpload,     setFileToUpload]     = useState(null);   // File object
  const [logoUploading,    setLogoUploading]    = useState(false);
  const [empresaSalvando,  setEmpresaSalvando]  = useState(false);

  // Modal genérico (não-materiais)
  const [modalState,    setModalState]    = useState({ isOpen: false, type: null, item: null });
  const [novaSenha,     setNovaSenha]     = useState('');
  const [mostrarSenha,  setMostrarSenha]  = useState(false);

  // Modal de material (controlado)
  const [matModal,    setMatModal]    = useState(false);
  const [matItem,     setMatItem]     = useState(null);
  const [matNome,     setMatNome]     = useState('');
  const [matCategoria, setMatCategoria] = useState('Granito');
  const [matVariacoes, setMatVariacoes] = useState([novaVariacao('2cm')]);
  const [matSalvando, setMatSalvando] = useState(false);
  const [matBusca,           setMatBusca]           = useState('');
  const [matOrdem,           setMatOrdem]           = useState('az');
  const [matFiltroCategoria, setMatFiltroCategoria] = useState('');
  const [acabamentosUnitarios, setAcabamentosUnitarios] = useState([]);
  const [acabamentoSubAba,     setAcabamentoSubAba]     = useState('lineares');
  const [precosMaterial,       setPrecosMaterial]       = useState({});
  const [expandedAcabamentos,  setExpandedAcabamentos]  = useState(new Set());
  const [novoPrecosForm,       setNovoPrecosForm]       = useState({});

  // ── Fetch materiais ──
  const fetchMateriais = useCallback(async () => {
    if (!session || !empresaId) return;
    setLoadingMateriais(true);
    const [{ data: area, error: errArea }, { data: linear, error: errLinear }] = await Promise.all([
      supabase.from('materiais')
        .select('*, variacoes_precos(*)')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase.from('materiais_lineares')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]);
    if (errArea)   console.error('Erro materiais área:', errArea);
    if (errLinear) console.error('Erro materiais lineares:', errLinear);
    if (area)   setMateriaisArea(area);
    if (linear) setMateriaisLineares(linear);
    const { data: precos } = await supabase
      .from('acabamento_precos_material')
      .select('id, material_linear_id, material_id, preco_ml, materiais(nome)')
      .eq('empresa_id', empresaId);
    const grouped = {};
    for (const p of precos ?? []) {
      if (!grouped[p.material_linear_id]) grouped[p.material_linear_id] = [];
      grouped[p.material_linear_id].push({ ...p, material_nome: p.materiais?.nome });
    }
    setPrecosMaterial(grouped);
    const { data: unitarios } = await supabase
      .from('produtos_avulsos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (unitarios) setAcabamentosUnitarios(unitarios);
    setLoadingMateriais(false);
  }, [session, empresaId]);

  useEffect(() => { fetchMateriais(); }, [fetchMateriais]);

  // ── Fetch dados da empresa ──────────────────────────────────────────────────
  const fetchEmpresa = useCallback(async () => {
    if (!empresaId) return;
    const { data } = await supabase
      .from('empresas')
      .select('nome, email_contato, logo_url, cnpj, inscricao_estadual, telefone, whatsapp, endereco, website, dados_bancarios')
      .eq('id', empresaId)
      .single();
    if (data) {
      setEmpresa({
        nome:               data.nome               ?? '',
        email_contato:      data.email_contato       ?? '',
        logo_url:           data.logo_url            ?? null,
        cnpj:               data.cnpj                ?? '',
        inscricao_estadual: data.inscricao_estadual  ?? '',
        telefone:           data.telefone            ?? '',
        whatsapp:           data.whatsapp            ?? '',
        endereco:           data.endereco            ?? '',
        website:            data.website             ?? '',
        dados_bancarios: {
          banco:     data.dados_bancarios?.banco     ?? '',
          agencia:   data.dados_bancarios?.agencia   ?? '',
          conta:     data.dados_bancarios?.conta     ?? '',
          titular:   data.dados_bancarios?.titular   ?? '',
          pix_chave: data.dados_bancarios?.pix_chave ?? '',
          pix_tipo:  data.dados_bancarios?.pix_tipo  ?? 'CNPJ',
        },
      });
      if (data.logo_url) setLogoPreview(data.logo_url);
    }
  }, [empresaId]);

  useEffect(() => { fetchEmpresa(); }, [fetchEmpresa]);

  // ── Fetch usuários ──────────────────────────────────────────────────────
  const fetchUsuarios = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome, email, perfil, ativo')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (error) console.error(error);
    if (data) setUsuarios(data);
  }, [empresaId]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  // ── Fetch templates de PDF ───────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    if (!empresaId) return;
    const { data } = await supabase
      .from('pdf_templates')
      .select('*')
      .eq('empresa_id', empresaId);

    const merged = { ...TEMPLATE_DEFAULTS };
    for (const row of data ?? []) {
      merged[row.tipo] = { ...TEMPLATE_DEFAULTS[row.tipo], ...row };
    }
    setTemplates(merged);
  }, [empresaId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Handler: salvar contrato ─────────────────────────────────────────────
  const handleSalvarContrato = async () => {
    if (!empresaId) return;
    setContratoSaving(true);
    try {
      const payload = { ...templates.contrato, empresa_id: empresaId, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from('pdf_templates')
        .upsert(payload, { onConflict: 'empresa_id,tipo' });
      if (error) throw error;
      alert('Contrato salvo!');
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setContratoSaving(false);
    }
  };

  const updateContrato = (field, value) =>
    setTemplates(prev => ({ ...prev, contrato: { ...prev.contrato, [field]: value } }));

  // ── Handler: seleção de arquivo (preview imediato) ──────────────────────────
  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileToUpload(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
    // Reset input para permitir re-selecionar o mesmo arquivo
    e.target.value = '';
  };

  // ── Handler: salvar empresa (upload logo + update tabela) ───────────────────
  const handleSalvarEmpresa = async () => {
    if (!empresaId) return;
    setEmpresaSalvando(true);
    try {
      let logoUrl = empresa.logo_url;

      // Faz upload da logo se um novo arquivo foi selecionado
      if (fileToUpload) {
        setLogoUploading(true);
        const ext  = fileToUpload.name.split('.').pop().toLowerCase();
        const path = `${empresaId}/logo.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('logos_empresa')
          .upload(path, fileToUpload, { upsert: true, contentType: fileToUpload.type });

        if (upErr) throw upErr;

        // Gera URL pública com cache-bust para forçar atualização imediata
        const { data: urlData } = supabase.storage
          .from('logos_empresa')
          .getPublicUrl(path);
        logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        setLogoUploading(false);
        setFileToUpload(null);
      }

      if (empresa.cnpj && empresa.cnpj.replace(/\D/g, '').length !== 14) {
        alert('CNPJ deve ter 14 dígitos.');
        setEmpresaSalvando(false);
        return;
      }

      const { error } = await supabase
        .from('empresas')
        .update({
          nome:               empresa.nome,
          email_contato:      empresa.email_contato,
          logo_url:           logoUrl,
          cnpj:               empresa.cnpj,
          inscricao_estadual: empresa.inscricao_estadual,
          telefone:           empresa.telefone,
          whatsapp:           empresa.whatsapp,
          endereco:           empresa.endereco,
          website:            empresa.website,
          dados_bancarios:    empresa.dados_bancarios,
        })
        .eq('id', empresaId);

      if (error) throw error;

      setEmpresa(prev => ({ ...prev, logo_url: logoUrl }));
      if (logoUrl) setLogoPreview(logoUrl);
      alert('Dados da empresa salvos com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar empresa:', err);
      alert('Erro ao salvar: ' + (err.message ?? 'tente novamente.'));
    } finally {
      setEmpresaSalvando(false);
      setLogoUploading(false);
    }
  };

  useEffect(() => {
    document.querySelectorAll('.sys-reveal').forEach(el => {
      el.classList.remove('sys-active');
      setTimeout(() => el.classList.add('sys-active'), 10);
    });
  }, [activeTab]);

  // Quando a categoria muda, redefine espessura nas variações
  useEffect(() => {
    if (!matModal) return;
    const espessuras = ESPESSURAS_POR_CATEGORIA[matCategoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';
    setMatVariacoes(prev => prev.map(v => ({ ...v, espessura: defaultEsp })));
  }, [matCategoria]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers modal genérico ──
  const openModal  = (type, item = null) => setModalState({ isOpen: true, type, item });
  const closeModal = () => setModalState({ isOpen: false, type: null, item: null });
  const handleToggle = (setter, list, id) =>
    setter(list.map(item => item.id === id ? { ...item, ativo: !item.ativo } : item));

  const handleToggleUsuario = async (id, ativoAtual) => {
    const { error } = await supabase
      .from('usuarios')
      .update({ ativo: !ativoAtual })
      .eq('id', id);
    if (error) { alert(error.message); return; }
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ativo: !ativoAtual } : u));
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const { type, item } = modalState;

    if (type === 'material_linear') {
      const payload = { nome: data.nome, tipo: data.tipo, preco_ml: Number(data.preco_ml), empresa_id: profile.empresa_id };
      if (item) {
        const { data: updated, error } = await supabase.from('materiais_lineares').update(payload).eq('id', item.id).select().single();
        if (error) { alert(error.message); return; }
        setMateriaisLineares(prev => prev.map(m => m.id === item.id ? updated : m));
      } else {
        const { data: inserted, error } = await supabase.from('materiais_lineares').insert({ ...payload, ativo: true }).select().single();
        if (error) { alert(error.message); return; }
        setMateriaisLineares(prev => [...prev, inserted]);
      }
    } else if (type === 'usuario') {
      const { nome, email, perfil } = data;
      if (item) {
        const { error } = await supabase
          .from('usuarios')
          .update({ nome, perfil })
          .eq('id', item.id);
        if (error) { alert('Erro ao atualizar: ' + error.message); return; }
        setUsuarios(prev => prev.map(u => u.id === item.id ? { ...u, nome, perfil } : u));
        if (item.id === session?.user?.id) await refreshProfile();
        alert('Usuário atualizado com sucesso!');
      } else {
        if (!novaSenha || novaSenha.length < 8) {
          alert('A senha deve ter no mínimo 8 caracteres.');
          return;
        }

        // Cliente temporário sem persistência de sessão: cria auth user
        // sem deslogar o admin atual nem tocar no localStorage.
        const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email,
          password: novaSenha,
          options: { data: { nome } }
        });

        if (authError) { alert('Erro ao criar acesso: ' + authError.message); return; }

        const userId = authData.user?.id;
        if (!userId) { alert('Erro: ID do usuário não foi gerado pelo Auth.'); return; }

        const { data: novoUser, error: errInsert } = await supabase
          .from('usuarios')
          .insert([{ id: userId, nome, email, perfil, empresa_id: profile.empresa_id, ativo: true }])
          .select()
          .single();
        if (errInsert) { alert('Erro ao cadastrar: ' + errInsert.message); return; }

        const credenciais = `Email: ${email}\nSenha: ${novaSenha}`;
        try {
          await navigator.clipboard.writeText(credenciais);
          alert(`✅ Usuário criado com sucesso!\n\nEmail: ${email}\nSenha: ${novaSenha}\n\n📋 Credenciais copiadas para a área de transferência.`);
        } catch {
          alert(`✅ Usuário criado com sucesso!\n\nEmail: ${email}\nSenha: ${novaSenha}\n\nAnote ou envie essas credenciais para o usuário.`);
        }

        setNovaSenha('');
        setMostrarSenha(false);
        setUsuarios(prev => [...prev, novoUser]);
      }
    } else if (type === 'produto') {
      const isNew = !item;
      const novoId = isNew ? (produtos.length > 0 ? Math.max(...produtos.map(p => p.id)) + 1 : 1) : item.id;
      const nd = { id: novoId, ...data, precoUnitario: Number(data.precoUnitario), incluiMaterial: !!data.incluiMaterial, ativo: isNew ? true : item.ativo };
      setProdutos(isNew ? [...produtos, nd] : produtos.map(p => p.id === item.id ? nd : p));
    } else if (type === 'pagamento') {
      const isNew = !item;
      const novoId = isNew ? (pagamentos.length > 0 ? Math.max(...pagamentos.map(p => p.id)) + 1 : 1) : item.id;
      const nd = { id: novoId, ...data, campos: data.campos.split(',').map(c => c.trim()), ativo: isNew ? true : item.ativo };
      setPagamentos(isNew ? [...pagamentos, nd] : pagamentos.map(p => p.id === item.id ? nd : p));
    } else if (type === 'acabamento_unitario') {
      const payload = { nome: data.nome, subcategoria: data.subcategoria, preco_unitario: Number(data.preco_unitario), empresa_id: profile.empresa_id };
      if (item) {
        const { data: updated, error } = await supabase.from('produtos_avulsos').update(payload).eq('id', item.id).select().single();
        if (error) { alert(error.message); return; }
        setAcabamentosUnitarios(prev => prev.map(a => a.id === item.id ? updated : a));
      } else {
        const { data: inserted, error } = await supabase.from('produtos_avulsos').insert({ ...payload, ativo: true }).select().single();
        if (error) { alert(error.message); return; }
        setAcabamentosUnitarios(prev => [...prev, inserted]);
      }
    }
    closeModal();
  };

  // ── Handlers material área ──
  function abrirMatModal(item = null) {
    const rawCategoria = item?.categoria ?? 'Granito';
    const categoria = rawCategoria in ESPESSURAS_POR_CATEGORIA ? rawCategoria : 'Granito';
    const espessuras = ESPESSURAS_POR_CATEGORIA[categoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';

    console.log('abrirMatModal →', { id: item?.id, nome: item?.nome, categoria, variacoes: item?.variacoes_precos?.length });

    setMatItem(item);
    setMatNome(item?.nome ?? '');
    setMatCategoria(categoria);
    setMatVariacoes(
      item?.variacoes_precos?.length
        ? item.variacoes_precos.map(v => ({
            _id:        Math.random(),
            acabamento: v.acabamento ?? 'Polido',
            espessura:  v.espessura  ?? '',
            precoCusto: v.preco_custo ?? '',
            frete:      v.frete       ?? '',
            precoVenda: v.preco_venda ?? '',
          }))
        : [novaVariacao(defaultEsp)]
    );
    setMatModal(true);
  }

  function fecharMatModal() {
    setMatModal(false);
    setMatItem(null);
    setMatNome('');
    setMatCategoria('Granito');
    setMatVariacoes([novaVariacao('2cm')]);
  }

  async function handleSalvarMaterial() {
    if (!matNome.trim()) { alert('Informe o nome do material.'); return; }
    setMatSalvando(true);
    try {
      const eId = profile?.empresa_id ?? 'a1b2c3d4-0000-0000-0000-000000000001';
      let materialId;

      if (matItem) {
        const { error } = await supabase.from('materiais')
          .update({ nome: matNome.trim(), categoria: matCategoria })
          .eq('id', matItem.id);
        if (error) throw error;
        materialId = matItem.id;
        await supabase.from('variacoes_precos').delete().eq('material_id', materialId);
      } else {
        const { data, error } = await supabase.from('materiais')
          .insert({ nome: matNome.trim(), categoria: matCategoria, empresa_id: eId, ativo: true })
          .select().single();
        if (error) throw error;
        materialId = data.id;
      }

      const variacoesValidas = matVariacoes.filter(v => v.acabamento?.trim());
      if (variacoesValidas.length > 0) {
        const { error } = await supabase.from('variacoes_precos').insert(
          variacoesValidas.map(v => ({
            material_id: materialId,
            acabamento:  v.acabamento,
            espessura:   v.espessura.trim() || null,
            preco_custo: parseFloat(v.precoCusto) || 0,
            frete:       parseFloat(v.frete) || 0,
            preco_venda: parseFloat(v.precoVenda) || 0,
          }))
        );
        if (error) throw error;
      }

      await fetchMateriais();
      fecharMatModal();
    } catch (err) {
      alert(err.message);
    } finally {
      setMatSalvando(false);
    }
  }

  const handleDeleteMaterialArea = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Excluir este material e todas as suas variações de preço?')) return;
    const { error } = await supabase.from('materiais').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setMateriaisArea(prev => prev.filter(m => m.id !== id));
  };

  const handleDeleteMaterialLinear = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Excluir este material definitivamente?')) return;
    const { error } = await supabase.from('materiais_lineares').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setMateriaisLineares(prev => prev.filter(m => m.id !== id));
    setPrecosMaterial(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const toggleExpandAcabamento = (id) =>
    setExpandedAcabamentos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAddPrecoMaterial = async (materialLinearId) => {
    const form = novoPrecosForm[materialLinearId] ?? {};
    if (!form.materialId || !form.preco) return;
    const { data, error } = await supabase
      .from('acabamento_precos_material')
      .insert({ empresa_id: empresaId, material_linear_id: materialLinearId, material_id: form.materialId, preco_ml: Number(form.preco) })
      .select('id, material_linear_id, material_id, preco_ml, materiais(nome)')
      .single();
    if (error) { alert(error.message); return; }
    setPrecosMaterial(prev => ({
      ...prev,
      [materialLinearId]: [...(prev[materialLinearId] ?? []), { ...data, material_nome: data.materiais?.nome }],
    }));
    setNovoPrecosForm(prev => ({ ...prev, [materialLinearId]: { materialId: '', preco: '' } }));
  };

  const handleRemovePrecoMaterial = async (materialLinearId, precoId) => {
    const { error } = await supabase.from('acabamento_precos_material').delete().eq('id', precoId);
    if (error) { alert(error.message); return; }
    setPrecosMaterial(prev => ({
      ...prev,
      [materialLinearId]: (prev[materialLinearId] ?? []).filter(p => p.id !== precoId),
    }));
  };

  // ── Helpers variação ──
  const updateVariacao = (idx, field, value) =>
    setMatVariacoes(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));

  const addVariacao = () => {
    const espessuras = ESPESSURAS_POR_CATEGORIA[matCategoria];
    const defaultEsp = Array.isArray(espessuras) ? espessuras[0] : '';
    setMatVariacoes(prev => [...prev, novaVariacao(defaultEsp)]);
  };

  const removeVariacao = (idx) => setMatVariacoes(prev => prev.filter((_, i) => i !== idx));

  // null = Nanoglass (sem espessura), false = Outros/campo livre, array = opções fixas
  // Categorias desconhecidas do banco caem em false (campo livre) via normalização em abrirMatModal
  const espessurasDisponiveis = matCategoria in ESPESSURAS_POR_CATEGORIA
    ? ESPESSURAS_POR_CATEGORIA[matCategoria]
    : false;

  const materiaisAreaFiltrados = materiaisArea
    .filter(m => {
      const buscaOk = matBusca === '' || m.nome.toLowerCase().includes(matBusca.toLowerCase());
      const catOk = matFiltroCategoria === '' ||
        m.categoria?.toLowerCase().trim() === matFiltroCategoria?.toLowerCase().trim();
      return buscaOk && catOk;
    })
    .sort((a, b) => {
      if (matOrdem === 'az')        return a.nome.localeCompare(b.nome);
      if (matOrdem === 'za')        return b.nome.localeCompare(a.nome);
      if (matOrdem === 'recente')   return new Date(b.created_at) - new Date(a.created_at);
      if (matOrdem === 'antigo')    return new Date(a.created_at) - new Date(b.created_at);
      if (matOrdem === 'mais_var')  return (b.variacoes_precos?.length ?? 0) - (a.variacoes_precos?.length ?? 0);
      if (matOrdem === 'menos_var') return (a.variacoes_precos?.length ?? 0) - (b.variacoes_precos?.length ?? 0);
      return 0;
    });

  // ── Tabs ──
  const tabs = [
    { id: 'empresa',           label: 'Dados da Empresa',    icon: 'solar:buildings-linear' },
    { id: 'usuarios',          label: 'Usuários',            icon: 'solar:users-group-rounded-linear' },
    { id: 'materiais_area',    label: 'Matéria Prima',       icon: 'solar:slider-minimalistic-horizontal-linear' },
    { id: 'materiais_lineares',label: 'Acabamentos',         icon: 'solar:sort-from-bottom-to-top-linear' },
    { id: 'produtos',          label: 'Produtos de Revenda', icon: 'solar:box-linear' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 bg-gray-100 dark:bg-[#050505] text-gray-600 dark:text-zinc-400 font-sans selection:bg-gray-200 dark:selection:bg-white selection:text-black flex">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>

      {/* Sidebar Nav */}
      <div className="w-64 bg-gray-50 dark:bg-[#020202] border-r border-gray-300 dark:border-zinc-800 p-6 flex flex-col relative z-10 h-screen sticky top-0 shrink-0">
        <div className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest border border-gray-300 dark:border-zinc-800 w-max px-2 py-1 mb-6">
          09 // System
        </div>
        <h1 className="text-2xl font-medium text-gray-900 dark:text-white tracking-tighter uppercase mb-8">Configurações</h1>
        <nav className="flex flex-col gap-2 flex-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-mono uppercase tracking-widest transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.2)] font-bold'
                  : 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 border border-transparent hover:border-gray-300 dark:hover:border-zinc-800'
              }`}
            >
              <iconify-icon icon={tab.icon}></iconify-icon>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto relative z-10 custom-scrollbar min-h-0">
        <div className="sys-reveal">

          {/* ── Dados da Empresa ── */}
          {activeTab === 'empresa' && (
            <div className="space-y-6">
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleLogoSelect} />

              {/* Card 1 — Identidade */}
              <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 p-8 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <iconify-icon icon="solar:buildings-linear" width="120"></iconify-icon>
                </div>
                <h3 className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 tracking-widest">Identidade</h3>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Logo da Empresa</label>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-24 h-24 border border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black flex items-center justify-center relative overflow-hidden group hover:border-yellow-400/50 transition-colors shrink-0"
                      title="Clique para selecionar logo">
                      {logoPreview
                        ? <img src={logoPreview} alt="Logo da empresa" loading="lazy" className="w-full h-full object-contain p-1" />
                        : <iconify-icon icon="solar:camera-add-linear" class="text-gray-500 dark:text-zinc-600 text-2xl group-hover:text-yellow-400 transition-colors"></iconify-icon>
                      }
                      {logoPreview && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <iconify-icon icon="solar:camera-add-linear" class="text-yellow-400 text-xl"></iconify-icon>
                        </div>
                      )}
                    </button>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-mono uppercase bg-transparent border border-gray-300 dark:border-zinc-700 hover:border-yellow-400 hover:text-yellow-400 text-gray-900 dark:text-white px-4 py-2 transition-colors flex items-center gap-2">
                        <iconify-icon icon="solar:upload-linear" width="13"></iconify-icon>
                        {logoPreview ? 'Trocar Imagem' : 'Selecionar Imagem'}
                      </button>
                      {logoPreview && (
                        <button type="button"
                          onClick={() => { setLogoPreview(null); setFileToUpload(null); setEmpresa(prev => ({ ...prev, logo_url: null })); }}
                          className="text-xs font-mono uppercase text-red-500/60 hover:text-red-400 transition-colors flex items-center gap-1.5">
                          <iconify-icon icon="solar:trash-bin-trash-linear" width="12"></iconify-icon>
                          Remover
                        </button>
                      )}
                      <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-700">JPG, PNG ou WEBP · Máx. 2 MB</p>
                      {fileToUpload && (
                        <p className="text-[10px] font-mono text-yellow-400/70 flex items-center gap-1">
                          <iconify-icon icon="solar:info-circle-linear" width="11"></iconify-icon>
                          {fileToUpload.name} — salve para confirmar o upload
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Razão Social / Nome</label>
                    <input type="text" value={empresa.nome}
                      onChange={e => setEmpresa({ ...empresa, nome: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">CNPJ</label>
                    <input type="text" value={empresa.cnpj}
                      onChange={e => setEmpresa({ ...empresa, cnpj: maskCNPJ(e.target.value) })}
                      placeholder="00.000.000/0000-00"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Inscrição Estadual</label>
                    <input type="text" value={empresa.inscricao_estadual}
                      onChange={e => setEmpresa({ ...empresa, inscricao_estadual: e.target.value })}
                      placeholder="Isento ou número"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                </div>
              </div>

              {/* Card 2 — Contato */}
              <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 p-8 space-y-6">
                <h3 className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 tracking-widest">Contato</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">E-mail de Contato</label>
                    <input type="email" value={empresa.email_contato}
                      onChange={e => setEmpresa({ ...empresa, email_contato: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Telefone Fixo</label>
                    <input type="text" value={empresa.telefone}
                      onChange={e => setEmpresa({ ...empresa, telefone: maskTelefone(e.target.value) })}
                      placeholder="(00) 0000-0000"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">WhatsApp</label>
                    <input type="text" value={empresa.whatsapp}
                      onChange={e => setEmpresa({ ...empresa, whatsapp: maskTelefone(e.target.value) })}
                      placeholder="(00) 00000-0000"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Website</label>
                    <input type="url" value={empresa.website}
                      onChange={e => setEmpresa({ ...empresa, website: e.target.value })}
                      placeholder="https://"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Endereço Completo</label>
                    <textarea value={empresa.endereco}
                      onChange={e => setEmpresa({ ...empresa, endereco: e.target.value })}
                      rows={2}
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm resize-none" />
                  </div>
                </div>
              </div>

              {/* Card 3 — Dados Bancários (admin only) */}
              {profile?.perfil === 'admin' && (
                <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 p-8 space-y-6">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 text-[10px] font-mono uppercase">
                    <iconify-icon icon="solar:lock-password-linear" class="text-yellow-400/70" width="14"></iconify-icon>
                    Visível apenas para perfil admin · Aparece no PDF de Pedido Fechado
                  </div>
                  <h3 className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 tracking-widest">Dados Bancários</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Banco</label>
                        <input type="text" value={empresa.dados_bancarios.banco}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, banco: e.target.value } }))}
                          placeholder="Ex: Banco do Brasil — 001"
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Agência</label>
                        <input type="text" value={empresa.dados_bancarios.agencia}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, agencia: e.target.value } }))}
                          placeholder="0000-0"
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Conta</label>
                        <input type="text" value={empresa.dados_bancarios.conta}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, conta: e.target.value } }))}
                          placeholder="00000-0"
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Titular</label>
                        <input type="text" value={empresa.dados_bancarios.titular}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, titular: e.target.value } }))}
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Tipo de Chave Pix</label>
                        <select value={empresa.dados_bancarios.pix_tipo}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, pix_tipo: e.target.value } }))}
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm">
                          <option value="CNPJ">CNPJ</option>
                          <option value="CPF">CPF</option>
                          <option value="EMAIL">E-mail</option>
                          <option value="TELEFONE">Telefone</option>
                          <option value="ALEATORIA">Aleatória</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Chave Pix</label>
                        <input type="text" value={empresa.dados_bancarios.pix_chave}
                          onChange={e => setEmpresa(prev => ({ ...prev, dados_bancarios: { ...prev.dados_bancarios, pix_chave: e.target.value } }))}
                          placeholder={
                            empresa.dados_bancarios.pix_tipo === 'CPF'      ? '000.000.000-00'     :
                            empresa.dados_bancarios.pix_tipo === 'CNPJ'     ? '00.000.000/0000-00' :
                            empresa.dados_bancarios.pix_tipo === 'EMAIL'    ? 'exemplo@email.com'  :
                            empresa.dados_bancarios.pix_tipo === 'TELEFONE' ? '+55 11 00000-0000'  :
                            'chave aleatória'
                          }
                          className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:border-yellow-400 font-mono text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 4 — Contrato Padrão (admin only) */}
              {profile?.perfil === 'admin' && (
                <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 p-8 space-y-6">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-500 text-[10px] font-mono uppercase">
                    <iconify-icon icon="solar:lock-password-linear" class="text-yellow-400/70" width="14"></iconify-icon>
                    Visível apenas para perfil admin · Usado no PDF de Contrato
                  </div>
                  <h3 className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 tracking-widest">Contrato Padrão</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Texto das cláusulas</label>
                      <button
                        type="button"
                        onClick={() => updateContrato('contrato_texto', CONTRATO_PADRAO)}
                        className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 hover:text-yellow-400 transition-colors"
                      >↻ Restaurar texto padrão</button>
                    </div>
                    <textarea
                      value={templates.contrato?.contrato_texto || CONTRATO_PADRAO}
                      onChange={e => updateContrato('contrato_texto', e.target.value)}
                      rows={12}
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 font-mono text-xs focus:outline-none focus:border-yellow-400 resize-none"
                    />
                    <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-700">
                      {'Placeholders: {{numero_pedido}} · {{valor_total}} · {{prazo_entrega}} · {{forma_pagamento}} · {{cidade_empresa}} · {{estado_empresa}}'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSalvarContrato}
                    disabled={contratoSaving}
                    className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {contratoSaving ? (
                      <><iconify-icon icon="solar:spinner-linear" class="animate-spin"></iconify-icon> Salvando...</>
                    ) : (
                      <><iconify-icon icon="solar:diskette-linear"></iconify-icon> Salvar Contrato</>
                    )}
                  </button>
                </div>
              )}

              {/* Botão único para os 3 cards */}
              <button
                type="button"
                onClick={handleSalvarEmpresa}
                disabled={empresaSalvando}
                className="bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest px-6 py-3 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {empresaSalvando ? (
                  <>
                    <iconify-icon icon="solar:spinner-linear" class="animate-spin"></iconify-icon>
                    {logoUploading ? 'Enviando logo...' : 'Salvando...'}
                  </>
                ) : (
                  <>
                    <iconify-icon icon="solar:diskette-linear"></iconify-icon>
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Usuários ── */}
          {activeTab === 'usuarios' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:users-group-rounded-linear" class="text-yellow-400"></iconify-icon> Controle de Usuários
                </h2>
                <button onClick={() => openModal('usuario')} className="bg-yellow-400 text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:user-plus-linear"></iconify-icon> Convidar
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800">
                <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">
                  <div>Nome / E-mail</div><div>Perfil</div><div>Status</div><div className="text-right">Ações</div>
                </div>
                {usuarios.length === 0 && (
                  <div className="p-8 text-center">
                    <iconify-icon icon="solar:users-group-two-rounded-linear" width="28" className="text-gray-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum usuário cadastrado</p>
                  </div>
                )}
                {usuarios.map(u => (
                  <div key={u.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 transition-colors">
                    <div>
                      <div className="text-gray-900 dark:text-white font-medium text-sm">{u.nome}</div>
                      <div className="text-xs font-mono text-gray-500 dark:text-zinc-500">{u.email}</div>
                    </div>
                    <div><span className="text-[10px] border border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-900 px-2 py-1 uppercase font-mono">{u.perfil}</span></div>
                    <div>
                      <button onClick={() => handleToggleUsuario(u.id, u.ativo)} className={`flex items-center gap-2 text-xs font-mono uppercase ${u.ativo ? 'text-green-400' : 'text-gray-500 dark:text-zinc-600'}`}>
                        <iconify-icon icon={u.ativo ? 'solar:toggle-on-bold' : 'solar:toggle-off-linear'} width="24"></iconify-icon>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                    <div className="text-right">
                      <button onClick={() => openModal('usuario', u)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Materiais de Área ── */}
          {activeTab === 'materiais_area' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                    <iconify-icon icon="solar:slider-minimalistic-horizontal-linear" class="text-yellow-400"></iconify-icon> Matéria Prima
                  </h2>
                  <p className="text-[10px] font-mono text-gray-500 dark:text-zinc-600 mt-1 uppercase tracking-widest">
                    Matriz de preços por acabamento e espessura
                  </p>
                </div>
                <button
                  onClick={() => abrirMatModal()}
                  className="bg-yellow-400 text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(250,204,21,0.4)] transition-shadow flex items-center gap-2"
                >
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Novo Material
                </button>
              </div>

              {/* ── Busca e Ordenação ── */}
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <iconify-icon icon="solar:magnifer-linear" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-zinc-500" width="14"></iconify-icon>
                  <input
                    type="text"
                    value={matBusca}
                    onChange={e => setMatBusca(e.target.value)}
                    placeholder="Buscar por nome..."
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white pl-9 pr-4 py-2 text-xs font-mono focus:outline-none focus:border-yellow-400 transition-colors placeholder:text-gray-400 dark:text-zinc-700"
                  />
                </div>
                <select
                  value={matOrdem}
                  onChange={e => setMatOrdem(e.target.value)}
                  className="bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 px-3 py-2 text-[10px] font-mono uppercase focus:outline-none focus:border-yellow-400 transition-colors"
                >
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                  <option value="recente">Mais recente</option>
                  <option value="antigo">Mais antigo</option>
                  <option value="mais_var">Mais variações</option>
                  <option value="menos_var">Menos variações</option>
                </select>
              </div>

              {/* ── Filtro por categoria ── */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setMatFiltroCategoria('')}
                  className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                    matFiltroCategoria === ''
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                      : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
                  }`}
                >
                  Todas
                </button>
                {CATEGORIAS.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setMatFiltroCategoria(cat === matFiltroCategoria ? '' : cat)}
                    className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                      matFiltroCategoria === cat
                        ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                        : 'border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-400 dark:hover:border-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800 overflow-x-auto">
                {/* Header */}
                <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500 min-w-[640px]">
                  <div>Material</div>
                  <div>Categoria</div>
                  <div>Variações</div>
                  <div>Status</div>
                  <div className="text-right">Ações</div>
                </div>

                {loadingMateriais ? (
                  <div className="p-8 text-center font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700 animate-pulse">Carregando...</div>
                ) : materiaisAreaFiltrados.length === 0 ? (
                  <div className="p-8 text-center font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700">
                    {materiaisArea.length === 0 ? 'Nenhum material cadastrado' : 'Nenhum material encontrado'}
                  </div>
                ) : materiaisAreaFiltrados.map(m => {
                  const nVar = m.variacoes_precos?.length ?? 0;
                  return (
                    <div key={m.id} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 px-4 py-3 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/20 dark:hover:bg-zinc-900/20 transition-colors min-w-[640px]">
                      <div className="text-gray-900 dark:text-white uppercase font-medium text-sm">{m.nome}</div>
                      <div>
                        <span className="text-[10px] font-mono border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-black text-gray-500 dark:text-zinc-400 px-2 py-0.5">
                          {m.categoria}
                        </span>
                      </div>
                      <div>
                        {nVar > 0 ? (
                          <span className="text-[10px] font-mono text-yellow-400">
                            {nVar} {nVar !== 1 ? 'variações' : 'variação'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-gray-500 dark:text-zinc-600">Sem preços</span>
                        )}
                      </div>
                      <div>
                        <button
                          onClick={() => handleToggle(setMateriaisArea, materiaisArea, m.id)}
                          className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}
                        >
                          <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                          {m.ativo ? 'Ativo' : 'Oculto'}
                        </button>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrirMatModal(m)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                          <iconify-icon icon="solar:pen-linear"></iconify-icon>
                        </button>
                        <button onClick={e => handleDeleteMaterialArea(e, m.id)} className="text-gray-500 dark:text-zinc-500 hover:text-red-400 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                          <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Acabamentos ── */}
          {activeTab === 'materiais_lineares' && (
            <div className="space-y-6">
              {/* Sub-abas */}
              <div className="flex gap-px bg-zinc-800 border border-gray-300 dark:border-zinc-800 w-max mb-6">
                {[
                  { id: 'lineares',  label: 'Acabamentos Lineares'  },
                  { id: 'unitarios', label: 'Acabamentos Unitários' },
                ].map(s => (
                  <button key={s.id} onClick={() => setAcabamentoSubAba(s.id)}
                    className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      acabamentoSubAba === s.id
                        ? 'bg-yellow-400 text-black'
                        : 'bg-gray-50 dark:bg-[#020202] text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>

              {acabamentoSubAba === 'lineares' && (
                <>
                  <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                      <iconify-icon icon="solar:sort-from-bottom-to-top-linear" class="text-yellow-400"></iconify-icon> Acabamentos Lineares
                    </h2>
                    <button onClick={() => openModal('material_linear')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                      <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                    </button>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800">
                    <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">
                      <div>Descrição</div><div>Tipo</div><div>Preço por ml</div><div>Status</div><div className="text-right">Ações</div>
                    </div>
                    {loadingMateriais ? (
                      <div className="p-8 text-center font-mono text-[10px] uppercase text-gray-400 dark:text-zinc-700 animate-pulse">Carregando...</div>
                    ) : materiaisLineares.map(m => {
                      const isExpanded = expandedAcabamentos.has(m.id);
                      const precos = precosMaterial[m.id] ?? [];
                      const form = novoPrecosForm[m.id] ?? { materialId: '', preco: '' };
                      return (
                        <div key={m.id} className="border-b border-gray-200/50 dark:border-zinc-800/50">
                          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 p-4 items-center hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
                            <div className="text-gray-900 dark:text-white uppercase font-medium">{m.nome}</div>
                            <div><span className="text-[10px] font-mono border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-black px-2 py-1 uppercase text-gray-500 dark:text-zinc-400">{m.tipo?.replace('_', ' ')}</span></div>
                            <div className="font-mono text-gray-600 dark:text-zinc-300">R$ {Number(m.preco_ml).toFixed(2)}</div>
                            <div>
                              <button onClick={() => handleToggle(setMateriaisLineares, materiaisLineares, m.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${m.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}>
                                <iconify-icon icon={m.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                                {m.ativo ? 'Ativo' : 'Oculto'}
                              </button>
                            </div>
                            <div className="text-right flex items-center justify-end gap-2">
                              <button
                                onClick={() => toggleExpandAcabamento(m.id)}
                                title="Preços por material"
                                className={`text-[10px] font-mono uppercase flex items-center gap-1 border px-3 py-1 transition-colors ${isExpanded ? 'bg-yellow-400 text-black border-yellow-400' : 'text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border-gray-300 dark:border-zinc-800'}`}
                              >
                                <iconify-icon icon="solar:layers-minimalistic-linear" width="14"></iconify-icon>
                                {precos.length > 0 && <span>{precos.length}</span>}
                              </button>
                              <button onClick={() => openModal('material_linear', m)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                                <iconify-icon icon="solar:pen-linear"></iconify-icon>
                              </button>
                              <button onClick={e => handleDeleteMaterialLinear(e, m.id)} className="text-gray-500 dark:text-zinc-500 hover:text-red-400 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                                <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-900/40 px-6 py-4">
                              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-500 mb-3">Preços por material específico</p>
                              {precos.length === 0 && (
                                <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 mb-3">Nenhum preço especial. Usando preço base para todos os materiais.</p>
                              )}
                              <div className="space-y-1 mb-4">
                                {precos.map(p => (
                                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-zinc-800/60 text-sm">
                                    <span className="text-gray-700 dark:text-zinc-300 uppercase font-mono text-xs">{p.material_nome}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-gray-600 dark:text-zinc-400 text-xs">R$ {Number(p.preco_ml).toFixed(2)}/ml</span>
                                      <button onClick={() => handleRemovePrecoMaterial(m.id, p.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                                        <iconify-icon icon="solar:trash-bin-trash-linear" width="14"></iconify-icon>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2 items-center">
                                <select
                                  value={form.materialId}
                                  onChange={e => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, materialId: e.target.value } }))}
                                  className="flex-1 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-yellow-400"
                                >
                                  <option value="">Selecionar material...</option>
                                  {materiaisArea.map(mat => (
                                    <option key={mat.id} value={mat.id}>{mat.nome}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={form.preco}
                                  onChange={e => setNovoPrecosForm(prev => ({ ...prev, [m.id]: { ...form, preco: e.target.value } }))}
                                  placeholder="Preço/ml"
                                  className="w-28 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-yellow-400"
                                />
                                <button
                                  onClick={() => handleAddPrecoMaterial(m.id)}
                                  disabled={!form.materialId || !form.preco}
                                  className="bg-yellow-400 text-black text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                >
                                  <iconify-icon icon="solar:add-square-linear" width="14"></iconify-icon> Adicionar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {acabamentoSubAba === 'unitarios' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                      <iconify-icon icon="solar:box-linear" class="text-yellow-400"></iconify-icon>
                      Acabamentos Unitários
                    </h2>
                    <button onClick={() => openModal('acabamento_unitario')}
                      className="bg-white text-black text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                      <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                    </button>
                  </div>
                  <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">
                      <div>Nome</div><div>Subcategoria</div><div>Preço</div><div>Status</div><div className="text-right">Ações</div>
                    </div>
                    {acabamentosUnitarios.length === 0 ? (
                      <div className="p-8 text-center">
                        <iconify-icon icon="solar:box-linear" width="28" className="text-gray-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum acabamento cadastrado</p>
                      </div>
                    ) : acabamentosUnitarios.map(a => (
                      <div key={a.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
                        <div className="text-gray-900 dark:text-white uppercase font-medium">{a.nome}</div>
                        <div><span className="text-[10px] font-mono border border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-black px-2 py-1 uppercase text-gray-500 dark:text-zinc-400">{a.subcategoria}</span></div>
                        <div className="font-mono text-gray-600 dark:text-zinc-300">R$ {Number(a.preco_unitario).toFixed(2)}</div>
                        <div>
                          <button onClick={() => handleToggle(setAcabamentosUnitarios, acabamentosUnitarios, a.id)}
                            className={`flex items-center gap-2 text-[10px] font-mono uppercase ${a.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}>
                            <iconify-icon icon={a.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                            {a.ativo ? 'Ativo' : 'Oculto'}
                          </button>
                        </div>
                        <div className="text-right flex items-center justify-end gap-2">
                          <button onClick={() => openModal('acabamento_unitario', a)}
                            className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                            <iconify-icon icon="solar:pen-linear"></iconify-icon>
                          </button>
                          <button onClick={async e => {
                            e.stopPropagation();
                            if (!window.confirm('Excluir este acabamento?')) return;
                            const { error } = await supabase.from('produtos_avulsos').delete().eq('id', a.id);
                            if (error) { alert(error.message); return; }
                            setAcabamentosUnitarios(prev => prev.filter(x => x.id !== a.id));
                          }} className="text-gray-500 dark:text-zinc-500 hover:text-red-400 bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                            <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Produtos Avulsos ── */}
          {activeTab === 'produtos' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-gray-300 dark:border-zinc-800 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white uppercase flex items-center gap-2">
                  <iconify-icon icon="solar:box-linear" class="text-yellow-400"></iconify-icon> Produtos Avulsos / Insumos
                </h2>
                <button onClick={() => openModal('produto')} className="bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-shadow flex items-center gap-2">
                  <iconify-icon icon="solar:add-square-linear"></iconify-icon> Adicionar
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-[#020202] border border-gray-300 dark:border-zinc-800">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-300 dark:border-zinc-800 bg-gray-50 dark:bg-black text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">
                  <div>Produto</div><div>Preço Unit.</div><div>Exclusões / Acresc.</div><div>Status</div><div className="text-right">Ações</div>
                </div>
                {produtos.length === 0 && (
                  <div className="p-8 text-center">
                    <iconify-icon icon="solar:box-linear" width="28" className="text-gray-400 dark:text-zinc-800 block mx-auto mb-2"></iconify-icon>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-zinc-600">Nenhum produto cadastrado</p>
                  </div>
                )}
                {produtos.map(p => (
                  <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 p-4 border-b border-gray-200/50 dark:border-gray-300 dark:border-zinc-800/50 items-center hover:bg-gray-200/30 dark:hover:bg-zinc-900/30 transition-colors text-sm">
                    <div>
                      <div className="text-gray-900 dark:text-white uppercase font-medium">{p.nome}</div>
                      <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono mt-1">{p.subcategoria}</div>
                    </div>
                    <div className="font-mono text-gray-600 dark:text-zinc-300">R$ {p.precoUnitario.toFixed(2)}</div>
                    <div>
                      {p.incluiMaterial
                        ? <span className="text-[10px] text-yellow-400 border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 font-mono uppercase">Deduz Área</span>
                        : <span className="text-gray-500 dark:text-zinc-600">—</span>}
                    </div>
                    <div>
                      <button onClick={() => handleToggle(setProdutos, produtos, p.id)} className={`flex items-center gap-2 text-[10px] font-mono uppercase ${p.ativo ? 'text-yellow-400' : 'text-gray-500 dark:text-zinc-600'}`}>
                        <iconify-icon icon={p.ativo ? 'solar:eye-bold' : 'solar:eye-closed-linear'} width="16"></iconify-icon>
                        {p.ativo ? 'Ativo' : 'Oculto'}
                      </button>
                    </div>
                    <div className="text-right">
                      <button onClick={() => openModal('produto', p)} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 px-3 py-1">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



      {/* ══════════════════════════════════════════════════════════════════════
          MODAL GENÉRICO — Usuário, Linear, Produto, Pagamento
      ════════════════════════════════════════════════════════════════════════ */}
      {modalState.isOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="bg-gray-50 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 border-t-yellow-400 border-t-2 w-full max-w-lg relative z-10 shadow-2xl sys-reveal sys-active flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-300 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">
                {modalState.item ? 'Editar ' : 'Novo '}
                {modalState.type === 'usuario'             && 'Usuário'}
                {modalState.type === 'material_linear'     && 'Material/Acabamento Linear'}
                {modalState.type === 'produto'             && 'Produto Avulso'}
                {modalState.type === 'pagamento'           && 'Método de Pagamento'}
                {modalState.type === 'acabamento_unitario' && 'Acabamento Unitário'}
              </h3>
              <button onClick={closeModal} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <iconify-icon icon="solar:close-square-linear" width="24"></iconify-icon>
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">

              {modalState.type === 'usuario' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  {!modalState.item && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">E-mail (Login)</label>
                        <input type="email" name="email" required className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Senha Inicial</label>
                        <div className="relative">
                          <input
                            type={mostrarSenha ? 'text' : 'password'}
                            value={novaSenha}
                            onChange={(e) => setNovaSenha(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            minLength={8}
                            required
                            className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 pr-12 text-sm focus:outline-none focus:border-yellow-400 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setMostrarSenha(!mostrarSenha)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-white transition-colors"
                          >
                            <iconify-icon icon={mostrarSenha ? 'solar:eye-closed-linear' : 'solar:eye-linear'} className="text-lg"></iconify-icon>
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-600">O usuário poderá alterar depois no primeiro acesso.</p>
                      </div>
                    </>
                  )}
                  {modalState.item && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">E-mail</label>
                      <div className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 px-4 py-3 text-sm font-mono">{modalState.item.email}</div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Perfil de Acesso</label>
                    <select name="perfil" defaultValue={modalState.item?.perfil || 'vendedor'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono uppercase">
                      <option value="vendedor">Vendedor(a)</option>
                      <option value="medidor">Medidor(a)</option>
                      <option value="admin">Administrador</option>
                      <option value="admin_medidor">Admin + Medidor</option>
                      <option value="vendedor_medidor">Vendedor + Medidor</option>
                    </select>
                  </div>
                </>
              )}

              {modalState.type === 'material_linear' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Descrição</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Tipo da Cobrança</label>
                      <select name="tipo" defaultValue={modalState.item?.tipo || 'acabamento_aresta'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                        <option value="acabamento_aresta">Acabamento de Aresta</option>
                        <option value="material_linear">Material Linear Físico</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço / metro linear</label>
                      <input type="number" step="0.01" name="preco_ml" required defaultValue={modalState.item?.preco_ml || ''} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'produto' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Produto</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Subcategoria</label>
                      <input type="text" name="subcategoria" required defaultValue={modalState.item?.subcategoria} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço Unitário (UN)</label>
                      <input type="number" step="0.01" name="precoUnitario" required defaultValue={modalState.item?.precoUnitario || ''} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'acabamento_unitario' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Acabamento</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome}
                      placeholder="Ex: Rodameio, Soleira, Cuba"
                      className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Subcategoria</label>
                      <input type="text" name="subcategoria" defaultValue={modalState.item?.subcategoria || ''}
                        placeholder="Ex: Cuba, Soleira, Rodameio"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-mono text-yellow-400">Preço</label>
                      <input type="number" step="0.01" name="preco_unitario" required defaultValue={modalState.item?.preco_unitario || ''}
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    </div>
                  </div>
                </>
              )}

              {modalState.type === 'pagamento' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Identificação Comercial</label>
                    <input type="text" name="nome" required defaultValue={modalState.item?.nome} placeholder="Ex: Cartão de Crédito - Stone" className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Tipo Base</label>
                    <select name="tipo" defaultValue={modalState.item?.tipo || 'Pix'} className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono">
                      <option value="Pix">Pix / Transferência</option>
                      <option value="Crédito">Cartão de Crédito</option>
                      <option value="Débito">Cartão de Débito</option>
                      <option value="Boleto">Boleto Bancário</option>
                      <option value="Dinheiro">Dinheiro Físico</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Campos Dinâmicos (Separar por vírgula)</label>
                    <input type="text" name="campos" required defaultValue={modalState.item?.campos?.join(', ')} placeholder="bandeira, maquininha, n_parcelas" className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 font-mono" />
                    <div className="text-[10px] text-gray-500 dark:text-zinc-600 font-mono">Campos que o vendedor precisa preencher no fechamento.</div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-gray-300 dark:border-zinc-800 mt-auto">
                <button type="button" onClick={closeModal} className="flex-1 bg-transparent border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest py-4 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-white text-black text-xs font-bold uppercase tracking-widest py-4 border border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all flex items-center justify-center gap-2">
                  <iconify-icon icon="solar:diskette-linear"></iconify-icon> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020202; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        @media (prefers-reduced-motion: no-preference) {
          .sys-reveal { opacity: 0; transition: opacity 0.5s ease; }
          .sys-active.sys-reveal { opacity: 1; }
        }
      `}} />

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Material de Área (controlado, com matriz de preços)
      ════════════════════════════════════════════════════════════════════════ */}
      {matModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={fecharMatModal}></div>
          <div className="relative bg-gray-50 dark:bg-[#050505] border border-gray-300 dark:border-zinc-800 border-t-2 border-t-yellow-400 w-full max-w-3xl z-10 shadow-2xl flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-300 dark:border-zinc-800 shrink-0 gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 mb-0.5">
                  [ {matItem ? 'EDITAR' : 'NOVO'}_MATERIAL ]
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                  {matItem ? 'Editar Material' : 'Cadastrar Material'}
                </h3>
              </div>
              <button onClick={fecharMatModal} className="text-gray-500 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white transition-colors p-1 shrink-0 mt-0.5">
                <iconify-icon icon="solar:close-square-linear" width="22"></iconify-icon>
              </button>
            </div>

            {/* Body (scroll) */}
            <div className="overflow-y-auto overflow-x-visible flex-1 custom-scrollbar px-6 pt-6 pb-4 space-y-6">

              {/* Nome + Categoria */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Nome do Material</label>
                  <input
                    type="text"
                    value={matNome}
                    onChange={e => setMatNome(e.target.value)}
                    placeholder="Ex: Preto Absoluto"
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-500">Categoria</label>
                  <select
                    value={matCategoria}
                    onChange={e => setMatCategoria(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors font-mono"
                  >
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Info espessuras disponíveis */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-200/50 dark:bg-zinc-900/50 border border-gray-300 dark:border-zinc-800">
                <iconify-icon icon="solar:info-circle-linear" class="text-gray-500 dark:text-zinc-500" width="13"></iconify-icon>
                <span className="text-[10px] font-mono text-gray-500 dark:text-zinc-500 uppercase tracking-widest">
                  Espessuras disponíveis para {matCategoria}:{' '}
                  <span className="text-gray-600 dark:text-zinc-300">
                    {espessurasDisponiveis === null
                      ? 'Sem espessura (opção única)'
                      : espessurasDisponiveis === false
                      ? 'Campo livre'
                      : espessurasDisponiveis.join(' · ')}
                  </span>
                </span>
              </div>

              {/* ── Matriz de variações ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-mono text-gray-500 dark:text-zinc-400 tracking-widest">
                    Variações de Acabamento & Preço
                  </label>
                  <button
                    type="button"
                    onClick={addVariacao}
                    className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400 border border-yellow-400/30 bg-yellow-400/5 px-3 py-1.5 hover:bg-yellow-400/10 transition-colors"
                  >
                    <iconify-icon icon="solar:add-square-linear" width="13"></iconify-icon>
                    Adicionar Variação
                  </button>
                </div>

                {/* Tabela unificada: header + linhas no mesmo container */}
                <div className="border border-gray-300 dark:border-zinc-800">

                  {/* Cabeçalho */}
                  <div
                    className="grid gap-3 bg-black/70 px-4 py-2 text-[9px] font-mono uppercase tracking-widest text-gray-500 dark:text-zinc-600 border-b border-gray-300 dark:border-zinc-800"
                    style={{ gridTemplateColumns: espessurasDisponiveis === null ? '2fr 1fr 1fr 1fr 32px' : '2fr 1.2fr 1fr 1fr 1fr 32px' }}
                  >
                    <div>Acabamento</div>
                    {espessurasDisponiveis !== null && <div>Espessura</div>}
                    <div className="text-center">Custo (R$/m²)</div>
                    <div className="text-center">Frete (R$/m²)</div>
                    <div className="text-center">Venda (R$/m²)</div>
                    <div></div>
                  </div>

                  {/* Linhas de variação */}
                  {(matVariacoes ?? []).map((v, idx) => (
                    <div
                      key={v._id}
                      className="grid gap-3 items-center px-4 py-2.5 bg-gray-50 dark:bg-zinc-950 border-b border-gray-300 dark:border-zinc-800/60 last:border-b-0 hover:bg-gray-200/40 dark:hover:bg-zinc-900/40 transition-colors"
                      style={{ gridTemplateColumns: espessurasDisponiveis === null ? '2fr 1fr 1fr 1fr 32px' : '2fr 1.2fr 1fr 1fr 1fr 32px' }}
                    >
                      {/* Acabamento */}
                      <select
                        value={v.acabamento}
                        onChange={e => updateVariacao(idx, 'acabamento', e.target.value)}
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                      >
                        {ACABAMENTOS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>

                      {/* Espessura */}
                      {espessurasDisponiveis === null ? null :
                       espessurasDisponiveis === false ? (
                         <input
                           type="text"
                           value={v.espessura}
                           onChange={e => updateVariacao(idx, 'espessura', e.target.value)}
                           placeholder="Ex: 2cm"
                           className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                         />
                       ) : (
                         <select
                           value={v.espessura}
                           onChange={e => updateVariacao(idx, 'espessura', e.target.value)}
                           className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono"
                         >
                           {espessurasDisponiveis.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                         </select>
                       )}

                      {/* Preço de Custo */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.precoCusto}
                        onChange={e => updateVariacao(idx, 'precoCusto', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      {/* Frete */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.frete}
                        onChange={e => updateVariacao(idx, 'frete', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      {/* Preço de Venda */}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.precoVenda}
                        onChange={e => updateVariacao(idx, 'precoVenda', e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-gray-50 dark:bg-black border border-gray-300 dark:border-zinc-800 text-yellow-400 text-xs px-2 py-2 focus:outline-none focus:border-yellow-400 font-mono text-center"
                      />

                      {/* Remover */}
                      <button
                        type="button"
                        onClick={() => removeVariacao(idx)}
                        disabled={matVariacoes.length === 1}
                        className="w-8 h-8 flex items-center justify-center border border-gray-300 dark:border-zinc-800 text-gray-500 dark:text-zinc-600 hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <iconify-icon icon="solar:trash-bin-trash-linear" width="13"></iconify-icon>
                      </button>
                    </div>
                  ))}

                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-6 py-4 border-t border-gray-300 dark:border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={fecharMatModal}
                className="flex-1 bg-transparent border border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest py-3 hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarMaterial}
                disabled={matSalvando}
                className="flex-1 bg-yellow-400 text-black text-xs font-bold uppercase tracking-widest py-3 hover:shadow-[0_0_20px_rgba(250,204,21,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {matSalvando
                  ? <><iconify-icon icon="solar:spinner-linear" class="animate-spin" width="14"></iconify-icon> Salvando...</>
                  : <><iconify-icon icon="solar:diskette-linear" width="14"></iconify-icon> Salvar Material</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
