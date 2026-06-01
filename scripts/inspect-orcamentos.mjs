// Script de inspeção: mostra colunas e estrutura de orcamentos específicos.
// Uso: node scripts/inspect-orcamentos.mjs
//
// Requer SUPABASE_SERVICE_ROLE_KEY em .env.local (bypass RLS).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const URL  = env.VITE_SUPABASE_URL;
const KEY  = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) { console.error('❌  Credenciais não encontradas'); process.exit(1); }
console.log(`🔑  Chave: ${env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE ROLE' : 'ANON'}\n`);

const ORC_ID = 'e2fec7df-1d20-4c14-b8c9-2f3b75e059e5';

const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
function get(path) { return fetch(`${URL}/rest/v1/${path}`, { headers: h }).then(r => r.json()); }

// ── Passo 1: orcamento_pecas com join em pecas ────────────────────────────────
// Equivalente a:
//   SELECT op.id, op.orcamento_id, op.ambiente_nome, op.item_nome,
//          p.ambiente_id, p.nome_livre
//   FROM orcamento_pecas op LEFT JOIN pecas p ON p.id = op.peca_id
//   WHERE op.orcamento_id = '...'
//   ORDER BY op.created_at;
const rows = await get(
    `orcamento_pecas?orcamento_id=eq.${ORC_ID}` +
    `&select=id,orcamento_id,ambiente_nome,item_nome,pecas(ambiente_id,nome_livre)` +
    `&order=created_at`
);

console.log(`\n${'═'.repeat(72)}`);
console.log(`PASSO 1 — orcamento_pecas do orçamento ${ORC_ID}`);
console.log(`${'═'.repeat(72)}`);

if (!Array.isArray(rows) || rows.length === 0) {
    console.log('⚠️  Sem linhas (RLS bloqueou ou orcamento_id inexistente).');
} else {
    console.log(`\nTotal de peças: ${rows.length}`);
    const ambNomesUnicos = [...new Set(rows.map(r => r.ambiente_nome))];
    console.log(`ambiente_nome únicos (JSON.stringify p/ distinguir null/""/string):`);
    ambNomesUnicos.forEach(v => console.log(`  ${JSON.stringify(v)}`));
    console.log('\nDetalhes por peça:');
    for (const r of rows) {
        console.log(
            `  id=${r.id.slice(-8)}` +
            `  ambiente_nome=${JSON.stringify(r.ambiente_nome)}` +
            `  item_nome=${JSON.stringify(r.item_nome)}` +
            `  peca.ambiente_id=${JSON.stringify(r.pecas?.ambiente_id ?? null)}` +
            `  peca.nome_livre=${JSON.stringify(r.pecas?.nome_livre ?? null)}`
        );
    }
}

// ── Passo 2 (confirmação): o orcamento pai ─────────────────────────────────────
const [orc] = await get(`orcamentos?id=eq.${ORC_ID}&select=id,nome_versao,ambiente_id`);
console.log(`\n${'═'.repeat(72)}`);
console.log(`PASSO 2 — orçamento pai`);
console.log(`${'═'.repeat(72)}`);
if (orc) {
    console.log(`  id:           ${orc.id}`);
    console.log(`  nome_versao:  ${JSON.stringify(orc.nome_versao)}`);
    console.log(`  ambiente_id:  ${JSON.stringify(orc.ambiente_id)}`);
} else {
    console.log('  (não retornado)');
}
