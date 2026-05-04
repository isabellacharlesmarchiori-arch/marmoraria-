import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { maskCNPJ, maskTelefone } from '../../utils/masks';
import { CONTRATO_PADRAO } from '../../utils/contratoPadrao';
import { TEMPLATE_DEFAULTS } from '../../utils/pdfOptions';

export default function AbaEmpresa() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? null;

  const [empresa, setEmpresa] = useState({
    nome: '', email_contato: '', logo_url: null, cnpj: '',
    inscricao_estadual: '', telefone: '', whatsapp: '',
    endereco: '', website: '',
    dados_bancarios: { banco: '', agencia: '', conta: '', titular: '', pix_chave: '', pix_tipo: 'CNPJ' },
  });
  const [templates,      setTemplates]      = useState({ orcamento: null, pedido: null, contrato: null });
  const [contratoSaving, setContratoSaving] = useState(false);

  const fileInputRef                        = useRef(null);
  const [logoPreview,    setLogoPreview]    = useState(null);
  const [fileToUpload,   setFileToUpload]   = useState(null);
  const [logoUploading,  setLogoUploading]  = useState(false);
  const [empresaSalvando,setEmpresaSalvando]= useState(false);

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

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileToUpload(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSalvarEmpresa = async () => {
    if (!empresaId) return;
    setEmpresaSalvando(true);
    try {
      let logoUrl = empresa.logo_url;

      if (fileToUpload) {
        setLogoUploading(true);
        const ext  = fileToUpload.name.split('.').pop().toLowerCase();
        const path = `${empresaId}/logo.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('logos_empresa')
          .upload(path, fileToUpload, { upsert: true, contentType: fileToUpload.type });

        if (upErr) throw upErr;

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

  return (
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
  );
}
