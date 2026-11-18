# mkdparams.py <id>: parameters for drawing tuning of a kit jet
import json, sys
i = sys.argv[1]
P = [("@nose", "+", 0.3), ("@tail", "+", 0.3),
 ("wing.le0", "+", 0.3), ("wing.sweep", "+", 2), ("wing.rootChord", "*", 0.06), ("wing.tipChord", "*", 0.1), ("wing.span", "+", 0.15),
 ("wing.dihedral", "+", 1), ("wing.y0", "+", 0.1),
 ("fin.rootLE.1", "+", 0.3), ("fin.tipLE.1", "+", 0.3), ("fin.tipLE.0", "+", 0.2), ("fin.rootChord", "*", 0.08), ("fin.tipChord", "*", 0.1),
 ("tailplane.rootLE|tailplane.tipLE", "+", 0.3), ("tailplane.tipLE", "+", 0.3), ("tailplane.tipX", "+", 0.2), ("tailplane.root", "*", 0.08), ("tailplane.tip", "*", 0.1), ("tailplane.y", "+", 0.15),
 ("engines.0.zi", "+", 0.3), ("engines.0.len", "*", 0.08), ("engines.0.r", "*", 0.06), ("engines.0.y", "+", 0.1), ("engines.0.x", "+", 0.1),
 ("fus.*.1", "*", 0.03), ("fus.*.2", "+", 0.06), ("fus.*.3", "+", 0.06)]
skip = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()
out = [{"path": "|".join(f"{i}.{q}" if not q.startswith("@") else f"{i}.{q}" for q in p.split("|")), "op": o, "step": s} for p, o, s in P if p not in skip]
json.dump(out, open(f"drawings/{i}_params.json", "w"), indent=1); print(len(out))
