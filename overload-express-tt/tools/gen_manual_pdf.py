#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把软件说明书 Markdown 排版为软著提交用 PDF。

版式：A4 纵向 / 页眉标注软件名称与版本号 / 右上角页码 / 自动目录
用法：
  python tools/gen_manual_pdf.py
输出：
  docs/legal/软著/02-软件说明书.pdf
"""

from __future__ import annotations

import os
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

SOFTWARE_NAME = "超载快车游戏软件"
VERSION = "V1.0"
HEADER = f"{SOFTWARE_NAME} {VERSION}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGAL_DIR = os.path.join(ROOT, "docs", "legal", "软著")
SOURCE_MD = [
    os.path.join(LEGAL_DIR, "02-软件说明书源文.md"),
    os.path.join(LEGAL_DIR, "02-软件说明书源文-p2.md"),
]
OUT_FILE = os.path.join(LEGAL_DIR, "02-软件说明书.pdf")

PAGE_W, PAGE_H = A4
MARGIN_L = 2.4 * cm
MARGIN_R = 2.2 * cm
MARGIN_T = 2.6 * cm
MARGIN_B = 2.0 * cm
FRAME_W = PAGE_W - MARGIN_L - MARGIN_R
FRAME_H = PAGE_H - MARGIN_T - MARGIN_B

BODY_SIZE = 10.5
BODY_LEAD = 18.0


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("YaHei", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))
    pdfmetrics.registerFontFamily("YaHei", normal="YaHei", bold="YaHeiBold")


def styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName="YaHei", wordWrap="CJK", alignment=TA_JUSTIFY)
    return {
        "CoverTitle": ParagraphStyle(
            "CoverTitle", fontName="YaHeiBold", fontSize=26, leading=38,
            alignment=TA_CENTER, wordWrap="CJK", spaceAfter=6,
        ),
        "CoverSub": ParagraphStyle(
            "CoverSub", fontName="YaHei", fontSize=14, leading=24,
            alignment=TA_CENTER, wordWrap="CJK", textColor=colors.HexColor("#333333"),
        ),
        "CoverMeta": ParagraphStyle(
            "CoverMeta", fontName="YaHei", fontSize=11, leading=22,
            alignment=TA_CENTER, wordWrap="CJK", textColor=colors.HexColor("#444444"),
        ),
        "H1": ParagraphStyle(
            "H1", fontName="YaHeiBold", fontSize=15, leading=24,
            spaceBefore=14, spaceAfter=8, wordWrap="CJK", alignment=TA_LEFT,
            textColor=colors.HexColor("#111111"),
        ),
        "H2": ParagraphStyle(
            "H2", fontName="YaHeiBold", fontSize=11.5, leading=20,
            spaceBefore=10, spaceAfter=5, wordWrap="CJK", alignment=TA_LEFT,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "Body": ParagraphStyle("Body", fontSize=BODY_SIZE, leading=BODY_LEAD, firstLineIndent=21, **base),
        "BodyNoIndent": ParagraphStyle("BodyNoIndent", fontSize=BODY_SIZE, leading=BODY_LEAD, **base),
        "ListItem": ParagraphStyle(
            "ListItem", fontSize=BODY_SIZE, leading=BODY_LEAD, leftIndent=18, bulletIndent=6, **base
        ),
        "TableText": ParagraphStyle(
            "TableText", fontName="YaHei", fontSize=9, leading=14, wordWrap="CJK", alignment=TA_LEFT
        ),
        "Caption": ParagraphStyle(
            "Caption", fontName="YaHei", fontSize=9, leading=15,
            alignment=TA_CENTER, wordWrap="CJK", textColor=colors.HexColor("#555555"),
            spaceBefore=3, spaceAfter=8,
        ),
        "TOC1": ParagraphStyle(
            "TOC1", fontName="YaHeiBold", fontSize=10.5, leading=19, wordWrap="CJK",
            spaceBefore=4,
        ),
        "TOC2": ParagraphStyle(
            "TOC2", fontName="YaHei", fontSize=9.5, leading=15, leftIndent=16, wordWrap="CJK"
        ),
    }


class ManualDoc(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        self._seq = 0

    def handle_documentBegin(self):
        # multiBuild 会多次编译，序号必须每遍归零，否则目录条目键不稳定、无法收敛
        self._seq = 0
        super().handle_documentBegin()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        name = flowable.style.name
        if name not in ("H1", "H2"):
            return
        text = flowable.getPlainText()
        level = 0 if name == "H1" else 1
        self._seq += 1
        key = f"h{self._seq}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def header_footer(canvas, doc) -> None:
    page = doc.page
    if page == 1:
        return
    canvas.saveState()
    canvas.setFont("YaHei", 9)
    canvas.drawCentredString(PAGE_W / 2, PAGE_H - 1.35 * cm, HEADER)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 1.35 * cm, f"第 {page} 页")
    canvas.setLineWidth(0.5)
    canvas.setStrokeColor(colors.HexColor("#888888"))
    canvas.line(MARGIN_L, PAGE_H - 1.55 * cm, PAGE_W - MARGIN_R, PAGE_H - 1.55 * cm)
    canvas.restoreState()


def inline(text: str) -> str:
    """转义并处理 **粗体**、`代码`。"""
    text = escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font name="YaHeiBold">\1</font>', text)
    return text


def parse_table(lines: list[str], st: dict) -> Table:
    raw_rows = []
    for line in lines:
        raw_rows.append([c.strip() for c in line.strip().strip("|").split("|")])
    header, body = raw_rows[0], raw_rows[2:]  # raw_rows[1] 是 |---|---| 分隔行
    data = [[Paragraph(inline(c), st["TableText"]) for c in header]]
    for row in body:
        data.append([Paragraph(inline(c), st["TableText"]) for c in row])
    ncols = max(len(r) for r in data)
    for row in data:
        while len(row) < ncols:
            row.append(Paragraph("", st["TableText"]))

    # 按各列最长文本分配宽度，并设下限，避免窄列被压成逐字换行
    lengths = []
    for c in range(ncols):
        lengths.append(max((len(r[c]) if c < len(r) else 0) for r in raw_rows) or 1)
    floor = FRAME_W * 0.10
    weights = [max(ln, 6) for ln in lengths]
    total = sum(weights)
    col_w = [max(floor, FRAME_W * w / total) for w in weights]
    scale = FRAME_W / sum(col_w)
    col_w = [w * scale for w in col_w]

    table = Table(data, colWidths=col_w, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EDEDED")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def build_story(md_path: str, st: dict, toc: TableOfContents) -> list:
    with open(md_path, "r", encoding="utf-8") as handle:
        raw = handle.read().splitlines()

    story: list = []
    i = 0
    n = len(raw)
    while i < n:
        line = raw[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == "<!-- pagebreak -->":
            story.append(PageBreak())
            i += 1
            continue

        if stripped == "<!-- cover -->":
            i += 1
            continue

        if stripped.startswith("#### "):
            story.append(Paragraph(inline(stripped[5:].strip()), st["H2"]))
            i += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:].strip()), st["H2"]))
            i += 1
            continue

        if stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:].strip()), st["H2"]))
            i += 1
            continue

        if stripped.startswith("# "):
            story.append(Paragraph(inline(stripped[2:].strip()), st["H1"]))
            i += 1
            continue

        if stripped.startswith("!["):
            match = re.match(r"!\[(.*?)\]\((.*?)\)", stripped)
            if match:
                caption, rel = match.group(1), match.group(2)
                img_path = rel if os.path.isabs(rel) else os.path.join(os.path.dirname(md_path), rel)
                if os.path.exists(img_path):
                    from PIL import Image as PILImage

                    with PILImage.open(img_path) as probe:
                        w, h = probe.size
                    target_w = FRAME_W
                    target_h = target_w * h / w
                    max_h = 9.2 * cm
                    if target_h > max_h:
                        target_h = max_h
                        target_w = target_h * w / h
                    block = [Image(img_path, width=target_w, height=target_h)]
                    if caption:
                        block.append(Paragraph(caption, st["Caption"]))
                    story.append(KeepTogether(block))
                i += 1
                continue

        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|[\s:|-]+\|$", raw[i + 1].strip()):
            block = []
            while i < n and raw[i].strip().startswith("|"):
                block.append(raw[i])
                i += 1
            story.append(Spacer(1, 4))
            story.append(parse_table(block, st))
            story.append(Spacer(1, 8))
            continue

        if re.match(r"^[-*] ", stripped):
            text = stripped[2:].strip()
            story.append(Paragraph(f"· {inline(text)}", st["ListItem"]))
            i += 1
            continue

        if re.match(r"^\d+\. ", stripped):
            story.append(Paragraph(inline(stripped), st["ListItem"]))
            i += 1
            continue

        story.append(Paragraph(inline(stripped), st["Body"]))
        i += 1

    return story


def main() -> int:
    register_fonts()
    st = styles()

    doc = ManualDoc(
        OUT_FILE,
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title=f"{HEADER} 软件说明书",
        author=SOFTWARE_NAME,
    )
    frame = Frame(MARGIN_L, MARGIN_B, FRAME_W, FRAME_H, id="body", showBoundary=0)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])

    # 封面
    cover = [
        Spacer(1, 5.0 * cm),
        Paragraph(SOFTWARE_NAME, st["CoverTitle"]),
        Paragraph(f"版本号 {VERSION}", st["CoverSub"]),
        Spacer(1, 0.6 * cm),
        Paragraph("软 件 说 明 书", st["CoverTitle"]),
        Spacer(1, 4.0 * cm),
        Paragraph("著作权人：张建乐", st["CoverMeta"]),
        Paragraph("开发完成日期：2026 年 11 月 24 日", st["CoverMeta"]),
        Paragraph("文档编制日期：2026 年 11 月 24 日", st["CoverMeta"]),
        PageBreak(),
    ]

    toc = TableOfContents()
    toc.levelStyles = [st["TOC1"], st["TOC2"]]
    toc.dotsMinLevel = 0

    body: list = []
    for md_path in SOURCE_MD:
        body.extend(build_story(md_path, st, toc))
    story = cover + [Paragraph("目　录", st["CoverTitle"]), Spacer(1, 0.4 * cm), toc, PageBreak()] + body

    doc.multiBuild(story)
    print(f"已生成：{OUT_FILE}")
    print(f"总页数：{doc.page}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
