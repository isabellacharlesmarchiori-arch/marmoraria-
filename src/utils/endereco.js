/**
 * Formata um endereço que pode estar armazenado como string JSON ou texto puro.
 * JSON: {"cep":"16400-050","rua":"Av. Tiradentes","numero":"2810",...}
 * Texto: "Av. Tiradentes, 2810, Centro, Araçatuba"
 * Saída: "Av. Tiradentes, 2810 — CEP 16400-050"
 */
export function formatarEndereco(str) {
  if (!str) return '';
  try {
    const a = JSON.parse(str);
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      const linha1 = [a.rua, a.numero].filter(Boolean).join(', ');
      const cep    = a.cep ? `CEP ${a.cep}` : '';
      return [linha1, cep].filter(Boolean).join(' — ') || str;
    }
  } catch {}
  return str;
}

/**
 * Retorna um objeto de endereço a partir de string JSON ou texto puro.
 * Útil para pré-preencher formulários.
 */
export function parseEndereco(str) {
  const empty = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };
  if (!str) return empty;
  try {
    const a = JSON.parse(str);
    if (a && typeof a === 'object' && !Array.isArray(a)) return { ...empty, ...a };
  } catch {}
  // fallback: tenta "Rua, Numero, Bairro, Cidade" por vírgula
  const partes = str.split(',').map(s => s.trim());
  return { ...empty, rua: partes[0] || '', numero: partes[1] || '', bairro: partes[2] || '', cidade: partes[3] || '' };
}
