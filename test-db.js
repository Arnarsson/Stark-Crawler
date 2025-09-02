import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Test 1: Simple select
const { data: test1, error: error1 } = await supabase
  .from('stark_products')
  .select('*');

console.log('Test 1 - Simple select:');
console.log('Products found:', test1 ? test1.length : 0);
if (error1) console.log('Error:', error1);

// Test 2: Count
const { count, error: error2 } = await supabase
  .from('stark_products')
  .select('*', { count: 'exact', head: true });

console.log('\nTest 2 - Count:');
console.log('Count:', count);
if (error2) console.log('Error:', error2);

// Test 3: List products
if (test1 && test1.length > 0) {
  console.log('\nProducts in database:');
  test1.forEach(p => {
    console.log(`- ${p.name} (SKU: ${p.sku})`);
  });
}
