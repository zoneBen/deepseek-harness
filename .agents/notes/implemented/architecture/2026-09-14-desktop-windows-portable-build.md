# Agent Note: Ship a portable Windows Desktop archive

Status: implemented

English | [中文](2026-09-14-desktop-windows-portable-build.zh.md)

The [Desktop packaging decision](2026-08-25-electron-desktop-packaging-and-updates.md) owns release identity, signing, and update transport; the [bundled-runtime decision](2026-09-08-desktop-bundled-runtime-and-external-plugins.md) owns what the runtime tree contains. This note owns where an extracted Desktop keeps its writable state.

## Problem

Every Desktop distribution format installs. NSIS writes the application tree and registers it with Windows, the macOS bundle and AppImage land in a system location, and all of them keep writable state in the user profile: the Harness home under `~/.dsh` and the Chromium profile under `%APPDATA%`. A user who wants an application that leaves no trace on the machine — running from a removable drive, or unpacking into a folder they later delete — has no option.

The dependency graph rules out the obvious answer. The Cordis loader resolves plugin names against a real `node_modules` directory tree, the bundled `cordis.patch.yml` is read as a file, four worker entry points must exist as files, and native modules cannot be inlined into a bundle. The [single-file executable decision](2026-07-10-single-file-executable-sdk-runtime-distribution.md) already resolved this for the SDK by shipping the dependency closure as an asset tree rather than bundling JavaScript. A portable Desktop has that same shape, so the work is a packaging target plus a relocation of the writable roots, not a new distribution mechanism.

## Decision

Windows x64 gains a portable archive, produced by `pnpm run package:desktop:win:x64:portable`.

The command runs the existing fixed-target driver with `--portable`, which selects electron-builder's `zip` target in place of `nsis` and implies an unsigned build. Every preparation step is unchanged — `build:official`, the release packs, runtime preparation, and the `afterPack` [`verifyDesktopRuntime`](../../../../apps/desktop/scripts/prepare-dsh.ts) assertion all run exactly as for a release artifact — so the archive carries a runtime tree verified by the same check. The flag adds `scripts/portable.txt` beside the executable through `win.extraFiles`, and nothing else in the configuration changes.

[`portable.ts`](../../../../apps/desktop/src/portable.ts) reads that marker at main-process module scope, before `app.whenReady()`, before the single-instance lock, and before anything resolves the Harness home. Electron keys its single-instance lock to `userData`, and both `DSH_HOME` and the Chromium paths are read once and then latched, so all three must follow the relocation. An unpackaged application or a missing marker returns `{ portable: false }` without touching the process.

## Portable layout

An extracted archive holds the executable, the marker, the resources, and one data directory:

```text
DeepSeek Harness.exe
portable.txt            marker beside the executable
data/
  home/                 $DSH_HOME
  electron-data/        app.getPath('userData')
  electron-cache/       app.getPath('cache')
resources/{runtime,dsh}/
```

The browser profile gets `data/electron-data` rather than `data/` so that the Harness home stays clean and `data/home` can be copied into an installed `~/.dsh` on its own. Only `userData` and `cache` are overridden. `temp` deliberately stays on the system volume, where node-pty, koffi, and Chromium expect scratch space; `sessionData` is not set because Chromium derives it from the already-relocated `userData`.

An explicitly set `DSH_HOME` wins over `data/home`, matching [`resolveDshHome`](../../../../packages/util/home-paths/src/index.ts)'s precedence, and the returned layout reports that override instead of the sibling path. `DSH_HOME=... deepseek-harness.exe` therefore keeps its meaning, at the cost of a portable copy inheriting an ambient `DSH_HOME` rather than staying self-contained.

One assignment to `process.env.DSH_HOME` reaches every consumer. The Host child process inherits `process.env` by default, and the pnpm environment filter that withholds `NODE_OPTIONS`, `NODE_PATH`, `DSH_DESKTOP_*`, and the package-manager prefixes passes `DSH_HOME` through. No module in the repository resolves the Harness home at import time, so a module-scope write precedes every read; the failure path keeps that ordering honest rather than merely relying on it.

