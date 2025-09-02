import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('🔍 Verifying Database Schema');
console.log('================================\n');

// Test 1: Check if tables exist
console.log('📊 Checking tables...');
const tables = ['stark_products', 'stark_product_changes', 'stark_crawl_logs'];

for (const table of tables) {
  const { error } = await supabase
    .from(table)
    .select('*')
    .limit(0);
  
  if (error) {
    console.log(`   ❌ ${table}: Not found or error`);
  } else {
    console.log(`   ✅ ${table}: Exists`);
  }
}

// Test 2: Try inserting a test product
console.log('\n📝 Testing insert operation...');
const testProduct = {
  url: 'https://test.example.com/product-' + Date.now(),
  name: 'Test Product ' + Date.now(),
  sku: 'TEST' + Date.now(),
  price_numeric: 99.99,
  category: 'Test Category'
};

const { data: inserted, error: insertError } = await supabase
  .from('stark_products')
  .insert(testProduct)
  .select()
  .single();

if (insertError) {
  console.log('   ❌ Insert failed:', insertError.message);
} else {
  console.log('   ✅ Insert successful');
  console.log(`      Product ID: ${inserted.id}`);
  console.log(`      Product Name: ${inserted.name}`);
}

// Test 3: Try upsert with SKU conflict
if (inserted) {
  console.log('\n🔄 Testing upsert operation...');
  const upsertProduct = {
    ...testProduct,
    name: 'Updated Test Product',
    price_numeric: 149.99
  };
  
  const { data: upserted, error: upsertError } = await supabase
    .from('stark_products')
    .upsert(upsertProduct, {
      onConflict: 'sku',
      ignoreDuplicates: false
    })
    .select()
    .single();
  
  if (upsertError) {
    console.log('   ❌ Upsert failed:', upsertError.message);
  } else {
    console.log('   ✅ Upsert successful');
    console.log(`      Updated price: ${upserted.price_numeric}`);
  }
  
  // Clean up test data
  await supabase
    .from('stark_products')
    .delete()
    .eq('id', inserted.id);
  console.log('   🧹 Test data cleaned up');
}

// Test 4: Check existing products
console.log('\n📦 Current database status:');
const { count } = await supabase
  .from('stark_products')
  .select('*', { count: 'exact', head: true });

console.log(`   Total products: ${count || 0}`);

console.log('\n✅ Schema verification complete!');