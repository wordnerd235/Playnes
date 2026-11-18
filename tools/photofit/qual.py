# qual.py <id> b001 b002 ... : prints the photos whose cut-out looks like one whole playne
import sys, cv2, numpy as np
tid = sys.argv[1]; good = []
for f in sys.argv[2:]:
    try: m = cv2.imread(f"{tid}/{f}.mask.png", 0) > 127
    except Exception: continue
    if m is None: continue
    h, w = m.shape; a = m.mean()
    edge = np.concatenate([m[0], m[-1], m[:, 0], m[:, -1]]).mean()
    n, lbl, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
    big = st[1:, cv2.CC_STAT_AREA].max() / max(m.sum(), 1) if n > 1 else 0
    ys, xs = np.nonzero(m)
    fill = m.sum() / max((np.ptp(xs) + 1) * (np.ptp(ys) + 1), 1) if len(xs) else 0
    ok = 0.02 < a < 0.55 and edge < 0.01 and big > 0.97 and 0.12 < fill < 0.7
    print(f, f"area {a:.2f} edge {edge:.3f} big {big:.2f} fill {fill:.2f}", "OK" if ok else "skip", file=sys.stderr)
    if ok: good.append(f)
print(" ".join(good))
