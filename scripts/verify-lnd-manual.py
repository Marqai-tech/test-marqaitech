#!/usr/bin/env python3
"""Verify the L&D manual PDF: links, outline, keywords, corruption, images."""
import fitz  # PyMuPDF

PATH = "/home/z/my-project/download/3Boxes-HRMS-Learning-Development-User-Manual-SOP.pdf"
doc = fitz.open(PATH)
print(f"pages={doc.page_count} | metadata title={doc.metadata.get('title')!r}")

# 1. Internal links on TOC pages (pages 1-2, 0-indexed)
total_links = 0
for pi in (1, 2):
    page = doc[pi]
    links = page.get_links()
    kinds = {}
    for l in links:
        kinds[l["kind"]] = kinds.get(l["kind"], 0) + 1
    total_links += len(links)
    print(f"TOC page {pi+1}: {len(links)} links, kinds={kinds}")

# resolve named destinations -> valid?
named = [l for l in doc[1].get_links() if l["kind"] == fitz.LINK_NAMED]
sample = named[:3] if named else []
for l in sample:
    dest = l.get("nameddest") or l.get("name")
    resolved = doc.resolve_names().get(dest)
    print(f"  link {dest!r} -> page {(resolved or {}).get('page')}", "OK" if resolved else "BROKEN")

# 2. Outline/bookmarks
toc = doc.get_toc()
print(f"outline entries={len(toc)}")
for lvl, title, pg in toc[:6]:
    print(f"  L{lvl} p{pg} {title}")
print("  ...")
for lvl, title, pg in toc[-3:]:
    print(f"  L{lvl} p{pg} {title}")

# 3. Keyword coverage for all 15 chapters
text = "".join(doc[i].get_text() for i in range(doc.page_count))
chapters = [
    "Introduction & Module Architecture", "L&D Hub", "Course Catalog & Content Hub",
    "Learning Paths & Promotion Tracks", "Assignment & Enrolment Engine",
    "Course Nomination & Approval", "Tracking, Completion & Certifications",
    "Skill Gaps from Performance Reviews", "Compliance Tracking & Policy Sign-Offs",
    "Kirkpatrick Model", "Notifications & Automation", "Roles & Permissions Matrix",
    "SOP Quick Reference", "FAQ & Troubleshooting", "Glossary",
]
missing = [c for c in chapters if c not in text]
print("chapter keyword coverage:", "ALL 15 PRESENT" if not missing else f"MISSING {missing}")

# 4. Corruption / blank pages
bad = text.count("\ufffd")
print(f"U+FFFD count: {bad}")
blank = [i + 1 for i in range(doc.page_count) if len(doc[i].get_text().strip()) < 5 and not doc[i].get_images()]
print(f"blank pages: {blank or 'none'}")

# 5. Images
n_img = sum(len(doc[i].get_images()) for i in range(doc.page_count))
print(f"embedded images: {n_img}")

# 6. Page sizes
sizes = {(round(p.rect.width, 1), round(p.rect.height, 1)) for p in doc}
print(f"page sizes: {sizes}")
doc.close()
print("VERIFY DONE")
