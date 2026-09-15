# Agent Note: Ship a portable Windows Desktop archive

Status: implemented

[English](2026-09-14-desktop-windows-portable-build.md) | 中文

[桌面打包决策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)负责发布标识、签名和更新传输；[内置运行时决策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)负责运行时树包含哪些内容。本记录负责解压后的桌面版把可写状态放在哪里。

## 问题

桌面版的每一种分发形态都需要安装。NSIS 写入应用树并在 Windows 中登记，macOS bundle 和 AppImage 落在系统位置，而它们都把可写状态留在用户主目录：Harness 主目录位于 `~/.dsh`，Chromium 配置位于 `%APPDATA%`。希望应用在机器上不留痕迹的用户——例如从可移动盘运行，或解压到某个文件夹后用后即删——没有任何选择。

依赖图排除了最直观的答案。Cordis 加载器按名字在真实的 `node_modules` 目录树上解析插件，内置的 `cordis.patch.yml` 作为文件被读取，四个 worker 入口必须作为文件存在，原生模块无法内联进 bundle。[单文件可执行决策](2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md)已为 SDK 给出结论：不打包 JavaScript，而是把依赖闭包作为资产树分发。桌面便携版具有同样的形态，因此要做的是新增一个打包目标加上一次可写根目录迁移，而不是一套新的分发机制。

## 决策

Windows x64 新增一个便携版压缩包，由 `pnpm run package:desktop:win:x64:portable` 产出。

该命令以 `--portable` 运行既有的固定目标驱动脚本，把 electron-builder 的目标从 `nsis` 换成 `zip`，并隐含未签名构建。所有准备步骤原样不变——`build:official`、各个 release pack、运行时准备，以及 `afterPack` 中的 [`verifyDesktopRuntime`](../../../../apps/desktop/scripts/prepare-dsh.ts) 断言都与发布产物完全一致——因此压缩包携带的运行时树经过了同一项校验。该标志通过 `win.extraFiles` 把 `scripts/portable.txt` 放到可执行文件旁，配置中再无其他改动。

[`portable.ts`](../../../../apps/desktop/src/portable.ts) 在主进程模块顶层读取该标记，早于 `app.whenReady()`、早于单实例锁，也早于任何对 Harness 主目录的解析。Electron 的单实例锁以 `userData` 为键，而 `DSH_HOME` 和 Chromium 路径都是一次性读取后即固定，因此三者都必须排在这次迁移之后。未打包的应用或标记缺失时返回 `{ portable: false }`，完全不触碰进程。

## 便携版布局

解压后的压缩包包含可执行文件、标记、资源以及一个数据目录：

```text
DeepSeek Harness.exe
portable.txt            marker beside the executable
data/
  home/                 $DSH_HOME
  electron-data/        app.getPath('userData')
  electron-cache/       app.getPath('cache')
resources/{runtime,dsh}/
```

浏览器配置落在 `data/electron-data` 而非 `data/`，这样 Harness 主目录保持干净，`data/home` 可以单独复制进安装版的 `~/.dsh`。只覆盖 `userData` 和 `cache`。`temp` 刻意留在系统卷上，因为 node-pty、koffi 和 Chromium 期望在那里使用临时空间；不设置 `sessionData`，因为 Chromium 会从已经迁移的 `userData` 推导它。

显式设置的 `DSH_HOME` 优先于 `data/home`，与 [`resolveDshHome`](../../../../packages/util/home-paths/src/index.ts) 的优先级一致，此时返回的布局报告该覆盖值而不是同级路径。因此 `DSH_HOME=... deepseek-harness.exe` 的含义保持不变，代价是便携副本会继承环境中的 `DSH_HOME`，而不是严格自包含。

对 `process.env.DSH_HOME` 的一次赋值即可到达所有使用方。Host 子进程默认继承 `process.env`，而那个会剔除 `NODE_OPTIONS`、`NODE_PATH`、`DSH_DESKTOP_*` 和包管理器前缀的 pnpm 环境过滤器会放行 `DSH_HOME`。仓库中没有任何模块在导入期解析 Harness 主目录，因此模块顶层的写入先于全部读取；下面的失败路径则保证这一先后关系不只是巧合。

