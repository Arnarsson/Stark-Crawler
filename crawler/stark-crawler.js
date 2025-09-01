/**
 * STARK Product Crawler
 * Compliant, robust crawler for STARK product data
 */

import { chromium } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import PQueue from 'p-queue';
import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import { setTimeout as sleep } from 'node:timers/promises';
import { request } from 'undici';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  crawler: {
    concurrency: parseInt(process.env.CRAWLER_CONCURRENCY || '2'),
    requestDelay: parseInt(process.env.CRAWLER_DELAY || '1000'),
    timeout: parseInt(process.env.CRAWLER_TIMEOUT || '60000'),
    userAgent: 'StarkCrawler/1.0 (Compliant Bot; contact@example.com)',
    headless: process.env.CRAWLER_HEADLESS !== 'false',
  },
  sitemaps: [
    'https://www.stark.dk/sitemapbase.xml',
    'https://www.stark.dk/sitemapcategories.xml',
    'https://www.stark.dk/sitemapvariants1.xml',
    'https://www.stark.dk/sitemapvariants2.xml',
  ],
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '../logs/crawler.log'),
  }
};

// Ensure log directory exists
await fs.mkdir(path.dirname(config.logging.file), { recursive: true }).catch(() => {});

// Logger setup
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// Validate environment
if (!config.supabase.url || !config.supabase.key) {
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(config.supabase.url, config.supabase.key);

// Stats tracker
const stats = {
  urlsDiscovered: 0,
  productsProcessed: 0,
  productsAdded: 0,
  productsUpdated: 0,
  errors: 0,
  startTime: Date.now(),
};

/**
 * Fetch text content from URL with retry
 */
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await request(url, {
        headers: {
          'User-Agent': config.crawler.userAgent,
          'Accept': 'text/xml,application/xml,text/html',
        },
        maxRedirections: 5,
      });

      if (res.statusCode >= 400) {
        throw new Error(`HTTP ${res.statusCode}`);
      }

      return await res.body.text();
    } catch (error) {
      logger.warn(`Fetch attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}

/**
 * Parse sitemap and extract product URLs
 */
async function parseSitemap(url, visitedSitemaps = new Set()) {
  if (visitedSitemaps.has(url)) return new Set();
  visitedSitemaps.add(url);

  logger.info(`Parsing sitemap: ${url}`);
  const urls = new Set();

  try {
    const xml = await fetchWithRetry(url);
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);

    // Handle sitemap index
    if (data.sitemapindex?.sitemap) {
      const sitemaps = Array.isArray(data.sitemapindex.sitemap)
        ? data.sitemapindex.sitemap
        : [data.sitemapindex.sitemap];

      for (const sm of sitemaps) {
        if (sm.loc && sm.loc.endsWith('.xml')) {
          const childUrls = await parseSitemap(sm.loc, visitedSitemaps);
          childUrls.forEach(u => urls.add(u));
          await sleep(300); // Rate limit
        }
      }
    }

    // Handle URL set
    if (data.urlset?.url) {
      const urlEntries = Array.isArray(data.urlset.url)
        ? data.urlset.url
        : [data.urlset.url];

      for (const entry of urlEntries) {
        if (entry.loc && isProductUrl(entry.loc)) {
          urls.add(entry.loc);
        }
      }
    }

  } catch (error) {
    logger.error(`Failed to parse sitemap ${url}:`, error);
  }

  return urls;
}

/**
 * Check if URL is a product page
 */
function isProductUrl(url) {
  try {
    const u = new URL(url);
    // STARK product URLs typically have:
    // - id parameter
    // - product slug in path
    // - not a category page
    return u.hostname === 'www.stark.dk' &&
           (u.searchParams.has('id') ||
            (u.pathname.split('/').length > 2 &&
             !u.pathname.includes('/kategori/') &&
             !u.pathname.includes('/services/')));
  } catch {
    return false;
  }
}

/**
 * Extract product data from page
 */
async function extractProduct(page, url) {
  logger.debug(`Extracting product from: ${url}`);

  try {
    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.crawler.timeout
    });

    // Wait for Angular/React to render
    await page.waitForTimeout(2000);

    // Try to wait for specific product elements
    try {
      await page.waitForSelector('[data-test="product-name"], h1', {
        timeout: 5000
      });
    } catch {
      logger.debug('Product elements not found immediately, continuing...');
    }

    // Extract structured data if available
    const jsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'Product') return data;
        } catch {}
      }
      return null;
    });

    // Extract product details
    const product = await page.evaluate(() => {
      // Helper to find text by label
      function getByLabel(label) {
        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          if (el.textContent?.includes(label)) {
            const text = el.textContent;
            const match = text.match(new RegExp(
              `${label}[:\\s]*([\\w\\-\\.\\#\\s/]+)`, 'i'
            ));
            if (match?.[1]) return match[1].trim();
          }
        }
        return null;
      }

      // Extract data
      const data = {
        name: document.querySelector('h1, [data-test="product-name"]')?.textContent?.trim(),
        sku: getByLabel('Varenr'),
        ean: getByLabel('EAN-nr'),
        vvs: getByLabel('VVS-nr'),
        price_text: null,
        in_stock: null,
        category: null,
        subcategory: null,
        brand: null,
      };

      // Extract price
      const priceEl = document.querySelector('[class*="price"], [data-price]');
      if (priceEl) {
        data.price_text = priceEl.textContent?.trim();
      }

      // Extract stock status
      const stockEl = document.querySelector('[class*="stock"], [data-stock]');
      if (stockEl) {
        const stockText = stockEl.textContent?.toLowerCase() || '';
        data.in_stock = stockText.includes('lager') ||
                       stockText.includes('tilgængelig');
      }

      // Extract breadcrumbs for category
      const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a');
      if (breadcrumbs.length > 1) {
        data.category = breadcrumbs[1]?.textContent?.trim();
        if (breadcrumbs.length > 2) {
          data.subcategory = breadcrumbs[2]?.textContent?.trim();
        }
      }

      return data;
    });

    // Merge with JSON-LD data if available
    if (jsonLd) {
      product.name = product.name || jsonLd.name;
      product.sku = product.sku || jsonLd.sku;
      product.ean = product.ean || jsonLd.gtin13 || jsonLd.gtin;
      product.brand = product.brand || jsonLd.brand?.name;

      if (jsonLd.offers) {
        product.price_text = product.price_text || jsonLd.offers.price;
        product.currency = jsonLd.offers.priceCurrency;
        product.in_stock = jsonLd.offers.availability?.includes('InStock');
      }
    }

    // Parse numeric price
    if (product.price_text) {
      const priceMatch = product.price_text.match(/[\d.,]+/);
      if (priceMatch) {
        product.price_numeric = parseFloat(
          priceMatch[0].replace('.', '').replace(',', '.')
        );
      }
    }

    // Add metadata
    product.url = url;
    product.raw_json = jsonLd;

    return product;

  } catch (error) {
    logger.error(`Failed to extract product from ${url}:`, error);
    throw error;
  }
}

