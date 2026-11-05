#!/usr/bin/env python3
"""Generate the body PDF for the Learning & Development User Manual & SOP.

Chapter Numbering Plan (cover/TOC unnumbered, content starts at 1):
| Outline | Type    | Chapter | Title                                       |
|---------|---------|---------|---------------------------------------------|
| 1       | cover   | -       | Cover (separate HTML/Playwright)            |
| 2       | toc     | -       | Table of Contents                           |
| 3       | content | 1       | Introduction & Module Architecture          |
| 4       | content | 2       | L&D Hub — Your Starting Point               |
| 5       | content | 3       | Course Catalog & Content Hub                |
| 6       | content | 4       | Learning Paths & Promotion Tracks           |
| 7       | content | 5       | Assignment & Enrolment Engine               |
| 8       | content | 6       | Course Nomination & Approval                |
| 9       | content | 7       | Tracking, Completion & Certifications       |
| 10      | content | 8       | TNI — Skill Gaps from Performance Reviews   |
| 11      | content | 9       | Compliance Tracking & Policy Sign-Offs      |
| 12      | content | 10      | Analytics & ROI — Kirkpatrick Model         |
| 13      | content | 11      | Notifications & Automation                  |
| 14      | content | 12      | Roles & Permissions Matrix                  |
| 15      | content | 13      | SOP Quick Reference                         |
| 16      | content | 14      | FAQ & Troubleshooting                       |
| 17      | content | 15      | Glossary                                    |
"""
import sys

sys.path.insert(0, "/home/z/my-project/scripts")

from reportlab.platypus import PageBreak, Paragraph
from reportlab.platypus.tableofcontents import TableOfContents

import lnd_manual_kit as kit
import lnd_manual_content_1 as c1
import lnd_manual_content_2 as c2
import lnd_manual_content_3 as c3

BODY_PDF = "/home/z/my-project/scripts/manual_assets/lnd/lnd_manual_body.pdf"


def main():
    doc = kit.make_doc(BODY_PDF)
    story = []

    # ---- TOC front matter (unnumbered) ----
    story.append(Paragraph("<b>Table of Contents</b>", kit.S["toc_title"]))
    toc = TableOfContents()
    toc.levelStyles = [kit.S["toc0"], kit.S["toc1"]]
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(PageBreak())

    # ---- content chapters (numbering starts at 1) ----
    kit.set_story(story)
    c1.build()
    c2.build()
    c3.build()

    doc.multiBuild(story, onFirstPage=kit._furniture, onLaterPages=kit._furniture)
    print(f"BODY OK -> {BODY_PDF}")


if __name__ == "__main__":
    main()
