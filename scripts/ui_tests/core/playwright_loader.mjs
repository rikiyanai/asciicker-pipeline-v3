import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (_e) {
    const fallback = process.env.PLAYWRIGHT_IMPORT ||
      path.join(os.homedir(), '.codex/skills/develop-web-game/node_modules/playwright/index.js');
    return await import(pathToFileURL(fallback).href);
  }
}

export async function launchChromium(opts = {}) {
  if (opts.headless !== false) {
    throw new Error('Playwright Chromium launches must be headed. Re-run with an explicit headed path.');
  }
  const mod = await loadPlaywright();
  const chromium = mod?.chromium || mod?.default?.chromium;
  if (!chromium) throw new Error('Playwright chromium export not found');
  return chromium.launch({ headless: opts.headless !== false, slowMo: opts.slowMo || 0 });
}
