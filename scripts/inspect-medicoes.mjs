// Script de inspeção: mostra valores reais de tipo_medicao nas medições do Supabase.
// Uso: node scripts/inspect-medicoes.mjs
//
// Requer: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local
// Se a RLS bloquear com anon key, adicione SUPABASE_SERVICE_ROLE_KEY ao .env.local
// e o script usará ela automaticamente.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Ler .env.local ────────────────────────────────────────────────────────────
function parseEnv(filePath) {
    try {
        return Object.fromEntries(
            readFileSync(filePath, 'utf8')
                .split('\n')
                .filter(l => l.includes('=') && !l.startsWith('#'))
                .map(l => {
                    const idx = l.indexOf('=');
                    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
                })
        );
    } catch { return {}; }
}

const env = {
    ...parseEnv(resolve(__dirname, '../.env')),
    ...parseEnv(resolve(__dirname, '../.env.local')),
};

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não encontradas no .env.local');
    process.exit(1);
}

const isServiceRole = !!env.SUPABASE_SERVICE_ROLE_KEY;
console.log(`🔑  Usando chave: ${isServiceRole ? 'SERVICE ROLE (bypass RLS)' : 'ANON (sujeito a RLS)'}\n`);

// ── Query via REST ────────────────────────────────────────────────────────────
const url = `${SUPABASE_URL}/rest/v1/medicoes`
    + `?select=id,tipo,pedido_id,status,json_medicao`
    + `&order=created_at.desc`
    + `&limit=5`;

const res = await fetch(url, {
    headers: {
        apikey:        SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept:        'application/json',
    },
});

if (!res.ok) {
    const body = await res.text();
    console.error(`❌  Erro HTTP ${res.status}:`, body);
    process.exit(1);
}

const rows = await res.json();

if (!Array.isArray(rows) || rows.length === 0) {
    console.log('⚠️  Nenhuma medição retornada. Provável bloqueio de RLS com anon key.');
    console.log('   Adicione SUPABASE_SERVICE_ROLE_KEY=<chave> ao .env.local e rode novamente.');
    process.exit(0);
}

console.log(`✅  ${rows.length} medição(ões) retornada(s)\n`);
console.log('═'.repeat(72));

for (const m of rows) {
    console.log(`\n📋  Medição: ${m.id}`);
    console.log(`    tipo (top-level):  ${JSON.stringify(m.tipo)}`);
    console.log(`    pedido_id:         ${JSON.stringify(m.pedido_id)}`);
    console.log(`    status:            ${JSON.stringify(m.status)}`);

    const ambientes = m.json_medicao?.ambientes ?? [];
    if (ambientes.length === 0) {
        console.log('    json_medicao.ambientes: [] (vazio ou null)');
    } else {
        console.log(`    json_medicao.ambientes (${ambientes.length}):`);
        for (const amb of ambientes) {
            console.log(`      • nome:                    ${JSON.stringify(amb.nome ?? amb.ambiente)}`);
            console.log(`        tipo_medicao:             ${JSON.stringify(amb.tipo_medicao)}`);
            console.log(`        extras?.tipo_medicao:     ${JSON.stringify(amb.extras?.tipo_medicao)}`);
        }
    }
    console.log('─'.repeat(72));
}
