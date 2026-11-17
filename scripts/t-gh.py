import json
d=json.load(open("/tmp/ghrepo.json"))
print("perms:", d.get("permissions"))
print("default_branch:", d.get("default_branch"))
