# Paw Haven: K-09 Shelter Patrol

A vibrant, third-person shelter exploration game starring K-09, a compact robotic assistant beginning its morning safety round. The practical environment uses sealed non-slip flooring, painted timber kennel frames, washable padded beds, stainless-steel water hardware, glazed window panels, and brushed-metal robot joints. The small story follows a realistic routine: clear the kennel aisles, check water points, and make sure rest and play bays are ready for morning intake. Built with pure Three.js, vanilla JavaScript ES modules, Vite, and Rapier 3D physics.

## Features

- Camera-relative WASD and analog movement use exponential damping on horizontal X/Z velocity, restoring the original smooth response when changing direction or holding partial joystick input. The response coefficient is 18 while moving, 23 while braking on the ground, and low horizontal drag when airborne with no input. Walk speed is 3.15 m/s; sprint speed is 5.6 m/s, or 1.78× walking speed (+78%).
- Physics-based jumping uses a 6.6 m/s vertical take-off velocity and 18 m/s² gravity. Horizontal take-off momentum is carried into the air with low drag. Rapier resolves collision displacement without scaling the movement motor down from a single clipped frame, which could previously cause stop-start speed pulses. Ideal level-ground airtime is about 0.73 s, giving roughly 2.31 m of range at walking speed versus 4.11 m at sprint speed before air steering, collisions, and landing height are considered.
- Character-focused camera with smooth follow/orbit, wheel zoom, on-screen zoom in/out and reset buttons, keyboard +/− zoom, and raycast obstacle avoidance.
- Procedurally modelled quadruped robot with mechanical armour, glowing optics, articulated legs/ears/tail, and idle/walk/run/jump/landing poses.
- Large enclosed shelter with tiled floor, high glass windows, timber rafters, pendants, entry frame, low fenced zones, dog houses, beds, bowls, toys, agility ramp, tunnel, shelves, plants, and signs.
- Low / Medium / High quality profiles with GPU-conscious render scales. Low disables real-time shadows and post-processing, then applies a glossy native PBR material variant only to tagged floor surfaces, using a shared PMREM room environment for reflections. Medium adds a 512px directional shadow map; High adds optional desktop-only bloom on capable desktop devices. On touch/mobile displays, every profile caps render pixel ratio at 1.0, High limits view distance to 72, bloom stays off, and the static shadow map is reused rather than rebuilt each frame. Hardware MSAA and adaptive resolution remain enabled. Instanced floor tiles and static shelter batching remain enabled.
- Compact adventure-style HUD with a hide/show toggle (`H`), a lightweight quest/status card, camera zoom controls, an accessible graphics settings panel, and a 12-slot field-pack inventory. Five small 3D pickups are placed around the shelter. Walk close to an item and press `E` or tap the contextual touch button to carry it visibly in K-09's mouth; press `E` again to store it. Tap a populated slot to carry that item, tap an empty slot while carrying to store it there, and press `Q` or use DROP ITEM to release it into the world. Press `I` or the package button to open the inventory. Inventory slots, the carried item, and starter pickups already collected are saved in local storage. Mobile controls use a dynamic left-side joystick, thumb-friendly Jump/Run/Sit/Interact buttons, safe-area spacing for notches and gesture bars, and a bottom-sheet settings panel with fullscreen access. The settings sheet pauses background physics and WebGL drawing while open, reducing GPU contention during scrolling; its FPS pill is hidden while the sample is paused. Users can enable Developer Mode directly from settings to reveal Advanced Settings, including FPS and Morning Check toggles. UI symbols use bundled monochrome SVG masks from `src/ui/icon/`, including settings, inventory, developer mode, FPS, disclosure, action and loading-decoration icons.
- Fixed-step 60 Hz physics stays authoritative for stable Rapier contacts, while the render loop follows the display's `requestAnimationFrame` cadence. FPS telemetry uses actual frame delta (rather than clamping its measurement to 60 Hz), and the visible dog root's position and yaw are interpolated between physics snapshots for smoother high-refresh displays. This makes 90/120 Hz rendering possible when the browser, display, and GPU sustain it; it does not force the device's refresh rate or guarantee 120 FPS. When the settings sheet is open, the main loop skips Rapier updates and WebGL draws, clears accumulated simulation time, and resumes smoothly after close. Loading/error states and resource cleanup remain in place.
- Rotated Rapier colliders preserve the visible slope of ramps and angled roof panels. Collision shapes cover the check-in desk/tabletops, bed cushions, shelves, dispenser lids, planters, bowls, balls, and rings so the character does not sink through their visible surfaces.
- Small production static server with safe path handling, MIME types, cache controls, and security headers.

## Requirements

