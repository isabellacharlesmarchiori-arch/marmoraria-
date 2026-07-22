import { supabase } from '../lib/supabase';

// Nome-sentinela do projeto-fantasma de orçamentos avulsos.
// Um único por empresa, compartilhado com toda a equipe.
export const NOME_PROJETO_AVULSO = '[Avulsos]';

// Um projeto é o avulso da empresa se tem o nome-sentinela e não tem cliente.
// Aceita tanto o shape raw do Supabase (cliente_id) quanto o normalizado (cliente_id).
export function isProjetoAvulso(p) {
    return !!p && p.nome === NOME_PROJETO_AVULSO && !p.cliente_id;
}

// Busca o projeto '[Avulsos]' da empresa; cria na primeira vez que alguém precisar.
// O vendedor_id fica com quem criou primeiro (irrelevante na prática — o projeto
// nasce compartilhado e é coletivo). Retorna { data, error }.
export async function getOrCreateProjetoAvulso(empresaId, userId) {
    if (!empresaId || !userId) {
        return { data: null, error: new Error('empresaId e userId são obrigatórios') };
    }

    const { data: existente, error: errBusca } = await supabase
        .from('projetos')
        .select('id, nome, cliente_id, vendedor_id, compartilhado')
        .eq('empresa_id', empresaId)
        .eq('nome', NOME_PROJETO_AVULSO)
        .is('cliente_id', null)
        .limit(1)
        .maybeSingle();

    if (errBusca) return { data: null, error: errBusca };
    if (existente) return { data: existente, error: null };

    const { data: criado, error: errInsert } = await supabase
        .from('projetos')
        .insert({
            nome:          NOME_PROJETO_AVULSO,
            empresa_id:    empresaId,
            vendedor_id:   userId,
            cliente_id:    null,
            status:        'orcado',
            compartilhado: true, // coletivo por definição
        })
        .select('id, nome, cliente_id, vendedor_id, compartilhado')
        .single();

    return { data: criado, error: errInsert };
}
