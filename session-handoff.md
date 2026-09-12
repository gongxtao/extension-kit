# Session Handoff

> 跨会话状态真源 = `docs/design.md`（设计）+ `feature_list.json` / `progress.md`（状态）；本文件是给下一个会话的快速入口。harness 四件套 + 工具链已就位（feat-001 done，2026-09-12）。

## Current Objective

- Goal: 按 `docs/design.md`（v2，2026-09-12 用户审定 + 自审 F1–F5 + 外部 review 二至四轮 F6–F22）实施 P0–P3，建成 `@gongxtao/extension-kit` 插件通用能力框架
- Current status: **feat-001 Harness & toolchain bootstrap 已收口（1/10）**——harness 五子系统 + 工具链骨架就位，`./init.sh` 三步真实全绿；设计经两轮 review 收口；实施未开始，下一步 = writing-plans 出 feat-002（P0 剩余）计划
- Branch / commit: `main`（最新见 `git log --oneline -5`）

## 铁律：落地质则（用户明确要求，优先级最高）

**所有实现以 ready-svg@95d0842 为唯一实现参照——copy-out（抄代码 + 抄测试）+ 按 design.md 泛化，禁止从零发明。**

1. ready-svg 的插件代码是 20 个特性 TDD 打磨出的实战形态（572 单测 / 27 E2E / 用户多轮真机复烟 / 每个裁定有编号记录）——它不是「参考之一」，是**唯一蓝本**
2. 框架里每个 API 形状都应能在 ready-svg 里指出对应物（design.md §9 溯源映射表）。**指不出对应物的新抽象 → 停下来质疑自己**：要么是过度设计，要么需要回设计文档补裁定
3. 泛化 = 参数化（ns/config/阈值/样式）+ 接口化（capture source 等 design.md 明列的抽象），不是重写。搬运时保持函数结构、DI 缝、守卫纪律、注释里的经验教训（cookie 端口号陷阱、lastError 语义、z-index 同值压制等——这些注释是踩坑记录，一并带走）
4. **跨仓参照路径**：`/Users/mac/Develop/project/ready-svg`（同级 `../ready-svg`）；源基线 commit `95d0842`（分支 `gongxtao`）——读源时以该 commit 为准，不追 ready-svg 后续演进（该仓已冻结，双方分叉成本用户已知情接受，见 design.md §10）
5. 行为语义疑问时读 `ready-svg/doc/v1.0/extension-interaction.md`（交互契约——代码为什么这样行为的成文理由）

## Completed Last Session（2026-09-12，于 ready-svg 仓会话完成）

- 设计 v1（当日撤回）→ 约束变化（用户裁定 ready-svg 冻结、copy-out 零改动源仓）→ v2 修订 → 用户五问校准（账号独立/npm 包/headless/页面集成/先冻结）→ 用户逐节批准 → 自审五处修订 F1–F5（F1 content 抽象重切 / F2 /react 子路径 / F3 MeInfo 归产品 / F4 工程补漏 / F5 CDN opt-in，详见 commit `f5c22ad`）→ docs/ 归位（`79e1eee`）
- **ready-svg 仓零改动**（冻结承诺兑现——本仓从建立至今未动过 ready-svg 任何文件）

## Completed（2026-09-12 本会话：设计二轮 review 修订 F6–F11）

- 外部 AI review design.md 提出 8 发现（2 阻断 + 6 精度），本会话逐条对照 ready-svg 源码验证全部成立（唯一出入：background/index.ts 实测 175 行 vs review 记 292，结论不受影响），三裁定经用户确认后落墨 design.md + README：
  - **F6** §3 新增「入口层边界」小节 + §9 补 /content/runtime（← entrypoints/content/index.ts startContentScript）、/content/cdn（← entrypoints/background/index.ts cdnGrab 接线）溯源——修「溯源表指不到源 = 诱导从零发明」的 P1/P2 阻断缺口
  - **F7** me-cache 泛型化落形 `createMeCache<T>({ area, validate: (v) => v is T, now? })`，条目 `{value, userId, savedAt}`（feat-005 TDD 绿靶）
  - **F8** StorageArea 类型归宿 /io 单点定义（+ onChanged 扩展形状），handoff.ts:132 重复声明收敛
  - **F9** capture source 接口 discover/eligibility 合一为 `isTarget`；点击复核 = runtime 再调同函数，ineligible/too_large 确定性败不走 CDN 兜底
  - **F10** README/D4：/panel 同居 content script 上下文——仅用 /panel 仍需 content script + host 权限
  - **F11** §5 ns 全量清单表（搬运/验收基准）+ 「逐字节兼容」限定 framework-bound 文件 + 非目标补「不仲裁多产品布局竞争」+ §6 补「构建后断言 exports 路径存在」
- 另：仓根出现未跟踪 `.workbuddy/`（另一 AI 工作区档案，非本仓交付物）——未纳入版本控制，处置待用户定（建议 .gitignore 或删除）

## Completed（2026-09-12 本会话续：设计三轮 review 修订 F12–F16）

