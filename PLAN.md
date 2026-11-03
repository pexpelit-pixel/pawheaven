# Little Rover: Robotic Dog Shelter Simulator

## Goal
Build a polished, responsive, third-person 3D exploration game starring an original articulated robotic dog inside a spacious indoor dog shelter. The shipped world is procedurally constructed so it does not depend on externally hosted models or placeholder downloads.

## Fixed stack and constraints
- Three.js `0.186.1` with vanilla JavaScript ES modules.
- Vite `8.3.5` for development and production bundling only.
- Rapier 3D `0.21.0` for a kinematic character controller, collision detection, gravity and grounded checks.
- HTML5 and CSS3 UI. No React, Vue, Angular or other frontend framework.
- WebGL2; do not use path tracing.
- Node.js 20.19+ or 22.12+ for the current Vite toolchain.

## Gameplay
- WASD or arrow keys: camera-relative movement with acceleration and braking.
- Space: jump with gravity, limited to grounded state.
- Shift: sprint.
- Mouse drag: orbit the third-person camera. Mouse wheel: zoom.
- Touch screen: virtual joystick, jump and sprint buttons; drag to orbit and use a two-finger pinch to zoom in/out.
- Dog faces movement direction; procedural animation states cover idle, walk, run, jump, air and landing.
- The camera follows smoothly, zooms within limits and raycasts against the shelter to reduce wall clipping.

## Visual environment
- Large indoor shelter with architectural glass, timber rafters, tiled floor, a welcome entry, low fences and play/rest/feeding/training zones.
- Procedural dog houses, beds, food bowls, toys, agility ramp and tunnel, shelves, plants, pendant lighting, wall details and signage.
- Custom articulated robotic quadruped featuring rounded armour, leg joints, ears, tail, glowing optics and a pulsing sensor.
- PBR-style rough materials, one shared generated room-reflection map, tone mapping, one directional shadow source, and optional subtle desktop-only bloom. SSAO/SMAA are omitted to limit full-screen GPU passes.
- Cached geometry/materials and instanced floor tiles reduce duplicate GPU resources. Low has no dynamic shadows or post-processing, Medium uses a 512px directional shadow map, and High enables subtle bloom only on capable desktop devices; adaptive rendering uses an absolute pixel-ratio cap to avoid multiplying resolution drops.

## Architecture
- `src/main.js`: startup, lifecycle, fixed 60 Hz simulation accumulator, render loop and visible startup errors.
- `src/core/`: renderer, lighting/scene, quality profiles and optional asset-loading helpers.
- `src/world/`: world composition, shelter architecture, props, foliage/decorations and shared color palette.
- `src/character/`: the robotic dog model, wrapper and procedural animation.
- `src/physics/`: Rapier world and character collision controller.
- `src/controls/`: keyboard/mouse/touch inputs and third-person camera.
- `src/systems/`: movement integration and FPS sampling.
- `src/ui/` plus `src/styles/`: loading screen, settings, HUD and responsive styling.
- `server.mjs`: minimal production static HTTP server with guarded paths, MIME types, caching and security headers.
- `scripts/check-project.mjs`: required-file, manifest and local-import checks.
- `scripts/deploy-vps.sh`: isolated VPS deployment workflow; it selects a free port, builds before starting a dedicated systemd service and verifies local HTTP/assets.

## Acceptance checks
1. Every referenced local ES module exists.
2. `npm run check` succeeds.
3. `node --check` succeeds for JavaScript files and `bash -n scripts/deploy-vps.sh` succeeds.
4. `npm install --no-audit --no-fund` succeeds in a network-enabled environment, then `npm run build` produces `dist/index.html` and bundled assets.
5. The production server returns HTTP 200 for the page and a built JavaScript asset, and rejects traversal/unsupported methods.
6. On the VPS, deployment inspects running services and occupied TCP ports, refuses to overwrite an existing project/service, builds the production application, binds `0.0.0.0`, enables systemd restart and verifies local HTTP.
7. The public URL is only considered established after the script reports the actual selected port/IP and outside-network access is tested.

## Deployment safety boundaries
The deployment script intentionally does not stop or change unrelated services, overwrite an existing `/opt/robotic-dog-shelter` install or the same-named systemd unit, change reverse proxies, flush firewall settings or guess whether provider-level firewall ingress is open. It adds a single TCP allow rule only if UFW is already active. The script must be run on the actual Linux VPS as root after the whole project directory is transferred there.

## Status of this deliverable
Application source and deployment automation are written in this project bundle. Local static and syntax checks are performed separately and recorded in the final handoff. A production bundle, real VPS installation, selected VPS port and public URL must not be assumed until dependency installation/build and the deployment script are run successfully on the target host.
