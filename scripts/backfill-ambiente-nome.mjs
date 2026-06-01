// Backfill de orcamento_pecas.ambiente_nome
//
// Para cada peça em orcamento_pecas onde ambiente_nome IS NULL ou vazio,
// deriva o nome correto via pecas.ambiente_id → ambientes.nome e atualiza.
//
// Uso:
//   node scripts/backfill-ambiente-nome.mjs          # executa o update
//   node scripts/backfill-ambiente-nome.mjs --dry-run # só lista, sem alterar

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun  = process.argv.includes('--dry-run');

// ── Ler .env.local ────────────────────────────────────────────────────────────
function parseEnv(p) {
    try {
        return Object.fromEntries(
            readFileSync(p, 'utf8').split('\n')
                .filter(l => l.includes('=') && !l.startsWith('#'))
                .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
        );
    } catch { return {}; }
}

const env = { ...parseEnv(resolve(__dirname, '../.env')), ...parseEnv(resolve(__dirname, '../.env.local')) };
const BASE = env.VITE_SUPABASE_URL;
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
    console.error('❌  SUPABASE_SERVICE_ROLE_KEY não encontrada em .env.local');
    console.error('   Adicione a chave service role e rode novamente.');
    process.exit(1);
}

const h = {
    apikey:        KEY,
    Authorization: `Bearer ${KEY}`,
    Accept:        'application/json',
    'Content-Type': 'application/json',
    Prefer:        'return=minimal',
};

async function get(path) {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: h });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
    return r.json();
}

async function patch(path, body) {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
}

console.log(isDryRun ? '🔍  DRY RUN — nenhum dado será alterado\n' : '🚀  MODO LIVE — atualizações serão aplicadas\n');

// ── 1. Buscar todas as peças com ambiente_nome NULL ou vazio ──────────────────
// Equivalente a:
//   SELECT op.id, op.peca_id, p.ambiente_id, a.nome AS ambiente_nome_calculado
//   FROM orcamento_pecas op
//   JOIN pecas p ON p.id = op.peca_id
//   JOIN ambientes a ON a.id = p.ambiente_id
//   WHERE op.ambiente_nome IS NULL OR op.ambiente_nome = ''

console.log('⏳  Buscando orcamento_pecas com ambiente_nome NULL ou vazio...');

// PostgREST limita a 1000 linhas por padrão; usamos range header para paginar se necessário.
let allRows = [];
let offset  = 0;
const PAGE  = 1000;

while (true) {
    const rows = await get(
        `orcamento_pecas` +
        `?or=(ambiente_nome.is.null,ambiente_nome.eq.)` +
        `&select=id,peca_id,pecas(ambiente_id,ambientes(nome))` +
        `&offset=${offset}&limit=${PAGE}`
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows = allRows.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
}

console.log(`   Encontradas: ${allRows.length} linha(s)\n`);

if (allRows.length === 0) {
    console.log('✅  Nada a fazer — todos os registros já têm ambiente_nome.');
    process.exit(0);
}

// ── 2. Separar os que têm nome resolvível dos que não têm ──────────────────────
const comNome  = [];
const semNome  = [];

for (const row of allRows) {
    const nome = row.pecas?.ambientes?.nome ?? null;
    if (nome) {
        comNome.push({ id: row.id, nome });
    } else {
        semNome.push(row.id);
    }
}

console.log(`   Com nome resolvível: ${comNome.length}`);
console.log(`   Sem nome (FK ausente ou ambiente excluído): ${semNome.length}`);
if (semNome.length > 0) console.log(`   IDs sem resolução: ${semNome.slice(0, 10).join(', ')}${semNome.length > 10 ? ` ... (+${semNome.length - 10})` : ''}\n`);

if (isDryRun) {
    console.log('\n📋  DRY RUN — atualizações que seriam feitas:');
    const previa = {};
    for (const { nome } of comNome) previa[nome] = (previa[nome] ?? 0) + 1;
    for (const [nome, qtd] of Object.entries(previa)) {
        console.log(`   "${nome}": ${qtd} peça(s)`);
    }
    console.log(`\n   Total que seria atualizado: ${comNome.length}`);
    process.exit(0);
}

// ── 3. Atualizar em lotes agrupados por nome (um PATCH por nome único) ─────────
const byNome = {};
for (const { id, nome } of comNome) {
    (byNome[nome] ??= []).push(id);
}

let totalOk  = 0;
let totalErr = 0;
const erros  = [];
const nomes  = Object.entries(byNome);

console.log(`\n⏳  Atualizando ${comNome.length} registros em ${nomes.length} lote(s)...`);

for (let i = 0; i < nomes.length; i++) {
    const [nome, ids] = nomes[i];
    // Quebra em chunks de 100 IDs para não exceder URL limit
    const chunks = [];
    for (let j = 0; j < ids.length; j += 100) chunks.push(ids.slice(j, j + 100));

    for (const chunk of chunks) {
        try {
            await patch(
                `orcamento_pecas?id=in.(${chunk.join(',')})`,
                { ambiente_nome: nome }
            );
            totalOk += chunk.length;
        } catch (err) {
            totalErr += chunk.length;
            erros.push(...chunk.map(id => ({ id, erro: err.message })));
        }
    }

    if ((i + 1) % 50 === 0 || i === nomes.length - 1) {
        console.log(`   ${totalOk + totalErr} / ${comNome.length} processados  (ok: ${totalOk}  erros: ${totalErr})`);
    }
}

// ── 4. Resumo final ───────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('RESUMO:');
console.log(`  Total com nome resolvível:  ${comNome.length}`);
console.log(`  Atualizados com sucesso:    ${totalOk}`);
console.log(`  Erros:                      ${totalErr}`);
console.log(`  Sem FK resolvível (skip):   ${semNome.length}`);
if (erros.length > 0) {
    console.log('\n  IDs com erro:');
    erros.slice(0, 20).forEach(e => console.log(`    ${e.id}: ${e.erro}`));
    if (erros.length > 20) console.log(`    ... e mais ${erros.length - 20}`);
}
console.log('═'.repeat(60));
process.exit(totalErr > 0 ? 1 : 0);
