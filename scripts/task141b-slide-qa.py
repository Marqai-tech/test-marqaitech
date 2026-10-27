#!/usr/bin/env python3
"""Screenshot new/rewritten slides for visual QA."""
import os
from playwright.sync_api import sync_playwright

SLIDES = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "download", "slides"))
CHECKS = ["slide_03", "slide_04", "slide_05", "slide_10", "slide_12", "slide_14"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    for name in CHECKS:
        page.goto("file://" + os.path.join(SLIDES, f"{name}.html"), wait_until="networkidle")
        page.wait_for_timeout(700)
        # detect overflow: content taller/wider than the 1280x720 slide
        overflow = page.evaluate(
            "() => { const s = document.querySelector('.slide');"
            " return {sw: s.scrollWidth, sh: s.scrollHeight}; }"
        )
        page.screenshot(path=f"/tmp/qa-{name}.png")
        flag = "OK" if overflow["sw"] <= 1280 and overflow["sh"] <= 720 else f"OVERFLOW {overflow}"
        print(name, flag)
    browser.close()
print("done")
