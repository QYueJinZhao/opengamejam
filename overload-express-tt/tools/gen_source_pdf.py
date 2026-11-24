#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成软件著作权登记的源程序鉴别材料（PDF）。

规格依据中国版权保护中心一般交存要求：
  - 前 30 页 + 后 30 页，共 60 页
  - 每页不少于 50 行有效代码
  - 页眉标注软件名称及版本号，右上角标注页码

渲染策略：
  - ASCII 使用 Consolas 等宽，中文使用微软雅黑，按字符实际宽度逐段绘制
  - 过滤纯空行，保证每页恰好 50 行有效代码
  - 按实测宽度折行，避免长行溢出右边距

用法：
  python tools/gen_source_pdf.py
输出：
  docs/legal/软著/03-源程序鉴别材料.pdf
"""

from __future__ import annotations

import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

SOFTWARE_NAME = "超载快车游戏软件"
VERSION = "V1.0"
HEADER = f"{SOFTWARE_NAME} {VERSION}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "legal", "软著")
OUT_FILE = os.path.join(OUT_DIR, "03-源程序鉴别材料.pdf")

# 拼接顺序：入口 → 核心物理算法 → 渲染/UI → 数据配置 → 平台桥接（末尾为生命周期挂起与恢复）
FILES = [
    "game.js",
    "src/config.js",
    "src/physics.js",
    "src/render.js",
    "src/ui_canvas.js",
    "src/levels.js",
    "src/progress.js",
    "src/director.js",
    "src/icons.js",
    "src/audio.js",
    "src/tt_sdk.js",
    "src/platform.js",
]

PAGE_W, PAGE_H = A4
MARGIN_L = 50
MARGIN_R = 50
HEADER_BASELINE = PAGE_H - 38
BODY_TOP = PAGE_H - 62
LINE_H = 14.0
LINES_PER_PAGE = 50
FONT_SIZE = 7.5
AVAIL_W = PAGE_W - MARGIN_L - MARGIN_R


def register_fonts() -> tuple[str, str]:
    mono, cjk = "Courier", "Helvetica"
    consola = r"C:\Windows\Fonts\consola.ttf"
    yahei = r"C:\Windows\Fonts\msyh.ttc"
    if os.path.exists(consola):
        pdfmetrics.registerFont(TTFont("Consola", consola))
        mono = "Consola"
    if os.path.exists(yahei):
        pdfmetrics.registerFont(TTFont("YaHei", yahei, subfontIndex=0))
        cjk = "YaHei"
    return mono, cjk


def is_wide(ch: str) -> bool:
    """中日韩文字与全角标点按宽字符处理。"""
    code = ord(ch)
    return (
        0x1100 <= code <= 0x115F
        or 0x2E80 <= code <= 0xA4CF
        or 0xAC00 <= code <= 0xD7A3
        or 0xF900 <= code <= 0xFAFF
        or 0xFE30 <= code <= 0xFE4F
        or 0xFF00 <= code <= 0xFF60
        or 0xFFE0 <= code <= 0xFFE6
    )


def read_lines(mono: str, cjk: str) -> list[str]:
    """按文件顺序读取源码，展开制表符，过滤空行，超宽行折为多个物理行。"""
    ascii_w = pdfmetrics.stringWidth("M", mono, FONT_SIZE)
    cjk_w = pdfmetrics.stringWidth("中", cjk, FONT_SIZE)

    physical: list[str] = []
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            raise SystemExit(f"缺少源文件：{rel}")
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.rstrip("\n").rstrip("\r").expandtabs(4).rstrip()
                if not line.strip():
                    continue
                # 按实测宽度折行
                buf: list[str] = []
                width = 0.0
                for ch in line:
                    cw = cjk_w if is_wide(ch) else ascii_w
                    if width + cw > AVAIL_W and buf:
                        physical.append("".join(buf))
                        buf, width = [], 0.0
                    buf.append(ch)
                    width += cw
                if buf:
                    physical.append("".join(buf))
    return physical


def draw_mixed(pdf: canvas.Canvas, x: float, y: float, text: str, mono: str, cjk: str) -> None:
    """中文与 ASCII 分段绘制，x 偏移按实测宽度累加。"""
    seg: list[str] = []
    seg_wide: bool | None = None
    for ch in text:
        wide = is_wide(ch)
        if seg_wide is None or wide == seg_wide:
            seg.append(ch)
        else:
            s = "".join(seg)
            font = cjk if seg_wide else mono
            pdf.setFont(font, FONT_SIZE)
            pdf.drawString(x, y, s)
            x += pdfmetrics.stringWidth(s, font, FONT_SIZE)
            seg, seg_wide = [ch], wide
        seg_wide = wide
    if seg:
        s = "".join(seg)
        font = cjk if seg_wide else mono
        pdf.setFont(font, FONT_SIZE)
        pdf.drawString(x, y, s)


def main() -> int:
    mono, cjk = register_fonts()
    lines = read_lines(mono, cjk)
    total = len(lines)
    need = LINES_PER_PAGE * 60
    if total < need:
        print(f"警告：有效代码仅 {total} 行，不足 60 页，将提交全部。", file=sys.stderr)

    front = lines[: LINES_PER_PAGE * 30]
    back = lines[-LINES_PER_PAGE * 30 :] if total >= need else []
    pages = [front[i : i + LINES_PER_PAGE] for i in range(0, len(front), LINES_PER_PAGE)]
    if back:
        pages += [back[i : i + LINES_PER_PAGE] for i in range(0, len(back), LINES_PER_PAGE)]

    os.makedirs(OUT_DIR, exist_ok=True)
    pdf = canvas.Canvas(OUT_FILE, pagesize=A4)
    pdf.setTitle(f"{HEADER} 源程序鉴别材料")
    pdf.setAuthor(SOFTWARE_NAME)
    total_pages = len(pages)

    for index, page_lines in enumerate(pages, start=1):
        pdf.setFont(cjk, 9)
        pdf.drawCentredString(PAGE_W / 2, HEADER_BASELINE, HEADER)
        pdf.setFont(cjk, 9)
        pdf.drawRightString(
            PAGE_W - MARGIN_R, HEADER_BASELINE, f"第 {index} 页 / 共 {total_pages} 页"
        )
        pdf.setLineWidth(0.5)
        pdf.line(MARGIN_L, HEADER_BASELINE - 6, PAGE_W - MARGIN_R, HEADER_BASELINE - 6)

        y = BODY_TOP
        for line in page_lines:
            draw_mixed(pdf, MARGIN_L, y, line, mono, cjk)
            y -= LINE_H
        pdf.showPage()

    pdf.save()
    print(f"已生成：{OUT_FILE}")
    print(f"有效代码行：{total}，输出页数：{total_pages}，每页 {LINES_PER_PAGE} 行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
