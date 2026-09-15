# 桌面版内置开发者工具指南

本文档说明如何向 Windows 便携版（portable）桌面应用中内置额外的命令行工具，使应用在不依赖系统环境的前提下就能使用这些工具。

## 概述

桌面版 Windows 便携构建支持将常用开发工具打包进 `resources/runtime/tools/` 目录，并在启动 dsh 宿主进程时自动将它们的可执行目录注入 `PATH`。这样 AI 对话中执行的 shell 命令无需用户手动安装即可找到这些工具。

### 已内置工具

| 工具 | 版本（示例） | PATH 目录 | 说明 |
|------|-------------|-----------|------|
| git | PortableGit 2.55.0 | `cmd/` | 仅暴露 `git` 命令，不引入整套 MSYS2 工具链 |
| python | WinPython 3.14 | `python/`、`python/Scripts/` | 精简版，仅保留运行时，含 pip/wheel 等工具，不含 GUI 组件 |
| pandoc | 3.11 | 根目录 | 文档转换工具 |
| sqlite | 3.53 | 根目录 | SQLite 命令行工具 |
| lua | 5.5 | 根目录 | Lua 解释器 |
| busybox | — | 根目录 | 单文件 Unix 工具集 |
| 7z | 26.03 | 根目录 | 7-Zip 压缩工具 |

### 工作原理

1. **构建阶段**：`prepare:tools` 脚本从 `downloads/` 目录读取已解压的工具归档，复制到 `runtime/tools/<name>/`，并生成 `tools-manifest.json` 记录每个工具的 PATH 入口目录。
2. **打包阶段**：`runtime/` 目录整体作为 `extraResources` 打进安装包，路径为 `resources/runtime/`。
3. **运行阶段**：桌面主进程启动 dsh 宿主子进程时，读取 `resources/runtime/tools/tools-manifest.json`，将所有工具的入口目录按顺序 prepend 到 `PATH` 最前面。dsh 内部通过 `ctx.subprocess.spawn` 启动的所有子进程（shell 命令、终端会话等）都会继承这个环境。

PATH 优先级（从高到低）：
1. 内置工具（git、python、pandoc 等）
2. 内置 Node.js（`resources/runtime/node/`）
3. 系统原有 PATH

---

## 添加新工具的步骤

### 第一步：准备工具文件

将工具的 Windows x64 版本下载并解压到：

```
apps/desktop/.desktop-build/downloads/<工具目录名>/
```

支持两种形态：

- **目录形态**：工具是一个完整目录（如 `PortableGit/`、`pandoc-3.11/`）
- **单文件形态**：工具就是单个 exe（如 `busybox.exe`）

> `downloads/` 是构建缓存目录，不在版本控制中（已被 `.gitignore` 忽略）。

### 第二步：在 `prepare-tools.ts` 中注册工具

编辑 `apps/desktop/scripts/prepare-tools.ts`，在 `TOOLS` 数组中添加一项：

