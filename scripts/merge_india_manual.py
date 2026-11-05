#!/usr/bin/env python3
"""Merge cover + body into the final India payroll manual PDF (cover = page 0, normalized to A4)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
COVER = "/home/z/my-project/scripts/manual_assets/india/india_cover.pdf"
BODY = "/home/z/my-project/scripts/manual_assets/india/india_manual_body.pdf"
OUT = "/home/z/my-project/download/3Boxes-HRMS-Indian-Payroll-Configuration-Operations-Manual-SOP.pdf"


def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
        # force exact mediabox to avoid sub-point drift
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page


writer = PdfWriter()
# append() preserves the body's PDF outline (bookmarks); add_page() would drop it
writer.append(COVER)
writer.append(BODY)
for page in writer.pages:
    normalize(page)
writer.add_metadata({
    "/Title": "3Boxes HRMS - Indian Payroll Configuration & Operations Manual & SOP",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Indian payroll configuration and operations: CTC architecture, statutory "
                "compliance (EPF, ESIC, PT, LWF, TDS), processing workflow, approvals, "
                "statutory filings, declaration and proof verification, F&F settlement "
                "and bank integration",
})
with open(OUT, "wb") as f:
    writer.write(f)

r = PdfReader(OUT)
sizes = {(round(float(p.mediabox.width), 1), round(float(p.mediabox.height), 1)) for p in r.pages}
print(f"MERGED -> {OUT}")
print(f"Pages: {len(r.pages)} | sizes: {sizes}")
