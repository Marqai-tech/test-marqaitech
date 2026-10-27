#!/usr/bin/env python3
"""Visual spot-check: screenshot the HR Help Desk chapter + a login page from the re-rendered SOP PDF."""
import fitz  # PyMuPDF

PDF = "/home/z/my-project/3-Boxes-HRMS/download/3boxes-hrms-mobile-app-sop-training.pdf"
doc = fitz.open(PDF)
# find the page with the Help Desk chapter header
target = None
for i, page in enumerate(doc):
    if "Support Ticketing on the Go" in page.get_text():
        target = i
        break
print("helpdesk chapter on page:", (target + 1) if target is not None else "NOT FOUND")
for idx, name in [(target, "helpdesk"), (3, "login")]:
    if idx is None:
        continue
    pix = doc[idx].get_pixmap(dpi=72)
    out = f"/tmp/sop-check-{name}.png"
    pix.save(out)
    print("saved", out)
# text check via PyMuPDF (pdftotext may drop spans)
full = " ".join(p.get_text() for p in doc)
print("Chapter 12 in text:", "Chapter 12" in full)
print("Chapter 4 in text:", "Chapter 4" in full)
