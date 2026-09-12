import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom 环境随 P1 DOM 模块（/panel /content /react）接入再切；当前纯 node
    environment: 'node',
  },
});
