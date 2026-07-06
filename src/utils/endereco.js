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

/**
 * ViaCEP — busca CEP a partir do logradouro. Requer UF (2 letras), cidade (≥3) e
 * rua (≥3). Considera a localização (UF+cidade), então não devolve rua de outra
 * cidade como a busca genérica por texto fazia. Retorna um array de resultados
 * (pode ter 0, 1 ou vários) no formato normalizado do projeto. Nunca lança.
 */
export async function buscarCepPorLogradouro(uf, cidade, logradouro) {
  const _uf     = (uf || '').trim();
  const _cidade = (cidade || '').trim();
  const _rua    = (logradouro || '').trim();
  if (_uf.length !== 2 || _cidade.length < 3 || _rua.length < 3) return [];
  try {
    const res = await fetch(
      `https://viacep.com.br/ws/${encodeURIComponent(_uf)}/${encodeURIComponent(_cidade)}/${encodeURIComponent(_rua)}/json/`
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(viacepParaEndereco);
  } catch {
    return [];
  }
}

/**
 * ViaCEP — busca o endereço a partir de um CEP (8 dígitos). Retorna objeto
 * normalizado ou null. Nunca lança.
 */
export async function buscarEnderecoPorCep(cep) {
  const limpo = (cep || '').replace(/\D/g, '');
  if (limpo.length !== 8) return null;
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const data = await res.json();
    if (data?.erro) return null;
    return viacepParaEndereco(data);
  } catch {
    return null;
  }
}

/** Normaliza um item do ViaCEP para o formato de endereço do projeto. */
export function viacepParaEndereco(item) {
  return {
    cep:    item?.cep ?? '',
    rua:    item?.logradouro ?? '',
    bairro: item?.bairro ?? '',
    cidade: item?.localidade ?? '',
    estado: item?.uf ?? '',
  };
}
