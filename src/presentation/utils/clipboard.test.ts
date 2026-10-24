import test from 'node:test';
import assert from 'node:assert/strict';
import { copyToClipboard } from './clipboard.ts';

test('copyToClipboard returns false for empty or non-string inputs', async () => {
  assert.equal(await copyToClipboard(''), false);
  // @ts-expect-error testing invalid argument
  assert.equal(await copyToClipboard(null), false);
  // @ts-expect-error testing invalid argument
  assert.equal(await copyToClipboard(undefined), false);
});

test('copyToClipboard catches navigator.clipboard errors and does not throw', async () => {
  // Mock global navigator with rejecting clipboard
  const originalNavigator = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: async () => {
            const err = new Error('Document is not focused.');
            err.name = 'NotAllowedError';
            throw err;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    // In Node.js environment without DOM document, fallback returns false safely without throwing
    const result = await copyToClipboard('https://test.edu.co/h');
    assert.equal(result, false);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
});

test('copyToClipboard succeeds when navigator.clipboard.writeText resolves', async () => {
  const originalNavigator = globalThis.navigator;
  let copiedText = '';
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: async (text: string) => {
            copiedText = text;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('https://short.link/123');
    assert.equal(result, true);
    assert.equal(copiedText, 'https://short.link/123');
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
});
