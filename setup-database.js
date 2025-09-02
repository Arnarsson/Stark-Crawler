import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('Setting up database schema...');

// Read the SQL schema
const schema = fs.readFileSync('./sql/schema.sql', 'utf8');

console.log('Note: The schema needs to be run directly in your Supabase SQL Editor.');
console.log('Please go to your Supabase dashboard:');
console.log('1. Navigate to SQL Editor');
console.log('2. Create a new query');
console.log('3. Copy and paste the contents of sql/schema.sql');
console.log('4. Run the query');
console.log('\nAlternatively, if the table already exists, you may need to:');
console.log('1. Drop the existing table: DROP TABLE IF EXISTS stark_products CASCADE;');
console.log('2. Re-run the schema to create it with proper constraints');

// Let's check what constraints currently exist
const { data: constraints, error } = await supabase
  .from('stark_products')
  .select('*')
  .limit(0);

if (!error) {
  console.log('\n✅ Table exists but may need constraint updates.');
  console.log('The crawler needs proper unique constraints to work.');
}