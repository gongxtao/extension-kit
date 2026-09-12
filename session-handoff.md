# Session Handoff

> 跨会话状态真源 = `docs/design.md`（设计）+ `feature_list.json` / `progress.md`（状态）；本文件是给下一个会话的快速入口。harness 四件套 + 工具链已就位（feat-001 done，2026-09-12）。

## Current Objective

- Goal: 按 `docs/design.md`（v2，2026-09-12 用户审定 + 自审修订）实施 P0–P3，建成 `@gongxtao/extension-kit` 插件通用能力框架
- Current status: **feat-001 Harness & toolchain bootstrap 已收口（1/10）**——harness 五子系统 + 工具链骨架就位，`./init.sh` 三步真实全绿；实施未开始，下一步 = writing-plans 出 feat-002（P0 剩余）计划
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
