import json
d=json.load(open("/tmp/vlink2.json"))
print("keys with link/git:", [k for k in d if "ink" in k or "git" in k.lower() or "production" in k.lower()])
for k in ["link","git","productionBranch","gitFragments"]:
    if k in d: print(k, "=", json.dumps(d[k])[:300])
