/**
 * STARK Product Crawler - Bulk Version
 * Optimized for high-volume crawling
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

// Configuration for bulk crawling
const config = {
  baseUrl: 'https://www.stark.dk',
  sitemaps: [
    'https://www.stark.dk/sitemapvariants1.xml',
    'https://www.stark.dk/sitemapvariants2.xml'
  ],
  batchSize: 10,        // Process 10 products in parallel
  maxProducts: 5000,    // Large batch size
  startOffset: 100,     // Skip first 100 (already crawled)
  pageTimeout: 15000,   // Reduced timeout for faster processing
  retryFailed: false    // Skip retries to save time
};

// Statistics
const stats = {
  urlsDiscovered: 0,
  productsProcessed: 0,
  productsAdded: 0,
  productsUpdated: 0,
  errors: 0,
  skipped: 0,
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
      if (item?.loc && isRealProductUrl(item.loc)) {
        urls.push(item.loc);
      }
    }
    
    return urls;
  } catch (error) {
    logger.error(`Failed to parse sitemap ${url}:`, error.message);
    return [];
  }
}

// Check if URL is a real product
function isRealProductUrl(url) {
  if (!url.includes('?id=')) return false;
  
  const skipPatterns = [
    '/brands/', '/konkurrence', '/klima', '/kundeservice/',
    '/om-stark/', '/inspiration/', '/services/', '/catalogsearch/',
    '/customer/', '/bygger', '/projekter/', '.pdf', '.jpg', '.png'
  ];
  
  return !skipPatterns.some(pattern => url.includes(pattern));
}

// Extract product data - simplified for speed
async function extractProduct(page, url) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.pageTimeout
    });
    
    await page.waitForTimeout(1000);
    
    const product = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        name: null,
        sku: null,
        ean: null,
        vvs: null,
        price_text: null,
        price_numeric: null,
        currency: 'DKK',
        in_stock: null,
        category: null,
        brand: null
      };
      
      // Name
      const nameEl = document.querySelector('h1.page-title, h1, .product-name');
      if (nameEl) data.name = nameEl.innerText.trim();
      
      // SKU - look for product number
      const bodyText = document.body.innerText;
      const skuMatch = bodyText.match(/(?:Varenr|SKU|Produktnummer|Artikelnr)[:\s]*(\d+)/i);
      if (skuMatch) data.sku = skuMatch[1];
      
      // Try getting from URL if not found
      if (!data.sku) {
        const urlMatch = window.location.href.match(/id=(\d+)-(\d+)/);
        if (urlMatch) data.sku = urlMatch[1] + urlMatch[2];
      }
      
      // EAN
      const eanMatch = bodyText.match(/(?:EAN|GTIN)[:\s]*(\d{13})/i);
      if (eanMatch) data.ean = eanMatch[1];
      
      // VVS
      const vvsMatch = bodyText.match(/(?:VVS)[:\s]*(\d+)/i);
      if (vvsMatch) data.vvs = vvsMatch[1];
      
      // Price
      const priceEl = document.querySelector('.price-wrapper .price, .product-price, .price');
      if (priceEl) {
        data.price_text = priceEl.innerText.trim();
        const priceMatch = data.price_text.match(/([\d.,]+)/);
        if (priceMatch) {
          data.price_numeric = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
        }
      }
      
      // Stock
      const stockEl = document.querySelector('.stock-status, .availability');
      if (stockEl) {
        const stockText = stockEl.innerText.toLowerCase();
        data.in_stock = stockText.includes('på lager') || stockText.includes('tilgængelig');
      }
      
      // Category
      const breadcrumbs = document.querySelectorAll('.breadcrumbs a');
      if (breadcrumbs.length > 1) {
        data.category = breadcrumbs[1]?.innerText.trim();
      }
      
      return data;
    });
    
    product.url = url;
    return product;
    
  } catch (error) {
    throw error;
  }
}

// Save product - simplified
async function saveProduct(product) {
  try {
    if (!product.sku && !product.name) {
      stats.skipped++;
      return;
    }
    
    // Check if exists by SKU
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
      name: product.name,
      sku: product.sku || null,
      ean: product.ean || null,
      vvs: product.vvs || null,
      price_text: product.price_text || null,
      price_numeric: product.price_numeric || null,
      currency: 'DKK',
      in_stock: product.in_stock,
      category: product.category || null,
      brand: product.brand || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (existingProduct) {
      await supabase
        .from('stark_products')
        .update(productData)
        .eq('id', existingProduct.id);
      stats.productsUpdated++;
    } else {
      productData.first_seen_at = new Date().toISOString();
      await supabase
        .from('stark_products')
        .insert(productData);
      stats.productsAdded++;
    }
    
  } catch (error) {
    stats.errors++;
  }
}

// Main crawler
async function crawl() {
  logger.info('🚀 Starting STARK bulk crawler');
  logger.info(`Target: ${config.maxProducts} products`);
  
  // Check database
  const { count: initialCount } = await supabase
    .from('stark_products')
    .select('*', { count: 'exact', head: true });
  
  logger.info(`Current products in database: ${initialCount || 0}`);
  
  // Log crawl session
  const { data: crawlLog } = await supabase
    .from('stark_crawl_logs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running',
      log_data: { mode: 'bulk', target: config.maxProducts }
    })
    .select()
    .single();
  
  const crawlId = crawlLog?.id;
  
  // Discover URLs
  logger.info('Discovering product URLs...');
  const allUrls = [];
  
  for (const sitemapUrl of config.sitemaps) {
    const urls = await parseSitemap(sitemapUrl);
    allUrls.push(...urls);
  }
  
  // Apply offset and limit
  const urlsToProcess = allUrls.slice(config.startOffset, config.startOffset + config.maxProducts);
  stats.urlsDiscovered = urlsToProcess.length;
  logger.info(`Found ${allUrls.length} total URLs, processing ${urlsToProcess.length}`);
  
  // Launch browser with optimized settings
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote'
    ]
  });
  
  // Process in batches
  const startTime = Date.now();
  
  for (let i = 0; i < urlsToProcess.length; i += config.batchSize) {
    const batch = urlsToProcess.slice(i, Math.min(i + config.batchSize, urlsToProcess.length));
    
    await Promise.all(
      batch.map(async (url) => {
        const context = await browser.newContext({
          userAgent: 'StarkCrawler/2.0 Bulk',
          viewport: { width: 1280, height: 720 },
          locale: 'da-DK',
          // Disable images and styles for speed
          javaScriptEnabled: true,
          ignoreHTTPSErrors: true
        });
        
        // Block unnecessary resources
        await context.route('**/*', (route) => {
          const url = route.request().url();
          if (url.match(/\.(png|jpg|jpeg|gif|svg|css|woff|woff2|ttf)$/i)) {
            route.abort();
          } else {
            route.continue();
          }
        });
        
        const page = await context.newPage();
        
        try {
          const product = await extractProduct(page, url);
          await saveProduct(product);
          stats.productsProcessed++;
          
          // Progress update every 25 products
          if (stats.productsProcessed % 25 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = stats.productsProcessed / elapsed;
            const remaining = (urlsToProcess.length - stats.productsProcessed) / rate;
            
            logger.info(`Progress: ${stats.productsProcessed}/${urlsToProcess.length} | Rate: ${rate.toFixed(1)}/sec | ETA: ${Math.round(remaining)}s`);
            logger.info(`Added: ${stats.productsAdded} | Updated: ${stats.productsUpdated} | Errors: ${stats.errors}`);
          }
        } catch (error) {
          stats.errors++;
          if (stats.errors % 10 === 0) {
            logger.warn(`Errors so far: ${stats.errors}`);
          }
        } finally {
          await context.close();
        }
      })
    );
    
    // Brief pause between batches
    if (i + config.batchSize < urlsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  await browser.close();
  
  // Final statistics
  const totalTime = (Date.now() - startTime) / 1000;
  const finalRate = stats.productsProcessed / totalTime;
  
  // Update crawl log
  if (crawlId) {
    await supabase
      .from('stark_crawl_logs')
      .update({
        completed_at: new Date().toISOString(),
        urls_discovered: stats.urlsDiscovered,
        products_processed: stats.productsProcessed,
        products_added: stats.productsAdded,
        products_updated: stats.productsUpdated,
        errors: stats.errors,
        status: 'completed',
        log_data: {
          ...stats,
          duration_seconds: totalTime,
          rate_per_second: finalRate
        }
      })
      .eq('id', crawlId);
  }
  
  // Get final count
  const { count: finalCount } = await supabase
    .from('stark_products')
    .select('*', { count: 'exact', head: true });
  
  logger.info('╔══════════════════════════════════════╗');
  logger.info('║     BULK CRAWL COMPLETED             ║');
  logger.info('╚══════════════════════════════════════╝');
  logger.info(`📊 Final Statistics:`);
  logger.info(`   Total Time: ${Math.round(totalTime)}s (${(totalTime/60).toFixed(1)} minutes)`);
  logger.info(`   URLs Processed: ${stats.productsProcessed}`);
  logger.info(`   Products Added: ${stats.productsAdded}`);
  logger.info(`   Products Updated: ${stats.productsUpdated}`);
  logger.info(`   Errors: ${stats.errors}`);
  logger.info(`   Skipped: ${stats.skipped}`);
  logger.info(`   Processing Rate: ${finalRate.toFixed(1)} products/second`);
  logger.info(`   Database Total: ${finalCount} products`);
  logger.info('✅ Ready for next batch!');
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