- Node.js `20.19+` or `22.12+` (Node 22 LTS recommended).
- npm.
- A recent browser with WebGL2 enabled. The game uses local bundled JS/WASM assets; no model download is needed.

## Run locally

```bash
npm install
npm run check
npm run dev
```

Open the URL printed by Vite. `npm run dev` is for development only.

## Production build and local production server

```bash
npm run check
npm run build
PORT=4173 HOST=0.0.0.0 npm start
```

Then visit `http://127.0.0.1:4173`. The production server requires `dist/index.html`, so it will refuse to start before a successful build. Set `PORT` to an available port if 4173 is occupied.

## Controls

| Action | Desktop | Touch devices |
|---|---|---|
| Move | W / A / S / D or arrow keys | Left virtual joystick |
| Jump | Space | Up-arrow button |
| Pick up nearby item / store carried item | `E` | Contextual PICK UP / STORE button |
| Drop carried item | `Q` | DROP ITEM inside inventory |
| Open/close inventory | `I` | Package button in the top bar |
| Sprint | Hold Shift | Hold RUN, or swipe the joystick upward to 85% of available screen travel to lock auto-run |
| Look around | Drag the mouse on the game view | Drag anywhere on the unobstructed game view |
| Zoom | Mouse wheel or `+` / `−` | Pinch two fingers together/apart, or use the on-screen zoom buttons |
| Reset camera | Middle camera button | Middle camera button |
| Hide/show HUD | `H` | Eye button in the top bar |
| Graphics settings | Gear button | Gear button |
| Fullscreen | Fullscreen button | Fullscreen button if browser permits |

On touch phones in landscape orientation, the floating hint and pickup prompt are hidden. The larger PICK UP / STORE button sits 25% in from the right edge and is vertically centered for easier thumb access.

## Developer Mode and Advanced Settings

Any player can enable **Developer Mode** from the graphics settings panel. Its state is stored in local storage, so no URL parameter is required. Turning it on reveals **Advanced settings** with the FPS counter and Morning Check visibility switches. Turning Developer Mode off hides Advanced settings and hides the FPS counter. Morning Check only controls the mission/status overlay and top label; it does not disable movement or physics. Developer Mode is a convenience UI, not an authentication or security boundary.

## Project architecture

```text
robotic-dog-shelter/
├── index.html
├── package.json
├── vite.config.js
├── server.mjs                 # production static HTTP server, no dev server
├── manifest.json              # AI-oriented path/function index
├── PLAN.md                    # original project brief and constraints
├── src/
│   ├── main.js                # application lifecycle and fixed-step loop
│   ├── core/                  # renderer, scene, assets, PBR floor override and quality profiles
│   ├── world/                 # shelter orchestration, architecture, props, foliage, palette
│   ├── character/             # robot dog rig, procedural animation, pickup and inventory system
│   ├── physics/PhysicsWorld.js# Rapier character controller and fixed world
│   ├── controls/              # keyboard/touch input and third-person camera
│   ├── systems/               # movement integration and FPS sampling
│   ├── ui/                    # loading, HUD, graphics settings
│   └── styles/
│       ├── main.css           # global responsive visual design
│       └── touch-ff.css       # mobile touch-control overrides
└── scripts/
    ├── check-project.mjs      # static path/import sanity checks
    └── deploy-vps.sh          # isolated, port-selecting systemd deployment
```

## Planned files not yet active

Several empty modules remain as a roadmap for future gameplay: `src/character/anim/mengambil.js`, `src/character/npc/slime.js`, `src/character/npc/wizard.js`, `src/world/object/kado.js`, `src/world/object/penjara-kado.js`, and the five `src/world/sound/*.js` files. NPC behavior, gift interactions, a dedicated pickup animation, and action sound effects are not implemented yet. The active `src/character/inventory.js` module now handles world pickups, mouth-carry, 12 inventory slots, item drops, and local persistence. The local `src/world/object/cincin_emas.glb` asset also exists but is not loaded by the active scene. `src/systems/BirthdayTheme.js` is only a minimal stub; the current birthday-decoration toggle is handled by `GameRenderer` in `src/core/Renderer.js`.

The world is composed by `src/world/Shelter.js`, while `Architecture.js`, `Props.js`, `Decorations.js`, and `palette.js` keep geometry, prop placement, and visual palette organized. Shelter-owned geometry/material caches and one collidable-solids list keep rendering and Rapier setup coordinated.

The active Low Profile material override lives in `src/core/Renderer.js`: it keeps original materials available for Medium/High and swaps only tagged platform/base-floor meshes to a glossy `MeshPhysicalMaterial` variant. It uses the shared PMREM room environment for reflections and does not use MatCap. `src/core/PopClay.js` and the `matcaps/` collection remain a legacy experiment and are not imported by the current startup path; they do not control the live Low profile.

