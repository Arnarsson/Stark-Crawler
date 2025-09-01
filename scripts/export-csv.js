/**
 * Export STARK products to CSV
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate environment
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function exportToCSV() {
  console.log('📊 Exporting STARK products to CSV...\n');
  
  try {
    // Fetch all products
    const { data: products, error } = await supabase
      .from('stark_products')
      .select('*')
      .order('last_seen_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`Found ${products.length} products\n`);
    
    // Convert to CSV
    const headers = [
      'SKU',
      'EAN',
      'VVS',
      'Name',
      'Price',
      'Currency',
      'In Stock',
      'Category',
      'Subcategory',
      'Brand',
      'URL',
      'First Seen',
      'Last Seen'
    ];
    
    const rows = products.map(p => [
      p.sku || '',
      p.ean || '',
      p.vvs || '',
      `"${(p.name || '').replace(/"/g, '""')}"`,
      p.price_numeric || '',
      p.currency || 'DKK',
      p.in_stock !== null ? (p.in_stock ? 'Yes' : 'No') : '',
      p.category || '',
      p.subcategory || '',
      p.brand || '',
      p.url || '',
      p.first_seen_at ? new Date(p.first_seen_at).toISOString() : '',
      p.last_seen_at ? new Date(p.last_seen_at).toISOString() : ''
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `stark_products_${timestamp}.csv`;
    const filepath = path.join(__dirname, '..', 'exports', filename);
    
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, csv, 'utf8');
    
    console.log(`✅ Exported to: ${filepath}`);
    console.log(`   ${products.length} products`);
    console.log(`   ${(Buffer.byteLength(csv) / 1024).toFixed(2)} KB`);
    
    // Also export recent changes
    const { data: changes } = await supabase
      .from('stark_product_changes')
      .select('*')
      .gte('changed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('changed_at', { ascending: false });
    
    if (changes && changes.length > 0) {
      console.log(`\n📈 Found ${changes.length} changes in last 7 days`);
      
      const changesCSV = [
        'Product ID,Field,Old Value,New Value,Changed At',
        ...changes.map(c => [
          c.product_id,
          c.field_name,
          `"${(c.old_value || '').replace(/"/g, '""')}"`,
          `"${(c.new_value || '').replace(/"/g, '""')}"`,
          new Date(c.changed_at).toISOString()
        ].join(','))
      ].join('\n');
      
      const changesFilename = `stark_changes_${timestamp}.csv`;
      const changesFilepath = path.join(__dirname, '..', 'exports', changesFilename);
      
      await fs.writeFile(changesFilepath, changesCSV, 'utf8');
      console.log(`✅ Changes exported to: ${changesFilepath}`);
    }
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

// Run export
exportToCSV().catch(console.error);