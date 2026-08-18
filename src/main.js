import './style.css';
import { Game } from './game/Game.js';
import { enhanceInstance } from './game/Enhancements.js';
import { installAssetVisuals } from './game/AssetVisuals.js';
import { installEnvironmentAssets } from './game/EnvironmentAssets.js';
import { installNatureAssets } from './game/NatureAssets.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
enhanceInstance(game);

const enterButton = document.querySelector('#enter-btn');
enterButton.disabled = true;
enterButton.textContent = 'Summoning the Glade…';

const visualManager = installAssetVisuals(game);
const environmentPromise = installEnvironmentAssets(game);
const naturePromise = installNatureAssets(game);

function waitForCoreVisuals(timeoutMs = 15000) {
  return new Promise(resolve => {
    const started = performance.now();
    const poll = () => {
      if ((visualManager.ready && visualManager.heroReady) || visualManager.failures.length || performance.now() - started > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

Promise.allSettled([waitForCoreVisuals(), environmentPromise, naturePromise]).then(() => {
  const failures = [
    ...(visualManager.failures || []),
    ...(game.environmentAssetManager?.failures || []),
    ...(game.natureAssetManager?.failures || []),
  ];
  enterButton.textContent = failures.length ? 'Enter the Glade' : 'Enter the Glade';
  enterButton.disabled = false;
  enterButton.dataset.ready = 'true';
});

game.start();
window.__MAPLES_GAME__ = game;
