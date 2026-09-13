import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'example/**'] },
  ...tseslint.configs.recommended,
  // P1 起追加：模块分层纪律（design.md §4——config/messaging/io 为底层零依赖，
  // session/api/panel/content 跨模块只允许 type 级引用，no-restricted-imports 钉死）
);
