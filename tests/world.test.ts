import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { airportByCode, AIRPORTS, LANDMARKS } from "../src/data/airports.ts";
import { inRegion, REGION } from "../src/data/region.ts";
import { CartoonData, LAND } from "../src/world/cartoon.ts";

let data: CartoonData;

beforeAll(async () => {
  // Serve public/world from disk instead of the network.
  vi.stubGlobal("fetch", async (url: string) => {
    const path = `public/world/${String(url).replace("./world/", "")}`;
    const buf = readFileSync(path);
    return new Response(buf, { status: 200 });
  });
  data = await CartoonData.load();
});

describe("offline world", () => {
  it("covers every airport and landmark", () => {
    for (const a of AIRPORTS) expect(inRegion(a.lat, a.lon), a.code).toBe(true);
    for (const l of LANDMARKS) expect(inRegion(l.lat, l.lon), l.id).toBe(true);
    expect(data.meta.bounds).toEqual(REGION);
  });

  it("has believable terrain heights", () => {
    const tri = airportByCode("TRI");
    expect(data.height(tri.lat, tri.lon)).toBeGreaterThan(400);
    expect(data.height(tri.lat, tri.lon)).toBeLessThan(520);
    // Mount Mitchell is over 2,000 m; the 370 m grid smooths the summit a little.
    expect(data.height(35.7648, -82.2652)).toBeGreaterThan(1700);
    // Out in the Atlantic.
    expect(data.height(33.5, -78.2)).toBeLessThan(2);
  });

  it("runways are flat and marked as airport land", () => {
    for (const a of AIRPORTS) {
      const [e0, e1] = a.runway.ends;
      const mid = { lat: (e0.lat + e1.lat) / 2, lon: (e0.lon + e1.lon) / 2 };
      expect(data.landAt(mid.lat, mid.lon), a.code).toBe(LAND.airport);
      const h0 = data.height(e0.lat, e0.lon);
      const h1 = data.height(e1.lat, e1.lon);
      const hm = data.height(mid.lat, mid.lon);
      // Midpoint within a few meters of the straight line between the ends.
      expect(Math.abs(hm - (h0 + h1) / 2), a.code).toBeLessThan(6);
    }
  });

  it("knows water from land", () => {
    expect(data.landAt(33.5, -78.2)).toBe(LAND.water);
    expect(data.landAt(34.06, -81.27)).toBe(LAND.water); // Lake Murray
  });
});

describe("airport buildings", () => {
  it("has real buildings for every airport, with sensible heights", async () => {
    const { guessHeight } = await import("../src/world/buildings.ts");
    const json = JSON.parse(readFileSync("public/world/buildings.json", "utf8")) as { airports: Record<string, { b: { a: number; h?: number; c?: string; n?: string }[] }> };
    for (const a of AIRPORTS) {
      const list = json.airports[a.code]?.b ?? [];
      expect(list.length, a.code).toBeGreaterThan(50);
      for (const b of list) {
        const h = guessHeight(b);
        expect(h).toBeGreaterThan(2);
        expect(h).toBeLessThanOrEqual(80);
      }
    }
    expect(json.airports.CLT.b.some((b) => /terminal/i.test(b.n ?? ""))).toBe(true);
  });

  it("collision footprint test: inside, near the wall, and clear", async () => {
    const { insideOrNear } = await import("../src/world/buildings.ts");
    const square = [0, 0, 100, 0, 100, 60, 0, 60];
    expect(insideOrNear(square, 50, 30, 5)).toBe(true);
    expect(insideOrNear(square, 104, 30, 5)).toBe(true);
    expect(insideOrNear(square, 120, 30, 5)).toBe(false);
    expect(insideOrNear(square, -3, -3, 5)).toBe(true);
  });
});
