# CLAUDE.md

本仓库的 agent 指引是**工具中立**的，唯一事实来源是 [`AGENTS.md`](AGENTS.md)。
本文件不复制任何内容——复制即制造第二个事实来源。

@AGENTS.md

> 若上面的导入未生效，请先完整阅读 `AGENTS.md` 再开始工作。
> Claude 专有的约定（若将来需要）才写在本文件，共享内容一律留在 `AGENTS.md`。

## Claude 专有

- B2B 客户建站流水线 skills 在 `.claude/skills/`：`b2b-research`（已建，产出契约
  `clients/<slug>/`，校验器随 skill 附带）→ `b2b-site-build` → `b2b-cs-attach`（待建）。
