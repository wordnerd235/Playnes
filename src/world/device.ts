// What kind of device we're on, for memory and detail budgets. iOS gives a web page much less
// memory than the hardware has (and counts graphics memory against it): go over and Safari
// silently reloads the page. Phones get the tightest budget, iPads a middle one.

export type DeviceClass = "phone" | "tablet" | "desktop";

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function deviceClass(): DeviceClass {
  const touch = navigator.maxTouchPoints > 1 || isIOS();
  if (!touch) return "desktop";
  const shortSide = Math.min(screen.width, screen.height);
  return /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent) || shortSide < 600 ? "phone" : "tablet";
}

export interface DetailBudget {
  /** Google 3D tiles: allowed blur, in screen pixels (lower = sharper, more work). The detail
   *  governor moves it between ~0.85x and 2.6x of this to keep frames smooth. */
  tilesSse: number;
  /** Google 3D tiles: graphics memory to keep, and the most it may briefly go over. */
  tilesCacheMB: number;
  tilesOverflowMB: number;
  /** Offline / ion globe: terrain tiles kept around after they leave the view. */
  globeTileCache: number;
  /** Google 3D tiles: most map tiles to draw at once before easing detail (0 = no limit). */
  maxTiles: number;
}

export function detailBudget(q: "high" | "medium" | "low", d: DeviceClass = deviceClass()): DetailBudget {
  if (q === "low") return { tilesSse: 24, tilesCacheMB: 160, tilesOverflowMB: 48, globeTileCache: 150, maxTiles: d === "desktop" ? 0 : 130 };
  if (d === "phone") return { tilesSse: 16, tilesCacheMB: 200, tilesOverflowMB: 64, globeTileCache: 220, maxTiles: 150 };
  // iPad: 256 MB (was 300; the speed test showed the slowdown starts once tile memory is full).
  // Tile limit 200: iPad speed tests ran 48-58 fps at ~210 tiles on screen (it varies from run
  // to run) and 60 at ~175.
  if (d === "tablet") return { tilesSse: 14, tilesCacheMB: 256, tilesOverflowMB: 64, globeTileCache: 320, maxTiles: 200 };
  return q === "high"
    ? { tilesSse: 8, tilesCacheMB: 768, tilesOverflowMB: 256, globeTileCache: 600, maxTiles: 0 }
    : { tilesSse: 12, tilesCacheMB: 384, tilesOverflowMB: 128, globeTileCache: 400, maxTiles: 0 };
}
