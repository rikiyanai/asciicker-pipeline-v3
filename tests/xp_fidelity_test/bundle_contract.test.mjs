import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_REGISTRY_PATH = path.join(REPO_ROOT, 'config', 'template_registry.json');

async function loadBundleContract(tag) {
  const moduleUrl = new URL('../../scripts/xp_fidelity_test/bundle_contract.mjs', import.meta.url);
  moduleUrl.searchParams.set('case', tag);
  return import(moduleUrl.href);
}

function withMockedRegistry(mutator) {
  const originalRead = fs.readFileSync;
  fs.readFileSync = function mockedRead(filePath, encoding, ...rest) {
    const result = originalRead.call(this, filePath, encoding, ...rest);
    if (path.resolve(String(filePath)) !== TEMPLATE_REGISTRY_PATH) {
      return result;
    }
    const registry = JSON.parse(result);
    mutator(registry);
    return JSON.stringify(registry);
  };
  return () => {
    fs.readFileSync = originalRead;
  };
}

test('getTemplateSetContract enforces schema_version 2 and required fields', async () => {
  const { getTemplateSetContract } = await loadBundleContract('schema-version-2');
  const contract = getTemplateSetContract('player_native_full');

  assert.equal(contract.template_set_key, 'player_native_full');
  assert.deepEqual(contract.actionKeys, ['idle', 'attack', 'death']);
  assert.equal(contract.actions.idle.preview_xp_sha256.length, 64);
  assert.equal(contract.actions.attack.preview_xp_sha256.length, 64);
  assert.equal(contract.actions.death.preview_xp_sha256.length, 64);
});

test('getTemplateSetContract fails on unsupported schema_version', async () => {
  const restore = withMockedRegistry((registry) => {
    registry.schema_version = 3;
  });

  try {
    const { getTemplateSetContract } = await loadBundleContract('schema-version-drift');
    assert.throws(
      () => getTemplateSetContract('player_native_full'),
      /Unsupported template registry schema_version/
    );
  } finally {
    restore();
  }
});

test('getTemplateSetContract fails on missing action fields instead of returning empty strings', async () => {
  const restore = withMockedRegistry((registry) => {
    registry.template_sets.player_native_full.actions.idle.preview_xp_sha256 = '';
  });

  try {
    const { getTemplateSetContract } = await loadBundleContract('missing-field');
    assert.throws(
      () => getTemplateSetContract('player_native_full'),
      /missing required field: preview_xp_sha256/
    );
  } finally {
    restore();
  }
});
