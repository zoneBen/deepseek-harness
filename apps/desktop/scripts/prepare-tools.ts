/**
 * Stage bundled developer tools into the runtime directory so the packaged
 * application can locate them on PATH.
 *
 * Tools are expected to exist under `downloads/` as archives extracted by the
 * build operator.  Each tool is copied into `runtime/tools/<name>/` and its
 * entry directory is recorded in `runtime/tools/tools-manifest.json` so the
 * host process can build a PATH from it.
 *
 * Only Windows x64 is currently supported.  Tools are optional: missing
 * downloads are skipped silently so a partial set still produces a build.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'

const BUILD_PATHS = resolveDesktopTargetBuildPaths()
const DOWNLOAD_ROOT = BUILD_PATHS.downloads
const RUNTIME_ROOT = BUILD_PATHS.runtime
const TOOLS_ROOT = join(RUNTIME_ROOT, 'tools')

/** One tool description: where to find it and which sub-dir is the PATH entry. */
interface ToolSpec {
  /** Directory name under `runtime/tools/`. */
  readonly name: string
  /**
   * Candidate source paths relative to DOWNLOAD_ROOT.  The first one that
   * exists on disk is used.  Supports both plain directory names and
   * "archive-name/inner-dir" patterns from tool archives with a top-level
   * wrapper folder.
   */
  readonly sources: readonly string[]
  /**
   * Directory *inside* the tool copy that should be added to PATH, relative
   * to `runtime/tools/<name>/`.  Empty string means the root.
   */
  readonly pathDir: string
  /** When true, do not copy but instead create the entry and copy only pathDir. */
  readonly filter?: (relPath: string) => boolean
}

/**
 * WinPython ships a lot of GUI wrappers, notebooks, and editors we don't
 * need.  Keep only the bare Python runtime.
 */
function keepWinPython(relPath: string): boolean {
  const top = relPath.split(/[/\\]/u)[0]
  // Only the python/ subtree is kept — no IDLE, no Spyder, no Jupyter, no VS Code.
  return top === 'python'
}

const TOOLS: readonly ToolSpec[] = [
  {
    name: 'git',
    sources: [
      'PortableGit-2.55.0.5-64-bit.7z',
      'PortableGit',
      'Git',
    ],
    // `cmd/git.exe` is the thin shim that exposes only `git` without also
    // putting 300+ MSYS2 utilities onto PATH (which `mingw64/bin` would do).
    pathDir: 'cmd',
  },
  {
    name: 'python',
    sources: [
      'WinPython64-3.14.7.1dotb1/WPy64-31471',
      'WinPython64-3.14.7.1dotb1',
      'python',
    ],
    // The python.exe lives at the root of the python/ subtree we keep.
    pathDir: 'python',
    filter: keepWinPython,
  },
  {
    name: 'pandoc',
    sources: [
      'pandoc-3.11-windows-x86_64/pandoc-3.11',
      'pandoc-3.11-windows-x86_64',
      'pandoc',
    ],
    pathDir: '',
  },
  {
    name: 'sqlite',
    sources: [
      'sqlite-tools-win-x64-3530400',
      'sqlite-tools-win-x64',
      'sqlite',
    ],
    pathDir: '',
  },
  {
    name: 'lua',
    sources: [
      'lua-5.5.0_Win64_bin',
      'lua',
    ],
    pathDir: '',
  },
  {
    name: 'busybox',
    sources: [
      'busybox.exe',
    ],
    // Single-file tool: copy the file itself into the tool dir.
    pathDir: '',
  },
  {
    name: '7z',
    sources: [
      '7z2603-x64',
      '7z',
      '7zip',
    ],
    // `7z.exe` is the CLI; `7z.dll` must sit beside it for plugins to load.
    pathDir: '',
  },
]

function resolveSource(spec: ToolSpec): { path: string; isFile: boolean } | undefined {
  for (const candidate of spec.sources) {
    const full = join(DOWNLOAD_ROOT, candidate)
    if (!existsSync(full)) continue
    return { path: full, isFile: statSync(full).isFile() }
  }
  return undefined
}

function copyFiltered(
  source: string,
  dest: string,
  filter: ((relPath: string) => boolean) | undefined,
  isFile: boolean,
): void {
  if (isFile) {
    // Single-file tool (e.g. busybox.exe).  Copy into the tool dir with its original basename.
    cpSync(source, join(dest, source.split(/[/\\]/u).pop() ?? source))
    return
  }
  if (filter === undefined) {
    cpSync(source, dest, { recursive: true, errorOnExist: false })
    return
  }
  const entries = readdirSync(source, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    const parent = (entry as unknown as { parentPath: string }).parentPath
    const relPath = parent === source ? entry.name : parent.slice(source.length + 1) + '/' + entry.name
    if (!filter(relPath)) continue
    const src = join(source, relPath)
    const dst = join(dest, relPath)
    if (entry.isDirectory()) {
      mkdirSync(dst, { recursive: true })
    } else {
      cpSync(src, dst)
    }
  }
}

interface ManifestEntry {
  readonly name: string
  readonly pathDir: string
}

function main(): void {
  if (process.platform !== 'win32') {
    // Bundled tools are currently a Windows-only feature.
    console.log('prepare:tools — skipping on non-Windows platform')
    return
  }

  mkdirSync(TOOLS_ROOT, { recursive: true })

  const present: ManifestEntry[] = []

  for (const spec of TOOLS) {
    const resolved = resolveSource(spec)
    if (resolved === undefined) {
      console.log(`prepare:tools — ${spec.name}: not found in downloads/, skipping`)
      continue
    }

    const dest = join(TOOLS_ROOT, spec.name)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })

    copyFiltered(resolved.path, dest, spec.filter, resolved.isFile)

    // Verify the entry point actually exists after filtering.
    const entryPoint = join(dest, spec.pathDir)
    if (!existsSync(entryPoint)) {
      console.warn(`prepare:tools — ${spec.name}: entry point missing after copy (${relative(TOOLS_ROOT, entryPoint)})`)
      rmSync(dest, { recursive: true, force: true })
      continue
    }

    present.push({ name: spec.name, pathDir: spec.pathDir })
    console.log(`prepare:tools — ${spec.name}: staged (${relative(RUNTIME_ROOT, entryPoint)})`)
  }

  writeFileSync(
    join(TOOLS_ROOT, 'tools-manifest.json'),
    `${JSON.stringify({ tools: present }, undefined, 2)}\n`,
  )
  console.log(`prepare:tools — ${present.length} tool(s) staged`)
}

main()
