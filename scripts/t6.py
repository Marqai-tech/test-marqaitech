import json
d=json.load(open("/tmp/tenant-api.json"))
open("/tmp/tok.txt","w").write(d.get("token",""))
print("saved", len(d.get("token","")))
