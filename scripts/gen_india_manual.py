#!/usr/bin/env python3
"""Generate the body PDF for the Indian Payroll Configuration & Operations Manual.

Chapter Numbering Plan (cover/TOC unnumbered, content starts at 1):
| Outline | Type    | Chapter | Title                                       |
|---------|---------|---------|---------------------------------------------|
| 1       | cover   | -       | Cover (separate HTML/Playwright)            |
| 2       | toc     | -       | Table of Contents                           |
| 3       | content | 1       | Introduction & Module Architecture          |
| 4       | content | 2       | Core Payroll & CTC Configuration            |
| 5       | content | 3       | India Statutory Configuration               |
| 6       | content | 4       | Statutory Deduction Rules Reference         |
| 7       | content | 5       | Income Tax (TDS) — Dual Regime Engine       |
| 8       | content | 6       | Payroll Processing Workflow (Stage A/B/C)   |
| 9       | content | 7       | Approvals, Variance & Governance            |
| 10      | content | 8       | Statutory Reports & Filings                 |
| 11      | content | 9       | Declaration & Proof Verification Workflow   |
| 12      | content | 10      | Full & Final (F&F) Settlement               |
| 13      | content | 11      | Bank Integration & Advice Files             |
| 14      | content | 12      | Payroll Notifications & Escalation          |
| 15      | content | 13      | Multi-Country Configuration Notes           |
| 16      | content | 14      | FAQ & Troubleshooting                       |
| 17      | content | 15      | Glossary                                    |
"""
import sys

sys.path.insert(0, "/home/z/my-project/scripts")

from reportlab.platypus import PageBreak, Paragraph
from reportlab.platypus.tableofcontents import TableOfContents

import india_manual_kit as kit
import india_manual_content_1 as c1
import india_manual_content_2 as c2
import india_manual_content_3 as c3

BODY_PDF = "/home/z/my-project/scripts/manual_assets/india/india_manual_body.pdf"


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
