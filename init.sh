#!/bin/bash
# extension-kit 基线验证：lint → unit → build（fail-fast；CLAUDE.md「Verification required」）
set -e

echo "=== Harness Initialization ==="

echo ""
echo "=== Step 1/3 · lint（eslint + tsc --noEmit） ==="
npm run lint

echo ""
echo "=== Step 2/3 · unit（vitest run） ==="
npm run test

echo ""
echo "=== Step 3/3 · build（tsdown → dist） ==="
npm run build

echo ""
echo "=== Verification Complete ==="
echo ""
echo "本入口未覆盖（按需另行运行，见 docs/design.md）："
echo "  - example/ 插件 Chrome 加载冒烟（P0 出口门；可脚本化：example/ 内 npm run smoke，前置见 example/README.md）"
echo "  - GitHub Packages 发布 dry-run（feat-010 建管线后）"
echo ""
echo "Next steps:"
echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run ./init.sh before claiming done"
