import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePcBuildCompatibility,
  filterAndSortProducts,
  isWooCommerceDemoProduct,
  normalizeStockStatus,
  parseWooPrice,
  resolveAdaptivePageSize,
} from './compatibility';
import { HARDWARE_PRODUCTS_SEED } from './hardwareCatalogSeed';
import { providerRegistry } from './providerRegistry';

test('parseWooPrice parses valid numbers and strings without inventing prices', () => {
  assert.equal(parseWooPrice(94500000), 94500000);
  assert.equal(parseWooPrice('46,800,000 تومان'), 46800000);
  assert.equal(parseWooPrice('1500000', 2), 15000);
  assert.equal(parseWooPrice(null), null);
  assert.equal(parseWooPrice(''), null);
  assert.equal(parseWooPrice('Call for price'), null);
});

test('normalizeStockStatus distinguishes IN_STOCK, OUT_OF_STOCK, ON_BACKORDER, and UNKNOWN', () => {
  assert.equal(normalizeStockStatus('INSTOCK'), 'IN_STOCK');
  assert.equal(normalizeStockStatus('in-stock'), 'IN_STOCK');
  assert.equal(normalizeStockStatus('OUTOFSTOCK'), 'OUT_OF_STOCK');
  assert.equal(normalizeStockStatus('ONBACKORDER'), 'ON_BACKORDER');
  assert.equal(normalizeStockStatus(undefined, true), 'IN_STOCK');
  assert.equal(normalizeStockStatus(undefined, false), 'OUT_OF_STOCK');
  assert.equal(normalizeStockStatus(null), 'UNKNOWN');
});

test('isWooCommerceDemoProduct flags WooCommerce sample apparel and spares real hardware', () => {
  assert.equal(isWooCommerceDemoProduct('V-Neck T-Shirt', 'v-neck-t-shirt'), true);
  assert.equal(isWooCommerceDemoProduct('Sunglasses', 'sunglasses'), true);
  assert.equal(isWooCommerceDemoProduct('Hoodie with Logo', 'hoodie-with-logo'), true);
  assert.equal(
    isWooCommerceDemoProduct('ASUS ROG Strix GeForce RTX 4080 SUPER', 'asus-rog-strix-rtx-4080-super-16gb'),
    false
  );
  assert.equal(isWooCommerceDemoProduct('AMD Ryzen 9 7950X3D', 'amd-ryzen-9-7950x3d'), false);
});

test('resolveAdaptivePageSize adapts to slow Iranian connections vs fast connections', () => {
  assert.equal(resolveAdaptivePageSize(undefined, 'constrained', 8, 12), 8);
  assert.equal(resolveAdaptivePageSize(undefined, 'fast', 8, 16), 16);
  assert.equal(resolveAdaptivePageSize(6, 'fast', 8, 16), 6);
});

test('PC Builder compatibility engine detects socket and DDR4/DDR5 mismatches accurately', () => {
  const ryzenAm5 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'amd-ryzen-9-7950x3d')!;
  const intelLga1700 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'intel-core-i9-14900k')!;
  const mbAm5 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'asus-rog-crosshair-x670e-hero')!;
  const ramDdr5 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'corsair-dominator-titanium-64gb-ddr5')!;
  const ramDdr4 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'corsair-vengeance-lpx-32gb-ddr4')!;
  const gpu4080 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'asus-rog-strix-rtx-4080-super-16gb')!;
  const psu1000 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'corsair-rm1000x-shift-atx3')!;
  const caseO11 = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'lian-li-o11-dynamic-evo-rgb')!;
  const caseItx = HARDWARE_PRODUCTS_SEED.find((p) => p.slug === 'lian-li-a4-h2o-mini-itx')!;

  // 1. Valid compatible AM5 + DDR5 + ATX + 1000W build
  const validReport = evaluatePcBuildCompatibility({
    cpu: ryzenAm5,
    motherboard: mbAm5,
    ram: ramDdr5,
    gpu: gpu4080,
    psu: psu1000,
    case: caseO11,
  });
  assert.equal(validReport.status, 'compatible');
  assert.equal(validReport.issues.length, 0);

  // 2. Socket mismatch (Intel LGA1700 CPU on AMD AM5 Motherboard)
  const socketMismatch = evaluatePcBuildCompatibility({
    cpu: intelLga1700,
    motherboard: mbAm5,
  });
  assert.equal(socketMismatch.status, 'incompatible');
  assert.ok(socketMismatch.issues.some((i) => i.code === 'SOCKET_MISMATCH'));

  // 3. Memory mismatch (DDR4 RAM on DDR5 Motherboard)
  const ramMismatch = evaluatePcBuildCompatibility({
    cpu: ryzenAm5,
    motherboard: mbAm5,
    ram: ramDdr4,
  });
  assert.equal(ramMismatch.status, 'incompatible');
  assert.ok(ramMismatch.issues.some((i) => i.code === 'MEMORY_TYPE_MISMATCH'));

  // 4. Physical GPU clearance & ATX form factor failure inside Mini-ITX case
  const clearanceFailure = evaluatePcBuildCompatibility({
    motherboard: mbAm5,
    gpu: gpu4080,
    case: caseItx,
  });
  assert.equal(clearanceFailure.status, 'incompatible');
  assert.ok(clearanceFailure.issues.some((i) => i.code === 'FORM_FACTOR_MISMATCH'));
  assert.ok(clearanceFailure.issues.some((i) => i.code === 'GPU_TOO_LONG'));
});

test('filterAndSortProducts filters by category, stock, search query, and price order', () => {
  const gpusOnly = filterAndSortProducts(HARDWARE_PRODUCTS_SEED, {
    categorySlug: 'graphics-cards',
    inStockOnly: true,
    sort: 'price-asc',
  });
  assert.equal(gpusOnly.length, 2); // RTX 4090 is OUT_OF_STOCK
  assert.equal(gpusOnly[0].slug, 'msi-rtx-4070-ti-super-16gb');
  assert.equal(gpusOnly[1].slug, 'asus-rog-strix-rtx-4080-super-16gb');
});

test('providerRegistry exposes WordPressWooCommerceProvider and live health check', async () => {
  const provider = providerRegistry.getActiveProvider();
  assert.equal(provider.id, 'wordpress-woocommerce');
  const page = await provider.getProducts({ connectionProfile: 'constrained' });
  assert.equal(page.pageSize, 8);
  assert.ok(page.items.length > 0);
});
