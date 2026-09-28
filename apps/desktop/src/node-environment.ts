/** Electron Node-mode startup, with private shell launchers scoped to package installation. */

import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

interface BundledToolManifest {
  readonly tools: readonly { readonly name: string; readonly pathDirs: readonly string[] }[]
}

/**
 * Read bundled developer tool PATH entries from a runtime tools manifest.
 *
 * Tools are staged into `runtime/tools/<name>/` at build time when their
 * download archives are available. The manifest lists each tool's PATH
 * directories relative to its folder; an empty string means the tool root
 * itself goes on PATH. Missing or corrupt manifests yield no entries rather
 * than aborting startup.
 *
 * @param runtimeRoot - Runtime resources directory containing `tools/`.
 * @returns Absolute PATH entries for bundled tools, in manifest order.
 */
export function resolveBundledToolPathEntries(runtimeRoot: string): readonly string[] {
  const entries: string[] = []
  const manifestPath = join(runtimeRoot, 'tools', 'tools-manifest.json')
  if (!existsSync(manifestPath)) return entries
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BundledToolManifest
    for (const tool of manifest.tools) {
      for (const dir of tool.pathDirs) {
        entries.push(dir === '' ? join(runtimeRoot, 'tools', tool.name) : join(runtimeRoot, 'tools', tool.name, dir))
      }
    }
  } catch {
    // Corrupt or unreadable manifest — skip tool PATH injection rather than aborting.
  }
  return entries
}

/**
 * Select Electron's Node mode and the shell launcher used by package scripts.
 * @param executable - Electron executable running the application.
 * @param bin - Directory containing the node shell launcher.
 * @param environment - Caller environment preserved for plugin execution.
 * @param extraPathDirs - Additional directories to prepend to PATH before `bin`.
 * @returns Environment for a Node-mode child process.
 */
export function desktopNodeEnvironment(
  executable: string,
  bin: string | undefined,
  environment: NodeJS.ProcessEnv,
  extraPathDirs: readonly string[] = [],
): NodeJS.ProcessEnv {
  const prefix = extraPathDirs.length > 0 ? `${extraPathDirs.join(delimiter)}${delimiter}` : ''
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    ...(bin === undefined
      ? extraPathDirs.length > 0 ? { PATH: `${prefix}${environment.PATH ?? ''}` } : {}
      : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${prefix}${bin}${delimiter}${environment.PATH ?? ''}` }),
  }
}
