#!/usr/bin/env python3
"""Generate the body PDF for the Recruitment/Preboarding/Onboarding User Manual.

Chapter Numbering Plan (cover/TOC unnumbered, content starts at 1):
| Outline | Type    | Chapter | Title                              |
|---------|---------|---------|------------------------------------|
| 1       | cover   | -       | Cover (separate HTML/Playwright)   |
| 2       | toc     | -       | Table of Contents                  |
| 3       | content | 1       | Introduction                       |
| 4       | content | 2       | The Talent Acquisition Lifecycle   |
| 5       | content | 3       | Recruitment Module                 |
| 6       | content | 4       | Preboarding Module                 |
| 7       | content | 5       | Onboarding Module                  |
| 8       | content | 6       | Workflow Configuration Admin Guide |
| 9       | content | 7       | Roles and Permissions              |
| 10      | content | 8       | Approval and Permission Matrix     |
| 11      | content | 9       | Role Quick-Reference Cards         |
| 12      | content | 10      | FAQ and Troubleshooting            |
| 13      | content | 11      | Glossary                           |
"""
import sys

sys.path.insert(0, "/home/z/my-project/scripts")

from reportlab.platypus import PageBreak, Paragraph, Spacer
from reportlab.platypus.tableofcontents import TableOfContents

import talent_manual_kit as kit
import talent_manual_content_1 as c1
import talent_manual_content_2 as c2
import talent_manual_content_3 as c3

BODY_PDF = "/home/z/my-project/scripts/manual_assets/recruit/talent_manual_body.pdf"


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
