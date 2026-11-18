# shared: IoU of model ortho masks against drawing silhouettes (best translation), per view
import json, subprocess, os, cv2, numpy as np
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, "drawings")
def load(jet):
    spec = json.load(open(f"{D}/specs.json"))[jet]; pxm = json.load(open(f"{D}/{jet}_pxm.json"))
    sils = {}
    for v in spec["views"]:
        im = cv2.imread(f"{D}/{jet}_{v}_sil.png", 0); k = min(1.0, 650 / max(im.shape))   # work at <= 650 px
        if k < 1: im = cv2.resize(im, (int(im.shape[1] * k), int(im.shape[0] * k)), interpolation=cv2.INTER_AREA); pxm = {**pxm, v: pxm[v] * k}
        sils[v] = im > 127
    return spec, pxm, sils
def render(jet, spec, pxm, src="-", pre=None):
    pre = pre or f"{D}/{jet}"
    views = {v: [pxm[v], v in spec.get("nogear", [])] for v in spec["views"]}
    subprocess.run(["node", f"{H}/ortho3.cjs", spec.get("model", jet), pre, json.dumps(views), src], check=True, stdout=subprocess.DEVNULL)
    return {v: cv2.imread(f"{pre}_{v}_m.png", 0) < 128 for v in views}
def score(view, sil, m, img=False, rng=14, step=2):
    hs, ws = sil.shape; hm, wm = m.shape; P = 40
    can = np.zeros((max(hs, hm) + 2 * P, max(ws, wm) + 2 * P), bool); S = can.copy(); S[P:P + hs, P:P + ws] = sil
    ax = P if view == "side" else P + ws // 2 - wm // 2
    ay = (P + hs - hm) if view in ("side", "front") else P
    best = (-1, 0, 0)
    for dy in range(-rng, rng + 1, step):
        for dx in range(-rng, rng + 1, step):
            y, x = ay + dy, ax + dx
            inter = (S[y:y + hm, x:x + wm] & m).sum(); uni = S.sum() + m.sum() - inter
            iou = inter / uni
            if iou > best[0]: best = (iou, dx, dy)
    if not img: return best[0]
    iou, dx, dy = best; M = can.copy(); M[ay + dy:ay + dy + hm, ax + dx:ax + dx + wm] = m
    im = np.full(S.shape + (3,), 255, np.uint8)
    im[S & M] = (205, 205, 205); im[M & ~S] = (80, 80, 240); im[S & ~M] = (230, 150, 60)
    for mk, col in ((S, (0, 160, 0)), (M, (0, 0, 200))):
        c, _ = cv2.findContours(mk.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(im, c, -1, col, 1)
    cv2.putText(im, f"{view} IoU {iou:.3f}", (5, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)
    return iou, im
