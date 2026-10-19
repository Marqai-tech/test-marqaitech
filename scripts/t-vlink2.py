import json
d=json.load(open("/tmp/vp2.json"))
print("link:", json.dumps(d.get("link"))[:400])
