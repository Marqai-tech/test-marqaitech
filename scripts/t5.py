import json
d=json.load(open("/tmp/tenant-api.json"))
u=d.get("user") or {}
a=u.get("avatar") or ""
print("prefix:", a[:60])
print("name:", u.get("name"))
print("company:", json.dumps(u.get("company")))
print("tenant:", json.dumps(u.get("tenant")))
