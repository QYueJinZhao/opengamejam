#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成软著登记版本的代码指纹文档。

用途：软著登记的是提交那一刻的代码表达。后续迭代会产生新表达，
原证书仍保护原表达，但需要一份可复核的指纹来证明登记版本对应关系。

用法：
  python tools/gen_code_fingerprint.py
输出：
  docs/legal/软著/04-登记版本代码指纹.md
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "legal", "软著", "04-登记版本代码指纹.md")

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

DIST_FILES = ["dist/game.js", "dist/game.json", "dist/project.config.json"]


def count(lines: list[str]) -> int:
    code = 0
    in_block = False
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith("/*"):
            in_block = True
        if in_block:
            if "*/" in s:
                in_block = False
            continue
        if s.startswith("//"):
            continue
        code += 1
    return code


def main() -> int:
    rows = []
    full = []
    total_all = total_code = 0
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        data = open(path, "rb").read()
        digest = hashlib.sha256(data).hexdigest()
        lines = data.decode("utf-8").splitlines()
        code = count(lines)
        total_all += len(lines)
        total_code += code
        rows.append((rel, len(lines), code, digest))
        full.append((rel, digest))

    dist_rows = []
    dist_total = 0
    if os.path.exists(os.path.join(ROOT, "dist", "game.js")):
        for rel in DIST_FILES:
            path = os.path.join(ROOT, rel)
            data = open(path, "rb").read()
            dist_total += len(data)
            dist_rows.append((rel, len(data), hashlib.sha256(data).hexdigest()))
    else:
        dist_rows = []

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    out = []
    out.append("# 登记版本代码指纹（V1.0）\n")
    out.append("> 用途：固定「软著 V1.0 登记提交的到底是哪一版代码」。")
    out.append(f"> 生成时间：{now}")
    out.append("> 对应材料：`02-软件说明书.pdf`、`03-源程序鉴别材料.pdf`")
    out.append("> 本文件由 `tools/gen_code_fingerprint.py` 自动生成，改码后可重跑刷新。\n")
    out.append("---\n")
    out.append("## 一、为什么要留这份指纹\n")
    out.append(
        "软著登记的是「提交那一刻的代码表达」，不是「这个游戏永远的样子」。后续迭代会产生新的表达，"
        "原证书仍然保护原表达，但一旦将来需要维权、举证，或被质疑「登记的不是这一版」，"
        "光有证书说不清对应关系。\n"
    )
    out.append(
        "留下每个源文件的 SHA-256，等于给这一版代码按了指纹。任何时候用同样的算法算一遍，"
        f"能证明「证书对应的就是这 {len(FILES)} 个文件、这 {total_all} 行」。\n"
    )
    out.append("---\n")
    out.append("## 二、源码文件指纹\n")
    out.append("| 文件 | 总行数 | 有效代码 | SHA-256 |")
    out.append("|---|---|---|---|")
    for rel, lines, code, digest in rows:
        out.append(f"| {rel} | {lines} | {code} | `{digest}` |")
    out.append(f"| **合计** | **{total_all}** | **{total_code}** | — |")
    out.append("")

    if dist_rows:
        out.append("---\n")
        out.append("## 三、构建产物指纹\n")
        out.append("| 文件 | 字节 | SHA-256 |")
        out.append("|---|---|---|")
        for rel, size, digest in dist_rows:
            out.append(f"| {rel} | {size:,} | `{digest}` |")
        out.append(f"| **主包合计** | **{dist_total:,}** | — |")
        out.append("")
        out.append("构建模式：production（`DEV_MOCK_AD = false`）\n")

    out.append("---\n")
    out.append("## 四、校验方法\n")
    out.append("```bash")
    out.append("# 单个文件")
    out.append("sha256sum game.js")
    out.append("")
    out.append("# 全部源码")
    out.append("sha256sum game.js src/*.js")
    out.append("")
    out.append("# 重算并与本文件比对")
    out.append("python tools/gen_code_fingerprint.py")
    out.append("```\n")
    out.append("---\n")
    out.append("## 五、后续版本怎么处理\n")
    out.append("| 情形 | 是否需要重新登记 | 说明 |")
    out.append("|---|---|---|")
    out.append("| 调数值、改文案、加关卡 | 不需要 | 同一软件的表达细化，原证书继续有效 |")
    out.append("| 新增玩法模块、重构核心算法 | 建议做 V2.0 登记 | 新表达不受 V1.0 保护 |")
    out.append("| 改名、换主体 | 必须变更登记 | 与代码无关，属登记事项变更 |")
    out.append("| 仅修 bug | 不需要 | — |")
    out.append("")
    out.append(
        "**实务判断**：抖音平台只核验证书是否存在、名称是否匹配，不比对代码。"
        "V1.0 证书足以支撑上线，后续大改再补 V2.0，不必现在纠结。\n"
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out))
    print(f"已生成：{OUT}")
    print(f"源文件 {len(FILES)} 个，总行 {total_all}，有效代码 {total_code}" + (f"，主包 {dist_total:,} 字节" if dist_rows else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
