import dotenv from 'dotenv';
import axios from 'axios';
import pg from 'pg';
import chalk from 'chalk';

const { Client } = pg;

// Load environment variables
dotenv.config();

console.log(chalk.blue.bold('\n🔧 STARK Crawler - Connection Test Suite\n'));
console.log(chalk.gray('=' .repeat(50)));

// Test results tracker
const results = {
  supabase: false,
  postgres: false,
  slack: false,
  n8n: false
};

// Test Supabase connection
async function testSupabase() {
  console.log(chalk.yellow('\n📊 Testing Supabase connection...'));
  
  try {
    const response = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );
    
    console.log(chalk.green('✅ Supabase connection successful'));
    console.log(chalk.gray(`   URL: ${process.env.SUPABASE_URL}`));
    console.log(chalk.gray(`   Status: ${response.status}`));
    results.supabase = true;
  } catch (error) {
    console.log(chalk.red('❌ Supabase connection failed'));
    console.log(chalk.red(`   Error: ${error.message}`));
    if (error.response) {
      console.log(chalk.red(`   Status: ${error.response.status}`));
      console.log(chalk.red(`   Data: ${JSON.stringify(error.response.data)}`));
    }
  }
}

// Test direct PostgreSQL connection
async function testPostgres() {
  console.log(chalk.yellow('\n🗄️  Testing PostgreSQL connection...'));
  
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD_DIRECT || process.env.DB_PASSWORD
  });
  
  try {
    await client.connect();
    
    // Test query
    const res = await client.query('SELECT NOW()');
    console.log(chalk.green('✅ PostgreSQL connection successful'));
    console.log(chalk.gray(`   Host: ${process.env.DB_HOST || 'localhost'}`));
    console.log(chalk.gray(`   Database: ${process.env.DB_NAME || 'postgres'}`));
    console.log(chalk.gray(`   Time: ${res.rows[0].now}`));
    
    // Check if stark_products table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'stark_products'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      const countRes = await client.query('SELECT COUNT(*) FROM stark_products');
      console.log(chalk.gray(`   Products in database: ${countRes.rows[0].count}`));
    } else {
      console.log(chalk.yellow('   ⚠️  Table stark_products does not exist yet'));
    }
    
    results.postgres = true;
  } catch (error) {
    console.log(chalk.red('❌ PostgreSQL connection failed'));
    console.log(chalk.red(`   Error: ${error.message}`));
  } finally {
    await client.end();
  }
}

// Test Slack webhook
async function testSlack() {
  console.log(chalk.yellow('\n💬 Testing Slack webhook...'));
  
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log(chalk.gray('   ⏭️  Slack webhook not configured (optional)'));
    return;
  }
  
  try {
    const response = await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: '🧪 STARK Crawler connection test successful!'
    });
    
    console.log(chalk.green('✅ Slack webhook successful'));
    console.log(chalk.gray(`   Status: ${response.status}`));
    results.slack = true;
  } catch (error) {
    console.log(chalk.red('❌ Slack webhook failed'));
    console.log(chalk.red(`   Error: ${error.message}`));
  }
}

// Test n8n webhook
async function testN8n() {
  console.log(chalk.yellow('\n🔄 Testing n8n webhook...'));
  
  if (!process.env.N8N_WEBHOOK_URL) {
    console.log(chalk.gray('   ⏭️  n8n webhook not configured (optional)'));
    return;
  }
  
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      event: 'connection_test',
      timestamp: new Date().toISOString(),
      source: 'STARK Crawler'
    });
    
    console.log(chalk.green('✅ n8n webhook successful'));
    console.log(chalk.gray(`   URL: ${process.env.N8N_WEBHOOK_URL}`));
    console.log(chalk.gray(`   Status: ${response.status}`));
    results.n8n = true;
  } catch (error) {
    console.log(chalk.yellow('⚠️  n8n webhook returned error (may be normal if workflow not active)'));
    console.log(chalk.gray(`   Error: ${error.message}`));
  }
}

// Display environment summary
function displayEnvironment() {
  console.log(chalk.blue('\n🔍 Environment Configuration:'));
  console.log(chalk.gray('=' .repeat(50)));
  
  const envVars = {
    'Supabase URL': process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing',
    'Supabase Key': process.env.SUPABASE_KEY ? '✅ Set' : '❌ Missing',
    'Supabase Service Key': process.env.SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ Missing',
    'DB Host': process.env.DB_HOST || 'localhost',
    'DB Port': process.env.DB_PORT || '5432',
    'DB Name': process.env.DB_NAME || 'postgres',
    'Slack Webhook': process.env.SLACK_WEBHOOK_URL ? '✅ Set' : '⏭️  Optional',
    'n8n Webhook': process.env.N8N_WEBHOOK_URL ? '✅ Set' : '⏭️  Optional',
    'Crawler Concurrency': process.env.CRAWLER_CONCURRENCY || '2',
    'Log Level': process.env.LOG_LEVEL || 'info'
  };
  
  for (const [key, value] of Object.entries(envVars)) {
    console.log(chalk.gray(`   ${key}: ${value}`));
  }
}

// Main test runner
async function runTests() {
  displayEnvironment();
  
  await testSupabase();
  await testPostgres();
  await testSlack();
  await testN8n();
  
  // Summary
  console.log(chalk.blue('\n📋 Test Summary:'));
  console.log(chalk.gray('=' .repeat(50)));
  
  const critical = results.supabase && results.postgres;
  const optional = `Slack: ${results.slack ? '✅' : '⏭️'}, n8n: ${results.n8n ? '✅' : '⏭️'}`;
  
  if (critical) {
    console.log(chalk.green.bold('✅ All critical connections successful!'));
    console.log(chalk.gray(`   Optional services: ${optional}`));
    console.log(chalk.green('\n🚀 Ready for deployment!'));
  } else {
    console.log(chalk.red.bold('❌ Critical connection failures detected'));
    if (!results.supabase) console.log(chalk.red('   - Supabase connection failed'));
    if (!results.postgres) console.log(chalk.red('   - PostgreSQL connection failed'));
    console.log(chalk.yellow('\n⚠️  Please check your environment configuration'));
  }
  
  console.log(chalk.gray('\n' + '=' .repeat(50)));
  process.exit(critical ? 0 : 1);
}

// Run all tests
runTests().catch(error => {
  console.error(chalk.red.bold('\n💥 Test suite failed:'), error);
  process.exit(1);
});