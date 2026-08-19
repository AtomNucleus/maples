import { chromium } from 'playwright';

const baseLaunch = chromium.launch.bind(chromium);
chromium.launch = async (options = {}) => {
  const browser = await baseLaunch({
    ...options,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(options.args || []),
    ],
  });

  const baseNewContext = browser.newContext.bind(browser);
  return new Proxy(browser, {
    get(target, property, receiver) {
      if (property === 'newContext') {
        return (contextOptions = {}) => {
          const { recordVideo: _recordVideo, ...stableOptions } = contextOptions;
          return baseNewContext(stableOptions);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

await import('../tests/visual-smoke.mjs');
