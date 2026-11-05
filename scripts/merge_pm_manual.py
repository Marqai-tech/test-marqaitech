#!/usr/bin/env python3
# merge_pm_manual.py — insert cover as page 0 of body, normalize to A4, write final PDF
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
ASSETS = '/home/z/my-project/scripts/manual_assets'
FINAL = '/home/z/my-project/download/3Boxes-HRMS-Project-Management-User-Manual-SOP.pdf'

def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader(f'{ASSETS}/pm_cover.pdf').pages[0]))
for p in PdfReader(f'{ASSETS}/pm_manual_body.pdf').pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    '/Title': '3Boxes HRMS - Project Management Module User Manual & SOP',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'User manual and standard operating procedures for the 3Boxes HRMS Project Management module: intake, planning, execution, stage gates, closure and workflow configuration',
})
import os
os.makedirs('/home/z/my-project/download', exist_ok=True)
with open(FINAL, 'wb') as f:
    writer.write(f)
r = PdfReader(FINAL)
print('final pages:', len(r.pages), '->', FINAL)
