import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://klfykujuyslgyypvfxth.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZnlrdWp1eXNsZ3l5cHZmeHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTM0MzUsImV4cCI6MjA5MDU2OTQzNX0.pfA7XexuMso1u2GTi-C07Y6dGx2x8EJjtN5wlxFHMy0');

async function test() {
  const dadosOrcamento = {
    empresa_id: 'a1b2c3d4-0000-0000-0000-000000000001',
    ambiente_id: 'd258a17f-ff76-46ff-b785-bb7c84798bd1',
    vendedor_id: 'a1b2c3d4-0000-0000-0001-000000000002', // Using what is likely a mock user or skipping
    nome_versao: 'Orçamento',
    status: 'rascunho',
    desconto_total: 0,
    valor_total: 100,
  };

  const { data, error } = await supabase
    .from('orcamentos')
    .insert(dadosOrcamento)
    .select('id')
    .single();

  console.log('Error:', error);
  console.log('Data:', data);
}

test();
