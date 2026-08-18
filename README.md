# Maples

A browser-first 3D action RPG prototype built with Three.js. The direction blends colorful, whimsical MMO progression with tabletop-inspired dice mechanics and adventure structure, while using original characters and world design.

## Current vertical slice: The Sunken Grove

- Third-person movement and orbit camera
- Desktop controls: WASD, right-mouse camera, left-click attack, Shift sprint, Space dodge
- Mobile controls: virtual joystick, swipe camera, attack and dodge buttons
- Stylized procedural forest/ruins environment with shadows, fog, sky lighting, and ACES tone mapping
- Warden player class with HP, armor class, attack bonus, XP, levels, and gold
- Goblin enemies with simple chase/wander/attack AI
- D&D-inspired d20 attack rolls, armor class checks, natural 1 misses, and natural 20 critical hits
- Quest objective and portal activation after defeating three goblins
- Responsive HUD and mobile-friendly rendering limits

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Next systems worth building

1. Proper character animation rig and imported original models
2. Collision/navigation mesh and terrain height support
3. Class selection (Warden, Arcanist, Ranger, Cleric)
4. Ability bar, cooldowns, status effects, loot, inventory, equipment
5. NPC dialogue, branching quests, skill checks, and dice-based exploration choices
6. Instanced foliage, LODs, object pooling, and GPU/mobile performance tiers
7. Multiplayer-ready entity/state architecture once the single-player combat loop is solid
