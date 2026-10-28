#!/usr/bin/env python3
"""Fix leave-policy/page.tsx: remove the orphaned old workflow component body
and close the main component properly."""
import sys

path = '/home/z/my-project/src/app/(dashboard)/leave/leave-policy/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)
print(f'Total lines before: {total}')

# Locate the marker line: '{/* ═══ APPROVAL WORKFLOW TAB ═══ */}'
marker_idx = None
for i, l in enumerate(lines):
    if 'APPROVAL WORKFLOW TAB' in l:
        marker_idx = i
        break
if marker_idx is None:
    print('ERROR: marker not found')
    sys.exit(1)

# Locate 'export default function LeavePolicyPage() {'
export_idx = None
for i, l in enumerate(lines):
    if l.startswith('export default function LeavePolicyPage()'):
        export_idx = i
        break
if export_idx is None:
    print('ERROR: export default not found')
    sys.exit(1)

print(f'Marker at line {marker_idx + 1}; export default at line {export_idx + 1}')

# Keep everything before the marker (trimmed of the stale comment block right
# above it), then close the main component, then keep the export default block.
# The stale comment sits directly above the marker: find where it starts.
comment_start = marker_idx
while comment_start > 0 and lines[comment_start - 1].lstrip().startswith(('{/*', '/*', '*')):
    comment_start -= 1
print(f'Stale comment block starts at line {comment_start + 1}')

new_lines = lines[:comment_start]
# Close the LeavePolicyPageContent component return + function
new_lines.append('\n')
new_lines.append('    </div>\n')
new_lines.append('  )\n')
new_lines.append('}\n')
new_lines.append('\n')
# Keep the export default block
new_lines.extend(lines[export_idx:])

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'Total lines after: {len(new_lines)}')
