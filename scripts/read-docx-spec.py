#!/usr/bin/env python3
"""Extract full text (paragraphs + tables) from a .docx spec file."""
import sys
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

def iter_block_items(parent):
    from docx.document import Document as _Doc
    from docx.oxml.ns import qn
    if isinstance(parent, _Doc):
        parent_elm = parent.element.body
    else:
        parent_elm = parent._element
    for child in parent_elm.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)

def main(path):
    doc = Document(path)
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            style = block.style.name if block.style else ''
            text = block.text.strip()
            if not text:
                continue
            prefix = ''
            if 'Heading' in style:
                level = ''.join(ch for ch in style if ch.isdigit()) or '1'
                prefix = '#' * int(level) + ' '
            elif 'Title' in style:
                prefix = '# '
            print(f"{prefix}{text}")
        elif isinstance(block, Table):
            print('--- TABLE ---')
            for row in block.rows:
                cells = [c.text.strip().replace('\n', ' / ') for c in row.cells]
                print(' | '.join(cells))
            print('--- END TABLE ---')

if __name__ == '__main__':
    main(sys.argv[1])
