# seg.py <photo.jpg> [sky|grab] [x0,y0,x1,y1]  ->  <photo>.mask.png (white = playne)
import sys, numpy as np, cv2
p = sys.argv[1]; mode = sys.argv[2] if len(sys.argv) > 2 else "sky"
im = cv2.imread(p); h, w = im.shape[:2]
if mode == "sky":
    lab = cv2.cvtColor(cv2.GaussianBlur(im, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    # Sky colour varies smoothly: fit a plane to the border pixels' colour, per channel.
    b = 6
    ys, xs = np.mgrid[0:h, 0:w]
    border = np.zeros((h, w), bool); border[:b] = border[-b:] = True; border[:, :b] = border[:, -b:] = True
    A = np.c_[xs[border], ys[border], np.ones(border.sum())]
    model = np.zeros_like(lab)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, lab[..., c][border], rcond=None)
        model[..., c] = coef[0] * xs + coef[1] * ys + coef[2]
    d = np.linalg.norm(lab - model, axis=2)
    res = d[border]; thr = max(12.0, np.percentile(res, 99) * 1.6)
    m = (d > thr).astype(np.uint8)
    # Refine with GrabCut: strong differences are probably playne, near-sky colours are
    # probably sky, and everything well away from the rough outline is surely sky.
    g = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    g[d > thr] = cv2.GC_PR_FGD
    g[d > thr * 2.5] = cv2.GC_FGD
    far = cv2.dilate(m, np.ones((41, 41), np.uint8)) == 0
    g[far] = cv2.GC_BGD
    g[border] = cv2.GC_BGD
    if (g == cv2.GC_FGD).sum() > 50 and (g == cv2.GC_BGD).sum() > 50:
        bgm = np.zeros((1, 65), np.float64); fgm = np.zeros((1, 65), np.float64)
        cv2.grabCut(im, g, None, bgm, fgm, 5, cv2.GC_INIT_WITH_MASK)
        gc = ((g == cv2.GC_FGD) | (g == cv2.GC_PR_FGD)).astype(np.uint8)
        # GrabCut drops shaded grey parts; keep threshold pixels next to what it found.
        m = gc | (m & cv2.dilate(gc, np.ones((25, 25), np.uint8)))
elif mode == "net":
    # A general "main object" cut-out network (ISNet, as used by rembg), optionally on a crop.
    import onnxruntime as ort
    x0, y0, x1, y1 = map(int, sys.argv[3].split(",")) if len(sys.argv) > 3 else (0, 0, w, h)
    crop = im[y0:y1, x0:x1]
    import os; sess = ort.InferenceSession(os.environ.get("SEG_MODEL", os.path.join(os.path.dirname(os.path.abspath(__file__)), "segmodel", "isnet.onnx")))
    x = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), (1024, 1024)).astype(np.float32) / 255 - 0.5
    out = sess.run(None, {"input_image": x.transpose(2, 0, 1)[None]})[0][0, 0]
    out = (out - out.min()) / max(out.max() - out.min(), 1e-6)
    pm = cv2.resize(out, (x1 - x0, y1 - y0))
    m = np.zeros((h, w), np.uint8); m[y0:y1, x0:x1] = (pm > 0.5).astype(np.uint8)
else:
    m = np.zeros((h, w), np.uint8)
    x0, y0, x1, y1 = map(int, sys.argv[3].split(",")) if len(sys.argv) > 3 else (int(w * .03), int(h * .03), int(w * .97), int(h * .97))
    bg = np.zeros((1, 65), np.float64); fg = np.zeros((1, 65), np.float64)
    cv2.grabCut(im, m, (x0, y0, x1 - x0, y1 - y0), bg, fg, 6, cv2.GC_INIT_WITH_RECT)
    m = ((m == 1) | (m == 3)).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
if n > 1:
    big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    # keep the largest part plus any sizeable part close to it (gear legs, a wing tip cut by glare)
    keep = np.zeros_like(m)
    x, y, ww, hh = st[big, :4]
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA]; xi, yi, wi, hi = st[i, :4]
        near = xi < x + ww + 20 and xi + wi > x - 20 and yi < y + hh + 20 and yi + hi > y - 20
        if i == big or (near and a > st[big, cv2.CC_STAT_AREA] * 0.004): keep[lbl == i] = 1
    m = keep
# fill holes (windows, dark nacelle intakes)
ff = m.copy() * 255; mask = np.zeros((h + 2, w + 2), np.uint8); cv2.floodFill(ff, mask, (0, 0), 128)
m = ((ff != 128)).astype(np.uint8)
cv2.imwrite(p.rsplit(".", 1)[0] + ".mask.png", m * 255)
print(p, "mask area", int(m.sum()), "of", h * w)
# Normalised 160x160 mask for the pose search: sqrt(area) = 60 px, centroid at (80, 80).
ys, xs = np.nonzero(m)
A = len(xs); cx, cy = xs.mean(), ys.mean()
k = 60 / np.sqrt(A)
M = np.float32([[k, 0, 80 - k * cx], [0, k, 80 - k * cy]])
n160 = cv2.warpAffine(m.astype(np.float32), M, (160, 160)) > 0.5
import json
k2 = 120 / np.sqrt(A)
M2 = np.float32([[k2, 0, 160 - k2 * cx], [0, k2, 160 - k2 * cy]])
n320 = cv2.warpAffine(m.astype(np.float32), M2, (320, 320)) > 0.5
json.dump({"cx": float(cx), "cy": float(cy), "area": int(A), "m": n160.astype(int).ravel().tolist(), "m2": n320.astype(int).ravel().tolist()}, open(p.rsplit(".", 1)[0] + ".seg.json", "w"))
