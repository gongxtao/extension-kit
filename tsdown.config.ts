import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/config/index.ts', 'src/messaging/index.ts', 'src/io/index.ts'],
  dts: true,
  format: 'esm',
  // 模块 subpath 入口随 P1 各模块落地时加入（design.md §4 九入口）；
  // 每条 exports 路径由 scripts/assert-exports.mjs 在 build 末尾示断言（§6）
});
