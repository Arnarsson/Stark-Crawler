import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('Adding unique constraint to stark_products table...');

// First, let's check if we can add a unique constraint via SQL
const { data, error } = await supabase.rpc('query', {
  query: 'ALTER TABLE stark_products ADD CONSTRAINT stark_products_url_key UNIQUE (url);'
}).catch(async (err) => {
  // If RPC doesn't work, let's try through the REST API
  console.log('RPC not available, trying alternative method...');
  
  // For now, let's just check what's in the table
  const { data: products, error: selectError } = await supabase
    .from('stark_products')
    .select('*')
    .limit(5);
  
  if (selectError) {
    console.error('Error selecting:', selectError);
  } else {
    console.log('Sample products:', products);
    console.log('\nNote: You may need to add a UNIQUE constraint on the "url" column in your Supabase dashboard.');
    console.log('Go to Table Editor > stark_products > Edit table > Add constraint');
  }
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('✅ Constraint added successfully!');
}