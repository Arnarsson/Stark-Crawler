import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('Checking stark_products table...');

const { data, error, count } = await supabase
  .from('stark_products')
  .select('*', { count: 'exact', head: true });

if (error) {
  console.error('Error:', error);
} else {
  console.log('✅ Table exists!');
  console.log(`Current row count: ${count || 0}`);
}