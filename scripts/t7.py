import json
d=json.load(open("/tmp/emp.json"))
print("keys:", list(d.keys()))
print("pagination:", json.dumps(d.get("pagination")))
