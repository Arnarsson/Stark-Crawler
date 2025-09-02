/**
 * STARK Product Crawler - Optimized Version
 * Focuses on actual product pages only
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
  // Focus on product sitemaps only
  sitemaps: [
    'https://www.stark.dk/sitemapvariants1.xml',
    'https://www.stark.dk/sitemapvariants2.xml'
  ],
  batchSize: 5,
  maxProducts: 200, // Process 200 products
  startOffset: 1100 // Skip problematic early URLs
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

// Better product URL detection
function isRealProductUrl(url) {
  // Must have query param with product ID
  if (!url.includes('?id=')) return false;
  
  // Skip known non-product sections
  const skipPatterns = [
    '/brands/',
    '/konkurrence',
    '/klima',
    '/kundeservice/',
    '/om-stark/',
    '/inspiration/',
    '/services/',
    '/catalogsearch/',
    '/customer/',
    '/bygger',
    '/projekter/',
    '.pdf',
    '.jpg',
    '.png'
  ];
  
  return !skipPatterns.some(pattern => url.includes(pattern));
}

// Extract product data from page
async function extractProduct(page, url) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
    
    // Wait for content to load
    await page.waitForTimeout(1500);
    
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
        brand: null
      };
      
      // Product name - try multiple selectors
      const nameSelectors = ['h1.page-title', '.product-name', 'h1', '[itemprop="name"]'];
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          data.name = el.innerText.trim();
          break;
        }
      }
      
      // SKU/Product number - look for various patterns
      const skuText = document.body.innerText;
      const skuMatch = skuText.match(/(?:Varenr|SKU|Produktnummer|Artikelnr)[:\s]*(\d+)/i);
      if (skuMatch) {
        data.sku = skuMatch[1];
      }
      
      // Also check specific elements
      const skuEl = document.querySelector('.sku-value, .product-sku, .product-number');
      if (skuEl && !data.sku) {
        const text = skuEl.innerText.replace(/[^0-9]/g, '');
        if (text) data.sku = text;
      }
      
      // EAN
      const eanMatch = skuText.match(/(?:EAN|GTIN)[:\s]*(\d{13})/i);
      if (eanMatch) {
        data.ean = eanMatch[1];
      }
      
      // VVS Number
      const vvsMatch = skuText.match(/(?:VVS)[:\s]*(\d+)/i);
      if (vvsMatch) {
        data.vvs = vvsMatch[1];
      }
      
      // Price - look for price patterns
      const priceSelectors = ['.price-wrapper .price', '.product-price', '.regular-price'];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          data.price_text = el.innerText.trim();
          const priceMatch = data.price_text.match(/([\d.,]+)/);
          if (priceMatch) {
            data.price_numeric = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
          }
          break;
        }
      }
      
      // Stock status
      const stockEl = document.querySelector('.stock-status, .availability');
      if (stockEl) {
        const stockText = stockEl.innerText.toLowerCase();
        data.in_stock = stockText.includes('på lager') || stockText.includes('tilgængelig');
      }
      
      // Category from breadcrumbs
      const breadcrumbs = document.querySelectorAll('.breadcrumbs a');
      if (breadcrumbs.length > 1) {
        data.category = breadcrumbs[1]?.innerText.trim();
        if (breadcrumbs.length > 2) {
          data.subcategory = breadcrumbs[2]?.innerText.trim();
        }
      }
      
      // Brand
      const brandEl = document.querySelector('.product-brand, .manufacturer');
      if (brandEl) {
        data.brand = brandEl.innerText.trim();
      }
      
      return data;
    });
    
    product.url = url;
    return product;
    
  } catch (error) {
    logger.error(`Failed to extract from ${url}: ${error.message}`);
    throw error;
  }
}

// Save product to database
async function saveProduct(product) {
  try {
    // Must have at least SKU or name
    if (!product.sku && !product.name) {
      logger.warn(`No data found for: ${product.url}`);
      stats.skipped++;
      return;
    }
    
    // Check if exists
    let existingProduct = null;
    if (product.sku) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
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
      subcategory: product.subcategory || null,
      brand: product.brand || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (existingProduct) {
      const { error } = await supabase
        .from('stark_products')
        .update(productData)
        .eq('id', existingProduct.id);
      
      if (error) throw error;
      stats.productsUpdated++;
      logger.info(`Updated: ${product.name || product.sku}`);
    } else {
      productData.first_seen_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('stark_products')
        .insert(productData);
      
      if (error) throw error;
      stats.productsAdded++;
      logger.info(`Added: ${product.name || product.sku}`);
    }
    
  } catch (error) {
    logger.error(`Failed to save product: ${error.message}`);
    stats.errors++;
  }
}

// Main crawler function
async function crawl() {
  logger.info('Starting STARK crawler (optimized)');
  
  // Check database
  const { error: dbError } = await supabase
    .from('stark_products')
    .select('count', { count: 'exact', head: true });
  
  if (dbError) {
    logger.error('Database connection failed:', dbError);
    return;
  }
  
  // Discover product URLs
  logger.info('Discovering product URLs...');
  const allUrls = [];
  
  for (const sitemapUrl of config.sitemaps) {
    const urls = await parseSitemap(sitemapUrl);
    allUrls.push(...urls);
  }
  
  // Apply offset and limit
  const urlsToProcess = allUrls.slice(config.startOffset, config.startOffset + config.maxProducts);
  stats.urlsDiscovered = urlsToProcess.length;
  logger.info(`Processing ${urlsToProcess.length} product URLs`);
  
  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Process URLs in batches
  for (let i = 0; i < urlsToProcess.length; i += config.batchSize) {
    const batch = urlsToProcess.slice(i, Math.min(i + config.batchSize, urlsToProcess.length));
    
    await Promise.all(
      batch.map(async (url) => {
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
          
          if (stats.productsProcessed % 5 === 0) {
            logger.info(`Progress: ${stats.productsProcessed}/${urlsToProcess.length}`);
          }
        } catch (error) {
          logger.error(`Failed ${url}: ${error.message}`);
          stats.errors++;
        } finally {
          await context.close();
        }
      })
    );
  }
  
  await browser.close();
  
  // Log summary
  logger.info('=== Crawl Summary ===');
  logger.info(`URLs processed: ${stats.productsProcessed}`);
  logger.info(`Products added: ${stats.productsAdded}`);
  logger.info(`Products updated: ${stats.productsUpdated}`);
  logger.info(`Skipped: ${stats.skipped}`);
  logger.info(`Errors: ${stats.errors}`);
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