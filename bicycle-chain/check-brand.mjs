// 商标词检查：防止「Zuma / 祖玛 / PopCap」重新混进产品资产。
//
// 这个脚本的存在理由很具体：项目的副标题原本是逐字加空格渲染的
// （`B I C Y C L E   R E V E R S E   Z U M A`），所以用 grep 搜 "ZUMA"
// 一个结果都搜不到，但屏幕上明晃晃显示着它。
// 因此这里先把所有空白去掉再匹配 —— 排版技巧不能当成规避手段。
//
// 用法：node check-brand.mjs    （CI / 提交前跑，命中即失败）
//
// 只扫运行时资产（js/css/html/json/mjs）。设计文档里的「品类代称」属于
// 评论性使用，不在检查范围，见 DESIGN.md §23。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const BANNED = ['zuma', '祖玛', 'popcap', '宝开游戏'];
const ASSET_EXT = new Set(['.js', '.mjs', '.css', '.html', '.json']);
const SKIP_DIR = new Set(['.git', 'node_modules', '.workbuddy']);

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (name === 'check-brand.mjs') continue;   // 词表在本文件里，跳过自身
    if (!ASSET_EXT.has(extname(p))) continue;

    const flat = readFileSync(p, 'utf8').replace(/\s+/g, '').toLowerCase();
    for (const kw of BANNED) {
      if (flat.includes(kw)) hits.push(`${p}  ←  ${kw}`);
    }
  }
}

walk('.');
console.log(`扫描完成：${hits.length} 处命中`);

if (hits.length) {
  console.log('');
  for (const h of hits) console.log('  ✗ ' + h);
  console.log('\n这些词属于 PopCap / EA 的注册商标，不得出现在产品名、副标、UI 文案或配置里。');
  console.log('替代写法：Bicycle Chain / marble shooter / 反向弹珠消除。见 DESIGN.md §23。');
  process.exit(1);
}