数据目录在 `setPath` 之前创建，因为 Electron 会拒绝不存在的目标。因此只读或其他不可写的位置会在 `mkdirSync` 处失败，而不是静默写入用户主目录。`applyPortableLayout` 抛出，主模块记录该错误而不是让模块顶层的异常静默终止启动，`main()` 再将其抛出，由既有的应急文档渲染原因。进程是响亮地失败，而不是半迁移地运行。

便携版打包始终未签名，因此更新配置解析为 `undefined`，`publish` 为 `null`，`app-update.yml` 不会进入 `resources/`。无需额外守卫，自动更新即是惰性的；即使配置了更新源，electron-builder 也不会把 `zip` 产物当作 Windows 更新目标。

## 考虑过的替代方案

- **NSIS 的 `portable` 目标。**其生成的脚本每次启动都把整个应用解压到 `%TEMP%`，在应用整个生命周期内常驻一个启动器进程，并在结束时删除该目录树。它仍然需要同样的迁移工作，因为该目标导出的是 `PORTABLE_EXECUTABLE_DIR`，而不是把数据放在可执行文件旁；此外它的产物名与 `nsis` 在共享的 `artifactName` 下冲突。
- **`--dir` 加自建的压缩步骤。**产物等价，但引入 zip 依赖会触发 `verify-package-dependencies` 并强制重新生成 `THIRD_PARTY_NOTICES.md`，而调用系统压缩工具则带来平台、引号和确定性方面的顾虑。复用 electron-builder 自带的 `ArchiveTarget` 让压缩包留在经过验证的产线内。不打包的形态仍可通过 `win-x64 --portable --dir` 获得，用于免压缩往返地迭代便携运行时。
- **用 `.cmd` 启动器设置 `DSH_HOME`。**多一个进程，无法直接双击可执行文件启动，且用户在复制整个文件夹后即失效。
- **`extraMetadata` 中的标志或 `resources/` 下的哨兵文件。**两者在磁盘上都无法触及，用户无法选择退出，而 `extraMetadata` 标志对它所在的解压文件夹而言不可见。
- **无条件覆盖 `DSH_HOME`。**自包含性更严格，但会静默忽略一项有文档记载的覆盖机制，并使便携副本无法有意共享同一个主目录。
- **连 `temp` 一起覆盖。**可移动卷上的临时目录会破坏长时间运行的原生解压，而对便携状态没有任何增益。

## 影响

签名安装包路径完全未受影响。`extraFiles` 与 `zip` 目标只在 `DSH_DESKTOP_PORTABLE=1` 下存在，默认的 `win.target` 仍是 `['nsis']`，发布标识、签名和上传保持各自的要求。`--portable` 强制走未签名路径，该路径本就会剔除 `CSC_*` 输入，因此本次改动绝不会读取、记录或持久化 SafeNet 令牌输入。

解压目标必须可写且位于 NTFS 卷上。profile 使用目录 junction 链接共享包，而 exFAT 和 FAT32 无法存储 junction，因此这类盘上的便携副本会直接失败而不是降级运行。当记录的 junction 目标不再解析时，启动会重建它，而运行时标识与路径无关，这正是移动解压文件夹后仍可运行的原因。

electron-builder 在 Windows 上写出的是无顶层目录的压缩包，因此压缩包是平铺的，解压必须指定文件夹而非“解压到当前位置”。Windows 资源管理器的“全部解压缩”默认如此，桌面版 README 也明确写出。

未签名压缩包不具备信誉，因此从下载副本首次启动会经过 SmartScreen。这与未签名测试安装包是同一取舍；本记录将其记录在案而不予解决，面向分发的便携版构建需要把既有的 EV 签名路径扩展到压缩包目标。

压缩包的体积仍由 `@openai/codex` 和 `@anthropic-ai/claude-code` 主导，而这两个依赖只有两个 subagent 插件需要。把它们从桌面依赖闭包中裁掉是另一个决策。

聚焦测试覆盖解析后的配置（目标与标记路径，包括确认随附标记真实存在）、参数解析契约，以及迁移的单元契约及其标记缺失、未打包、显式覆盖、空白覆盖和不可写位置等用例。真实解压、移动文件夹后的 junction 重建、在没有系统 Node.js 的情况下运行，以及从解压副本发起一次端到端工具调用，仍属于发布环境验收而非单元夹具。