- 外部 AI 复核 F6–F11：六条修订逐条回源码验证**全部吻合**（startContentScript :159 / setupPageIntegration·deliverHandoff·cdnGrab :69/:107/:64 / isBadgeTarget 两次调用 :231/:261 / 确定性败 :219 / F11 全表对源无误）；其首轮「background 292 行」系笔误（292 实为 optimize-flow.test.ts 行数，该文件 175 行）——已在 handoff 记录，未污染 design.md
- 新提 7 发现（1 实质 + 6 一致性）验证全成立，落 F12–F16：
  - **F12** §5 正文幽灵名 `${ns}-badge-host` 清除（源无此 id，徽标宿主走 data 属性）；§3/§9 消息形两口径统一（handoff 6 + close-panel）；kitMessages 注释改 7 kind 正确分组
  - **F13（唯一实质裁定）** background 边界走 **(a) 整体参数化**：`setupPageIntegration` 整函数进框架（菜单 title/contexts 注入、id 缺省 `${ns}-convert`；312 行测试整体随码参数化）——(b) 拆函数留壳违铁律「保持函数结构」；产品壳留值的注入 + manifest 快捷键
  - **F14** 溯源按能力归位：deliverHandoff → /content/handoff 行（两分支共用的 SW 半段）；cdn 行 = cdnGrab 分支 + makeOffscreenCanvas；§9 新增 /content（background 装配面）行
  - **F15** createFlagStore(area, key) 落形（源 createOnboardingStore(area)）+ store 构造器参数风格规则（同参个数保持位置参；新增缝 ≥3 参走对象参——me-cache 即例）
  - **F16** 菜单 id rsvg-convert 登记进 §5 清单；P0 断言口径 = createKit 派生面全表（纯字符串派生，P0 锁死 ns 契约；名字消费随模块 phase）
- `.workbuddy/` 确认为外部 AI 的记忆区（`memory/2026-09-12.md`）——已加 .gitignore，**保留不删**

## Completed（2026-09-12 本会话续二：设计四轮 review 修订 F17–F22 + F15 收紧）

- 外部 AI 三度复核：确认 F12–F16 全部落准（其「292 行」笔误已自纠——292 实为 optimize-flow.test.ts）；重心转向框架级审查，新提 6 缺口 + 2 小项，逐条验证全成立后落墨：
  - **F17** sourceOf 站点映射 + ImageSource 值域归产品（框架零站点知识；§5 metadata 透传 + cornerFor 泛型）——不修则产品 #2 照抄 ready-svg 站点名
  - **F18** HANDOFF_MAX_BYTES 通道上限随 /content/handoff 走（源在 page-image.ts:21 但属通道能力）；GrabFailReason 六值跨层标注
  - **F19** §4 配置三层归属表：KitConfig（跨模块全局，当前仅 ns，升层 = ≥2 模块消费或全局唯一）/ 模块装配参数 / 产品常量永不持
  - **F20** §5 createKit 接口契约（key/kind/domId/dataAttr/cssName/menuId）+ 唯一无源对应物抽象的显式例外登记（纯字符串派生 / ns='rsvg' 逐字节等价 / 新类别回设计扩契约）——feat-002 的 API 依据
  - **F21** §6 manifest 必备声明映射表（WAR 漏一项 iframe 白屏——/panel 静默故障源，源 manifest.test 锁；contextMenus 自 F13 起为框架必需权限）
  - **F22** §4 生命周期与清理纪律（destroy 还原 margin / {rescan, stop} / dispose / 菜单幂等重建）
  - **F15 收紧**（两方向裁定之一，选「保持源位置参」）：判据 = 源的真实分界（deps bag vs 单主体），不数参数个数；F7 me-cache 签名随改 `createMeCache<T>(area, validate, now?)`
  - 小项：§9 行正名 /content/runtime（background 半段）；§4 runtime 树补 background 半段注记

## Next Session Startup

1. `pwd && git status --short --branch`（本仓，main 分支；新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` 启动头 → `docs/design.md`（真源，尤其 §4 模块 / §8 切分 / §9 溯源表）→ `feature_list.json` / `progress.md` → 本文件
3. **Run `./init.sh`** —— 基线先绿（三步 fail-fast，feat-001 已验证可跑）
4. **跨仓读源**：`ls ../ready-svg/extension/src/lib/` 对照 design.md §9 溯源映射表（做哪个特性读哪个源文件，勿提前全读）
5. 调 writing-plans 技能出 feat-002（P0 剩余：createKit + example 插件）计划 → 用户批准 → 实施
6. 实施纪律：TDD 强制（复制测试先改参数化转红，再泛化代码转绿）；每个 commit 框架仓可构建；完成任一特性后更新状态三件套 + 回填 §9 溯源表 commit 列

## Verification Evidence

- 尚无实施。当前唯一产物 = 设计文档三件（`docs/design.md` / `README.md` / 本文件）

## Blockers / Risks

- `@gongxtao` scope 假设 GitHub 用户名与 git user 同名——P3 发布前核对，不同则改 package.json 一处（design.md §11）
- 产品 #2 抓取目标类型（图片之外）未定——D6 抽象已覆盖，新抓取源随产品 #2 需求加，不阻塞 P0–P3
- example/ 示例插件的 Chrome 加载验证依赖本机 headful Chrome（手动步骤，参照 ready-svg 的 E2E 基建形态可后续脚本化）

## Recommended Next Step

新会话第一动作：**writing-plans 出 P0 详细计划**（仓 bootstrap：harness 四件套 + tsdown/vitest/eslint 接线 + example/ 最小示例插件；出口门 = 框架 init.sh 绿 + example Chrome 加载冒烟三断言）。
