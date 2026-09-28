# Bundled Skills

Skills placed in this directory are built into the Desktop application as
bundled (shipped-with-product) skills. They are available to every session at
the lowest discovery priority (`bundled`, rank 600), so user- or project-level
skills with the same name take precedence.

## Layout

Each skill is a directory with a `SKILL.md` file (and optional supporting
files such as `references/`, `templates/`, or `scripts/`):

```
bundled-skills/
├── my-skill/
│   ├── SKILL.md
│   └── references/
│       └── example.md
└── another-skill/
    └── SKILL.md
```

## Skill frontmatter

`SKILL.md` starts with a YAML frontmatter block:

```yaml
---
name: my-skill
description: One-line summary shown in the skill directory.
modelInvocable: true
userInvocable: true
---

Skill body – detailed instructions loaded on demand.
```

See `packages/skill/skill-filesystem/README.md` for the full schema.
