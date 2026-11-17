import json
d=json.load(open("/tmp/vproj.json"))
for p in d.get("projects", []):
    print(p.get("name"), "|", p.get("id"), "| prodBranch:", p.get("productionBranch"), "| framework:", p.get("framework"), "| latest:", (p.get("latestDeployments") or [{}])[0].get("url", ""))
