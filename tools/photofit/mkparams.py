# mkparams.py <id> [extra json]: shape parameters for the tuner (kit jets)
import json, sys
i = sys.argv[1]
P = [
 (f"{i}.@tail", "+", 0.3), (f"{i}.@nose", "+", 0.2),
 (f"{i}.fin.rootLE.1", "+", 0.3), (f"{i}.fin.tipLE.1", "+", 0.3), (f"{i}.fin.tipLE.0", "+", 0.2),
 (f"{i}.tailplane.tipX", "+", 0.25), (f"{i}.tailplane.tipLE", "+", 0.25),
 (f"{i}.wing.le0", "+", 0.25), (f"{i}.wing.dihedral", "+", 1), (f"{i}.wing.sweep", "+", 2),
 (f"{i}.engines.0.zi", "+", 0.25), (f"{i}.engines.0.r", "*", 0.06),
 (f"{i}.fus.*.2", "+", 0.06), (f"{i}.fus.*.3", "+", 0.06),
 (f"{i}.gear.mainZ", "=", 0.3), (f"{i}.gear.noseZ", "+", 0.3),
]
skip = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()
json.dump([{"path": p, "op": o, "step": s} for p, o, s in P if p.split(".", 1)[1] not in skip], open(f"{i}/params.json", "w"), indent=1)
