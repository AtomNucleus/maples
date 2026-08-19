export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.mobileMove = { x: 0, y: 0 };
    this.mobileActions = new Set();
    this.isCoarse = matchMedia('(pointer: coarse)').matches;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.pressed.add('Mouse0');
      if (!this.isCoarse && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', e => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    const joystick = document.querySelector('#joystick');
    const knob = document.querySelector('#joystick-knob');
    if (joystick && knob) {
      let activeId = null;
      const updateStick = e => {
        const r = joystick.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const max = r.width * 0.32;
        const len = Math.hypot(dx, dy) || 1;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        this.mobileMove.x = dx / max;
        this.mobileMove.y = -dy / max;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      joystick.addEventListener('pointerdown', e => {
        activeId = e.pointerId;
        joystick.setPointerCapture(e.pointerId);
        updateStick(e);
      });
      joystick.addEventListener('pointermove', e => { if (e.pointerId === activeId) updateStick(e); });
      const end = e => {
        if (e.pointerId !== activeId) return;
        activeId = null;
        this.mobileMove.x = this.mobileMove.y = 0;
        knob.style.transform = 'translate(0px, 0px)';
      };
      joystick.addEventListener('pointerup', end);
      joystick.addEventListener('pointercancel', end);
    }

    document.querySelectorAll('.mobile-actions button').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.mobileActions.add(btn.dataset.action);
      });
    });

    let lookTouch = null;
    this.canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1 && e.touches[0].clientX > innerWidth * .35) {
        lookTouch = { id: e.touches[0].identifier, x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', e => {
      if (!lookTouch) return;
      const t = [...e.touches].find(t => t.identifier === lookTouch.id);
      if (!t) return;
      this.mouseDX += (t.clientX - lookTouch.x) * 1.55;
      this.mouseDY += (t.clientY - lookTouch.y) * 1.55;
      lookTouch.x = t.clientX;
      lookTouch.y = t.clientY;
    }, { passive: true });
    this.canvas.addEventListener('touchend', e => {
      if (!lookTouch) return;
      if (![...e.touches].some(t => t.identifier === lookTouch.id)) lookTouch = null;
    }, { passive: true });
  }

  getMove() {
    let x = 0, y = 0;
    // Game/Character use a legacy camera basis whose horizontal axis is sign-inverted.
    // Normalize every control source here so physical/screen right always means move right.
    if (this.keys.has('KeyA')) x += 1;
    if (this.keys.has('KeyD')) x -= 1;
    if (this.keys.has('KeyW')) y += 1;
    if (this.keys.has('KeyS')) y -= 1;
    x -= this.mobileMove.x;
    y += this.mobileMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consume(action) {
    const map = {
      attack: ['Mouse0','Digit1','KeyF'],
      spell: ['KeyQ'],
      dodge: ['Space'],
    };
    const keys = map[action] || [];
    for (const key of keys) {
      if (this.pressed.has(key)) {
        this.pressed.delete(key);
        return true;
      }
    }
    if (this.mobileActions.has(action)) {
      this.mobileActions.delete(action);
      return true;
    }
    return false;
  }

  consumeLook() {
    const v = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return v;
  }

  endFrame() {
    this.pressed.clear();
    this.mobileActions.clear();
  }
}