The data directories are created before `setPath`, because Electron rejects a target that does not exist. A read-only or otherwise unwritable location therefore fails in `mkdirSync` instead of silently writing to the user profile. `applyPortableLayout` throws, the main module records the error rather than letting a module-scope throw abort startup silently, and `main()` rethrows it so the existing emergency document renders the reason. The process fails loudly instead of running half-relocated.

Portable packaging is always unsigned, so the update configuration resolves to `undefined`, `publish` is `null`, and no `app-update.yml` reaches `resources/`. The updater is inert with no further guard, and electron-builder would not accept a `zip` build as a Windows update target even with a feed configured.

## Alternatives considered

- **The NSIS `portable` target.** Its generated script extracts the whole application into `%TEMP%` on every launch, keeps a launcher process resident for the application's lifetime, and finishes by removing that tree. It still needs the same relocation work, because the target exports `PORTABLE_EXECUTABLE_DIR` instead of placing data beside the executable, and its artifact name collides with `nsis` under the shared `artifactName`.
- **`--dir` plus an archive step we own.** The output is equivalent, but a zip dependency would trip `verify-package-dependencies` and force a `THIRD_PARTY_NOTICES.md` regeneration, while shelling out to a system archiver adds platform, quoting, and determinism concerns. Reusing electron-builder's own `ArchiveTarget` keeps the archive inside the verified pipeline. The unpacked form remains reachable as `win-x64 --portable --dir` for iterating on the portable runtime without an archive round trip.
- **A `.cmd` launcher that sets `DSH_HOME`.** It adds a process, breaks launching the executable directly, and does not survive the user copying the folder elsewhere.
- **A flag inside `extraMetadata` or a sentinel under `resources/`.** Neither is reachable on disk, so a user could not opt out, and an `extraMetadata` flag is invisible in the extracted folder it describes.
- **Overriding `DSH_HOME` unconditionally.** Stricter self-containment, but it would silently ignore a documented override and stop a portable copy from sharing a home on purpose.
- **Overriding `temp` as well.** A scratch directory on a removable volume breaks long-running native extraction and gains nothing that portable state requires.

## Consequences

The signed installer path is untouched. `extraFiles` and the `zip` target exist only under `DSH_DESKTOP_PORTABLE=1`, the default `win.target` remains `['nsis']`, and release identity, signing, and uploading keep their requirements. `--portable` forces the unsigned path that already withholds `CSC_*` inputs, so the safe-net token inputs are never read, logged, or persisted by this change.

Extraction must be writable and on an NTFS volume. The profile links shared packages with directory junctions, which exFAT and FAT32 cannot store, so a portable copy on such a drive fails rather than degrading. Junction targets are recreated at launch when the recorded target no longer resolves, and the runtime identity is path-independent, which is what makes moving the extracted folder work.

electron-builder writes a directory-less archive for Windows, so the archive is flat and extraction has to target a folder rather than "here". Windows Explorer's Extract All does that by default, and the Desktop README states it explicitly.

Marketplace reputation is absent from an unsigned archive, so a first launch from a downloaded copy goes through SmartScreen. That is the same trade the unsigned test installer makes; it is documented rather than solved, and a portable build for distribution would need the existing EV signing path extended to the archive target.

The archive remains dominated by the `@openai/codex` and `@anthropic-ai/claude-code` dependencies that only two subagent plugins require. Trimming them from the Desktop closure is a separate decision.

Focused tests cover the resolved configuration (target and marker path, including that the shipped marker exists), the parser contract, and the relocation unit contract with its absent-marker, unpackaged, explicit-override, blank-override, and unwritable-location cases. Real extraction, junction relocation after a folder move, running without a system Node.js, and one end-to-end tool call from the extracted copy remain release-environment qualification rather than unit fixtures.
