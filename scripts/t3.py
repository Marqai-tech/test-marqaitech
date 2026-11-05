import json
d=json.load(open("/tmp/tenant-api.json"))
u=d.get("user") or {}
print("user:", json.dumps({k:u.get(k) for k in ["id","name","email","role","tenantId","avatar"]}))
print("company:", json.dumps(u.get("company"))[:200])
print("tenant:", json.dumps(u.get("tenant"))[:200])
