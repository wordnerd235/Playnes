# comp.py <photo.jpg> [...]  ->  <photo>.cmp.jpg : photo with outline | model at the same pose | differences
import sys, json, numpy as np, cv2
for p in sys.argv[1:]:
    base = p.rsplit(".", 1)[0]
    im = cv2.imread(p); h, w = im.shape[:2]
    pm = cv2.imread(base + ".mask.png", 0) > 127
    fit = json.load(open(base + ".fit.json")); seg = json.load(open(base + ".seg.json"))
    mm = cv2.imread(base + ".mask-model.png", 0) < 128
    sh = cv2.imread(base + ".shaded.png")
    ys, xs = np.nonzero(mm); mA = len(xs); mcx, mcy = xs.mean(), ys.mean()
    s = np.sqrt(seg["area"] / mA); t = np.radians(fit["roll"]); c, si = np.cos(t) * s, np.sin(t) * s
    M = np.float32([[c, -si, 0], [si, c, 0]])
    M[:, 2] = np.float32([seg["cx"], seg["cy"]]) - M[:, :2] @ np.float32([mcx, mcy])
    wm = cv2.warpAffine(mm.astype(np.uint8), M, (w, h), flags=cv2.INTER_NEAREST) > 0
    ws = cv2.warpAffine(sh, M, (w, h), borderValue=(230, 196, 156))
    ws[~wm] = (230, 196, 156)
    iou = (wm & pm).sum() / max((wm | pm).sum(), 1)
    out1 = im.copy()
    cnt, _ = cv2.findContours(wm.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out1, cnt, -1, (0, 0, 255), max(1, w // 500))
    pc, _ = cv2.findContours(pm.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out1, pc, -1, (0, 200, 0), max(1, w // 700))
    diff = np.full_like(im, 255)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY); g3 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    diff[:] = (g3 * 0.35 + 165).astype(np.uint8)
    diff[pm & wm] = (150, 150, 150)
    diff[pm & ~wm] = (0, 0, 230)     # in the photo, missing from the model: red
    diff[~pm & wm] = (230, 120, 0)   # model only: blue
    def lab(img, t):
        img = img.copy(); cv2.rectangle(img, (0, 0), (min(w, 12 * len(t) + 10), 26), (255, 255, 255), -1)
        cv2.putText(img, t, (5, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1, cv2.LINE_AA); return img
    row = np.hstack([lab(out1, "photo: green=cut-out red=model"), lab(ws, f"model az{fit['az']:.0f} el{fit['el']:.0f}"), lab(diff, f"red=photo only blue=model only IoU {iou:.2f}")])
    if row.shape[1] > 1800: row = cv2.resize(row, (1800, int(row.shape[0] * 1800 / row.shape[1])))
    cv2.imwrite(base + ".cmp.jpg", row, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(p, "IoU", round(float(iou), 3))
