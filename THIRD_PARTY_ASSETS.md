# Third-party assets

Emberfall keeps its gameplay, rendering, VFX and UI code in this repository. The curated 3D assets below are redistributed under **Creative Commons Zero (CC0 1.0)** so the browser build can be self-contained.

## KayKit — Adventurers Character Pack 1.0

Creator: Kay Lousberg / KayKit  
Source repository: `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`  
License: Creative Commons Zero (CC0 1.0); commercial use permitted; attribution optional.

Used in Maples:

- `public/assets/characters/rowan-knight.glb` — Rowan's rigged Knight body, helmet, cape, one-handed sword, shield and animation library.

A copy of the upstream license is stored at `public/assets/licenses/KAYKIT_ADVENTURERS_LICENSE.txt`.

## Quaternius — Animated Monster / Ultimate Monsters assets

Creator: Quaternius  
Original packs: Animated Monster Pack, Ultimate Monsters, Animated Knight Pack  
License: Creative Commons Zero (CC0 1.0).

The GLB conversions used here were sourced from the public `ilrein/warptracker` repository, whose asset manifest records the original Quaternius packs, conversion provenance and CC0 status.

Used in Maples:

- `public/assets/monsters/briar-skeleton.glb`
- `public/assets/monsters/briar-bat.glb`
- `public/assets/monsters/briar-ghost.glb`
- `public/assets/monsters/thornmaw-demon.glb`
- `public/assets/characters/rowan-sword.glb` — retained as an alternate sword asset; Rowan currently uses the sword already included in the KayKit Knight GLB.

The provenance manifest is stored at `public/assets/licenses/QUATERNIUS_PROVENANCE.md`.

## Quaternius — Stylized Nature MegaKit

Creator: Quaternius  
Original pack: Stylized Nature MegaKit  
License: Creative Commons Zero (CC0 1.0).

A deliberately small GLB subset was curated from the public `petroulacl/fps-buildings-env-kit` mirror, whose README records the vegetation set as Quaternius Stylized Nature MegaKit / CC0. The game instances these few source models many times rather than shipping the full pack.

Used in Maples:

- `public/assets/nature/lumen-pine.glb`
- `public/assets/nature/flowering-bush.glb`
- `public/assets/nature/fern.glb`
- `public/assets/nature/wispy-grass.glb`

The mirror/provenance README is stored at `public/assets/licenses/QUATERNIUS_NATURE_PROVENANCE.md`.

## KayKit — Dungeon Remastered 1.0

Creator: Kay Lousberg / KayKit  
Source repository: `KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0`  
License: Creative Commons Zero (CC0 1.0); commercial use permitted; attribution optional.

Used in Maples:

- `public/assets/environment/glade-arch.glb`
- `public/assets/environment/ruin-pillar.glb`
- `public/assets/environment/ruin-wall-broken.glb`
- `public/assets/environment/shrine-stairs.glb`
- `public/assets/environment/torch-lit.glb`

A copy of the upstream license is stored at `public/assets/licenses/KAYKIT_DUNGEON_LICENSE.txt`.

## Asset inventory

`docs/asset-inventory.json` records the vendored character, monster and dungeon GLBs' byte sizes, bounds, node names, skins and animation clip names. It is generated from the actual binary files and is used as an integration reference rather than relying on guessed animation names.
