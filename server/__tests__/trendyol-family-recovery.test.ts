import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoverColorFamilyMembers, buildColorFamilyVariantMatrix, type TrendyolColorFamilyMember } from '../trendyol-color-family';
const member = (id: string, ok = true): TrendyolColorFamilyMember => ({
  productId: id, url: `https://www.trendyol.com/x/x-p-${id}`, color: id === '10000' ? 'Siyah' : 'Beyaz',
  images: ['https://cdn.dsmcdn.com/test.jpg'], ok,
});
test('recovery fetches a single failed sibling and preserves verified members', async () => {
  const root = member('10000');
  const failed = member('20000', false);
  const candidates = [root, failed].map(m => ({ productId: m.productId, url: m.url }));
  const result = await recoverColorFamilyMembers(candidates, [root, failed], root.productId, async list => {
    assert.deepEqual(list.map(m => m.productId), ['20000']);
    return [member('20000')];
  });
  assert.equal(result[0], root);
  assert.equal(result[1].ok, true);
});
test('failed recovery retains the original error and existing data', async () => {
  const failed = { ...member('20000', false), error: 'navigation-timeout' };
  const result = await recoverColorFamilyMembers([failed], [failed], '10000', async () => [member('20000', false)]);
  assert.equal(result[0], failed);
});
test('a rejected wrong-color variant does not consume the correct color-size key', () => {
  const root = member('10000');
  root.variants = { colors: ['Siyah'], sizes: ['M'], allVariants: [
    { color: 'Beyaz', size: 'M', inStock: true },
    { color: 'Siyah', size: 'M', inStock: false },
  ] };
  const result = buildColorFamilyVariantMatrix([root]);
  assert.equal(result.allVariants.length, 1);
  assert.equal(result.allVariants[0].color, 'Siyah');
  assert.equal(result.allVariants[0].inStock, false);
});
