import * as THREE from 'three';

export class InputManager {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private moveTouch = new THREE.Vector2();
  private cameraDelta = new THREE.Vector2();
  private touchCameraPointer: number | null = null;
  private lastTouchCamera = new THREE.Vector2();
  private rightMouseDown = false;
  private attackQueued = false;
  private dodgeQueued = false;

  constructor(private canvas: HTMLCanvasElement, private root: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', this.onCanvasPointerDown, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    this.bindMobileControls();
  }

  get movement(): THREE.Vector2 {
    const x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const y = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const keyboard = new THREE.Vector2(x, y);
    if (keyboard.lengthSq() > 1) keyboard.normalize();
    return keyboard.lengthSq() > 0 ? keyboard : this.moveTouch.clone();
  }

  get sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeAttack(): boolean {
    const value = this.attackQueued || this.pressed.has('KeyF');
    this.attackQueued = false;
    this.pressed.delete('KeyF');
    return value;
  }

  consumeDodge(): boolean {
    const value = this.dodgeQueued || this.pressed.has('Space');
    this.dodgeQueued = false;
    this.pressed.delete('Space');
    return value;
  }

  consumeCameraDelta(): THREE.Vector2 {
    const value = this.cameraDelta.clone();
    this.cameraDelta.set(0, 0);
    return value;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (!event.repeat) this.pressed.add(event.code);
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onCanvasPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') {
      if (event.button === 0) this.attackQueued = true;
      if (event.button === 2) {
        this.rightMouseDown = true;
        this.canvas.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    if (event.clientX > window.innerWidth * 0.42) {
      this.touchCameraPointer = event.pointerId;
      this.lastTouchCamera.set(event.clientX, event.clientY);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && this.rightMouseDown) {
      this.cameraDelta.x += event.movementX;
      this.cameraDelta.y += event.movementY;
      return;
    }

    if (event.pointerId === this.touchCameraPointer) {
      event.preventDefault();
      this.cameraDelta.x += event.clientX - this.lastTouchCamera.x;
      this.cameraDelta.y += event.clientY - this.lastTouchCamera.y;
      this.lastTouchCamera.set(event.clientX, event.clientY);
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button === 2) this.rightMouseDown = false;
    if (event.pointerId === this.touchCameraPointer) this.touchCameraPointer = null;
  };

  private bindMobileControls(): void {
    const joystick = this.root.querySelector<HTMLElement>('[data-joystick]');
    const knob = this.root.querySelector<HTMLElement>('[data-joystick-knob]');
    const attack = this.root.querySelector<HTMLButtonElement>('[data-attack]');
    const dodge = this.root.querySelector<HTMLButtonElement>('[data-dodge]');
    if (!joystick || !knob || !attack || !dodge) return;

    let joystickPointer: number | null = null;
    const updateJoystick = (event: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      const center = new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const delta = new THREE.Vector2(event.clientX, event.clientY).sub(center);
      const radius = rect.width * 0.32;
      if (delta.length() > radius) delta.setLength(radius);
      knob.style.transform = `translate(${delta.x}px, ${delta.y}px)`;
      this.moveTouch.set(delta.x / radius, -delta.y / radius);
    };

    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      joystickPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === joystickPointer) updateJoystick(event);
    });
    const releaseJoystick = (event: PointerEvent) => {
      if (event.pointerId !== joystickPointer) return;
      joystickPointer = null;
      this.moveTouch.set(0, 0);
      knob.style.transform = 'translate(0px, 0px)';
    };
    joystick.addEventListener('pointerup', releaseJoystick);
    joystick.addEventListener('pointercancel', releaseJoystick);

    for (const button of [attack, dodge]) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    attack.addEventListener('pointerdown', () => { this.attackQueued = true; });
    dodge.addEventListener('pointerdown', () => { this.dodgeQueued = true; });
  }
}
