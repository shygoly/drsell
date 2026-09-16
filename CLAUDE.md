# CLAUDE.md

本仓库的 agent 指引是**工具中立**的，唯一事实来源是 [`AGENTS.md`](AGENTS.md)。
本文件不复制任何内容——复制即制造第二个事实来源。

@AGENTS.md

> 若上面的导入未生效，请先完整阅读 `AGENTS.md` 再开始工作。
> Claude 专有的约定（若将来需要）才写在本文件，共享内容一律留在 `AGENTS.md`。

## Claude 专有

- B2B 客户建站流水线 skills 在 `.claude/skills/`：`b2b-research`（已建，事实契约
  `clients/<slug>/catalog.json`）→ `b2b-site-design`（已建，表达契约 `sitecopy.json`，
  跨文件校验：资质锚定 catalog + 询价枚举现读后端路由）→ `b2b-site-build` →
  `b2b-cs-attach`（待建）。每个 skill 自带校验器；首个完整客户档案在 `clients/kossel-medtech/`。
