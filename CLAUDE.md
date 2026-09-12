# CLAUDE.md - Extension Kit（插件通用能力框架）

## Project Startup & Harness（先读这节）

**项目**：`@gongxtao/extension-kit` —— 浏览器插件通用能力框架（headless 核心 + `/react` 逻辑 hooks）。
**使命**：未来插件产品（产品 #2 起）起步 = WXT 入口装配 + 业务视图，基础管线零重写。
**抽离源**：ready-svg 插件（`../ready-svg`，基线 commit `95d0842`）——copy-out + 泛化，**ready-svg 仓永不回头修改**（分叉成本用户已知情接受，见 docs/design.md §10）。
**当前阶段**：设计定稿（docs/design.md v2），实施 P0–P3 未开始——见 `session-handoff.md`。

### Startup Workflow

**Before writing code**, complete these steps in order:

1. `pwd && git status --short --branch`（`main` 分支；新 shell 需先 `nvm use`——.nvmrc 24.13.1）
2. **读本节**（Project Startup & Harness）
3. **读状态**：`docs/design.md`（设计真源）→ `session-handoff.md`（会话入口）→ `feature_list.json` → `progress.md`——从聊天记录或记忆推断状态是反模式
4. **Run `./init.sh`** —— 基线必须先绿（lint → unit → build，fail-fast）；基线坏了先修基线，不开新特性格
5. `git log --oneline -5` 对齐最近变更

### 落地质则（铁律，优先级最高——用户明确要求）

**所有实现以 ready-svg@95d0842 为唯一实现参照——copy-out（抄代码 + 抄测试）+ 按 docs/design.md 泛化，禁止从零发明。**

- 框架里每个 API 形状都应能在 ready-svg 里指出对应物（docs/design.md §9 溯源映射表）；**指不出对应物的新抽象 → 停下来质疑**：要么过度设计，要么回设计文档补裁定
- 泛化 = 参数化（ns / config / 阈值 / 样式）+ design.md 明列的接口化（capture source 等），不是重写；搬运时保持函数结构、DI 缝、守卫纪律，**源码注释里的踩坑记录（cookie 端口号陷阱、lastError 语义、z-index 同值压制等）随码带走**
- 行为语义疑问读 `../ready-svg/doc/v1.0/extension-interaction.md`（交互契约）

### Working Rules

- **One feature at a time**：一次只从 `feature_list.json` 挑一个未完成特性
- **Stay in scope**：不碰当前特性无关的文件
- **TDD 强制**：复制 ready-svg 对应测试先改参数化转红 → 泛化代码转绿 → 重构
- **Verification required**：声明完成前必须真实跑过 `./init.sh`
- **Update artifacts**：随做随更新 `feature_list.json` 与 `progress.md`
- **Leave clean state**：下一个会话必须能直接跑 `./init.sh`

### Definition of Done

**A feature is done only when** 以下全部成立：

- [ ] 实现按 docs/design.md 对应模块的泛化点落地，且能在 ready-svg 指出对应物（溯源表回填）
- [ ] `./init.sh` 真实跑过且通过（涉 example/ 集成时另做 Chrome 加载冒烟）
- [ ] 证据已记录：`feature_list.json` 的 evidence 字段和/或 `progress.md` 的 Evidence of Completion
- [ ] 状态文件已更新，仓库可从本启动路径直接重启

### End of Session

**Before ending a session**, do the following:

1. 更新 `progress.md`（状态 / 阻断项 / 下一步 / 证据）
2. 更新 `feature_list.json` 的 status 与 evidence
3. 跨会话工作更新 `session-handoff.md`
4. 回填 `docs/design.md` §9 溯源映射表的 commit 列
5. 达到安全状态后按仓库风格提交（`info: 中文描述`）

### Verification Commands

```bash
./init.sh        # 三步：lint → unit → build（fail-fast）
# example/ 插件 Chrome 加载冒烟 = feat-002 起的 P0 出口门（手动，见 design.md §8）
# 发布（P3 起）：GitHub Packages——管线建好后另有 dry-run 步骤
```

### Escalation

- 抽象/接口拿不准 → 先对照 ready-svg 源码找对应物；仍不清 → 用平实语言 + 具体选项问用户
- 实现与设计冲突 → `docs/design.md` 胜出，回头修文档或补裁定记录
- 产品 #2 相关的新需求 → 先判断属于框架泛化还是产品侧代码，边界见 design.md §3 两清单
