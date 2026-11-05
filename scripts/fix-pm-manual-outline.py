#!/usr/bin/env python3
"""Rebuild PDF outline (sidebar bookmarks) from TOC page link destinations."""
import re
import fitz

PDF = "/home/z/my-project/download/3Boxes-HRMS-Project-Management-User-Manual-SOP.pdf"

doc = fitz.open(PDF)
entries = []

for pno in (1, 2):  # TOC pages (1-based pages 2 and 3)
    page = doc[pno]
    for lnk in page.get_links():
        if lnk["kind"] != fitz.LINK_NAMED:
            continue
        rect = fitz.Rect(lnk["from"])
        if rect.x0 > 400:  # right-edge page-number link, skip (duplicate)
            continue
        raw = page.get_textbox(rect)
        title = re.sub(r"[.\s·]+$", "", raw)          # trailing dots/space
        title = re.sub(r"^\s*[.\s·]+", "", title)     # leading dots
        title = re.sub(r"\s*\d+$", "", title)         # trailing page number
        title = title.strip(" .\u00b7")
        if not title or len(title) < 2:
            continue
        dest = int(lnk["page"])                       # 1-based page label
        entries.append((title, dest))

# dedupe consecutive duplicates (same title+dest)
dedup = []
for t, d in entries:
    if dedup and dedup[-1][0] == t and dedup[-1][1] == d:
        continue
    dedup.append((t, d))

# build hierarchical outline
outline = []
for title, dest in dedup:
    m = re.match(r"^(\d+)\.(\d+)", title)
    if m:
        level = 2
    else:
        level = 1
    outline.append([level, title, dest])

# sanitize: first must be level 1, no level jumps
clean = []
prev = 0
for lvl, title, dest in outline:
    if not clean:
        lvl = 1
    else:
        lvl = min(lvl, prev + 1)
    clean.append([lvl, title, dest])
    prev = lvl

print(f"Outline entries to write: {len(clean)}")
for lvl, title, dest in clean[:8]:
    print(f"  {'  ' * (lvl - 1)}{title}  ->  p{dest}")
print("  ...")
for lvl, title, dest in clean[-4:]:
    print(f"  {'  ' * (lvl - 1)}{title}  ->  p{dest}")

# sanity: destination pages must be within document
assert all(1 <= d <= len(doc) for _, _, d in clean), "destination out of range"

doc.set_toc(clean)
doc.save("/home/z/my-project/download/_pm_manual_outline.pdf", garbage=3, deflate=True)
doc.close()

import shutil
shutil.move("/home/z/my-project/download/_pm_manual_outline.pdf", PDF)

# verify
doc2 = fitz.open(PDF)
print(f"\nVERIFIED: outline entries now {len(doc2.get_toc())}")
print(f"Links still intact: {sum(1 for p in doc2 for l in p.get_links() if l['kind'] in (fitz.LINK_GOTO, fitz.LINK_NAMED))}")
print(f"Metadata title: {doc2.metadata['title']!r}")
print(f"Metadata subject: {doc2.metadata['subject']!r}")
doc2.close()
