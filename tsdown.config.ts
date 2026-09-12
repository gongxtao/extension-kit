import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: 'esm',
  // 模块 subpath 入口随 P1 各模块落地时加入（design.md §4 九入口）
});
