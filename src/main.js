import './style.css';
import './asset-polish.css';
import './showcase.css';
import { Game } from './game/Game.js';
import { enhanceInstance } from './game/Enhancements.js';
import { installAssetVisuals } from './game/AssetVisuals.js';
import { installEnvironmentAssets } from './game/EnvironmentAssets.js';
import { installNatureAssets } from './game/NatureAssets.js';
import { installCinematicPolish } from './game/CinematicPolish.js';
import { installRowanStyle } from './game/RowanStyle.js';
import { installShowcasePass } from './game/ShowcasePass.js';
import { installShowcaseQualityGate } from './game/ShowcaseQualityGate.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
enhanceInstance(game);

const enterButton = document.querySelector('#enter-btn');
enterButton.disabled = true;
enterButton.textContent = 'Summoning the Glade…';

const visualManager = installAssetVisuals(game);
installRowanStyle(game);
installCinematicPolish(game);
installShowcasePass(game);
installShowcaseQualityGate(game);
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
  enterButton.textContent = 'Enter the Glade';
  enterButton.disabled = false;
  enterButton.dataset.ready = 'true';
});

game.start();
window.__MAPLES_GAME__ = game;
