// The test copy of the game (published beside the stable one, at .../Playnes/test/) keeps its
// own saved progress and settings, so trying new things can never disturb the real game's.
// Both copies live on the same website, which means the same browser storage: here, every
// "playnes.*" key is quietly renamed "playnes-test.*". The first time the test copy runs it
// starts from a copy of the real game's progress and settings (including map keys).
// This file must be the first import in main.ts (other modules read storage as they load).

const REAL = "playnes.";
const TEST = "playnes-test.";

if (typeof __TEST__ !== "undefined" && __TEST__ && typeof Storage !== "undefined") {
  try {
    if (!localStorage.getItem(`${TEST}seeded`)) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(REAL)) localStorage.setItem(TEST + k.slice(REAL.length), localStorage.getItem(k) ?? "");
      }
      localStorage.setItem(`${TEST}seeded`, "1");
    }
    const map = (k: string) => (k.startsWith(REAL) ? TEST + k.slice(REAL.length) : k);
    const proto = Storage.prototype;
    const { getItem, setItem, removeItem } = proto;
    proto.getItem = function (k: string) {
      return getItem.call(this, map(k));
    };
    proto.setItem = function (k: string, v: string) {
      setItem.call(this, map(k), v);
    };
    proto.removeItem = function (k: string) {
      removeItem.call(this, map(k));
    };
  } catch {
    /* storage unavailable */
  }
  document.title = "Playnes TEST";
}

export const isTestCopy = typeof __TEST__ !== "undefined" && __TEST__;