## Deploy on a Linux VPS

The script is designed to be run **on the target VPS**, from the project directory after you transfer the files there. It requires root access because it installs a systemd unit and may add one UFW rule when UFW is already active.

```bash
# from the project root on the VPS
sudo bash scripts/deploy-vps.sh
```

The script:

1. Prints the host summary, currently listening TCP ports, and a short list of running services.
2. Refuses to overwrite `/opt/robotic-dog-shelter` or an existing `robotic-dog-shelter.service`.
3. Selects an unused TCP port in 4173–4273 by probing actual bind availability.
4. Installs into the isolated `/opt/robotic-dog-shelter` directory, installs packages, runs static checks and a production build.
5. Installs a read-only `systemd` service with restart-on-failure and binds the production server to `0.0.0.0`.
6. Verifies HTTP and a built JavaScript asset locally before considering a firewall rule.
7. If UFW is already active, adds an allow rule for that single application TCP port. It does not disable the firewall, flush rules, or edit reverse proxies. If UFW is not active, it does not guess at nftables/iptables/Hostinger firewall policy and reports that external access still needs verification.
8. Prints the detected public IPv4 URL, chosen port, service status, and a note about external reachability.

**Important:** the deployment script has not been run against any VPS by this workspace. Do not treat an example URL or the script itself as proof that the public service is already online. Verify the URL from a separate network/browser after running it. A provider-level firewall may also need a narrowly scoped inbound TCP rule in Hostinger's control panel.

## Checks and known limitations

- `npm run check` validates required paths, local ES module import paths, project metadata, touch-control hooks/layout, balanced CSS blocks/strings/comments, the native PBR floor override, light/shadow isolation, and toy color tags. It is a static sanity check, not a replacement for full browser automation.
- `npm run build` validates Vite bundling. Recent UI, story, material-palette, and camera changes are source updates and require a fresh production build before they appear in `dist`. Use your browser's DevTools to inspect WebGL capabilities, frame rate, and GPU performance on the target device.
- Collision shapes are deliberately simple cuboids/capsules rather than mesh-perfect triangle colliders. They are safer and faster for a stylized game, but curved props and the hollow agility tunnel may still allow visual overlap in narrow edge cases.
- SSAO and SMAA passes are intentionally removed from the runtime pipeline because their full-screen cost was not justified on mobile. Low renders without shadows or post-processing; Medium uses one lower-resolution directional shadow map; High adds a subtle bloom pass only on capable desktop devices.
- Props and character are generated procedurally. The shelter is a stylized game environment, not photorealistic scanned architecture.
- Static room meshes are merged after world generation. Textured signs and instanced floor tiles remain separate; colliders continue using the original world-space solid list.
- Pinch zoom is handled with Pointer Events and a two-pointer distance delta. Camera obstruction raycasts are throttled to about 12 Hz instead of running every frame. FPS and visual quality still need verification on the actual target GPU.
- The public URL and final port are only knowable after the deployment script inspects the real VPS. No external connectivity claim is made in advance.

## World Rules, Stability, and Localization

- The current rule baseline is `src/world/gamerules.json`. Its scope is intentionally limited to world physics and performance/stability. It records acceptance criteria and reference targets; it is not a runtime physics engine and does not automatically enforce every rule.
- Core world rules cover mass, gravity, momentum, collisions, distinct movement states, bounded mass-scaled impacts, collision-safe movement, and animation that follows the simulated pose.
- Performance/stability rules cover a 60 FPS goal on capable devices, fixed-step physics at 60 Hz, visual-detail reduction without removing important colliders, skipping expensive inactive-object work, avoiding reload/loading loops, and recoverable error handling.
- English source strings live in `src/localization/en.json`; Bahasa Indonesia strings live in `src/localization/id.json`. Keep their dotted keys identical when adding a translation. Add a missing English key and its Indonesian counterpart together.
- Use `t('some.key')` for JavaScript strings and `data-i18n="some.key"` for text-only DOM elements. Supported attribute markers are `data-i18n-aria-label`, `data-i18n-title`, `data-i18n-content`, and `data-i18n-placeholder`. Dynamic text with variables can use `t('some.key', { count: 3 })` and catalog placeholders such as `{{count}}`.
- `src/core/Localization.js` exports `t()`, `setLocale('en' | 'id')`, `getLocale()`, `applyTranslations()`, and `SUPPORTED_LOCALES`. A language selector is not part of the current UI yet; it can call `setLocale('id')` when added later.
- Run `npm run check && npm run build` after adding or editing translation strings. The checker verifies that both catalogs have matching keys and that referenced UI/game-rule keys exist. Browser/runtime testing is still required for physical behavior and performance.

