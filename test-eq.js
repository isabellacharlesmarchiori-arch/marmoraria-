import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://klfykujuyslgyypvfxth.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZnlrdWp1eXNsZ3l5cHZmeHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTM0MzUsImV4cCI6MjA5MDU2OTQzNX0.pfA7XexuMso1u2GTi-C07Y6dGx2x8EJjtN5wlxFHMy0');

async function test() {
  try {
    let query = supabase.from('pecas').select('*');
    // What if value is literal string "undefined"?
    query = query.eq('ambiente_id', "undefined");
    console.log('Worked for string "undefined"');
    // What if value is actual undefined?
    query = query.eq('ambiente_id', undefined);
    console.log('Worked for actual undefined');
  } catch (e) {
    console.log('Threw JS Error:', e.message);
  }
}

test();
