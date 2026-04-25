-- Adiciona campos de identificação e pagamento à tabela empresas.
-- Esses dados aparecem no cabeçalho dos PDFs e no bloco
-- "Dados Bancários" do PDF de Pedido Fechado.

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS website            text,
  ADD COLUMN IF NOT EXISTS whatsapp           text,
  ADD COLUMN IF NOT EXISTS dados_bancarios    jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN empresas.dados_bancarios IS
'Estrutura: { banco: text, agencia: text, conta: text, titular: text,
              pix_chave: text, pix_tipo: text (CPF|CNPJ|EMAIL|TELEFONE|ALEATORIA) }
 Visível apenas no PDF de Pedido Fechado e na aba Configurações para perfil admin.';
