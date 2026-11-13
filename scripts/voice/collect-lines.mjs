// Writes scripts/voice/lines.json: every line the game can say, with its audio id.
// Then run scripts/voice/generate.py to make the audio files.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allLines, lineKey, speakable } from "../../src/data/lines.ts";

const here = dirname(fileURLToPath(import.meta.url));
const lines = allLines().map((l) => ({ id: lineKey(l), who: l.who, text: l.text, speak: speakable(l.text) }));
writeFileSync(join(here, "lines.json"), JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines -> scripts/voice/lines.json`);
