import './style.css';
import { Game } from './game/Game.js';
import { enhanceInstance } from './game/Enhancements.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
enhanceInstance(game);
game.start();

window.__MAPLES_GAME__ = game;
