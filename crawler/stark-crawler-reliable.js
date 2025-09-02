/**
 * STARK Product Crawler - Reliable High Volume Version
 * Optimized for continuous crawling with robust error handling
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configuration
const config = {
  baseUrl: 'https://www.stark.dk',
  sitemaps: [
    'https://www.stark.dk/sitemapvariants1.xml',
    'https://www.stark.dk/sitemapvariants2.xml'
  ],
  batchSize: 5,          // Smaller batch size for reliability
  maxProducts: 1000,     // Process 1000 at a time
  startOffset: 100,      // Skip already processed
  pageTimeout: 10000,    // 10 second timeout
  maxRetries: 1,         // Retry once on failure
  pauseBetweenBatches: 2000  // 2 second pause
};

// Statistics
const stats = {
  urlsDiscovered: 0,
  productsProcessed: 0,
  productsAdded: 0,
  productsUpdated: 0,
  errors: 0,
  skipped: 0,
  timeouts: 0,
  startTime: Date.now()
};

// Parse sitemap
async function parseSitemap(url) {
  try {
    logger.info(`Parsing sitemap: ${url}`);
    const response = await fetch(url);
    const xml = await response.text();
    
    const parser = new XMLParser();
    const result = parser.parse(xml);
    
    const urls = [];
    const urlset = result.urlset?.url || [];
    
    for (const item of Array.isArray(urlset) ? urlset : [urlset]) {
      if (item?.loc && isValidProductUrl(item.loc)) {
        urls.push(item.loc);
      }
    }
    
    return urls;
  } catch (error) {
    logger.error(`Failed to parse sitemap ${url}:`, error.message);
    return [];
  }
}

// Better product URL validation
function isValidProductUrl(url) {
  // Must have product ID
  if (!url.includes('?id=')) return false;
  
  // Must not be in non-product sections
  const excludePatterns = [
    '/brands/', '/konkurrence', '/klima', '/kundeservice',
    '/om-stark', '/inspiration', '/services', '/blog',
    '/customer', '/bygger', '/projekter', 'pdf', 'jpg'
  ];
  
  for (const pattern of excludePatterns) {
    if (url.includes(pattern)) return false;
  }
  
  // Should contain product-like paths
  const includePatterns = [
    '/maskiner/', '/vaerktoej/', '/byggematerialer/',
    '/el-artikler/', '/vvs/', '/havemaskiner/',
    '/sikkerhed/', '/beslag/', '/dore/', '/vinduer/'
  ];
  
  // If URL contains any product category, it's likely valid
  for (const pattern of includePatterns) {
    if (url.includes(pattern)) return true;
  }
  
  // Default: include if has ID and not excluded
  return true;
}

// Extract product with retries
async function extractProductWithRetry(page, url, retries = 0) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.pageTimeout
    });
    
    // Wait briefly for content
    await page.waitForTimeout(800);
    
    const product = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        name: null,
        sku: null,
        ean: null,
        price_numeric: null,
        in_stock: null,
        category: null
      };
      
      // Product name - multiple selectors
      const nameSelectors = ['h1.page-title', 'h1', '.product-name', '[itemprop="name"]'];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          data.name = el.innerText.trim();
          break;
        }
      }
      
      // SKU extraction - comprehensive search
      const bodyText = document.body.innerText || '';
      
      // Try various SKU patterns
      const skuPatterns = [
        /Varenr\.?:?\s*(\d+)/i,
        /Varenummer:?\s*(\d+)/i,
        /Artikelnr\.?:?\s*(\d+)/i,
        /Produktnr\.?:?\s*(\d+)/i,
        /SKU:?\s*(\d+)/i,
        /Item #:?\s*(\d+)/i
      ];
      
      for (const pattern of skuPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          data.sku = match[1];
          break;
        }
      }
      
      // If no SKU found, try extracting from URL
      if (!data.sku) {
        const urlMatch = window.location.href.match(/id=(\d+)-(\d+)/);
        if (urlMatch) {
          data.sku = urlMatch[1] + urlMatch[2];
        }
      }
      
      // EAN
      const eanMatch = bodyText.match(/EAN:?\s*(\d{13})/i);
      if (eanMatch) data.ean = eanMatch[1];
      
      // Price - try multiple selectors
      const priceSelectors = [
        '.price-wrapper .price',
        '.product-price',
        '.price',
        '.regular-price',
        '[itemprop="price"]'
      ];
      
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || el.textContent;
          const match = text.match(/([\d.,]+)/);
          if (match) {
            data.price_numeric = parseFloat(
              match[1].replace(/\./g, '').replace(',', '.')
            );
            break;
          }
        }
      }
      
      // Stock status
      const stockSelectors = ['.stock-status', '.availability', '.stock'];
      for (const sel of stockSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el.innerText || '').toLowerCase();
          data.in_stock = text.includes('på lager') || 
                         text.includes('tilgængelig') ||
                         text.includes('in stock');
          break;
        }
      }
      
      // Category
      const breadcrumbs = document.querySelectorAll('.breadcrumbs a, .breadcrumb a');
      if (breadcrumbs.length > 1) {
        data.category = breadcrumbs[1]?.innerText?.trim();
      }
      
      return data;
    });
    
    product.url = url;
    return product;
    
  } catch (error) {
    if (error.message.includes('Timeout') || error.message.includes('timeout')) {
      stats.timeouts++;
      if (retries < config.maxRetries) {
        await page.waitForTimeout(1000);
        return extractProductWithRetry(page, url, retries + 1);
      }
    }
    throw error;
  }
}

// Save product
async function saveProduct(product) {
  try {
    // Must have at least name or SKU
    if (!product.name && !product.sku) {
      stats.skipped++;
      return false;
    }
    
    // Check if exists
    let existingProduct = null;
    if (product.sku) {
      const { data } = await supabase
        .from('stark_products')
        .select('id')
        .eq('sku', product.sku)
        .single();
      existingProduct = data;
    }
    
    const productData = {
      url: product.url,
      name: product.name || 'Unknown Product',
      sku: product.sku || null,
      ean: product.ean || null,
      price_numeric: product.price_numeric || null,
      currency: 'DKK',
      in_stock: product.in_stock,
      category: product.category || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (existingProduct) {
      await supabase
        .from('stark_products')
        .update(productData)
        .eq('id', existingProduct.id);
      stats.productsUpdated++;
      return true;
    } else {
      productData.first_seen_at = new Date().toISOString();
      const { error } = await supabase
        .from('stark_products')
        .insert(productData);
      
      if (!error) {
        stats.productsAdded++;
        return true;
      }
    }
    
  } catch (error) {
    logger.debug(`Save error: ${error.message}`);
    return false;
  }
}

// Main crawler
async function crawl() {
  logger.info('🚀 Starting Reliable STARK Crawler');
  logger.info(`Configuration: ${config.maxProducts} products, batch size ${config.batchSize}`);
  
  // Check database
  const { count: initialCount } = await supabase
    .from('stark_products')
    .select('*', { count: 'exact', head: true });
  
  logger.info(`Current products in database: ${initialCount || 0}`);
  
  // Discover URLs
  logger.info('Discovering product URLs...');
  const allUrls = [];
  
  for (const sitemapUrl of config.sitemaps) {
    const urls = await parseSitemap(sitemapUrl);
    allUrls.push(...urls);
  }
  
  // Process subset
  const urlsToProcess = allUrls.slice(config.startOffset, config.startOffset + config.maxProducts);
  stats.urlsDiscovered = urlsToProcess.length;
  
  logger.info(`Total URLs: ${allUrls.length}, Processing: ${urlsToProcess.length}`);
  logger.info(`Starting from offset: ${config.startOffset}`);
  
  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const startTime = Date.now();
  let consecutiveErrors = 0;
  
  // Process URLs in batches
  for (let i = 0; i < urlsToProcess.length; i += config.batchSize) {
    const batch = urlsToProcess.slice(i, Math.min(i + config.batchSize, urlsToProcess.length));
    
    const batchPromises = batch.map(async (url) => {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 StarkCrawler/3.0',
        viewport: { width: 1280, height: 720 },
        locale: 'da-DK'
      });
      
      const page = await context.newPage();
      
      try {
        const product = await extractProductWithRetry(page, url);
        const saved = await saveProduct(product);
        
        if (saved) {
          consecutiveErrors = 0;  // Reset error counter on success
        }
        
        stats.productsProcessed++;
        
      } catch (error) {
        stats.errors++;
        consecutiveErrors++;
        
        // Log every 5th error to avoid spam
        if (stats.errors % 5 === 0) {
          logger.debug(`Error #${stats.errors}: ${error.message.substring(0, 50)}`);
        }
        
        // Stop if too many consecutive errors
        if (consecutiveErrors > 20) {
          logger.error('Too many consecutive errors, stopping batch');
          throw new Error('Too many consecutive errors');
        }
      } finally {
        await context.close();
      }
    });
    
    // Execute batch
    try {
      await Promise.all(batchPromises);
    } catch (batchError) {
      logger.error(`Batch failed: ${batchError.message}`);
      break;
    }
    
    // Progress report
    if (stats.productsProcessed > 0 && stats.productsProcessed % 20 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = stats.productsProcessed / elapsed;
      
      logger.info(`📊 Progress: ${stats.productsProcessed}/${urlsToProcess.length}`);
      logger.info(`   Added: ${stats.productsAdded} | Updated: ${stats.productsUpdated}`);
      logger.info(`   Errors: ${stats.errors} | Timeouts: ${stats.timeouts}`);
      logger.info(`   Rate: ${rate.toFixed(1)} products/sec`);
    }
    
    // Pause between batches
    if (i + config.batchSize < urlsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, config.pauseBetweenBatches));
    }
  }
  
  await browser.close();
  
  // Final statistics
  const totalTime = (Date.now() - startTime) / 1000;
  const { count: finalCount } = await supabase
    .from('stark_products')
    .select('*', { count: 'exact', head: true });
  
  logger.info('═══════════════════════════════════════');
  logger.info('     CRAWL SESSION COMPLETED');
  logger.info('═══════════════════════════════════════');
  logger.info(`⏱  Duration: ${Math.round(totalTime)}s (${(totalTime/60).toFixed(1)} min)`);
  logger.info(`📦 Products Processed: ${stats.productsProcessed}`);
  logger.info(`✅ Added: ${stats.productsAdded}`);
  logger.info(`🔄 Updated: ${stats.productsUpdated}`);
  logger.info(`⚠️  Errors: ${stats.errors} (${((stats.errors/stats.productsProcessed)*100).toFixed(1)}%)`);
  logger.info(`⏳ Timeouts: ${stats.timeouts}`);
  logger.info(`🏃 Rate: ${(stats.productsProcessed/totalTime).toFixed(1)} products/sec`);
  logger.info(`💾 Total in Database: ${finalCount} products`);
  logger.info('═══════════════════════════════════════');
}

// Check environment
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

// Run crawler
crawl().catch(error => {
  logger.error('Crawler failed:', error);
  process.exit(1);
});