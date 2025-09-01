import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://supabasekong-f4808sk00g8s08s8o84o4ww0.135.181.101.70.sslip.io',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc1Njc1OTg2MCwiZXhwIjo0OTEyNDMzNDYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.gPToiL-2O5k1NvB4TjL0qAbU7iTwVCefDLE9j5y7qT4'
);

console.log('Testing Supabase connection...');

// Test selecting from stark_products table
const { data, error } = await supabase
  .from('stark_products')
  .select('*')
  .limit(1);

if (error) {
  console.error('Connection failed:', error);
  process.exit(1);
} else {
  console.log('✅ Supabase connection successful!');
  console.log('Table exists and is accessible.');
  if (data && data.length > 0) {
    console.log('Sample data:', data[0]);
  } else {
    console.log('Table is empty - ready for data.');
  }
}
