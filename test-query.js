import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('ambientes')
    .select(`
      id, nome,
      orcamentos(id, nome_versao, valor_total, status, created_at,
        orcamento_pecas(id, valor_total, pecas(nome_livre), materiais(nome))
      )
    `)
    .eq('projeto_id', '6fa6163b-6ea1-4ad8-bf1f-c5e2b5fa05bd');

  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}

test();
