/**
 * STARK Crawler - Direct PostgreSQL version
 * For use with self-hosted Supabase when REST API is unavailable
 */

import { chromium } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import PQueue from 'p-queue';
import pkg from 'pg';
const { Client } = pkg;
import winston from 'winston';
import { setTimeout as sleep } from 'node:timers/promises';
import { request } from 'undici';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL configuration
const dbConfig = {
  host: process.env.DB_HOST || '135.181.101.70',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '65LEOEDaSVDnvzbrIzzIBGY7937RmEFV',
};

// Rest of configuration same as original
const config = {
  crawler: {
    concurrency: parseInt(process.env.CRAWLER_CONCURRENCY || '2'),
    requestDelay: parseInt(process.env.CRAWLER_DELAY || '1000'),
    timeout: parseInt(process.env.CRAWLER_TIMEOUT || '60000'),
    userAgent: 'StarkCrawler/1.0 (Compliant Bot)',
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
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

// Database client
let db;

async function connectDB() {
  db = new Client(dbConfig);
  await db.connect();
  logger.info('Connected to PostgreSQL database');
}

async function disconnectDB() {
  if (db) {
    await db.end();
    logger.info('Disconnected from database');
  }
}

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
      await sleep(1000 * (i + 1));
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
          await sleep(300);
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
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.crawler.timeout
    });

    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector('[data-test="product-name"], h1', {
        timeout: 5000
      });
    } catch {
      logger.debug('Product elements not found immediately, continuing...');
    }

    // Extract product details (same as original)
    const product = await page.evaluate(() => {
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

      const priceEl = document.querySelector('[class*="price"], [data-price]');
      if (priceEl) {
        data.price_text = priceEl.textContent?.trim();
      }

      const stockEl = document.querySelector('[class*="stock"], [data-stock]');
      if (stockEl) {
        const stockText = stockEl.textContent?.toLowerCase() || '';
        data.in_stock = stockText.includes('lager') ||
                       stockText.includes('tilgængelig');
      }

      const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a');
      if (breadcrumbs.length > 1) {
        data.category = breadcrumbs[1]?.textContent?.trim();
        if (breadcrumbs.length > 2) {
          data.subcategory = breadcrumbs[2]?.textContent?.trim();
        }
      }

      return data;
    });

    if (product.price_text) {
      const priceMatch = product.price_text.match(/[\d.,]+/);
      if (priceMatch) {
        product.price_numeric = parseFloat(
          priceMatch[0].replace('.', '').replace(',', '.')
        );
      }
    }

    product.url = url;
    return product;

  } catch (error) {
    logger.error(`Failed to extract product from ${url}:`, error);
    throw error;
  }
}

/**
 * Upsert product to PostgreSQL
 */
async function upsertProduct(product) {
  try {
    // Check if product exists
    let existingProduct = null;
    if (product.sku) {
      const result = await db.query(
        'SELECT * FROM stark_products WHERE sku = $1',
        [product.sku]
      );
      existingProduct = result.rows[0];
    } else if (product.ean) {
      const result = await db.query(
        'SELECT * FROM stark_products WHERE ean = $1',
        [product.ean]
      );
      existingProduct = result.rows[0];
    }

    const now = new Date().toISOString();

    if (!existingProduct) {
      // Insert new product
      await db.query(`
        INSERT INTO stark_products (
          url, name, sku, ean, vvs, price_text, price_numeric,
          currency, in_stock, category, subcategory, brand,
          first_seen_at, last_seen_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $13)
      `, [
        product.url,
        product.name,
        product.sku || null,
        product.ean || null,
        product.vvs || null,
        product.price_text || null,
        product.price_numeric || null,
        'DKK',
        product.in_stock,
        product.category || null,
        product.subcategory || null,
        product.brand || null,
        now
      ]);
      stats.productsAdded++;
    } else {
      // Update existing product
      await db.query(`
        UPDATE stark_products 
        SET url = $1, name = $2, price_text = $3, price_numeric = $4,
            in_stock = $5, category = $6, subcategory = $7, brand = $8,
            last_seen_at = $9, updated_at = $9
        WHERE id = $10
      `, [
        product.url,
        product.name,
        product.price_text || null,
        product.price_numeric || null,
        product.in_stock,
        product.category || null,
        product.subcategory || null,
        product.brand || null,
        now,
        existingProduct.id
      ]);
      stats.productsUpdated++;

      // Track changes
      if (existingProduct.price_numeric !== product.price_numeric) {
        await db.query(`
          INSERT INTO stark_product_changes (product_id, field_name, old_value, new_value)
          VALUES ($1, $2, $3, $4)
        `, [
          existingProduct.id,
          'price_numeric',
          String(existingProduct.price_numeric),
          String(product.price_numeric)
        ]);
      }
    }

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
  logger.info('Starting STARK crawler (PostgreSQL mode)');

  await connectDB();

  // Create crawl log entry
  const crawlResult = await db.query(
    'INSERT INTO stark_crawl_logs (status) VALUES ($1) RETURNING id',
    ['running']
  );
  const crawlId = crawlResult.rows[0]?.id;

  try {
    // Phase 1: Discover URLs
    logger.info('Phase 1: Discovering product URLs');
    const allUrls = new Set();

    for (const sitemapUrl of config.sitemaps) {
      const urls = await parseSitemap(sitemapUrl);
      urls.forEach(url => allUrls.add(url));
      await sleep(500);
    }

    stats.urlsDiscovered = allUrls.size;
    logger.info(`Discovered ${allUrls.size} product URLs`);

    // Phase 2: Extract products
    logger.info('Phase 2: Extracting product data');

    const browser = await chromium.launch({
      headless: config.crawler.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: config.crawler.userAgent,
      viewport: { width: 1280, height: 1024 },
      locale: 'da-DK',
    });

    const queue = new PQueue({
      concurrency: config.crawler.concurrency,
      interval: config.crawler.requestDelay,
      intervalCap: 1
    });

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

      await sleep(2000);
    }

    await queue.onIdle();
    await browser.close();

    // Update crawl log
    if (crawlId) {
      await db.query(`
        UPDATE stark_crawl_logs 
        SET completed_at = $1, urls_discovered = $2, products_processed = $3,
            products_added = $4, products_updated = $5, errors = $6,
            status = $7, log_data = $8
        WHERE id = $9
      `, [
        new Date().toISOString(),
        stats.urlsDiscovered,
        stats.productsProcessed,
        stats.productsAdded,
        stats.productsUpdated,
        stats.errors,
        'completed',
        JSON.stringify(stats),
        crawlId
      ]);
    }

    const duration = (Date.now() - stats.startTime) / 1000;
    logger.info('Crawl completed:', {
      duration: `${duration}s`,
      ...stats
    });

  } catch (error) {
    logger.error('Crawl failed:', error);

    if (crawlId) {
      await db.query(`
        UPDATE stark_crawl_logs 
        SET completed_at = $1, status = $2, log_data = $3
        WHERE id = $4
      `, [
        new Date().toISOString(),
        'error',
        JSON.stringify({ error: error.message, ...stats }),
        crawlId
      ]);
    }

    throw error;
  } finally {
    await disconnectDB();
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