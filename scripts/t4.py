import json
d=json.load(open("/tmp/tenant-api.json"))
u=d.get("user") or {}
for k,v in u.items():
    s=json.dumps(v)
    print(k, type(v).__name__, len(s))
