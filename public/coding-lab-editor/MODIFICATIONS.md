# Coding Lab — Record of Modifications to Upstream Scratch Editor

All modifications listed below are applied to commit `89181a7a224793a05bf9d55e2aecc68417534076` (v15.3.0) of `https://github.com/scratchfoundation/scratch-editor` under the GNU Affero General Public License v3.0 (`AGPL-3.0-only`). Exact copies of each modified file are archived under `vendor/coding-lab-scratch/modified-files/`.

## Modified Files in `packages/scratch-gui`

1. **`src/lib/legacy-library-asset-url.ts`**
   - Redirects library asset resolution from `https://cdn.assets.scratch.mit.edu` to self-hosted same-origin `static/assets/{assetId}.{dataFormat}` so Coding Lab has zero runtime dependency on `scratch.mit.edu`.

2. **`src/lib/legacy-storage.ts`**
   - Removes official Scratch web store endpoints (`projects.scratch.mit.edu`, `assets.scratch.mit.edu`) and remote backpack calls; registers self-hosted `static/assets/{assetId}.{dataFormat}` web store for built-in images and approved sounds.

3. **`src/lib/default-project/index.ts` & `src/lib/default-project/project-data.ts`**
   - Replaces the default Scratch Cat mascot (a Scratch Foundation trademark per `TRADEMARK`) with an original vector robot sprite (`Robo`), blank canvas backdrop, and original synthesized WAV sounds (`Pop`, `Beep`).

4. **`src/lib/libraries/sprites.json`, `costumes.json`, `backdrops.json`, `sounds.json`**
   - Replaced with self-hosted original vector sprites, costumes, backdrops, and synthesized PCM WAV sound library (excluding all Scratch Foundation trademark characters: Scratch Cat, Gobo, Pico, Nano, Tera, Giga).

5. **`src/containers/sound-tab.jsx`**
   - Removes the Microphone Record button, Upload Sound button, and `RecordModal` rendering; disables `handleSoundUpload`, `handleFileUploadClick`, and `onNewSoundFromRecordingClick` handlers per v1 audio restriction policy.

6. **`src/lib/file-uploader.js`**
   - Hard-blocks `soundUpload` at runtime so custom audio file uploads cannot execute even if triggered programmatically.

7. **`src/playground/coding-lab-bridge.js`** *(added)*
   - Adds a strict same-origin `postMessage` bridge connecting the live `scratch-vm` instance to the parent `CodingLabEditorHost` component for `.sb3` loading/exporting, JSON inspection, debounced project-change signalling, read-only tutor review mode, and VM-level sound allowlist enforcement.

8. **`src/playground/render-gui.jsx` & `src/playground/index.css`**
   - Renders `GUI` with `menuBarHidden` and `onVmInit={attachCodingLabVm}` so the surrounding Jaystarbliss **Coding Lab** shell provides toolbar controls without Scratch trademark branding, adds responsive scrolling styles, and adds `.coding-lab-readonly` CSS guards for read-only tutor inspection.

9. **`public/coding-lab-editor/index.html` & `src/playground/coding-lab-bridge.js`**
   - Adds strict `event.source === window.parent` and per-instance handshake `nonce` verification (`CODING_LAB_HANDSHAKE_INIT` / `CODING_LAB_HANDSHAKE_ACK`), plus instant theme synchronization (`CODING_LAB_SET_THEME` for `light`, `dark`, and `glass` outer chrome modes) while strictly preserving authentic Scratch block colors, stage canvas, and paint editor canvas without CSS filters.

