// Foundry Yard, a threejs-fps-02 entry (Node 22, standard library only): the game is
// this directory's game/ folder, plain static files the browser loads as ES modules
// with three.js from an import map, and this program hands it in. It copies game/
// and screenshots/ from beside this file to /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library. Four against
// four, rounds, economy, a plantable core, and bots that route, hold and shoot back.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossier = buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 });
writeFileSync(join(out, 'dossier.json'), dossier);

let files = 0;
let bytes = 0;
for (const entry of readdirSync(join(out, 'game'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  files += 1;
  bytes += statSync(join(entry.parentPath, entry.name)).size;
}
console.log(`game: ${files} files, ${bytes} bytes`);
console.log(`screenshots: ${readdirSync(join(out, 'screenshots')).join(', ')}`);
console.log(`dossier: ${dossier.length} bytes`);
