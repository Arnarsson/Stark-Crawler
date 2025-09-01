import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('Checking products in database...');

const { data: products, error, count } = await supabase
  .from('stark_products')
  .select('*', { count: 'exact' })
  .limit(10);

if (error) {
  console.error('Error:', error);
} else {
  console.log(`Total products in database: ${count || 0}`);
  if (products && products.length > 0) {
    console.log('\nSample products:');
    products.forEach(p => {
      console.log(`- ${p.name || 'No name'} (SKU: ${p.sku || 'N/A'})`);
    });
  }
}