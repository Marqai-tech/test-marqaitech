import json
d=json.load(open("/tmp/empdet.json"))
e=d["employee"]
print("detail keys:", sorted(e.keys()))
for k in ["branch","branchName","department","designation","reportingManager","managerName","status","joinDate","dateOfJoining","employeeCode"]:
    v=e.get(k)
    print(k, type(v).__name__, (str(v)[:60] if v is not None else None))