```ts
{
  name: 'toolname',           // 工具的唯一标识，也是 runtime/tools/ 下的目录名
  sources: [                   // 候选源路径（相对 downloads/），第一个存在的生效
    'toolname-1.2.3-win-x64',  //   常见形态：带版本号的目录名
    'toolname',                 //   备用：通用目录名
  ],
  pathDirs: ['bin', 'Scripts'],// 工具内部需要加入 PATH 的子目录列表（相对工具根目录）
                               // 按顺序加入 PATH，数组越靠前优先级越高
                               // 空字符串 '' 表示可执行文件就在工具根目录
  filter: keepWinPython,       // 可选：文件过滤函数，只复制需要的部分（减小体积）
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 工具唯一名称，使用小写字母，不能包含路径分隔符 |
| `sources` | `string[]` | 是 | 候选源路径列表，按顺序在 `downloads/` 下查找，第一个存在的即被使用。支持目录和单文件 |
| `pathDirs` | `string[]` | 是 | 需要加入 PATH 的子目录列表，相对于工具根目录。按数组顺序加入 PATH，越靠前优先级越高。空字符串表示根目录本身 |
| `filter` | `(relPath: string) => boolean` | 否 | 文件过滤函数，返回 `true` 的文件才会被复制。用于裁剪大型发行包中不需要的部分 |

### 第三步：验证构建

运行便携版构建：

```powershell
$env:DSH_DESKTOP_PORTABLE = "1"
pnpm run package:desktop:win:x64:portable
```

构建日志中会看到类似输出：

```
prepare:tools — toolname: staged (tools/toolname/bin)
prepare:tools — 8 tool(s) staged
```

表示工具已成功加入。

### 第四步：运行时验证

解压构建产物 zip，启动应用。在 AI 对话中执行：

```bash
toolname --version
```

如果能输出版本信息，说明 PATH 注入生效。

也可以在对话中执行 `echo $env:PATH`（PowerShell）或 `echo $PATH`（bash）查看完整 PATH，验证工具目录是否在最前面。

---

## 常见场景示例

### 场景 1：添加一个单文件工具（如 `jq.exe`）

1. 下载 `jq-win64.exe`，放到 `downloads/jq.exe`
2. 添加配置：

```ts
{
  name: 'jq',
  sources: ['jq.exe'],
  pathDirs: [''],
}
```

3. 构建后验证：`jq --version`

### 场景 2：添加一个有 bin 子目录的工具（如 Go）

1. 解压 `go1.22.0.windows-amd64.zip` 到 `downloads/go/`
2. 添加配置：

```ts
{
  name: 'go',
  sources: ['go1.22.0.windows-amd64/go', 'go'],
  pathDirs: ['bin'],   // go.exe 在 go/bin/ 下
}
```

3. 构建后验证：`go version`

### 场景 3：添加一个需要裁剪的大包（类似 WinPython）

1. 解压到 `downloads/SomeBigTool/`
2. 定义过滤函数（只保留需要的子目录）：

```ts
function keepOnlyCore(relPath: string): boolean {
  const top = relPath.split(/[/\\]/u)[0]
  return top === 'core' || top === 'bin'
}
```

3. 在工具配置中引用：

```ts
{
  name: 'bigtool',
  sources: ['SomeBigTool-2.0'],
  pathDirs: ['bin'],
  filter: keepOnlyCore,
}
```

---

## 注意事项

### 工具选择原则

- **优先选择单文件或目录结构扁平的工具**，减少体积和路径复杂度。
- **Windows x64 版本**：当前仅支持 Windows x64 便携构建，macOS/Linux 暂不内置工具（构建脚本会静默跳过）。
- **命令行工具**：只打包 CLI 工具，不要打包 GUI 应用。
- **许可证合规**：确保工具的许可证允许随应用分发。

### PATH 顺序

工具按 `TOOLS` 数组中的顺序加入 PATH，数组越靠前优先级越高。如果两个工具提供同名命令，前面的会覆盖后面的。调整顺序时注意不要破坏已有工具的预期行为。

### git 的特殊处理

Git 使用 `cmd/` 目录而非 `mingw64/bin/` 作为 PATH 入口，因为后者会把 300+ 个 MSYS2 工具（`bash`、`ls`、`find`、`sed` 等）都暴露到 PATH 中，可能与系统自带工具或 busybox 冲突，也会让 shell 环境变得不可预期。`cmd/git.exe` 是一个 thin shim，只暴露 `git` 命令本身。

如果确实需要 MSYS2 的完整 Unix 工具链，应该作为独立工具另外打包，而不是通过 git 的 mingw64/bin 引入。

### 体积控制

便携包的体积会随着内置工具增多而增长。建议：

- 对大包使用 `filter` 函数裁剪不需要的组件
- 优先选择轻量替代方案（比如 busybox 替代全套 GNU 工具）
- 文档、示例、测试文件等非运行必需的内容通过 filter 排除

### 开发环境下的行为

在开发模式（`pnpm dev`）下，`runtimeDir` 指向开发用的 dsh 目录，`tools/` 目录通常不存在，PATH 注入会静默跳过。要验证工具 PATH 注入，必须使用完整的便携构建产物。

### 缺失容忍

工具是**可选**的：如果 `downloads/` 中找不到对应文件，构建不会失败，只是该工具不会被打包。这样部分工具缺失时仍能正常构建。
