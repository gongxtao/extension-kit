# CLAUDE.md - Extension Kit（插件通用能力框架）

## Project Startup & Harness（先读这节）

**项目**：`@gongxtao/extension-kit` —— 浏览器插件通用能力框架（headless 核心 + `/react` 逻辑 hooks）。
**使命**：未来插件产品（产品 #2 起）起步 = WXT 入口装配 + 业务视图，基础管线零重写。
**当前阶段**：v0.1.0 已发布（GitHub Packages 私有，github.com/gongxtao/extension-kit）；12/12 特性收口（框架十模块 + demo 端到端验证 + 接入教程）；下一里程碑 = 产品 #2 接入（首个真实消费者）。

### Startup Workflow

**Before writing code**, complete these steps in order:

1. `pwd && git status --short --branch`（`main` 分支；新 shell 需先 `nvm use`——.nvmrc 24.13.1）
2. **读本节**（Project Startup & Harness）
3. **读状态**：`docs/design.md`（设计真源）→ `docs/onboarding.md`（接入教程）→ `session-handoff.md`（会话入口）→ `feature_list.json` → `progress.md`——从聊天记录或记忆推断状态是反模式
4. **Run `./init.sh`** —— 基线必须先绿（lint → unit → build，fail-fast）；基线坏了先修基线，不开新特性格
5. `git log --oneline -5` 对齐最近变更

### 落地质则（铁律，优先级最高——用户明确要求）

**docs/design.md 是唯一设计真源；已实装的十模块代码 + 测试是行为基准。改动先对齐它们，禁止从零发明。**

- 新能力 / 新抽象：先回 `docs/design.md` 对应节核对或补裁定记录（F/R 编号），再动手——指不出设计依据和既有对应物的新抽象 = 过度设计，停下来质疑
- 修行为：先读对应模块的测试矩阵（它们锁定既有语义），改语义必须连测试一起改并说明理由
- 泛化纪律：参数化（ns / config / 阈值 / 样式 / 文案）优先于新机制；产品文案与品牌资产一律注入、框架零缺省（F23）
- 代码注释里的踩坑记录（lastError 回调语义、z-index 同值压制、cookie 撕裂时序等）是资产，重构时保留其技术内容
- 多产品共存靠 ns 隔离（§5）——任何新全局名字必须经 kit 派生，禁止裸字符串

### Working Rules

- **One feature at a time**：一次只从 `feature_list.json` 挑一个未完成特性
- **Stay in scope**：不碰当前特性无关的文件
- **TDD 强制**：新逻辑先写测试转红 → 实现转绿 → 重构
- **Verification required**：声明完成前必须真实跑过 `./init.sh`（涉 example/demo 集成时另跑 compile/build + 对应冒烟）
- **Update artifacts**：随做随更新 `feature_list.json` 与 `progress.md`
- **Leave clean state**：下一个会话必须能直接跑 `./init.sh`

### Definition of Done

**A feature is done only when** 以下全部成立：

- [ ] 实现按 `docs/design.md` 对应模块契约落地（新裁定已回写设计文档）
- [ ] `./init.sh` 真实跑过且通过（涉 example/ 集成时另做 Chrome 加载冒烟）
- [ ] 证据已记录：`feature_list.json` 的 evidence 字段和/或 `progress.md` 的 Evidence of Completion
- [ ] 状态文件已更新，仓库可从本启动路径直接重启

### End of Session

**Before ending a session**, do the following:

1. 更新 `progress.md`（状态 / 阻断项 / 下一步 / 证据）
2. 更新 `feature_list.json` 的 status 与 evidence
3. 跨会话工作更新 `session-handoff.md`
4. 达到安全状态后按仓库风格提交（`info: 中文描述`）并推送

### Verification Commands

```bash
./init.sh        # 三步：lint → unit → build（fail-fast）
# demo/example：目录内 npm run compile && npm run build；Chrome 冒烟见各自 README
# 发布：v* 标签推送触发 Actions（.github/workflows/release.yml）
```

### Escalation

- 抽象/接口拿不准 → 先对照 design.md 契约与既有模块实现；仍不清 → 用平实语言 + 具体选项问用户
- 实现与设计冲突 → `docs/design.md` 胜出，回头修文档或补裁定记录
- 产品 #2 相关的新需求 → 先判断属于框架泛化还是产品侧代码，边界见 design.md §3 两清单
