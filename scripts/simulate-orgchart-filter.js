/**
 * Org-chart department filter simulation on LIVE data.
 * Mirrors buildOrgTree + filteredTree from src/app/(dashboard)/org-chart/page.tsx,
 * then compares OLD (buggy) vs NEW (fixed) keep-conditions per department.
 */
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';

function countNodes(nodes) {
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children || []), 0);
}

function filterTree(nodes, deptFilter, keep) {
  const walk = (list) => list.reduce((acc, node) => {
    const deptName = node.employee.department?.name || 'Unassigned';
    const matchesDept = !deptFilter || deptName === deptFilter;
    const filteredChildren = walk(node.children);
    const ok = keep
      ? (matchesDept || filteredChildren.length > 0)                 // NEW (search always true here)
      : (matchesDept && filteredChildren.length > 0) || matchesDept; // OLD: (md && kids) || (md && ms) — with ms=true: md
    if (ok) acc.push({ ...node, children: filteredChildren });
    return acc;
  }, []);
  return walk(nodes);
}

async function main() {
  const login = await fetch(`${LIVE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
  }).then(r => r.json());
  const H = { Authorization: `Bearer ${login.token}`, 'x-tenant-slug': 'marqaitechgroup' };
  const res = await fetch(`${LIVE}/api/employees?limit=1000`, { headers: H }).then(r => r.json());
  const employees = res.employees || res || [];
  console.log('employees fetched:', employees.length);
  const withDept = employees.filter(e => e.department?.name);
  console.log('with department:', withDept.length, '| without:', employees.length - withDept.length);

  // Build tree (reporting-manager driven, mirrors buildOrgTree)
  const byId = new Map(employees.map(e => [e.id, e]));
  const childrenOf = new Map();
  const roots = [];
  for (const emp of employees) {
    const mid = emp.reportingManagerId;
    if (!mid || mid === emp.id || !byId.has(mid)) { roots.push(emp); continue; }
    if (!childrenOf.has(mid)) childrenOf.set(mid, []);
    childrenOf.get(mid).push(emp);
  }
  const build = (emp) => ({ id: emp.id, employee: emp, children: (childrenOf.get(emp.id) || []).map(build) });
  const tree = roots.map(build);
  console.log('roots:', roots.length);

  const depts = [...new Set(withDept.map(e => e.department.name))];
  console.log('\ndepartment          | OLD visible | NEW visible | dept members');
  console.log('-'.repeat(70));
  for (const d of depts) {
    const members = withDept.filter(e => e.department.name === d).length;
    const oldN = countNodes(filterTree(tree, d, false));
    const newN = countNodes(filterTree(tree, d, true));
    console.log(`${d.padEnd(20).slice(0, 20)}| ${String(oldN).padStart(11)} | ${String(newN).padStart(11)} | ${members}`);
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
