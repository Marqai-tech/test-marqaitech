import json
d=json.load(open("/tmp/emp.json"))
e=d["employees"][0]
print("list-item keys:", sorted(e.keys()))
for k in ["branch","branchName","department","designation","departmentName","designationName","status","joinDate","employeeCode","avatar"]:
    v=e.get(k)
    print(k, type(v).__name__, (str(v)[:40] if v is not None else None))
