import json
d=json.load(open("/tmp/vp.json"))
for k in sorted(d.keys()):
    v=json.dumps(d[k])
    if len(v)<300: print(k, "=", v)
