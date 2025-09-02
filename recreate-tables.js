import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const { Client } = pg;

// Try using the PostgreSQL connection directly
const client = new Client({
  connectionString: `postgresql://postgres.fvjegvihdbfrqtawmbkr:${process.env.SUPABASE_KEY}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false }
});

async function recreateTables() {
  try {
    console.log('Attempting to connect to database...');
    await client.connect();
    console.log('Connected successfully!');

    // Drop existing tables
    console.log('Dropping existing tables...');
    await client.query('DROP TABLE IF EXISTS stark_product_changes CASCADE;');
    await client.query('DROP TABLE IF EXISTS stark_crawl_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS stark_products CASCADE;');
    console.log('Tables dropped successfully.');

    // Read and execute schema
    console.log('Creating new tables with proper constraints...');
    const schema = fs.readFileSync('./sql/schema.sql', 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        await client.query(statement + ';');
      }
    }

    console.log('✅ Tables created successfully with proper constraints!');

    // Verify the tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'stark_%'
      ORDER BY table_name;
    `);

    console.log('\nCreated tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Check constraints
    const constraints = await client.query(`
      SELECT 
        tc.table_name, 
        tc.constraint_name, 
        tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
      AND tc.table_name = 'stark_products'
      ORDER BY tc.constraint_type;
    `);

    console.log('\nConstraints on stark_products:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.constraint_type}: ${row.constraint_name}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nTrying alternative connection method...');
    
    // If direct connection fails, try through Supabase API
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    console.log('Please run the following SQL in your Supabase dashboard:');
    console.log('\n--- SQL to execute ---\n');
    console.log('DROP TABLE IF EXISTS stark_product_changes CASCADE;');
    console.log('DROP TABLE IF EXISTS stark_crawl_logs CASCADE;');
    console.log('DROP TABLE IF EXISTS stark_products CASCADE;');
    console.log('\n--- Then run the contents of sql/schema.sql ---\n');
    
  } finally {
    await client.end();
  }
}

recreateTables().catch(console.error);