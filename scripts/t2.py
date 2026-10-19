import json
d=json.load(open("/tmp/tenant-api.json"))
print("topKeys:", list(d.keys()))
u=d.get("user") or {}
print("userKeys:", list(u.keys()))
