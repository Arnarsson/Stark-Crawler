/**
 * STARK Product Crawler - Fixed Version
 * Handles database operations without requiring URL unique constraint
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import PQueue from 'p-queue';
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
  concurrency: 5,
  baseUrl: 'https://www.stark.dk',
  sitemaps: [
    'https://www.stark.dk/sitemapbase.xml',
    'https://www.stark.dk/sitemapcategories.xml',
    'https://www.stark.dk/sitemapvariants1.xml',
    'https://www.stark.dk/sitemapvariants2.xml'
  ],
  retries: 3,
  retryDelay: 5000,
  batchSize: 10
};

// Statistics
const stats = {
  urlsDiscovered: 0,
  productsProcessed: 0,
  productsAdded: 0,
  productsUpdated: 0,
  errors: 0,
  skipped: 0
};

// Parse sitemap XML
async function parseSitemap(url) {
  try {
    logger.info(`Parsing sitemap: ${url}`);
    const response = await fetch(url);
    const xml = await response.text();
    
    const parser = new XMLParser();
    const result = parser.parse(xml);
    
    const urls = new Set();
    const urlset = result.urlset?.url || [];
    
    for (const item of Array.isArray(urlset) ? urlset : [urlset]) {
      if (item?.loc) {
        urls.add(item.loc);
      }
    }
    
    return urls;
  } catch (error) {
    logger.error(`Failed to parse sitemap ${url}:`, error);
    return new Set();
  }
}

// Check if URL is a product page
function isProductUrl(url) {
  // Skip non-product pages
  const skipPatterns = [
    '/brands/',
    '/konkurrencebetingelser/',
    '/klima/',
    '/kundeservice/',
    '/om-stark/',
    '/inspiration/',
    '/services/',
    '/catalogsearch/',
    '/customer/',
    '.pdf',
    '.jpg',
    '.png'
  ];
  
  return !skipPatterns.some(pattern => url.includes(pattern));
}

// Extract product data from page
export async function extractProduct(page, url) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  // Wait for critical elements
  await page.waitForTimeout(2000);
  
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
      subcategory: null,
      brand: null,
      metadata: {}
    };
    
    // Product name
    const nameEl = document.querySelector('h1, .product-name, .product-title, [itemprop="name"]');
    if (nameEl) data.name = nameEl.innerText.trim();
    
    // SKU
    const skuEl = document.querySelector('.sku, .product-sku, [itemprop="sku"], .product-meta-sku');
    if (skuEl) {
      data.sku = skuEl.innerText.replace(/[^0-9]/g, '').trim();
    }
    
    // Also check for product number in various formats
    if (!data.sku) {
      const productNumEl = document.querySelector('.product-number, .varenummer, .item-number');
      if (productNumEl) {
        data.sku = productNumEl.innerText.replace(/[^0-9]/g, '').trim();
      }
    }
    
    // EAN
    const eanEl = document.querySelector('.ean, [itemprop="gtin13"], .product-ean');
    if (eanEl) {
      data.ean = eanEl.innerText.replace(/[^0-9]/g, '').trim();
    }
    
    // VVS Number
    const vvsEl = document.querySelector('.vvs, .vvs-number, .vvs-nr');
    if (vvsEl) {
      data.vvs = vvsEl.innerText.replace(/[^0-9]/g, '').trim();
    }
    
    // Price
    const priceEl = document.querySelector('.price, .product-price, .regular-price, [itemprop="price"]');
    if (priceEl) {
      data.price_text = priceEl.innerText.trim();
      const priceMatch = data.price_text.match(/[\d.,]+/);
      if (priceMatch) {
        data.price_numeric = parseFloat(priceMatch[0].replace(/\./g, '').replace(',', '.'));
      }
    }
    
    // Stock status
    const stockEl = document.querySelector('.stock, .availability, .in-stock, .stock-status');
    if (stockEl) {
      const stockText = stockEl.innerText.toLowerCase();
      data.in_stock = stockText.includes('lager') || stockText.includes('stock') || stockText.includes('tilgængelig');
    }
    
    // Category from breadcrumbs
    const breadcrumbs = document.querySelectorAll('.breadcrumb a, .breadcrumbs a, nav[aria-label="breadcrumb"] a');
    if (breadcrumbs.length > 1) {
      data.category = breadcrumbs[1]?.innerText.trim();
      if (breadcrumbs.length > 2) {
        data.subcategory = breadcrumbs[2]?.innerText.trim();
      }
    }
    
    // Brand
    const brandEl = document.querySelector('.brand, .manufacturer, [itemprop="brand"]');
    if (brandEl) {
      data.brand = brandEl.innerText.trim();
    }
    
    return data;
  });
  
  product.url = url;
  product.last_seen_at = new Date().toISOString();
  
  return product;
}

// Save product to database
async function saveProduct(product) {
  try {
    // Skip if no identifier
    if (!product.sku && !product.ean && !product.vvs) {
      logger.warn(`No identifier found for: ${product.url}`);
      stats.skipped++;
      return;
    }
    
    // First check if product exists by SKU, EAN, or VVS
    let existingProduct = null;
    
    if (product.sku) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
        .eq('sku', product.sku)
        .single();
      existingProduct = data;
    }
    
    if (!existingProduct && product.ean) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
        .eq('ean', product.ean)
        .single();
      existingProduct = data;
    }
    
    if (!existingProduct && product.vvs) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
        .eq('vvs', product.vvs)
        .single();
      existingProduct = data;
    }
    
    // Prepare data
    const productData = {
      url: product.url,
      name: product.name,
      sku: product.sku || null,
      ean: product.ean || null,
      vvs: product.vvs || null,
      price_text: product.price_text || null,
      price_numeric: product.price_numeric || null,
      currency: product.currency || 'DKK',
      in_stock: product.in_stock,
      category: product.category || null,
      subcategory: product.subcategory || null,
      brand: product.brand || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: product.metadata || {}
    };
    
    if (existingProduct) {
      // Update existing product
      const { error } = await supabase
        .from('stark_products')
        .update(productData)
        .eq('id', existingProduct.id);
      
      if (error) throw error;
      
      stats.productsUpdated++;
      logger.info(`Updated product: ${product.sku || product.ean || product.vvs}`);
      
      // Track price changes
      if (existingProduct.price_numeric !== product.price_numeric && product.price_numeric) {
        await supabase
          .from('stark_product_changes')
          .insert({
            product_id: existingProduct.id,
            field_name: 'price_numeric',
            old_value: String(existingProduct.price_numeric || ''),
            new_value: String(product.price_numeric)
          });
      }
    } else {
      // Insert new product
      productData.first_seen_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('stark_products')
        .insert(productData);
      
      if (error) throw error;
      
      stats.productsAdded++;
      logger.info(`Added new product: ${product.sku || product.ean || product.vvs}`);
    }
    
  } catch (error) {
    logger.error(`Failed to save product:`, error.message);
    stats.errors++;
  }
}

// Main crawler function
async function crawl() {
  logger.info('Starting STARK crawler');
  
  // Check database connection
  const { error: dbError } = await supabase
    .from('stark_products')
    .select('count', { count: 'exact', head: true });
  
  if (dbError) {
    logger.error('Database connection failed:', dbError);
    return;
  }
  
  // Log crawler start
  const { data: crawlLog } = await supabase
    .from('stark_crawl_logs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running'
    })
    .select()
    .single();
  
  const crawlId = crawlLog?.id;
  
  // Discover product URLs
  logger.info('Phase 1: Discovering product URLs');
  const allUrls = new Set();
  
  for (const sitemapUrl of config.sitemaps) {
    const urls = await parseSitemap(sitemapUrl);
    urls.forEach(url => {
      if (isProductUrl(url)) {
        allUrls.add(url);
      }
    });
  }
  
  stats.urlsDiscovered = allUrls.size;
  logger.info(`Discovered ${allUrls.size} product URLs`);
  
  // Extract product data
  logger.info('Phase 2: Extracting product data');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const queue = new PQueue({ concurrency: config.concurrency });
  const urlArray = Array.from(allUrls);
  
  // Process in batches
  for (let i = 0; i < urlArray.length; i += config.batchSize) {
    const batch = urlArray.slice(i, Math.min(i + config.batchSize, urlArray.length));
    
    await Promise.all(
      batch.map(url => 
        queue.add(async () => {
          const context = await browser.newContext({
            userAgent: 'StarkCrawler/1.0',
            viewport: { width: 1280, height: 1024 },
            locale: 'da-DK'
          });
          
          const page = await context.newPage();
          
          try {
            const product = await extractProduct(page, url);
            await saveProduct(product);
            stats.productsProcessed++;
            
            // Progress log
            if (stats.productsProcessed % 10 === 0) {
              logger.info(`Progress: ${stats.productsProcessed}/${allUrls.size}`);
            }
          } catch (error) {
            logger.error(`Failed to process ${url}:`, error.message);
            stats.errors++;
          } finally {
            await context.close();
          }
        })
      )
    );
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  await queue.onIdle();
  await browser.close();
  
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
        log_data: stats
      })
      .eq('id', crawlId);
  }
  
  // Log summary
  logger.info('Crawl completed!');
  logger.info(`URLs discovered: ${stats.urlsDiscovered}`);
  logger.info(`Products processed: ${stats.productsProcessed}`);
  logger.info(`Products added: ${stats.productsAdded}`);
  logger.info(`Products updated: ${stats.productsUpdated}`);
  logger.info(`Products skipped: ${stats.skipped}`);
  logger.info(`Errors: ${stats.errors}`);
}

// Check for required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

// Run crawler
crawl().catch(error => {
  logger.error('Crawler failed:', error);
  process.exit(1);
});