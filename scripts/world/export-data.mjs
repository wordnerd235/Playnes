// Dumps region, airports and landmarks as JSON for the Python world builder.
import { writeFileSync } from "node:fs";
import { AIRPORTS, LANDMARKS } from "../../src/data/airports.ts";
import { REGION } from "../../src/data/region.ts";

const out = process.argv[2];
writeFileSync(out, JSON.stringify({ region: REGION, airports: AIRPORTS, landmarks: LANDMARKS }, null, 1));
console.log(`wrote ${out}`);
