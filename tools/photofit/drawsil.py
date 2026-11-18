# drawsil.py <jet>: silhouettes from the manufacturer drawing views listed in ../draw/specs.json
# writes ../draw/<jet>_<view>_sil.png (white = aircraft) and prints px/m for each view
import sys, json, cv2, numpy as np, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drawings")
jet = sys.argv[1]; spec = json.load(open(f"{D}/specs.json"))[jet]
im = cv2.imread(f"{D}/{spec['img']}")
out = {}
for view, box in spec["views"].items():
    x0, y0, x1, y1 = box; c = im[y0:y1, x0:x1]
    rot = spec.get("rot", {}).get(view, 0)            # degrees anticlockwise to bring the view upright (nose up / left)
    if rot:
        h_, w_ = c.shape[:2]; M = cv2.getRotationMatrix2D((w_ / 2, h_ / 2), rot, 1.0)
        cs, sn = abs(M[0, 0]), abs(M[0, 1]); nw, nh = int(h_ * sn + w_ * cs), int(h_ * cs + w_ * sn)
        M[0, 2] += nw / 2 - w_ / 2; M[1, 2] += nh / 2 - h_ / 2
        c = cv2.warpAffine(c, M, (nw, nh), borderValue=(255, 255, 255) if not spec.get("dark") else (0, 0, 0))
    g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(np.int32)
    if spec.get("dark"): g = 255 - g
    kind = spec.get("kinds", {}).get(view, spec.get("kind"))
    if kind == "net":
        import onnxruntime as ort
        sess = ort.InferenceSession(os.path.join(os.path.dirname(os.path.abspath(__file__)), "segmodel", "isnet.onnx"))
        pad = 40; cp = cv2.copyMakeBorder(c, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        x = cv2.resize(cv2.cvtColor(cp, cv2.COLOR_BGR2RGB), (1024, 1024)).astype(np.float32) / 255 - 0.5
        o = sess.run(None, {"input_image": x.transpose(2, 0, 1)[None]})[0][0, 0]; o = (o - o.min()) / max(o.max() - o.min(), 1e-6)
        sil = (cv2.resize(o, (cp.shape[1], cp.shape[0])) > 0.5).astype(np.uint8)[pad:-pad, pad:-pad]
        if view in spec.get("netplus", []):                                       # union with "differs from the white page"
            gg = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(np.int32)
            ink2 = (np.abs(gg - 255) > spec.get("thr", 12)).astype(np.uint8)
            Hh, Ww = ink2.shape
            vl = cv2.morphologyEx(ink2, cv2.MORPH_OPEN, np.ones((int(Hh * spec.get("vfrac", 0.55)), 1), np.uint8))
            hl = cv2.morphologyEx(ink2, cv2.MORPH_OPEN, np.ones((1, int(Ww * spec.get("hfrac", 0.75))), np.uint8))
            ink2 = ink2 & (1 - cv2.dilate(vl | hl, np.ones((3, 3), np.uint8)))
            u = cv2.morphologyEx(sil | ink2, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            ff = np.pad(u, 2) * 255; mk = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8); cv2.floodFill(ff, mk, (0, 0), 128)
            sil = (ff != 128).astype(np.uint8)[2:-2, 2:-2]
            n, lbl, st, _ = cv2.connectedComponentsWithStats(sil); b = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            sil = np.isin(lbl, [i for i in range(1, n) if i == b or st[i, cv2.CC_STAT_AREA] > st[b, cv2.CC_STAT_AREA] * 0.002]).astype(np.uint8)
        sil = cv2.morphologyEx(sil, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        ys, xs = np.nonzero(sil); metres = spec["dims"]["length"] if view == "side" else spec["dims"]["span"]
        out[view] = (xs.max() - xs.min() + 1) / metres
        cv2.imwrite(f"{D}/{jet}_{view}_sil.png", sil[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255); continue
    if kind == "render":
        bg = np.median(np.concatenate([g[:4].ravel(), g[-4:].ravel(), g[:, :4].ravel(), g[:, -4:].ravel()]))
        ink = (np.abs(g - bg) > spec.get("thr", 10)).astype(np.uint8)
    else:
        ink = (g < spec.get("ink", 200)).astype(np.uint8)
    H_, W_ = ink.shape                                               # long straight vertical / horizontal lines are
    vl = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((int(H_ * spec.get("vfrac", 0.55)), 1), np.uint8))   # dimension lines
    hl = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, int(W_ * spec.get("hfrac", 0.75))), np.uint8))
    ink = ink & (1 - cv2.dilate(vl | hl, np.ones((3, 3), np.uint8)))
    n, lbl, st, _ = cv2.connectedComponentsWithStats(ink)
    keep = np.zeros_like(ink); big = st[1:, cv2.CC_STAT_AREA].max()
    for i in range(1, n):
        w_, h_, a = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT], st[i, cv2.CC_STAT_AREA]
        if min(w_, h_) <= 4 and max(w_, h_) > 40: continue          # dimension / ground lines
        if a >= max(6, big * 0.004): keep[lbl == i] = 1
    k = spec.get("closev", {}).get(view, spec.get("close", 5))
    cl = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    ff = np.pad(cl, 2) * 255; mask = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 128)                             # outside = reachable from the padded border
    sil = (ff != 128).astype(np.uint8)[2:-2, 2:-2]
    sil = cv2.morphologyEx(sil, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))   # drop leftover thin line stubs
    n, lbl, st, _ = cv2.connectedComponentsWithStats(sil)
    if n > 1:                                                        # main body plus nearby pieces (gear)
        b = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); s2 = np.zeros_like(sil)
        for i in range(1, n):
            if i == b or st[i, cv2.CC_STAT_AREA] > st[b, cv2.CC_STAT_AREA] * 0.002: s2[lbl == i] = 1
        sil = s2
    ys, xs = np.nonzero(sil)
    ext = (xs.max() - xs.min() + 1)
    metres = spec["dims"]["length"] if view == "side" else spec["dims"]["span"]
    out[view] = ext / metres
    cv2.imwrite(f"{D}/{jet}_{view}_sil.png", sil[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255)
json.dump(out, open(f"{D}/{jet}_pxm.json", "w")); print(jet, {k: round(v, 2) for k, v in out.items()})
