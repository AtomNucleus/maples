import './style.css';
import { Game } from './game/Game.js';
import { enhanceInstance } from './game/Enhancements.js';
import { installAssetVisuals } from './game/AssetVisuals.js';
import { installEnvironmentAssets } from './game/EnvironmentAssets.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
enhanceInstance(game);
installAssetVisuals(game);
installEnvironmentAssets(game);
game.start();

window.__MAPLES_GAME__ = game;
