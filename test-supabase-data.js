import dotenv from 'dotenv';
import axios from 'axios';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

console.log(chalk.blue.bold('\n📊 STARK Crawler - Supabase Data Test\n'));
console.log(chalk.gray('=' .repeat(50)));

async function testSupabaseData() {
  try {
    // Test 1: Get product count
    console.log(chalk.yellow('\n📈 Fetching product statistics...'));
    const countResponse = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?select=id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    
    const totalCount = countResponse.headers['content-range']?.split('/')[1] || 'Unknown';
    console.log(chalk.green(`✅ Total products in database: ${totalCount}`));
    
    // Test 2: Get sample products
    console.log(chalk.yellow('\n🛍️  Fetching sample products...'));
    const productsResponse = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/stark_products?limit=5&order=updated_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );
    
    if (productsResponse.data && productsResponse.data.length > 0) {
      console.log(chalk.green(`✅ Successfully retrieved ${productsResponse.data.length} products`));
      console.log(chalk.gray('\nRecent products:'));
      
      productsResponse.data.forEach((product, index) => {
        console.log(chalk.cyan(`\n${index + 1}. ${product.name || 'Unnamed Product'}`));
        console.log(chalk.gray(`   SKU: ${product.sku || 'N/A'}`));
        console.log(chalk.gray(`   Price: ${product.price || 'N/A'} ${product.currency || ''}`));
        console.log(chalk.gray(`   In Stock: ${product.in_stock ? '✅' : '❌'}`));
        console.log(chalk.gray(`   Updated: ${product.updated_at}`));
      });
    } else {
      console.log(chalk.yellow('⚠️  No products found in database'));
    }
    
    // Test 3: Check table structure
    console.log(chalk.yellow('\n🔍 Checking table structure...'));
    const schemaResponse = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );
    
    console.log(chalk.green('✅ Table structure accessible'));
    
    // Test 4: Test write permission (optional)
    console.log(chalk.yellow('\n✏️  Testing write permissions...'));
    try {
      const testProduct = {
        sku: 'TEST-' + Date.now(),
        name: 'Connection Test Product',
        price: 0.01,
        currency: 'USD',
        in_stock: true,
        url: 'https://test.example.com',
        scraped_at: new Date().toISOString()
      };
      
      const writeResponse = await axios.post(
        `${process.env.SUPABASE_URL}/rest/v1/stark_products`,
        testProduct,
        {
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        }
      );
      
      console.log(chalk.green('✅ Write permissions verified'));
      
      // Clean up test product
      await axios.delete(
        `${process.env.SUPABASE_URL}/rest/v1/stark_products?sku=eq.${testProduct.sku}`,
        {
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY}`
          }
        }
      );
      console.log(chalk.gray('   Test product cleaned up'));
      
    } catch (writeError) {
      console.log(chalk.yellow('⚠️  Write permissions not available (may need service key)'));
      console.log(chalk.gray(`   Error: ${writeError.message}`));
    }
    
    // Summary
    console.log(chalk.blue('\n📋 Supabase Connection Summary:'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log(chalk.green('✅ Connection: ACTIVE'));
    console.log(chalk.green(`✅ Products: ${totalCount}`));
    console.log(chalk.green('✅ Read Access: VERIFIED'));
    console.log(chalk.green('🚀 Ready for crawler operations!'));
    
  } catch (error) {
    console.log(chalk.red('❌ Supabase test failed'));
    console.log(chalk.red(`   Error: ${error.message}`));
    if (error.response) {
      console.log(chalk.red(`   Status: ${error.response.status}`));
      console.log(chalk.red(`   Data: ${JSON.stringify(error.response.data)}`));
    }
    process.exit(1);
  }
  
  console.log(chalk.gray('\n' + '=' .repeat(50)));
}

// Run the test
testSupabaseData().catch(error => {
  console.error(chalk.red.bold('\n💥 Test failed:'), error);
  process.exit(1);
});