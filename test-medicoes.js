import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://klfykujuyslgyypvfxth.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZnlrdWp1eXNsZ3l5cHZmeHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTM0MzUsImV4cCI6MjA5MDU2OTQzNX0.pfA7XexuMso1u2GTi-C07Y6dGx2x8EJjtN5wlxFHMy0');
async function test() {
  const { data, error } = await supabase
    .from('ambientes')
    .select('*, medicoes(*)')
    .eq('id', 'd258a17f-ff76-46ff-b785-bb7c84798bd1');
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}
test();
