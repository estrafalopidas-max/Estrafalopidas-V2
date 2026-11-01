import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCacheTimestamp,
  applyCacheBustingTimestamp,
  resolveInstitutionalBranding,
  PRIMARY_INSTITUTIONAL_LOGO_PATH,
  SECONDARY_BRANDING_LOGO_PATH,
} from './institutional-branding';

test('extractCacheTimestamp parses admin dashboard ?t= timestamp accurately', () => {
  assert.equal(extractCacheTimestamp('/logo-institucional.png?t=1730465000123'), 1730465000123);
  assert.equal(extractCacheTimestamp('/logo.png?v=1&t=1730465999000'), 1730465999000);
  assert.equal(extractCacheTimestamp('/logo-institucional.png'), null);
  assert.equal(extractCacheTimestamp('data:image/png;base64,iVBORw0KGgo='), null);
  assert.equal(extractCacheTimestamp(null), null);
});

test('applyCacheBustingTimestamp preserves data URLs and appends ?t= to asset paths', () => {
  const dataUrl = 'data:image/png;base64,abc123';
  assert.equal(applyCacheBustingTimestamp(dataUrl, 1730465000123), dataUrl);

  assert.equal(
    applyCacheBustingTimestamp('/logo-institucional.png', 1730465000123),
    '/logo-institucional.png?t=1730465000123'
  );

  assert.equal(
    applyCacheBustingTimestamp('/logo-institucional.png?t=11111', 22222),
    '/logo-institucional.png?t=22222'
  );

  assert.equal(
    applyCacheBustingTimestamp('/logo-institucional.png?t=11111'),
    '/logo-institucional.png?t=11111'
  );
});

test('resolveInstitutionalBranding resolves primary and secondary variants with admin cache-busting timestamp', () => {
  const statePrimary = resolveInstitutionalBranding({
    adminLogoUrl: '/logo-institucional.png?t=1730465000999',
    selectedVariant: 'primary',
  });

  assert.equal(statePrimary.activeVariant, 'primary');
  assert.equal(statePrimary.cacheTimestamp, 1730465000999);
  assert.equal(statePrimary.activeUrl, `${PRIMARY_INSTITUTIONAL_LOGO_PATH}?t=1730465000999`);
  assert.equal(statePrimary.hasSecondaryVariant, true);
  assert.equal(statePrimary.variants.length, 2);
  assert.equal(statePrimary.variants[1].url, `${SECONDARY_BRANDING_LOGO_PATH}?t=1730465000999`);

  const stateSecondary = resolveInstitutionalBranding({
    adminLogoUrl: '/logo-institucional.png?t=1730465000999',
    selectedVariant: 'secondary',
  });

  assert.equal(stateSecondary.activeVariant, 'secondary');
  assert.equal(stateSecondary.activeUrl, `${SECONDARY_BRANDING_LOGO_PATH}?t=1730465000999`);
});

test('resolveInstitutionalBranding falls back to snapshotUpdatedAtMs when adminLogoUrl has no query param', () => {
  const state = resolveInstitutionalBranding({
    adminLogoUrl: '/logo-institucional.png',
    snapshotUpdatedAtMs: 1730500000000,
    selectedVariant: 'primary',
  });

  assert.equal(state.cacheTimestamp, 1730500000000);
  assert.equal(state.activeUrl, '/logo-institucional.png?t=1730500000000');
  assert.equal(state.variants[1].url, `${SECONDARY_BRANDING_LOGO_PATH}?t=1730500000000`);
});
