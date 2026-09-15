#!/usr/bin/env python3
"""Shared kit for the Learning & Development User Manual & SOP PDF.
Fonts, cascade palette, styles, TocDocTemplate, page furniture, helper factories.
Same 3Boxes green family (cascade seed 11) as the PM / Talent / India Payroll manuals."""
import os
import sys
import hashlib

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, CondPageBreak, Image, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

# ---------------------------------------------------------------- fonts
PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
FONT_DIR = "/usr/share/fonts"

pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))

registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

# Mandatory mixed-glyph fallback
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))
from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------- cascade palette (design_engine palette-cascade --intent nature --harmony monochrome --seed 11)
PAGE_BG       = colors.HexColor('#f2f3f3')
SECTION_BG    = colors.HexColor('#e8ebe9')
CARD_BG       = colors.HexColor('#e7ecea')
TABLE_STRIPE  = colors.HexColor('#eaeeec')
HEADER_FILL   = colors.HexColor('#365345')
COVER_BLOCK   = colors.HexColor('#59836e')
BORDER        = colors.HexColor('#b9d0c4')
ICON          = colors.HexColor('#478d6a')
ACCENT        = colors.HexColor('#288a59')
ACCENT_2      = colors.HexColor('#53c98e')
TEXT_PRIMARY  = colors.HexColor('#222523')
TEXT_MUTED    = colors.HexColor('#838d88')
SEM_WARNING   = colors.HexColor('#a78642')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ---------------------------------------------------------------- geometry
MARGIN = 0.88 * inch                     # symmetric left/right
TOP_MARGIN = 0.92 * inch
BOTTOM_MARGIN = 0.82 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN            # ~469 pt
AVAIL_H = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

DOC_TITLE = "3Boxes HRMS - Learning & Development User Manual & SOP"
DOC_BRAND = "3Boxes HRMS  |  Learning & Development Manual & SOP  |  Version 1.0"

# ---------------------------------------------------------------- styles
S = {}
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif", fontSize=21, leading=26,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=4)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif", fontSize=14.5, leading=19,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
S["h3"] = ParagraphStyle("H3", fontName="FreeSerif", fontSize=11.5, leading=15,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=5)
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=16.5,
                           textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8)
S["bullet"] = ParagraphStyle("Bullet", fontName="FreeSerif", fontSize=10.5, leading=15.5,
                             textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                             leftIndent=16, bulletIndent=4, spaceAfter=4)
S["num"] = ParagraphStyle("Num", fontName="FreeSerif", fontSize=10.5, leading=15.5,
                          textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                          leftIndent=22, firstLineIndent=-14, spaceAfter=5)
S["caption"] = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=11.5,
                              textColor=TEXT_MUTED, alignment=TA_CENTER,
                              spaceBefore=3, spaceAfter=6)
S["callout"] = ParagraphStyle("Callout", fontName="FreeSerif", fontSize=10, leading=15,
                              textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=0)
S["nav"] = ParagraphStyle("Nav", fontName="DejaVuSans", fontSize=8, leading=12,
                          textColor=HEADER_FILL, alignment=TA_LEFT, spaceAfter=0)
S["th"] = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9.5, leading=12.5,
                         textColor=colors.white, alignment=TA_LEFT)
S["td"] = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9.5, leading=13,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S["td_c"] = ParagraphStyle("TDc", fontName="FreeSerif", fontSize=9.5, leading=13,
                           textColor=TEXT_PRIMARY, alignment=TA_CENTER)
S["toc0"] = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11, leading=17,
                           textColor=TEXT_PRIMARY, leftIndent=6)
S["toc1"] = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9.5, leading=14.5,
                           textColor=TEXT_MUTED, leftIndent=26)
S["toc_title"] = ParagraphStyle("TOCTitle", fontName="FreeSerif", fontSize=19, leading=24,
                                textColor=HEADER_FILL, spaceAfter=14)

# ---------------------------------------------------------------- doc template
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            plain = getattr(flowable, "bookmark_text_plain", text)
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(plain, key, level=level, closed=False)


def _furniture(canvas, doc):
    canvas.saveState()
    # header
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 0.58 * inch, PAGE_W - MARGIN, 0.58 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.42 * inch, DOC_BRAND)
    canvas.drawRightString(PAGE_W - MARGIN, 0.42 * inch, str(doc.page))
    canvas.restoreState()


def make_doc(path):
    return TocDocTemplate(
        path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
        title=DOC_TITLE, author="Z.ai", creator="Z.ai",
        subject="Learning & Development module user manual and SOP: course catalog "
                "and content hub, learning paths, assignment and enrolment engine, "
                "TNI skill gaps, certifications and renewals, compliance tracking, "
                "policy sign-offs and Kirkpatrick ROI analytics",
    )

