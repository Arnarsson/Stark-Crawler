/**
 * Test script for STARK crawler
 * Tests extraction from a single product page
 */

import { chromium } from 'playwright';
import { extractProduct } from './stark-crawler.js';
import dotenv from 'dotenv';

dotenv.config();

// Test URL - a real STARK product
const TEST_URL = 'https://www.stark.dk/ytong-plade-200-mm-200-mm-600-mm?id=6400-5224838';

async function test() {
  console.log('🧪 Testing STARK crawler...\n');
  console.log(`URL: ${TEST_URL}\n`);
  
  const browser = await chromium.launch({
    headless: process.env.CRAWLER_HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'StarkCrawler/1.0 Test',
      viewport: { width: 1280, height: 1024 },
      locale: 'da-DK',
    });
    
    const page = await context.newPage();
    
    console.log('📄 Loading page...');
    const startTime = Date.now();
    
    const product = await extractProduct(page, TEST_URL);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Extraction completed in ${duration}s\n`);
    
    console.log('📦 Extracted Product Data:');
    console.log('─'.repeat(40));
    console.log(`Name:       ${product.name || '(not found)'}`);
    console.log(`SKU:        ${product.sku || '(not found)'}`);
    console.log(`EAN:        ${product.ean || '(not found)'}`);
    console.log(`VVS:        ${product.vvs || '(not found)'}`);
    console.log(`Price:      ${product.price_text || '(not found)'}`);
    console.log(`Price (num): ${product.price_numeric || '(not found)'}`);
    console.log(`In Stock:   ${product.in_stock !== null ? product.in_stock : '(not found)'}`);
    console.log(`Category:   ${product.category || '(not found)'}`);
    console.log(`Brand:      ${product.brand || '(not found)'}`);
    console.log('─'.repeat(40));
    
    // Validation
    console.log('\n🔍 Validation:');
    const hasIdentifier = product.sku || product.ean;
    if (hasIdentifier) {
      console.log('✅ Product has valid identifier (SKU or EAN)');
    } else {
      console.log('⚠️  Warning: No SKU or EAN found');
    }
    
    if (product.name) {
      console.log('✅ Product name extracted');
    } else {
      console.log('⚠️  Warning: Product name not found');
    }
    
    // Test database connection (optional)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      console.log('\n🗄️  Database connection configured');
      console.log('   Run "npm run crawl" to start full crawl');
    } else {
      console.log('\n⚠️  Database not configured');
      console.log('   Copy .env.example to .env and add credentials');
    }
    
    console.log('\n✨ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run test
test().catch(console.error);