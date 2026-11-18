# drawtune.py <jet> <params.json> [rounds]: coordinate descent on the kit spec against the manufacturer drawing
import sys, json, subprocess, os, time
from drawscore import load, render, score, H, D
jet, pfile = sys.argv[1], sys.argv[2]; rounds = int(sys.argv[3]) if len(sys.argv) > 3 else 2
spec, pxm, sils = load(jet); params = json.load(open(pfile)); model = spec.get("model", jet)
VAR = os.path.join(H, "var4"); os.makedirs(VAR, exist_ok=True)
def evaluate(patch):
    subprocess.run(["node", "scripts/build-models.mjs", model], cwd="/home/user/Playnes", env={**os.environ, "FAST": "1", "OUT_DIR": VAR, "SPEC_PATCH": json.dumps(patch)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    ms = render(jet, spec, pxm, f"/var4/{model}.glb", f"{VAR}/{jet}")
    per = {v: score(v, sils[v], ms[v]) for v in sils}
    # keep to the published length and span: the drawing's scale comes from them
    import numpy as np
    pen = 0
    for v, key in (("side", "length"), ("top", "span"), ("front", "span")):
        if v in ms:
            xs = np.nonzero(ms[v].any(axis=0))[0]; L = (xs.max() - xs.min() + 1) / pxm[v]
            pen += 3 * max(0, abs(L / spec["dims"][key] - 1) - 0.005)
    return sum(per.values()) / len(per) - pen, per
patch = json.load(open(sys.argv[4]))["patch"] if len(sys.argv) > 4 else []
best, per = evaluate(patch)
print("baseline", round(best, 4), {k: round(v, 3) for k, v in per.items()}, flush=True)
for r in range(rounds):
    for prm in params:
        step = prm["step"] / 2 ** r
        for d in (1, -1):
            while True:
                cur = next((q for q in patch if q[0] == prm["path"] and q[1] == prm["op"]), None)
                val = (cur[2] if cur else (1 if prm["op"] == "*" else 0)) + d * step
                trial = [q for q in patch if not (q[0] == prm["path"] and q[1] == prm["op"])] + [[prm["path"], prm["op"], round(val, 4)]]
                s, p = evaluate(trial)
                if s > best + 0.0008:
                    best, per, patch = s, p, trial
                    print("keep", prm["path"], prm["op"], round(val, 3), "->", round(s, 4), {k: round(v, 3) for k, v in p.items()}, flush=True)
                else: break
print("FINAL", round(best, 4), json.dumps(patch), flush=True)
json.dump({"score": best, "per": per, "patch": patch}, open(f"{D}/{jet}_tuned.json", "w"), indent=1)
