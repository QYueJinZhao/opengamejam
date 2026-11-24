// 仅构建期使用 esbuild；交付主包不含 npm、文档、测试和本地预览文件。
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MARKER = '/* overload-express-tt V3 generated */';
const args = process.argv.slice(2);
const production = args.includes('--production');
const outArg = args.indexOf('--outdir');
if (outArg >= 0 && !args[outArg + 1]) throw new Error('输出目录参数缺失');
const out = path.resolve(outArg >= 0 ? args[outArg + 1] : path.join(ROOT, 'dist'));
const relative = path.relative(ROOT, out);
if (out === ROOT || out === path.parse(out).root ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && relative !== 'dist')) {
  throw new Error('输出目录只能是项目 dist 或项目外的新目录，禁止覆盖源码');
}
const stat = await fs.lstat(out).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (stat) {
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('输出目录不合法');
  const names = await fs.readdir(out);
  if (names.length && (names.some((name) => !['game.js', 'game.json', 'project.config.json'].includes(name)) ||
      !(await fs.readFile(path.join(out, 'game.js'), 'utf8')).startsWith(MARKER))) {
    throw new Error('输出目录含非本构建生成的文件，拒绝覆盖');
  }
}
const result = await build({
  entryPoints: [path.join(ROOT, 'game.js')],
  bundle: true, minify: true, write: false, format: 'iife', platform: 'browser',
  target: 'es2018', charset: 'utf8', legalComments: 'none',
  banner: { js: MARKER },
  define: { __OVERLOAD_DEV_MOCK_AD__: production ? 'false' : 'true' },
});
const rawProjCfg = JSON.parse(await fs.readFile(path.join(ROOT, 'project.config.json'), 'utf8'));
const resolvedAppId = rawProjCfg.appid && rawProjCfg.appid !== 'tt_replace_with_your_appid' ? rawProjCfg.appid : '';
const files = {
  'game.js': result.outputFiles[0].contents,
  'game.json': await fs.readFile(path.join(ROOT, 'game.json')),
  'project.config.json': Buffer.from(JSON.stringify({
    appid: resolvedAppId, projectname: 'overload-express-tt', compileType: 'game',
    setting: { es6: false, minified: false },
  }, null, 2) + '\n'),
};
const LIMIT_BYTES = 300000;
const bytes = Object.values(files).reduce((sum, value) => sum + value.byteLength, 0);
if (bytes >= LIMIT_BYTES) throw new Error(`主包 ${bytes} bytes，超过 < ${LIMIT_BYTES} bytes 限制`);
await fs.mkdir(out, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const target = path.join(out, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const existing = await fs.lstat(target).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing?.isSymbolicLink()) throw new Error('拒绝覆盖符号链接');
  await fs.writeFile(target, content);
}
console.log(JSON.stringify({ mode: production ? 'production' : 'development',
  mockAds: !production, bytes, limit: LIMIT_BYTES, files: Object.keys(files), out }));
