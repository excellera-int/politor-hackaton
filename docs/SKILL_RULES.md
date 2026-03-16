# SKILL_RULES — How to Create Skills for This Project

This file instructs Claude Code on how to **translate natural language descriptions into SKILL.md files** using the Skills plugin active in VS Code.

---

## Your Role When Reading This

When the user describes **in natural language** what they want an agent to do, your job is to:

1. Identify what type of skill it is (reference, task, orchestration)
2. Choose the correct frontmatter based on the rules in this file
3. Write the instructions in the skill body
4. Create the file in the correct project location

Do not ask for confirmation about structure — apply these rules directly and create the file.

---

## Where to Create Skills

All skills in this project go in:

```
.claude/skills/<skill-name>/SKILL.md
```

The `<skill-name>` must be lowercase, no spaces, hyphen-separated. Examples: `code-reviewer`, `deploy-staging`, `api-docs-generator`.

If the user does not specify a name, derive it from the described purpose.

---

## Required Structure of Every SKILL.md

```
.claude/skills/
└── <name>/
    ├── SKILL.md          ← always required
    ├── reference.md      ← optional: detailed documentation
    └── examples.md       ← optional: usage examples
```

Every SKILL.md has exactly two parts:

```
---
[YAML frontmatter]
---

[Markdown instructions Claude will follow]
```

---

## Rules for Choosing Frontmatter

### Rule 1 — `description` always present

Always write a clear `description`. This is what Claude uses to know when to invoke the skill automatically. It must explain **what it does** and **when to use it**:

```yaml
description: Reviews code changes for security vulnerabilities. Use after implementing any feature that handles user data or authentication.
```

### Rule 2 — Choose invocation mode based on purpose

| If the user describes... | Use |
|---|---|
| Something Claude should detect and apply on its own | Only `description` (default) |
| A workflow the user triggers manually (deploy, commit, publish) | `disable-model-invocation: true` |
| Background knowledge or conventions Claude should always know | `user-invocable: false` |

### Rule 3 — Choose `context` based on isolation needs

| If the skill... | Use |
|---|---|
| Gives instructions or conventions Claude applies in the active conversation | No `context` (inline, default) |
| Must execute a complex task independently without accessing history | `context: fork` |
| Needs to deeply explore the codebase before acting | `context: fork` + `agent: Explore` |
| Needs to plan complex steps before executing | `context: fork` + `agent: Plan` |

### Rule 4 — Always restrict tools to the minimum needed

If the task only requires reading files, do not grant Bash access. Examples:

```yaml
# Read-only
allowed-tools: Read, Glob, Grep

# Read + git
allowed-tools: Read, Glob, Grep, Bash(git diff *), Bash(git log *)

# Read + test commands
allowed-tools: Read, Bash(npm test *), Bash(pytest *)

# Write access allowed
allowed-tools: Read, Write, Edit, Glob, Grep
```

### Rule 5 — `argument-hint` when the skill receives parameters

If the skill expects the user to pass something when invoking it:

```yaml
argument-hint: [component-name]
# or
argument-hint: [file] [target-format]
# or
argument-hint: [issue-number]
```

---

## Templates by Skill Type

### Template A — Reference / Conventions Skill

Use when the user wants Claude to **always remember** certain rules, patterns, or project conventions without needing to invoke it manually.

```yaml
---
name: <name>
description: <what knowledge it provides and when to apply it>
user-invocable: false
---

<Instructions, rules, conventions, or patterns Claude must follow>
```

**When to use:** the user says things like *"I want Claude to always know that..."*, *"it should follow these conventions..."*, *"it should understand how this system works..."*.

---

### Template B — Automatic Task Skill

Use when the user describes an action Claude should recognize and execute within the active conversation.

```yaml
---
name: <name>
description: <what it does and when to use it — write phrases like "Use when..." or "Use after...">
allowed-tools: <minimum required tools>
---

## Your task
<Clear instruction of what Claude must do>

## Steps
1. <step 1>
2. <step 2>
3. <step 3>

## Output format
<How Claude should present results>
```

**When to use:** the user describes a concrete action that Claude will detect in the conversation and execute automatically.

---

### Template C — Manual Workflow Skill (with side effects)

Use when the user describes something that **must not trigger automatically** — deploys, commits, publishing, sending messages.

```yaml
---
name: <name>
description: <what it does — for documentation and autocomplete>
context: fork
disable-model-invocation: true
allowed-tools: <required tools>
---

## Your task
<Detailed workflow instruction>

## Steps
1. <step 1>
2. <step 2>
3. <step 3>

## Pre-completion checks
- <check 1>
- <check 2>
```

