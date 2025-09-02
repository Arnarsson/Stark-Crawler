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
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,  // Try service key first
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
  logger.error('Missing SUPABASE_URL or SUPABASE_KEY/SUPABASE_SERVICE_KEY');
  logger.error(`URL: ${config.supabase.url}`);
  logger.error(`Key: ${config.supabase.key ? 'Present' : 'Missing'}`);
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
    // Use shorter timeout for pages that might be slow
    await page.goto(url, {
      waitUntil: 'domcontentloaded',  // Faster than networkidle
      timeout: 30000  // 30 seconds instead of 60
    });
    
    // Wait for network to settle but with shorter timeout
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      logger.debug('Network did not idle, continuing anyway');
    });

    // Wait for Angular to fully render - check if there are any Angular template markers
    await page.waitForFunction(
      () => {
        const body = document.body.innerHTML;
        // Check if Angular templates are still visible
        return !body.includes('{{') && !body.includes('}}');
      },
      { timeout: 10000 }
    ).catch(() => {
      logger.debug('Angular templates may still be present');
    });

    // Additional wait for dynamic content
    await page.waitForTimeout(1000);

    // Try to wait for specific product elements
    try {
      await page.waitForSelector('h1:not(:empty)', {
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
      // Helpers
      const normalizeSpaces = (s) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

      function extractByLabelFromText(bodyText, label, valuePattern) {
        const re = new RegExp(`${label}\.?:?\s*(${valuePattern})`, 'i');
        const m = bodyText.match(re);
        return m ? normalizeSpaces(m[1]) : null;
      }

      function cleanDigits(s) {
        if (!s) return null;
        const only = (s + '').replace(/[^0-9]/g, '');
        return only || null;
      }

      function extractSku(bodyText) {
        // Typical STARK pattern: 4 digits + 6-12 digits (vendor + item)
        const m1 = bodyText.match(/Varenr\.?\s*[:#]?\s*([0-9]{4})\s*[- ]\s*([0-9]{6,12})/i);
        if (m1) return cleanDigits(m1[1] + m1[2]);
        // Fallback: number sequence after label, then normalize to first 4 + 6-12 group combination
        const m2 = bodyText.match(/Varenr\.?\s*[:#]?\s*([0-9][0-9\s-]{9,24})/i);
        if (m2) {
          const s = m2[1];
          const m = s.match(/([0-9]{4})[\s-]*([0-9]{6,12})/);
          if (m) return cleanDigits(m[1] + m[2]);
        }
        // As last resort, look for standalone vendor+item pattern anywhere
        const m3 = bodyText.match(/([0-9]{4})\s*[- ]\s*([0-9]{6,12})/);
        if (m3) return cleanDigits(m3[1] + m3[2]);
        return null;
      }

      function extractEan(bodyText) {
        const m = bodyText.match(/EAN(?:-nr)?\.?\s*[:#]?\s*(\d{12,14})/i);
        return m ? cleanDigits(m[1]) : null;
      }

      function extractVvs(bodyText) {
        const m = bodyText.match(/VVS(?:-nr)?\.?\s*[:#]?\s*([0-9][0-9\s-]{5,})/i);
        return m ? cleanDigits(m[1]) : null;
      }

      function findPriceText() {
        const candidates = [];
        // Prefer obvious price containers
        const priceSelectors = [
          '[data-price]',
          '[class*="price"]',
          '.product-price',
          '.price',
          '.price-wrapper .price',
          '.regular-price',
        ];
        try {
          document.querySelectorAll(priceSelectors.join(',')).forEach((el) => {
            const text = normalizeSpaces(el.textContent || '');
            if (!text) return;
            // Skip Angular/Vue templates
            if (text.includes('{{') || text.includes('}}')) return;
            // Require price context to avoid picking dimensions like "10 cm"
            if (!/(kr|dkk|pris|medlemspris)/i.test(text)) return;
            candidates.push(text);
          });
        } catch {}

        // As a fallback, scan for lines that contain 'pris' or 'kr'
        if (candidates.length === 0) {
          const body = normalizeSpaces(document.body.innerText || '');
          body.split(/\n|\r/).forEach((line) => {
            if (/(kr|dkk|pris|medlemspris)/i.test(line)) {
              const clean = normalizeSpaces(line);
              if (!clean.includes('{{') && /\d/.test(clean)) candidates.push(clean);
            }
          });
        }

        if (candidates.length === 0) return null;

        // Choose the candidate with the highest numeric value (usually the actual price)
        const parseCandidate = (t) => {
          const nums = (t.match(/[0-9][0-9\s.,]*[0-9]|[0-9]/g) || []).map((n) => n);
          let best = null;
          for (const n of nums) {
            const normalized = n.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
            const val = parseFloat(normalized);
            if (!isNaN(val)) best = Math.max(best ?? 0, val);
          }
          return best ?? null;
        };

        let bestText = null;
        let bestValue = null;
        for (const t of candidates) {
          const v = parseCandidate(t);
          if (v != null && (bestValue == null || v > bestValue)) {
            bestValue = v;
            bestText = t;
          }
        }

        return bestText || null;
      }

      // Extract data - check for Angular templates and skip if found
      const h1 = document.querySelector('h1');
      const h1Text = normalizeSpaces(h1?.textContent || '');

      if (h1Text.includes('{{') || h1Text.includes('}}')) {
        return null;
      }

      const bodyText = normalizeSpaces(document.body?.innerText || '');

      const data = {
        name: h1Text || null,
        sku: extractSku(bodyText),
        ean: extractEan(bodyText),
        vvs: extractVvs(bodyText),
        price_text: findPriceText(),
        in_stock: null,
        category: null,
        subcategory: null,
        brand: null,
      };

      // Extract stock status
      const stockEl = document.querySelector('[class*="stock"], [data-stock], .stock-status, .availability');
      if (stockEl) {
        const stockText = normalizeSpaces(stockEl.textContent || '').toLowerCase();
        data.in_stock = stockText.includes('lager') || stockText.includes('tilgængelig');
      }

      // Extract breadcrumbs for category
      const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, .breadcrumbs a, nav[aria-label="breadcrumb"] a');
      if (breadcrumbs.length > 1) {
        data.category = normalizeSpaces(breadcrumbs[1]?.textContent || '');
        if (breadcrumbs.length > 2) {
          data.subcategory = normalizeSpaces(breadcrumbs[2]?.textContent || '');
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

    // Parse numeric price (handle Danish formats)
    if (product?.price_text) {
      const txt = String(product.price_text)
        .replace(/\u00a0/g, ' ')
        .replace(/kr\.?/i, '')
        .replace(/DKK/i, '');
      const match = txt.match(/[0-9][0-9\s.,]*[0-9]|[0-9]/);
      if (match) {
        const normalized = match[0].replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(normalized);
        if (!Number.isNaN(num)) product.price_numeric = num;
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

    // Fallback: try to find existing row by URL (covers previously-saved rows with bad SKU like '. 1234 ...')
    if (!existingProduct && product.url) {
      try {
        const { data } = await supabase
          .from('stark_products')
          .select('*')
          .eq('url', product.url)
          .limit(1)
          .maybeSingle();
        if (data) existingProduct = data;
      } catch (_) {
        // ignore 'no rows' errors
      }
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

    // If existing row has a defective SKU starting with '.', replace it with the cleaned one when available
    if (existingProduct && upsertData.sku && (existingProduct.sku?.trim()?.startsWith('.'))) {
      // Force the cleaned SKU onto the existing row
      existingProduct.sku = upsertData.sku;
    }

    // Perform insert or update
    if (existingProduct) {
      // Update existing product
      const { error } = await supabase
        .from('stark_products')
        .update(upsertData)
        .eq('id', existingProduct.id);
      
      if (error) throw error;
    } else {
      // Insert new product
      const { error } = await supabase
        .from('stark_products')
        .insert(upsertData);
      
      if (error) throw error;
    }

    logger.info(`✅ SAVED TO SUPABASE: SKU=${product.sku} EAN=${product.ean} Name="${product.name}" Price=${product.price_numeric}`);

  } catch (error) {
    logger.error(`❌ FAILED TO SAVE TO SUPABASE:`, error);
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

    // ONLY KEEP ACTUAL PRODUCT URLS WITH ID PARAMETERS
    const productUrls = new Set();
    for (const url of allUrls) {
      // ONLY process URLs that have a product ID parameter
      if (!url.includes('?id=')) {
        logger.debug(`Skipping URL without product ID: ${url}`);
        continue;
      }
      
      // Extra safety: skip ANY URL with klima (including klima-old)
      if (url.includes('klima')) {
        logger.debug(`Skipping klima URL: ${url}`);
        continue;
      }
      
      productUrls.add(url);
    }

    stats.urlsDiscovered = productUrls.size;
    logger.info(`Discovered ${productUrls.size} product URLs (filtered from ${allUrls.size} total)`);

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
    const urlArray = Array.from(productUrls);
    const batchSize = 10;

    for (let i = 0; i < urlArray.length; i += batchSize) {
      const batch = urlArray.slice(i, i + batchSize);

      await Promise.all(batch.map(url =>
        queue.add(async () => {
          const page = await context.newPage();
          try {
            const product = await extractProduct(page, url);
            stats.productsProcessed++;

            // Skip if no product data was extracted (Angular templates still visible)
            if (!product) {
              logger.debug(`Skipping ${url} - no valid product data`);
              return;
            }

            // Double-check: skip if likely not a product page
            if (!url.includes('?id=') && (url.includes('/brands/') || url.includes('/klima/') || 
                url.includes('/konkurrencebetingelser/'))) {
              logger.debug(`Skipping non-product page: ${url}`);
              return;
            }

            // Only save if we have valid identifiers and not template data
            const cleanedSku = product?.sku ? String(product.sku).replace(/[^0-9]/g, '') : null;
            const validSku = cleanedSku && cleanedSku.length >= 10 && cleanedSku.length <= 16;
            if ((validSku || product.ean) && 
                !product.name?.includes('{{') && 
                !product.price_text?.includes('{{')) {
              // Persist cleaned SKU
              if (validSku) product.sku = cleanedSku;
              await upsertProduct(product);
            } else {
              logger.warn(`No valid SKU/EAN or template data found for: ${url}`);
            }

            // Progress log
            if (stats.productsProcessed % 10 === 0) {
              logger.info(`Progress: ${stats.productsProcessed}/${productUrls.size}`);
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
