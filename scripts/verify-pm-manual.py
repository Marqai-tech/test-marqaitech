#!/usr/bin/env python3
"""Verify the delivered PM User Manual PDF using PyMuPDF: pages, chapters, TOC links, metadata."""
import fitz  # PyMuPDF

PDF = "/home/z/my-project/download/3Boxes-HRMS-Project-Management-User-Manual-SOP.pdf"

doc = fitz.open(PDF)
print(f"Pages: {len(doc)}")
meta = doc.metadata
print(f"Metadata: title={meta.get('title')!r} author={meta.get('author')!r} "
      f"creator={meta.get('creator')!r} subject={meta.get('subject')!r}")

full_text = []
img_count = 0
for page in doc:
    full_text.append(page.get_text())
    img_count += len(page.get_images(full=True))
all_text = "\n".join(full_text)

expected = [
    "Introduction", "Purpose", "Scope",
    "Roles", "Permissions",
    "Lifecycle", "Intake",
    "Workflow Configuration",
    "Planning", "Resources", "Matchmaking", "Capacity",
    "Execution", "Delivery Board", "Sprint", "Waterfall", "Phase",
    "Stage Gate",
    "Timesheet", "Time Log",
    "Closure", "Post-mortem", "Sign-off",
    "Integrations", "Jira", "Azure DevOps",
    "Quick Reference", "FAQ", "Troubleshooting", "Glossary",
]
missing = [k for k in expected if k.lower() not in all_text.lower()]
print(f"\nKeyword coverage: {len(expected) - len(missing)}/{len(expected)} found")
if missing:
    print(f"  MISSING: {missing}")

# Embedded images (screenshots/diagram)
print(f"Embedded images across document: {img_count}")

# Link annotations
n_links = 0
for page in doc:
    for lnk in page.get_links():
        if lnk.get("kind") in (fitz.LINK_GOTO, fitz.LINK_NAMED):
            n_links += 1
print(f"Internal navigation links: {n_links}")

# Blank pages / corruption
blanks = [i + 1 for i, t in enumerate(full_text) if len(t.strip()) < 10]
print(f"Near-empty pages: {blanks if blanks else 'none'}")
print(f"U+FFFD corruption chars: {all_text.count(chr(0xFFFD))}")

# Page size consistency
sizes = {(round(p.rect.width, 1), round(p.rect.height, 1)) for p in doc}
print(f"Page sizes: {sizes}")

print("\n--- Cover (page 1) ---")
print("\n".join(full_text[0].splitlines()[:14]))
print("\n--- TOC (page 3, first 32 lines) ---")
print("\n".join(full_text[2].splitlines()[:32]))
