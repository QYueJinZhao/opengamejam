"""本机 Canvas 玩家路径验收。只启动自己的 localhost 服务和隔离浏览器上下文。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
INIT = """() => {
  window.__clock = 0; window.__texts = [];
  let seed = 42;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  Date.now = () => 1795384800000;
  window.__scales = [];
  window.__pointerEvents = [];
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => window.__pointerEvents.push({type, id: e.pointerId, x: e.clientX, y: e.clientY}));
  }
  Object.defineProperty(performance, 'now', {value: () => window.__clock});
  window.requestAnimationFrame = (fn) => { window.__frame = fn; return 1; };
  const drawText = CanvasRenderingContext2D.prototype.fillText;
  const scale = CanvasRenderingContext2D.prototype.scale;
  CanvasRenderingContext2D.prototype.scale = function(x, y) {
    window.__scales.push({x, y}); return scale.call(this, x, y);
  };
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
    const m = this.getTransform();
    window.__texts.push({text: String(text), x, y,
      sx: m.a * x + m.c * y + m.e, sy: m.b * x + m.d * y + m.f,
      fontPhysical: parseFloat(this.font.match(/([0-9.]+)px/)?.[1] || 0) * Math.hypot(m.a, m.b), fill: this.fillStyle});
    return drawText.call(this, text, x, y, ...rest);
  };
  window.__step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      window.__clock += 1000 / 60; window.__texts = []; window.__scales = []; window.__frame();
    }
  };
}"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dist', action='store_true')
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--hints-only', action='store_true')
    parser.add_argument('--skip-overview', action='store_true')
    args = parser.parse_args()
    run = ROOT / 'qa' / '20261123-plan-followup' / datetime.now().strftime('run-%Y%m%d-%H%M%S-%f')
    run.mkdir(parents=True)
    summary = {'mode': 'dist' if args.dist else 'source', 'smoke': args.smoke,
               'fullFlowViewport': {'width': args.width, 'height': args.height}, 'randomSeed': 42,
               'checks': [], 'images': [], 'errors': [], 'network': [], 'service': {}}
    command = ['node', 'serve.mjs'] + (['--dist'] if args.dist else [])
    child = subprocess.Popen(command, cwd=ROOT, env={**os.environ, 'PORT': '0'},
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW)
    summary['service'] = {'pid': child.pid, 'command': command, 'owned': True}
    try:
        line = child.stdout.readline()
        match = re.search(r'http://127\.0\.0\.1:\d+', line)
        assert match, line
        origin = match[0]
        summary['service']['origin'] = origin
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            def new_page(width=None, height=None, save=None):
                width = width or args.width
                height = height or args.height
                context = browser.new_context(viewport={'width': width, 'height': height},
                                              device_scale_factor=1, has_touch=True)
                context.add_init_script('(' + INIT + ')()')
                if save is not None:
                    context.add_init_script('localStorage.setItem("overload_tt_save_v3", ' +
                                            json.dumps(json.dumps(save)) + ');')
                page = context.new_page()
                page.on('pageerror', lambda err: summary['errors'].append(str(err)))
                page.on('console', lambda message: summary['errors'].append(message.text) if message.type == 'error' else None)
                page.on('request', lambda request: summary['network'].append(request.url))
                page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
                page.goto(origin, wait_until='networkidle')
                page.wait_for_function('typeof window.__frame === "function"')
                step(page)
                return context, page

            def step(page, count=1):
                page.evaluate('(count) => window.__step(count)', count)

            def texts(page):
                return page.evaluate('window.__texts')

            def has(page, needle):
                return any(needle in item['text'] for item in texts(page))

            def check(name, value):
                assert value, name
                summary['checks'].append(name)

            def tap(page, label, exact=True, index=-1):
                matches = [item for item in texts(page) if (item['text'] == label if exact else label in item['text'])]
                assert matches, f'找不到 {label}: {[x["text"] for x in texts(page)][-22:]}'
                target = matches[index]
                # 包括发车按钮的局部 translate/scale，使用 Canvas 实际变换后的屏幕坐标。
                page.mouse.click(target['sx'] + 2, target['sy'] - 5)
                step(page)

            def click(page, vx, vy):
                x, y = screen_point(page, vx, vy)
                page.mouse.click(x, y)
                step(page)

            def screen_point(page, vx, vy):
                width = page.viewport_size['width']
                height = page.viewport_size['height']
                scale = min(width / 1280, height / 720)
                return ((width - 1280 * scale) / 2 + vx * scale,
                        (height - 720 * scale) / 2 + vy * scale)

            def shot(page, name):
                target = run / (name + '.png')
                page.screenshot(path=target)
                raw = target.read_bytes()
                summary['images'].append({'file': target.name, 'sha256': hashlib.sha256(raw).hexdigest(),
                                          'bytes': len(raw), 'viewport': page.viewport_size, 'range': 'full viewport'})

            overviews = [] if args.hints_only or args.skip_overview else [(1280, 720, '16-9'), (844, 390, 'phone'), (1560, 720, '19.5-9'), (1680, 720, '21-9')]
            for width, height, ratio in overviews:
                context, page = new_page(width, height)
                check(f'{ratio} 首页启动', has(page, '开始'))
                shot(page, f'title-{ratio}')
                tap(page, '8+')
                check(f'{ratio} 适龄全文可打开', has(page, '适龄提示（CADPA 8+）') and has(page, '合理安排'))
                click(page, 450, 560)  # 弹窗外原「开始闯关」主按钮位置
                check(f'{ratio} 适龄弹窗不穿透', has(page, '适龄提示（CADPA 8+）'))
                shot(page, f'age-{ratio}')
                context.close()

            if not args.smoke and not args.hints_only:
                context, page = new_page()
                tap(page, '开始闯关')
                check('首关仅展示瘦猴且出现车顶引导', has(page, '瘦猴') and has(page, '点击或按住车顶这里') and not has(page, '胖叔'))
                click(page, 1090, 36)  # 右上角圆形静音按钮
                for col in range(8):
                    click(page, 405 + col * 52, 357); step(page, 18)
                for i in range(6):
                    click(page, 560 + (i % 3) * 28, 330 - (i // 3) * 29); step(page, 18)
                shot(page, 's1-loading')
                tap(page, '发车！')
                check('手动发车进入行驶', has(page, '行驶 '))
                step(page, 160)
                check('首关发车未加速出现冲刺气泡指引', has(page, '按住加速冲刺'))
                step(page, 900)
                check('行驶到站进入结算', has(page, '人安全挂车到站') or has(page, '分（'))
                save = page.evaluate('JSON.parse(localStorage.getItem("overload_tt_save_v3"))')
                check('结算车票与运人存档', save['tickets'] > 0 and save['totalDelivered'] > 0)
                shot(page, 's1-result')
                tickets_before = save['tickets']
                tap(page, '双倍领票'); page.wait_for_timeout(300); step(page)
                save = page.evaluate('JSON.parse(localStorage.getItem("overload_tt_save_v3"))')
                check('完整开发广告后结算车票翻倍', save['tickets'] > tickets_before)
                if has(page, '护盾重跑'):
                    tap(page, '护盾重跑')
                    page.wait_for_timeout(300); step(page)
                    check('原班人马护盾重跑直接进入行驶', has(page, '行驶 ') and not has(page, '点击或按住车顶这里'))
                    step(page, 1050)
                tap(page, '首页')
                check('结算返回首页成功', has(page, '开始闯关'))

                # 进入第 2 关（铁桥初体验），验证真实撞洞 1.18x 特写镜头与大字吐槽
                tap(page, '开始闯关')
                check('第2关出现胖叔弱提示', has(page, '新乘客【胖叔】'))
                for i in range(14):
                    click(page, 540 + (i % 4) * 38, 355 - (i // 4) * 40); step(page, 16)
                tap(page, '发车！')
                saw_impact = False
                for _ in range(950):
                    step(page)
                    if any(any(k in t['text'] for k in ('发型重塑', '天女散花', '安全帽顶着桥', '磕脑门', '高个子')) for t in texts(page)):
                        step(page, 6)
                        zooms = page.evaluate('window.__scales.filter(s => s.x === s.y).map(s => s.x)')
                        if any(1.17 <= zoom <= 1.18 for zoom in zooms):
                            check('真实碰撞事件触发特写和大字吐槽', True)
                            shot(page, 'impact-zoom')
                            summary['impactZoom'] = max(zooms)
                            saw_impact = True
                            break
                check('第2关实际经过撞桥特写爆点', saw_impact)
                context.close()

                context, page = new_page(save={'unlockedIdx': 9, 'seenL1Dialog': True, 'tickets': 1000})
                tap(page, '车库')
                shot(page, 'garage')
                tap(page, '试驾 1 局', index=2)  # 黄金涂装
                tap(page, '关闭')
                check('广告中忽略底层关闭输入', has(page, '车头涂装'))
                page.wait_for_timeout(300); step(page)
                check('开发广告试驾生效', has(page, '涂装本局免费试驾'))
                tap(page, '关闭')
                tap(page, '开始闯关')
                click(page, 1144, 36)  # 游玩顶栏圆形重开按钮，重开应结束单局试驾
                tap(page, '首页')
                tap(page, '车库')
                active = [item for item in texts(page) if item['text'] == '使用中']
                check('重开后单局试驾结束', len(active) == 1 and active[0]['x'] < 450)
                tap(page, '40 车票升级', index=0)
                save = page.evaluate('JSON.parse(localStorage.getItem("overload_tt_save_v3"))')
                check('车队升级扣款且持久化', save['tickets'] == 960 and save['upgrades']['gripPaint'] == 1)
                tap(page, '关闭')

                tap(page, '开始闯关')
                shot(page, 's10-loading')
                for x in [460, 520, 580, 640]:
                    click(page, x, 350); step(page, 20)
                tap(page, '发车！')
                session = context.new_cdp_session(page)
                left_label = next(item for item in texts(page) if item['text'] == '按住加速')
                right_label = next(item for item in texts(page) if item['text'] == '按住全员缩头死抓')
                lx, ly = left_label['sx'], left_label['sy'] - 5
                rx, ry = right_label['sx'], right_label['sy'] - 5
                left = {'id': 1, 'x': lx, 'y': ly}
                right = {'id': 2, 'x': rx, 'y': ry}
                session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [left, right]})
                step(page)
                def active_label(label):
                    return any(item['text'] == label and item['fill'].lower() == '#1e293b' for item in texts(page))
                check('双指同时加速与缩头', active_label('猛踩油门中!') and active_label('按住全员缩头死抓'))
                shot(page, 'multitouch')
                # CDP touchEnd 的列表是本次结束的触点，不是剩余触点。
                session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [left]})
                step(page)
                summary['touchTrace'] = page.evaluate('window.__pointerEvents')
                summary['touchAfterRelease'] = [item for item in texts(page) if item['text'] in ['按住加速', '猛踩油门中!', '按住全员缩头死抓']]
                check('松开左指不丢右指缩头', not has(page, '猛踩油门中!') and active_label('按住全员缩头死抓'))
                session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
                bx, by = screen_point(page, 200, 300)
                session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'id': 3, 'x': bx, 'y': by}]})
                step(page)
                check('左半屏空白不误触缩头', not active_label('按住全员缩头死抓'))
                session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

                tap(page, '首页')
                tap(page, '线路')
                check('分流模式已改为左右分流专列', has(page, '左右分流专列'))
                tap(page, '每日极限专列')
                check('每日专列可进入', has(page, '每日'))
                shot(page, 'daily')

                tap(page, '首页')
                tap(page, '无尽肉鸽')
                check('无尽专列入口可进入', has(page, '无尽第 1 站'))
                shot(page, 'endless')
                for x in [476, 724, 410, 465, 520, 575, 630, 685, 740, 795, 450, 560, 650, 750]:
                    click(page, x, 365 if x not in (476, 724) else 430); step(page, 18)
                tap(page, '发车！')
                crouch_down = False
                duck_hold_left = 0
                duck_delay = -1
                rx_pt, ry_pt = screen_point(page, 1100, 650)
                for _ in range(1400):
                    step(page, 4)
                    if duck_delay < 0 and duck_hold_left == 0 and has(page, '按住缩头'):
                        duck_delay = 14  # 等待约 0.9s 后再按下缩头，节省体力完整撑过整座桥
                    elif duck_delay > 0:
                        duck_delay -= 1
                        if duck_delay == 0:
                            duck_hold_left = 36  # 按住约 2.4s 护送车尾彻底出桥洞
                            duck_delay = -1
                    if duck_hold_left > 0:
                        if not crouch_down:
                            page.mouse.move(rx_pt, ry_pt); page.mouse.down(); crouch_down = True
                        duck_hold_left -= 1
                    elif crouch_down:
                        page.mouse.up(); crouch_down = False
                    if has(page, '选词条进第 2 站') or has(page, '挑战失败'):
                        break
                if crouch_down:
                    page.mouse.up()
                check('无尽第一站可到站结算', has(page, '选词条进第 2 站'))
                tap(page, '选词条进第 2 站')
                check('无尽下一站提供三选一强化', len([x for x in texts(page) if x['text'] == '就选这个！']) == 3)
                tap(page, '就选这个！')
                check('选择强化后进入第二站且保留乘客', has(page, '无尽第 2 站') and any(
                    x['y'] == 55 and x['x'] < 280 and x['text'].isdigit() and int(x['text']) > 0 for x in texts(page)))
                shot(page, 'endless-wave2')

                tap(page, '首页')
                tap(page, '侧边栏礼')
                check('非侧边栏进入显示引导态', has(page, '去抖音侧边栏') and not has(page, '立即领取今日'))
                shot(page, 'sidebar-guide')
                tap(page, '去抖音侧边栏')
                check('开发侧边栏模拟返回后显示领奖态', has(page, '立即领取今日侧边栏礼'))
                shot(page, 'sidebar-ready')
                tap(page, '立即领取今日侧边栏礼')
                save = page.evaluate('JSON.parse(localStorage.getItem("overload_tt_save_v3"))')
                check('侧边栏领取记录当日存档', len(save['sidebarClaimDate']) == 8)
                check('当日已领后隐藏领奖入口', not any(x['text'] == '侧边栏礼' for x in texts(page)))
                shot(page, 'sidebar-claimed')
                context.close()

            if args.hints_only:
                for idx, role, fragment in [(1, 'fat', '新乘客【胖叔】'), (2, 'acrobat', '新乘客【挂壁娃】'),
                                             (3, 'tall', '新乘客【竹竿】'), (4, 'auntie', '新乘客【大妈】'),
                                             (5, 'vip', '【VIP 老板】驾到')]:
                    context, page = new_page(save={'unlockedIdx': idx, 'seenL1Dialog': True})
                    tap(page, '开始闯关')
                    hint = next(item for item in texts(page) if fragment in item['text'])
                    shot(page, 'hint-' + role)
                    check(role + ' 提示字号在当前视口可读', hint['fontPhysical'] >= 10.5)
                    click(page, 600, 350)
                    check(role + ' 弱提示不阻断装车', any(x['y'] == 55 and x['x'] < 280 and x['text'].isdigit() and int(x['text']) > 0 for x in texts(page)))
                    step(page, 120)
                    check(role + ' 两秒时仍显示弱提示', has(page, fragment))
                    step(page, 30)
                    check(role + ' 约2.5秒后自动消失', not has(page, fragment))
                    click(page, 1144, 36)  # 重开圆钮
                    check(role + ' 已见过的提示不会反复出现', not has(page, fragment))
                    context.close()

            check('未访问外部网络', all(url.startswith(origin + '/') for url in summary['network']))
            check('浏览器无脚本错误', not summary['errors'])
            browser.close()
        summary['status'] = 'PASS'
    except Exception as error:
        summary['status'] = 'FAIL'
        summary['failure'] = str(error)
        raise
    finally:
        child.terminate()
        child.wait(timeout=5)
        summary['service']['stopped'] = child.poll() is not None
        if args.dist:
            summary['bundleSha256'] = hashlib.sha256((ROOT / 'dist' / 'game.js').read_bytes()).hexdigest()
        (run / 'result.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': summary.get('status'), 'checks': len(summary['checks']),
                          'images': len(summary['images']), 'evidence': str(run),
                          'serviceStopped': summary['service'].get('stopped'),
                          'failure': summary.get('failure')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
