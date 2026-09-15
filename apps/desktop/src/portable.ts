/** Portable ("green") layout: keep every writable root beside the executable. */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Marker file beside the executable that opts a packaged application into the portable layout. */
export const PORTABLE_MARKER = 'portable.txt'

/** Minimal Electron application operations needed to relocate writable roots. */
export interface PortableApplication {
  readonly isPackaged: boolean
  setPath(name: 'userData' | 'cache', path: string): void
}

/** Resolved portable roots for the current process. */
export interface PortableLayout {
  /** Whether the marker selected the portable layout. */
  readonly portable: boolean
  /** The directory holding the executable and the marker, when portable. */
  readonly root?: string
  /** The Harness home the process now uses, when portable. */
  readonly home?: string
}

/**
 * Relocate the Harness home, the Electron browser profile, and the Electron cache
 * into `<executable directory>/data/` when the portable marker sits beside the
 * executable.
 *
 * Call this before `app.whenReady()`, before the single-instance lock, and before
 * any dsh module resolves the Harness home: the Chromium profile location and the
 * `DSH_HOME` override are both read once and then latched. Electron rejects a
 * `setPath` target that does not exist, so the directories are created first; a
 * read-only location therefore fails here rather than silently writing to the
 * user's home.
 *
 * An explicitly set `DSH_HOME` is an intentional override and wins, matching
 * `resolveDshHome`'s precedence; the returned `home` then reports that override
 * rather than the sibling directory.
 *
 * @param application - Electron application singleton.
 * @param executable - executable path whose directory is the portable root.
 * @param environment - environment mutated with the `DSH_HOME` override.
 * @returns the resolved layout; `portable: false` when the marker is absent.
 * @throws when a packaged portable application cannot create its data directory.
 */
export function applyPortableLayout(
  application: PortableApplication,
  executable: string = process.execPath,
  environment: NodeJS.ProcessEnv = process.env,
): PortableLayout {
  if (!application.isPackaged) return { portable: false }
  const root = dirname(executable)
  if (!existsSync(join(root, PORTABLE_MARKER))) return { portable: false }
  const data = join(root, 'data')
  const home = join(data, 'home')
  const userData = join(data, 'electron-data')
  const cache = join(data, 'electron-cache')
  for (const path of [home, userData, cache]) mkdirSync(path, { recursive: true })
  const configured = environment.DSH_HOME ?? ''
  const effectiveHome = configured.trim() === '' ? home : configured
  if (effectiveHome === home) environment.DSH_HOME = home
  application.setPath('userData', userData)
  application.setPath('cache', cache)
  return { portable: true, root, home: effectiveHome }
}
