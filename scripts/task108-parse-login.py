import json

d = json.load(open('/tmp/tenant-api.json'))
print('topKeys:', list(d.keys()))
u = d.get('user') or {}
print('user:', json.dumps({k: u.get(k) for k in ['id', 'name', 'avatar', 'role', 'tenantId', 'ownEmployeeId', 'email']}))
print('userKeys:', list(u.keys()))
print('token:', (d.get('token') or 'NONE')[:30])
