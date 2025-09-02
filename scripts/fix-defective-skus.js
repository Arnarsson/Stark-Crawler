/**
 * Fix defective SKUs in Supabase/Postgres
 *
 * Rules:
 * - Any sku starting with '.' is considered defective
 * - Correct value is first vendor+item pattern: (\d{4})(- or space)(\d{6,12})
 * - If not present in sku text, derive from URL param: ?id=NNNN-NNNNNN...
 * - On unique conflict (another row already has the corrected sku), we set the
 *   current row's sku to NULL and log the collision (so a future crawl can update it).
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

function computeSkuFromUrl(url) {
  if (!url) return null;
  const m = url.match(/[?&]id=(\d{4})-(\d{6,12})/);
  return m ? `${m[1]}${m[2]}` : null;
}

function computeSkuFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d{4})[\s-]*([\d]{6,12})/);
  return m ? `${m[1]}${m[2]}` : null;
}

function isLikelySku(s) {
  return typeof s === 'string' && /^(\d{10,16})$/.test(s);
}

async function main() {
  console.log('🔧 Fixing defective SKUs (starting with ".")');

  // Fetch in batches
  const pageSize = 1000;
  let from = 0;
  let fixed = 0;
  let collisions = 0;
  let examined = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data: rows, error } = await supabase
      .from('stark_products')
      .select('id, url, sku, name')
      .like('sku', '.%')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      examined++;

      const fromUrl = computeSkuFromUrl(row.url);
      const fromText = computeSkuFromText(row.sku);
      const newSku = fromUrl || fromText;

      if (!isLikelySku(newSku)) {
        console.log(`- Skip id=${row.id} (cannot compute SKU) sku='${row.sku}' url='${row.url}'`);
        continue;
      }

      // Check for existing row with corrected sku
      const { data: existing } = await supabase
        .from('stark_products')
        .select('id')
        .eq('sku', newSku)
        .limit(1)
        .maybeSingle();

      if (existing && existing.id !== row.id) {
        // Collision with an existing correct row
        collisions++;
        const { error: upErr } = await supabase
          .from('stark_products')
          .update({ sku: null, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (upErr) throw upErr;
        console.log(`• Collision: id=${row.id} -> NULL (already have sku=${newSku} in id=${existing.id})`);
        continue;
      }

      const { error: updErr } = await supabase
        .from('stark_products')
        .update({ sku: newSku, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updErr) throw updErr;
      fixed++;
      console.log(`✓ Fixed id=${row.id} '${row.sku}' -> '${newSku}'`);
    }

    from += pageSize;
  }

  console.log('\nDone. Summary:');
  console.log(`- Examined:   ${examined}`);
  console.log(`- Fixed:      ${fixed}`);
  console.log(`- Collisions: ${collisions}`);
}

main().catch((e) => {
  console.error('Failed to fix SKUs:', e);
  process.exit(1);
});

