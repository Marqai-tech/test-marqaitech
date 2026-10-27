#!/usr/bin/env python3
"""Task 141 close-out — re-render the mobile app SOP & training PDF.

Reads download/3boxes-hrms-mobile-app-sop-training.html (720x1020 Paged-style
layout, break-after pages) and prints it to PDF with Playwright/Chromium using
the exact page size the stylesheet declares, so every .cover/.ending section
lands on its own page.
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "download", "3boxes-hrms-mobile-app-sop-training.html")
OUT = os.path.join(ROOT, "download", "3boxes-hrms-mobile-app-sop-training.pdf")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 720, "height": 1020})
    page.goto("file://" + SRC, wait_until="networkidle")
    page.wait_for_timeout(1200)  # fonts settle
    page.pdf(
        path=OUT,
        width="720px",
        height="1020px",
        print_background=True,
        margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
    )
    browser.close()

print("WROTE", OUT, os.path.getsize(OUT), "bytes")
