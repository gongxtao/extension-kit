import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'example/**'] },
  ...tseslint.configs.recommended,
  // 模块分层纪律（design.md §4）第一刀：config/messaging/io 为底层零依赖——
  // 禁止跨模块 import（跨层协作全走 DI 参数）；上层间 type 级引用纪律由
  // verbatimModuleSyntax + code review 守（no-restricted-imports 无法区分
  // import type，第二刀暂缓——见 progress.md 风险注记）
  {
    files: ['src/config/**/*.ts', 'src/messaging/**/*.ts', 'src/io/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../session', '../session/*', '../api', '../api/*', '../panel', '../panel/*', '../content', '../content/*', '../react', '../react/*'],
              message: '底层模块零依赖（design.md §4 分层纪律）——跨层协作走 DI 参数',
            },
          ],
        },
      ],
    },
  },
);
