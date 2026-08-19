import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Input } from '../src/game/Input.js';

function sampleMove(keys = [], mobileMove = { x: 0, y: 0 }) {
  const input = Object.create(Input.prototype);
  input.keys = new Set(keys);
  input.mobileMove = { ...mobileMove };
  return input.getMove();
}

function sampleLook(mouseDX, mouseDY) {
  const input = Object.create(Input.prototype);
  input.mouseDX = mouseDX;
  input.mouseDY = mouseDY;
  const look = input.consumeLook();
  return { look, remainingX: input.mouseDX, remainingY: input.mouseDY };
}

function worldDirection(move, cameraYaw) {
  // Mirrors the shared Game/Character camera basis. The input layer normalizes
  // horizontal controls so physical screen-right remains screen-right.
  const forward = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
  const right = { x: Math.cos(cameraYaw), z: -Math.sin(cameraYaw) };
  return {
    x: forward.x * move.y + right.x * move.x,
    z: forward.z * move.y + right.z * move.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.z * b.z;
}

function normalized(v) {
  const len = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / len, z: v.z / len };
}

for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.73]) {
  const cameraForward = normalized({ x: Math.sin(yaw), z: Math.cos(yaw) });
  const screenRight = normalized({ x: -Math.cos(yaw), z: Math.sin(yaw) });

  const keyboardForward = normalized(worldDirection(sampleMove(['KeyW']), yaw));
  const keyboardBack = normalized(worldDirection(sampleMove(['KeyS']), yaw));
  const keyboardRight = normalized(worldDirection(sampleMove(['KeyD']), yaw));
  const keyboardLeft = normalized(worldDirection(sampleMove(['KeyA']), yaw));

  assert.ok(dot(keyboardForward, cameraForward) > 0.999, `W must move camera-forward at yaw ${yaw}`);
  assert.ok(dot(keyboardBack, cameraForward) < -0.999, `S must move camera-back at yaw ${yaw}`);
  assert.ok(dot(keyboardRight, screenRight) > 0.999, `D must move screen-right at yaw ${yaw}`);
  assert.ok(dot(keyboardLeft, screenRight) < -0.999, `A must move screen-left at yaw ${yaw}`);

  const joystickForward = normalized(worldDirection(sampleMove([], { x: 0, y: 1 }), yaw));
  const joystickRight = normalized(worldDirection(sampleMove([], { x: 1, y: 0 }), yaw));
  assert.ok(dot(joystickForward, cameraForward) > 0.999, `joystick up must move camera-forward at yaw ${yaw}`);
  assert.ok(dot(joystickRight, screenRight) > 0.999, `joystick right must move screen-right at yaw ${yaw}`);
}

const diagonal = sampleMove(['KeyW', 'KeyD']);
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9, 'diagonal movement must remain normalized');

const lookUp = sampleLook(0, -24);
assert.equal(lookUp.look.y, 24, 'mouse/touch moving up must produce positive look-up input');
assert.equal(lookUp.remainingX, 0, 'consumeLook must clear horizontal delta');
assert.equal(lookUp.remainingY, 0, 'consumeLook must clear vertical delta');

const lookDown = sampleLook(0, 24);
assert.equal(lookDown.look.y, -24, 'mouse/touch moving down must produce negative look-down input');

const lookRight = sampleLook(18, 0);
assert.equal(lookRight.look.x, 18, 'horizontal camera look direction must remain unchanged');

const assetVisuals = fs.readFileSync(new URL('../src/game/AssetVisuals.js', import.meta.url), 'utf8');
assert.match(
  assetVisuals,
  /Rowan is authored facing \+Z[\s\S]*?model\.rotation\.y\s*=\s*0\s*;/,
  'Rowan imported visual must share the player +Z forward convention',
);

console.log('movement-unit: PASS');