/**
 * Upsert product to database
 */
async function upsertProduct(product) {
  try {
    // Check if product exists
    let existingProduct = null;
    if (product.sku) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
        .eq('sku', product.sku)
        .single();
      existingProduct = data;
    } else if (product.ean) {
      const { data } = await supabase
        .from('stark_products')
        .select('*')
        .eq('ean', product.ean)
        .single();
      existingProduct = data;
    }

    // Prepare upsert data
    const upsertData = {
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
      raw_json: product.raw_json || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!existingProduct) {
      upsertData.first_seen_at = new Date().toISOString();
      stats.productsAdded++;
    } else {
      stats.productsUpdated++;

      // Track changes
      const changes = [];
      for (const field of ['price_numeric', 'in_stock', 'name']) {
        if (existingProduct[field] !== upsertData[field]) {
          changes.push({
            product_id: existingProduct.id,
            field_name: field,
            old_value: String(existingProduct[field]),
            new_value: String(upsertData[field]),
          });
        }
      }

      if (changes.length > 0) {
        await supabase.from('stark_product_changes').insert(changes);
      }
    }

    // Perform upsert
    const { error } = await supabase
      .from('stark_products')
      .upsert(upsertData, {
        onConflict: 'sku,ean',
        ignoreDuplicates: false
      });

    if (error) throw error;

    logger.info(`Upserted product: ${product.sku || product.ean || product.url}`);

  } catch (error) {
    logger.error(`Failed to upsert product:`, error);
    stats.errors++;
  }
}

/**
 * Main crawler function
 */
async function crawl() {
  logger.info('Starting STARK crawler');

  // Create crawl log entry
  const { data: crawlLog } = await supabase
    .from('stark_crawl_logs')
    .insert({ status: 'running' })
    .select()
    .single();

  const crawlId = crawlLog?.id;

  try {
    // Phase 1: Discover URLs
    logger.info('Phase 1: Discovering product URLs');
    const allUrls = new Set();

    for (const sitemapUrl of config.sitemaps) {
      const urls = await parseSitemap(sitemapUrl);
      urls.forEach(url => allUrls.add(url));
      await sleep(500); // Rate limit between sitemaps
    }

    stats.urlsDiscovered = allUrls.size;
    logger.info(`Discovered ${allUrls.size} product URLs`);

    // Phase 2: Extract products
    logger.info('Phase 2: Extracting product data');

    // Launch browser
    const browser = await chromium.launch({
      headless: config.crawler.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: config.crawler.userAgent,
      viewport: { width: 1280, height: 1024 },
      locale: 'da-DK',
    });

    // Create processing queue
    const queue = new PQueue({
      concurrency: config.crawler.concurrency,
      interval: config.crawler.requestDelay,
      intervalCap: 1
    });

    // Process URLs
    const urlArray = Array.from(allUrls);
    const batchSize = 10;

    for (let i = 0; i < urlArray.length; i += batchSize) {
      const batch = urlArray.slice(i, i + batchSize);

      await Promise.all(batch.map(url =>
        queue.add(async () => {
          const page = await context.newPage();
          try {
            const product = await extractProduct(page, url);
            stats.productsProcessed++;

            if (product.sku || product.ean) {
              await upsertProduct(product);
            } else {
              logger.warn(`No SKU/EAN found for: ${url}`);
            }

            // Progress log
            if (stats.productsProcessed % 10 === 0) {
              logger.info(`Progress: ${stats.productsProcessed}/${allUrls.size}`);
            }

          } catch (error) {
            logger.error(`Failed to process ${url}:`, error.message);
            stats.errors++;
          } finally {
            await page.close();
          }
        })
      ));

      // Rate limiting between batches
      await sleep(2000);
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

    // Final report
    const duration = (Date.now() - stats.startTime) / 1000;
    logger.info('Crawl completed:', {
      duration: `${duration}s`,
      ...stats
    });

  } catch (error) {
    logger.error('Crawl failed:', error);

    // Update crawl log with error
    if (crawlId) {
      await supabase
        .from('stark_crawl_logs')
        .update({
          completed_at: new Date().toISOString(),
          status: 'error',
          log_data: { error: error.message, ...stats }
        })
        .eq('id', crawlId);
    }

    throw error;
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  crawl()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Fatal error:', error);
      process.exit(1);
    });
}

export { crawl, extractProduct, parseSitemap };