import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { AIRCRAFT } from "../src/data/aircraft.ts";
import { AIRPORTS, airportByCode } from "../src/data/airports.ts";
import { allLines, lineKey, speakable, LINES } from "../src/data/lines.ts";
import { buy, canBuy, charterRewards, exportCode, freeLandingRewards, importCode, newProgress, takeoffBonus, total } from "../src/game/progress.ts";
import { makeRunway, pickEnd, runwayCoords, runwayPoint } from "../src/game/runway.ts";
import { bearing, distance, NM } from "../src/sim/geo.ts";

beforeAll(() => {
  // progress.ts uses btoa/atob, available in Node 18+.
  expect(typeof btoa).toBe("function");
});

describe("data", () => {
  it("TRI to CLT is about 104 nm", () => {
    expect(distance(airportByCode("TRI"), airportByCode("CLT")) / NM).toBeCloseTo(104, 0);
  });

  it("every aircraft has a unique id and a model file", () => {
    const ids = new Set(AIRCRAFT.map((a) => a.id));
    expect(ids.size).toBe(AIRCRAFT.length);
    for (const a of AIRCRAFT) expect(existsSync(`public/models/${a.id}.glb`), a.id).toBe(true);
  });

  it("unlock prices rise with the hangar order", () => {
    const prices = AIRCRAFT.flatMap((a) => (a.unlock.type === "wings" ? [a.unlock.price] : []));
    expect([...prices].sort((x, y) => x - y)).toEqual(prices);
  });

  it("runway ends are about the published length apart", () => {
    for (const ap of AIRPORTS) {
      const [a, b] = ap.runway.ends;
      const ft = distance(a, b) / 0.3048;
      expect(Math.abs(ft - ap.runway.lengthFt) / ap.runway.lengthFt, ap.code).toBeLessThan(0.05);
    }
  });
});

describe("runways", () => {
  it("picks the runway direction closest to the course", () => {
    const tri = airportByCode("TRI");
    expect(pickEnd(tri, 225).end.id).toBe("23");
    expect(pickEnd(tri, 40).end.id).toBe("5");
  });

  it("round-trips runway coordinates", () => {
    const tri = airportByCode("TRI");
    const { end, other } = pickEnd(tri, 225);
    const r = makeRunway(tri, end, other, 450, 460);
    const p = runwayPoint(r, 1000, 20);
    const c = runwayCoords(r, p);
    expect(c.s).toBeCloseTo(1000, -1);
    expect(c.x).toBeCloseTo(20, 0);
    expect(r.heading).toBeCloseTo(bearing(end, other), 5);
  });
});

describe("progress", () => {
  it("backup codes round-trip and reject tampering", () => {
    const p = newProgress();
    p.wings = 321;
    p.lessonsDone = ["l1", "l2"];
    const code = exportCode(p);
    expect(importCode(code)?.wings).toBe(321);
    expect(importCode(code.replace(/.$/, code.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(importCode("hello")).toBeNull();
  });

  it("buying spends Wings once", () => {
    const p = newProgress();
    const pc12 = AIRCRAFT.find((a) => a.id === "pc12")!;
    expect(canBuy(p, pc12)).toBe(false);
    p.wings = 100;
    expect(buy(p, pc12)).toBe(true);
    expect(p.wings).toBe(25);
    expect(buy(p, pc12)).toBe(false);
  });

  it("charters pay more for longer trips and bigger playnes", () => {
    const trip = (distanceNm: number, seats: number) => total(charterRewards({ from: "CLT", to: "TRI", distanceNm, seats, stars: 0, butter: false, newLanding: false }));
    expect(trip(104, 4)).toBe(31); // Cessna, Charlotte to Tri-Cities
    expect(trip(104, 19)).toBeGreaterThan(trip(104, 10));
    expect(trip(104, 10)).toBeGreaterThan(trip(104, 4));
    expect(trip(300, 6)).toBeGreaterThan(trip(104, 6) * 2.3);
    const full = charterRewards({ from: "CLT", to: "TRI", distanceNm: 104, seats: 4, stars: 3, butter: true, newLanding: true });
    expect(total(full)).toBe(31 + 15 + 5 + 20);
  });

  it("free flight trips pay by distance between airports; circuits pay little", () => {
    const trip = total(freeLandingRewards({ from: "CLT", to: "TRI", distanceNm: 104, stars: 2, butter: false, newLanding: false }));
    const circuit = total(freeLandingRewards({ from: "TRI", to: "TRI", distanceNm: 0, stars: 2, butter: false, newLanding: false }));
    expect(trip).toBe(8 + 4);
    expect(circuit).toBe(2 + 4);
    expect(total(freeLandingRewards({ from: null, to: "TRI", distanceNm: 0, stars: 0, butter: false, newLanding: true }))).toBe(2 + 20);
  });

  it("first takeoff from an airport pays once", () => {
    const p = newProgress();
    expect(takeoffBonus(p, "TRI")).toBe(10);
    expect(takeoffBonus(p, "TRI")).toBe(0);
    expect(p.wings).toBe(10);
    expect(p.airportsDeparted).toEqual(["TRI"]);
  });
});

describe("voice lines", () => {
  it("keys are stable and unique", () => {
    expect(lineKey(LINES.welcome)).toBe(lineKey({ ...LINES.welcome }));
    const lines = allLines();
    expect(new Set(lines.map(lineKey)).size).toBe(lines.length);
  });

  it("every line has a generated audio file", () => {
    const manifest = JSON.parse(readFileSync("public/audio/voice/manifest.json", "utf8")) as Record<string, string>;
    const missing = allLines().filter((l) => !manifest[lineKey(l)]);
    expect(missing.map((l) => l.text)).toEqual([]);
  });

  it("makes the callsign pronounceable", () => {
    expect(speakable("Playnes one two three")).toBe("Planes one two three");
  });
});