**When to use:** the user says things like *"a command to deploy"*, *"when I invoke it, it should..."*, *"prepare the commit"*, *"publish to..."*.

---

### Template D — Investigation / Deep Analysis Skill

Use when the user wants Claude to **deeply explore the codebase** in isolation and return a report.

```yaml
---
name: <name>
description: <what it analyzes and when to use it>
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep, Bash(git log *), Bash(git diff *)
---

## Your task
$ARGUMENTS or <fixed description of what to investigate>

## Investigation process
1. Identify relevant files using Glob and Grep
2. Read and analyze the code
3. <analysis-specific steps>

## Report format
<How to structure the findings>
```

**When to use:** the user says things like *"analyze..."*, *"scan the codebase for..."*, *"investigate..."*, *"audit..."*.

---

### Template E — Skill with User Arguments

Use when the skill needs to receive parameters when invoked.

```yaml
---
name: <name>
description: <what it does — mention it receives a parameter>
argument-hint: [<argument description>]
context: fork          # optional depending on complexity
allowed-tools: <tools>
---

## Your task
<Instruction using $ARGUMENTS or $0, $1, $2>

# Single argument example:
"Analyze module $ARGUMENTS for..."

# Multiple arguments example:
"Migrate component $0 from $1 to $2, preserving..."
```

**When to use:** the user says things like *"it should receive a filename"*, *"pass it the issue number"*, *"tell it which framework to migrate from"*.

---

## Available Substitutions in the Skill Body

| Syntax | What it injects |
|---|---|
| `$ARGUMENTS` | Everything the user types after the skill name when invoking it |
| `$0`, `$1`, `$2` | Positional arguments separated by spaces |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `` !`shell command` `` | Result of command executed **before** sending the prompt to Claude |
| `ultrathink` | Enables extended thinking (include anywhere in the body) |

---

## End-to-End Example: From Natural Language to SKILL.md

**The user says:**
> "I want a skill that, when I manually invoke it, scans all TypeScript files in the project looking for implicit `any`, untyped variables, and functions missing return types, and gives me a report with file, line, and a fix suggestion."

**Claude must create** `.claude/skills/ts-type-audit/SKILL.md`:

```yaml
---
name: ts-type-audit
description: Audits TypeScript files for implicit any, untyped variables, and missing return types. Invoke manually before a PR or code review to get a full type-safety report.
argument-hint: [subdirectory]
context: fork
agent: Explore
allowed-tools: Read, Glob, Grep
disable-model-invocation: true
---

## Your task
Audit the project's TypeScript files for typing issues.
If $ARGUMENTS is provided, restrict the analysis to that subdirectory.

## Process
1. Find all `.ts` and `.tsx` files using Glob: `**/*.ts`, `**/*.tsx`
2. Ignore `node_modules/`, `dist/`, `build/`
3. In each file, look for:
   - Variables declared with explicit `: any` or where TypeScript infers `any`
   - Functions without a declared return type (look for `function` and `=>` without `: <Type>` before `{`)
   - Untyped function parameters
4. For each finding, record the file, line number, problematic code, and a fix suggestion

## Report format

### Summary
- Total files audited: N
- Total issues found: N

### Issues by file

**`path/to/file.ts`**
| Line | Type | Code | Suggestion |
|---|---|---|---|
| 42 | Implicit `any` | `const data = JSON.parse(...)` | `const data: MyType = JSON.parse(...)` |

### Fix priority
🔴 High: untyped parameters in public functions
🟡 Medium: explicit `any` variables
🔵 Low: internal functions missing return type
```

---

## What NOT to Do When Creating Skills

- **Do not use literal `\n`** in the body — use real line breaks and paragraphs in Markdown
- **Do not create skills over 500 lines** in SKILL.md — move extensive content to `reference.md`
- **Do not put `context: fork` on reference skills** — it only makes sense with task instructions
- **Do not use `bypassPermissions` in `permissionMode`** unless the user explicitly requests it
- **Do not invent tools** in `allowed-tools` — only use valid ones: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash(...)`, `WebSearch`, `mcp__*`
- **Do not omit `description`** — it is the most important field for Claude to know when to use the skill

---

## Decision Flow When the User Asks to Create a Skill

```
User describes in natural language what they want
         ↓
Identify: is it reference, automatic task, manual workflow, or deep analysis?
         ↓
Choose template (A, B, C, D, or E)
         ↓
Derive name in kebab-case from the purpose
         ↓
Write a clear description with "Use when..." or "Use after..."
         ↓
Decide context (inline or fork), agent, and allowed-tools
         ↓
Write the body with precise instructions and output format
         ↓
Create the file at .claude/skills/<name>/SKILL.md
         ↓
Confirm to the user what was created and how to invoke it
```
