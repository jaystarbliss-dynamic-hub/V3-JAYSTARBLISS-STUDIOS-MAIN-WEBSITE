# Coding Lab — Media & Third-Party Dependency Licences

## Built-in Self-Hosted Media Library

All built-in sprites, costumes, backdrops, and sound effects shipped under `public/coding-lab-editor/static/assets/` are original assets generated specifically for Coding Lab by `vendor/coding-lab-scratch/build-coding-lab-editor.mjs`:

- **Vector Sprites & Costumes (16 sprites, 23 costumes)**: Original SVG vector artwork created for Jaystarbliss Coding Lab — dedicated to Public Domain / CC0-1.0. Contains **no** Scratch Foundation trademark characters (no Scratch Cat, Gobo, Pico, Nano, Tera, or Giga).
- **Vector Backdrops (10 backdrops)**: Original 480×360 SVG backdrops including Blank Canvas and XY Coordinate Grid — dedicated to Public Domain / CC0-1.0.
- **Built-in Sound Library (14 WAV audio effects)**: Original mathematically synthesized 16-bit PCM WAV files (`Pop`, `Beep`, `Laser Zap`, `Coin Collect`, `Jump Up`, `Boing Bounce`, `Victory Fanfare`, `Bell Chime`, `Click Tick`, `Power Up`, `Drum Kick`, `Snare Hit`, `Alert Tone`, `Whistle Slide`) — dedicated to Public Domain / CC0-1.0.

## Editor Software & Third-Party Dependencies

- **Scratch 3 Editor Monorepo (`scratch-gui`, `scratch-vm`, `scratch-render`, `scratch-storage`, `scratch-paint`, `scratch-svg-renderer`, `task-herder`)**: AGPL-3.0-only — Copyright © Scratch Foundation. Upstream: https://github.com/scratchfoundation/scratch-editor (`89181a7a224793a05bf9d55e2aecc68417534076`).
- **Blockly / `scratch-blocks`**: Apache-2.0 Licence (block SVG icons and media copied under `public/coding-lab-editor/static/blocks-media/`).
- **JSZip**: MIT / GPL-3.0 dual licence (used in the LMS host for `.sb3` ZIP validation and reconstruction).
- **Lucide Icons**: ISC Licence (used in the surrounding Jaystarbliss LMS UI).
