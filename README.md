# Emberfall — Maples

A self-contained Three.js action-RPG vertical slice mixing bright storybook fantasy with tabletop-RPG combat readability.

## Play

- **WASD** — move
- **Mouse** — orbit camera
- **Left click / 1** — three-hit Arc Slash combo
- **Q** — Ember Lance
- **Space** — invulnerable dash
- Touch devices get a virtual stick and action buttons automatically.

## Vertical slice

The Sunken Glade encounter includes a procedural stylized forest, ruins, shrine and reactive portal; five Briarbound enemies with readable windups; melee combo chains; projectile magic; crits, hit-stop and camera impulses; XP essence and level feedback; and a boss phase against Thornmaw after eight kills.

## Run locally

```bash
npm install
npm run dev
```

## Validation

`npm run test:visual` runs a Playwright showcase smoke test against `npm run preview`. CI captures desktop intro/combat/spell/boss screenshots, a mobile screenshot, and a short video. The showcase workflow only deploys anonymously to Netlify after the production build and visual/runtime smoke test pass.
