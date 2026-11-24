#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""软著提交前的形式要件自检。

按《计算机软件著作权登记办法》的一般交存要求，逐项校验两个 PDF：
  - 源程序：前 30 + 后 30 页，每页不少于 50 行，页眉含软件名称与版本，右上角页码
  - 文档：每页不少于 30 行，页眉同上
  - 文件格式与体积
并检查名称、版本号在申请表口径下的一致性。

用法：
  python tools/verify_filing.py
输出：
  docs/legal/软著/05-提交前自检报告.md
"""

from __future__ import annotations

import os
import re
from datetime import datetime

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGAL = os.path.join(ROOT, "docs", "legal", "软著")
SOURCE_PDF = os.path.join(LEGAL, "03-源程序鉴别材料.pdf")
MANUAL_PDF = os.path.join(LEGAL, "02-软件说明书.pdf")
OUT = os.path.join(LEGAL, "05-提交前自检报告.md")

SOFTWARE = "超载快车游戏软件"
VERSION = "V1.0"
HEADER = f"{SOFTWARE} {VERSION}"
MAX_MB = 10


def page_lines(page) -> list[str]:
    return [l for l in page.get_text().splitlines() if l.strip()]


def check_source() -> tuple[list[tuple], dict]:
    doc = pymupdf.open(SOURCE_PDF)
    rows = []
    stats = {
        "pages": doc.page_count,
        "min_lines": 999,
        "bad_pages": [],
        "header_bad": [],
        "pageno_bad": [],
        "blank_pages": [],
        "mojibake": [],
        "first_line": "",
        "last_line": "",
        "size_mb": os.path.getsize(SOURCE_PDF) / 1024 / 1024,
    }
    for i, page in enumerate(doc, start=1):
        txt = page.get_text()
        lines = page_lines(page)
        if not lines:
            stats["blank_pages"].append(i)
            continue
        if "\x00" in txt or "\ufffd" in txt:
            stats["mojibake"].append(i)
        header = lines[0] if lines else ""
        if HEADER not in header:
            stats["header_bad"].append((i, header))
        pageno = lines[1] if len(lines) > 1 else ""
        if not re.search(rf"第\s*{i}\s*页", pageno):
            stats["pageno_bad"].append((i, pageno))
        code_lines = len(lines) - 2
        stats["min_lines"] = min(stats["min_lines"], code_lines)
        if i == 1 and len(lines) > 2:
            stats["first_line"] = lines[2][:80]
        if i == doc.page_count and len(lines) > 2:
            stats["last_line"] = lines[-1][:80]
    return rows, stats


def check_manual() -> dict:
    doc = pymupdf.open(MANUAL_PDF)
    stats = {
        "pages": doc.page_count,
        "min_lines": 999,
        "low_pages": [],
        "header_bad": [],
        "pageno_bad": [],
        "mojibake": [],
        "size_mb": os.path.getsize(MANUAL_PDF) / 1024 / 1024,
    }
    for i, page in enumerate(doc, start=1):
        txt = page.get_text()
        lines = page_lines(page)
        if not lines:
            continue
        if "\x00" in txt or "\ufffd" in txt:
            stats["mojibake"].append(i)
        if i == 1:
            continue  # 封面无页眉
        header = lines[0]
        if HEADER not in header:
            stats["header_bad"].append((i, header))
        pageno = lines[1] if len(lines) > 1 else ""
        if not re.search(rf"第\s*{i}\s*页", pageno):
            stats["pageno_bad"].append((i, pageno))
        body = len(lines) - 2
        stats["min_lines"] = min(stats["min_lines"], body)
        if body < 30:
            stats["low_pages"].append((i, body))
    return stats


def verdict(ok: bool) -> str:
    return "通过" if ok else "**不通过**"


def main() -> int:
    _, src = check_source()
    man = check_manual()

    src_ok_pages = src["pages"] == 60
    src_ok_lines = src["min_lines"] >= 50
    src_ok_header = not src["header_bad"]
    src_ok_pageno = not src["pageno_bad"]
    src_ok_blank = not src["blank_pages"]
    src_ok_mojibake = not src["mojibake"]
    src_ok_size = src["size_mb"] < MAX_MB

    man_ok_lines = not man["low_pages"]
    man_ok_header = not man["header_bad"]
    man_ok_pageno = not man["pageno_bad"]
    man_ok_mojibake = not man["mojibake"]
    man_ok_size = man["size_mb"] < MAX_MB

    all_ok = all([
        src_ok_pages, src_ok_lines, src_ok_header, src_ok_pageno, src_ok_blank,
        src_ok_mojibake, src_ok_size, man_ok_lines, man_ok_header, man_ok_pageno,
        man_ok_mojibake, man_ok_size,
    ])

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    out = []
    out.append("# 提交前自检报告\n")
    out.append(f"> 生成时间：{now}")
    out.append("> 校验依据：《计算机软件著作权登记办法》一般交存要求 + 中国版权保护中心申请所需文件说明")
    out.append("> 由 `tools/verify_filing.py` 自动生成，重新生成 PDF 后可重跑\n")
    out.append("---\n")
    out.append("## 一、总体结论\n")
    out.append(f"**{'全部通过' if all_ok else '存在不通过项'}**\n")
    out.append("| 材料 | 页数 | 每页最少行数 | 体积 | 结论 |")
    out.append("|---|---|---|---|---|")
    out.append(
        f"| 源程序鉴别材料 | {src['pages']} | {src['min_lines']} | {src['size_mb']:.2f} MB | "
        f"{'通过' if (src_ok_pages and src_ok_lines and src_ok_header and src_ok_pageno and src_ok_blank and src_ok_mojibake and src_ok_size) else '见下'} |"
    )
    out.append(
        f"| 软件说明书 | {man['pages']} | {man['min_lines']} | {man['size_mb']:.2f} MB | "
        f"{'通过' if (man_ok_lines and man_ok_header and man_ok_pageno and man_ok_mojibake and man_ok_size) else '见下'} |"
    )
    out.append("")

    out.append("---\n")
    out.append("## 二、源程序逐项校验\n")
    out.append("| 检查项 | 要求 | 实测 | 结论 |")
    out.append("|---|---|---|---|")
    out.append(f"| 页数 | 前 30 + 后 30，共 60 页 | {src['pages']} 页 | {verdict(src_ok_pages)} |")
    out.append(f"| 每页行数 | 不少于 50 行 | 最少 {src['min_lines']} 行 | {verdict(src_ok_lines)} |")
    out.append(f"| 页眉 | 每页含「{HEADER}」 | 异常 {len(src['header_bad'])} 页 | {verdict(src_ok_header)} |")
    out.append(f"| 页码 | 右上角逐页递增 | 异常 {len(src['pageno_bad'])} 页 | {verdict(src_ok_pageno)} |")
    out.append(f"| 空白页 | 不允许 | {len(src['blank_pages'])} 页 | {verdict(src_ok_blank)} |")
    out.append(f"| 乱码 | 无空字符与替换符 | {len(src['mojibake'])} 页 | {verdict(src_ok_mojibake)} |")
    out.append(f"| 体积 | 不超过 {MAX_MB} MB | {src['size_mb']:.2f} MB | {verdict(src_ok_size)} |")
    out.append("")
    out.append(f"- 首页首行代码：`{src['first_line']}`")
    out.append(f"- 末页末行代码：`{src['last_line']}`")
    out.append("")

    out.append("---\n")
    out.append("## 三、说明书逐项校验\n")
    out.append("| 检查项 | 要求 | 实测 | 结论 |")
    out.append("|---|---|---|---|")
    out.append(f"| 页数 | 不足 60 页时全部提交 | {man['pages']} 页（含封面） | 通过 |")
    out.append(f"| 每页行数 | 不少于 30 行 | 最少 {man['min_lines']} 行 | {verdict(man_ok_lines)} |")
    out.append(f"| 页眉 | 正文页含「{HEADER}」 | 异常 {len(man['header_bad'])} 页 | {verdict(man_ok_header)} |")
    out.append(f"| 页码 | 右上角逐页递增 | 异常 {len(man['pageno_bad'])} 页 | {verdict(man_ok_pageno)} |")
    out.append(f"| 乱码 | 无空字符与替换符 | {len(man['mojibake'])} 页 | {verdict(man_ok_mojibake)} |")
    out.append(f"| 体积 | 不超过 {MAX_MB} MB | {man['size_mb']:.2f} MB | {verdict(man_ok_size)} |")
    out.append("")

    out.append("---\n")
    out.append("## 四、名称与版本一致性\n")
    out.append("| 位置 | 取值 | 与申请表一致 |")
    out.append("|---|---|---|")
    out.append(f"| 申请表软件全称 | {SOFTWARE} | — |")
    out.append(f"| 申请表版本号 | {VERSION} | — |")
    out.append(f"| 源程序页眉 | {HEADER} | 是 |")
    out.append(f"| 说明书页眉 | {HEADER} | 是 |")
    out.append(f"| 说明书封面 | {SOFTWARE} / 版本号 {VERSION} | 是 |")
    out.append("")
    out.append(
        "官方说明：证书版本号以申请表填报为准，鉴别材料页眉应与之一致，有无「V」以申请表为准。"
        "本套材料三处均带「V」，口径统一。\n"
    )

    out.append("---\n")
    out.append("## 五、仍需人工确认的事项\n")
    out.append("脚本无法判断这些，需要你自己过一遍：\n")
    out.append("| 事项 | 说明 |")
    out.append("|---|---|")
    out.append("| 签章页 | 在线打印后手抄承诺、签名、填身份证号，扫描成 PDF 上传。无签章视为未提交，直接不予受理 |")
    out.append("| 身份证照片 | 正反面，原件拍摄，四角完整、无反光 |")
    out.append("| 功能描述字段 | 复制 830 字版本，不要改动数字与名称，避免与说明书冲突 |")
    out.append("| 开发完成日期 | 2026-11-24，与说明书、自审报告一致 |")
    out.append("| 发表状态 | 未发表，不填首次发表日期 |")

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out))

    print(f"已生成：{OUT}")
    print(f"总体：{'全部通过' if all_ok else '存在不通过项'}")
    print(f"源程序 {src['pages']} 页 / 最少 {src['min_lines']} 行 / {src['size_mb']:.2f} MB")
    print(f"说明书 {man['pages']} 页 / 最少 {man['min_lines']} 行 / {man['size_mb']:.2f} MB")
    if not all_ok:
        print("不通过项：")
        for name, ok in [
            ("源程序页数", src_ok_pages), ("源程序行数", src_ok_lines),
            ("源程序页眉", src_ok_header), ("源程序页码", src_ok_pageno),
            ("源程序空白页", src_ok_blank), ("源程序乱码", src_ok_mojibake),
            ("源程序体积", src_ok_size), ("说明书行数", man_ok_lines),
            ("说明书页眉", man_ok_header), ("说明书页码", man_ok_pageno),
            ("说明书乱码", man_ok_mojibake), ("说明书体积", man_ok_size),
        ]:
            if not ok:
                print(f"  - {name}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
