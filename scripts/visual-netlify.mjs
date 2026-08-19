import { chromium } from 'playwright';

const baseLaunch = chromium.launch.bind(chromium);
chromium.launch = (options = {}) => baseLaunch({
  ...options,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    ...(options.args || []),
  ],
});

await import('../tests/visual-smoke.mjs');
