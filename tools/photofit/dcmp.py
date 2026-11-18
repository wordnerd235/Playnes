# dcmp.py <jet> [src]: comparison sheet against the drawing (current model or a variant)
import sys, cv2, numpy as np
from drawscore import load, render, score, D
jet = sys.argv[1]; src = sys.argv[2] if len(sys.argv) > 2 else "-"
spec, pxm, sils = load(jet); ms = render(jet, spec, pxm, src); panels = []; res = {}
for v in sils:
    iou, im = score(v, sils[v], ms[v], img=True); res[v] = round(float(iou), 3); panels.append(im)
W = 900; panels = [cv2.resize(p, (W, int(p.shape[0] * W / p.shape[1])), interpolation=cv2.INTER_AREA) for p in panels]
cv2.imwrite(f"{D}/{jet}_cmp.jpg", np.vstack(panels), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(jet, res, "mean", round(sum(res.values()) / len(res), 4))