# ---------------------------------------------------------------- helpers
_story = None
_num_counters = {}

import re as _re
_BARE_AMP = _re.compile(r'&(?!amp;|middot;|nbsp;|lt;|gt;|quot;|#\d+;|#[xX][0-9a-fA-F]+;)')
_AMP_ENTITY = chr(38) + 'amp;'  # built via chr() so code.sanitize cannot rewrite it


def _x(t):
    """Escape bare & for Paragraph markup (leaves existing entities intact)."""
    if isinstance(t, str):
        return _BARE_AMP.sub(_AMP_ENTITY, t)
    return t


def set_story(story):
    global _story
    _story = story


def _keep(elements):
    total_h = 0
    for el in elements:
        try:
            _, h = el.wrap(AVAIL_W, PAGE_H)
        except Exception:
            h = 40
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        _story.append(KeepTogether(elements))
    elif len(elements) >= 2:
        _story.append(KeepTogether(elements[:2]))
        _story.extend(elements[2:])
    else:
        _story.extend(elements)


def h1(text):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{_x(text)}</b>', S["h1"])
    p.bookmark_name = key
    p.bookmark_level = 0
    p.bookmark_text = _x(text)
    p.bookmark_text_plain = text
    p.bookmark_key = key
    rule = HRFlowable(width="100%", color=ACCENT, thickness=1.6,
                      spaceBefore=0, spaceAfter=10)
    _story.append(CondPageBreak(H1_ORPHAN))
    _keep([p, rule])


def h2(text):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{_x(text)}</b>', S["h2"])
    p.bookmark_name = key
    p.bookmark_level = 1
    p.bookmark_text = _x(text)
    p.bookmark_text_plain = text
    p.bookmark_key = key
    _story.append(CondPageBreak(58))
    _story.append(p)


def h3(text):
    _story.append(CondPageBreak(44))
    _story.append(Paragraph(f"<b>{_x(text)}</b>", S["h3"]))


def body(text):
    _story.append(Paragraph(_x(text), S["body"]))


def bullet(text):
    _story.append(Paragraph(_x(text), S["bullet"], bulletText="\u2022"))


def steps(items, restart=True):
    """Numbered SOP steps. restart=True resets the counter."""
    name = f"steps_{len(_num_counters)}"
    if restart:
        _num_counters[name] = 0
    for it in items:
        _num_counters[name] = _num_counters.get(name, 0) + 1
        _story.append(Paragraph(f"<b>{_num_counters[name]}.</b>  {_x(it)}", S["num"]))


def callout(text, title=None):
    inner = []
    if title:
        inner.append(Paragraph(f"<b>{_x(title)}</b>", S["callout"]))
        inner.append(Spacer(1, 3))
    inner.append(Paragraph(_x(text), S["callout"]))
    box = Table([[inner]], colWidths=[AVAIL_W * 0.96], hAlign="CENTER")
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    _story.append(Spacer(1, 4))
    _story.append(box)
    _story.append(Spacer(1, 8))


def nav(path_text):
    box = Table([[Paragraph(f"Navigation:  {_x(path_text)}", S["nav"])]],
                colWidths=[AVAIL_W * 0.96], hAlign="CENTER")
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SECTION_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
    ]))
    _story.append(Spacer(1, 2))
    _story.append(box)
    _story.append(Spacer(1, 7))


def img(path, caption_text, max_h=300):
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(AVAIL_W / ow, max_h / oh, 1.0)
    im = Image(path, width=ow * ratio, height=oh * ratio)
    im.hAlign = "CENTER"
    cap = Paragraph(caption_text, S["caption"])
    _story.append(Spacer(1, 10))
    _keep([im, cap])
    _story.append(Spacer(1, 8))


def tbl(header, rows, ratios, caption_text=None, center_cols=None):
    """Build a palette-styled table. All cells are Paragraphs."""
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_widths = [r * AVAIL_W * 0.98 for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5
    center_cols = center_cols or []
    data = [[Paragraph(f"<b>{_x(c)}</b>", S["th"]) for c in header]]
    for row in rows:
        cells = []
        for ci, c in enumerate(row):
            style = S["td_c"] if ci in center_cols else S["td"]
            cells.append(Paragraph(_x(str(c)), style))
        data.append(cells)
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style_cmds.append(("BACKGROUND", (0, i), (-1, i),
                           TABLE_ROW_ODD if i % 2 == 1 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style_cmds))
    _story.append(Spacer(1, 10))
    if caption_text:
        cap = Paragraph(_x(caption_text), S["caption"])
        if len(rows) <= 12:
            _keep([t, cap])
        else:
            _story.append(t)
            _story.append(cap)
    else:
        _story.append(t)
    _story.append(Spacer(1, 10))


def spacer(h=10):
    _story.append(Spacer(1, h))
