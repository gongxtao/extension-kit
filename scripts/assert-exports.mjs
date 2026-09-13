// §6 导出路径断言：package.json exports 每条路径在 dist 实产存在再放行。
// feat-001 曾实捕 .js→.mjs 不匹配一次，此断言固化防再犯（design.md §6）。
// 形状说明：tsdown 0.23 esm 产物为 .mjs / .d.mts（入口修正记录见 progress.md）。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const missing = [];
for (const [subpath, conditions] of Object.entries(pkg.exports ?? {})) {
  for (const [condition, target] of Object.entries(conditions)) {
    if (!existsSync(join(root, target))) {
      missing.push(`exports["${subpath}"].${condition} → ${target}（dist 缺失）`);
    }
  }
}

if (missing.length > 0) {
  console.error('[assert-exports] 导出路径断言失败（design.md §6）：');
  for (const line of missing) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(
  `[assert-exports] exports ↔ dist 全部对齐（${Object.keys(pkg.exports ?? {}).length} 入口）`,
);
