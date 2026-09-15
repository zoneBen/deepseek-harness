import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PORTABLE_MARKER, applyPortableLayout, type PortableApplication } from '../src/portable.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Create an extraction root holding an executable and, optionally, the portable marker. */
function portableRoot(marker = true): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-portable-'))
  roots.push(root)
  writeFileSync(executableIn(root), '')
  if (marker) writeFileSync(join(root, PORTABLE_MARKER), '')
  return root
}

function executableIn(root: string): string {
  return join(root, 'DeepSeek Harness.exe')
}

function application(isPackaged: boolean): {
  application: PortableApplication
  setPath: ReturnType<typeof vi.fn>
} {
  const setPath = vi.fn()
  return { application: { isPackaged, setPath } satisfies PortableApplication, setPath }
}

describe('desktop portable layout', () => {
  it('leaves an installed application on the user profile without the marker', () => {
    const root = portableRoot(false)
    const { application: packaged, setPath } = application(true)
    const environment: NodeJS.ProcessEnv = {}

    expect(applyPortableLayout(packaged, executableIn(root), environment)).toEqual({ portable: false })
    expect(setPath).not.toHaveBeenCalled()
    expect(environment).toEqual({})
    expect(existsSync(join(root, 'data'))).toBe(false)
  })

  it('leaves an unpackaged application alone even with the marker', () => {
    const root = portableRoot()
    const { application: unpackaged, setPath } = application(false)
    const environment: NodeJS.ProcessEnv = {}

    expect(applyPortableLayout(unpackaged, executableIn(root), environment)).toEqual({ portable: false })
    expect(setPath).not.toHaveBeenCalled()
    expect(environment).toEqual({})
    expect(existsSync(join(root, 'data'))).toBe(false)
  })

  it('moves every writable root beside the executable', () => {
    const root = portableRoot()
    const { application: packaged, setPath } = application(true)
    const environment: NodeJS.ProcessEnv = {}
    const data = join(root, 'data')

    expect(applyPortableLayout(packaged, executableIn(root), environment)).toEqual({
      portable: true,
      root,
      home: join(data, 'home'),
    })
    expect(environment.DSH_HOME).toBe(join(data, 'home'))
    expect(setPath.mock.calls).toEqual([
      ['userData', join(data, 'electron-data')],
      ['cache', join(data, 'electron-cache')],
    ])
    for (const name of ['home', 'electron-data', 'electron-cache']) {
      expect(existsSync(join(data, name))).toBe(true)
    }
  })

  it('honours an explicit Harness home while still relocating the browser profile', () => {
    const root = portableRoot()
    const shared = join(root, 'shared-home')
    const { application: packaged, setPath } = application(true)
    const environment: NodeJS.ProcessEnv = { DSH_HOME: shared }

    expect(applyPortableLayout(packaged, executableIn(root), environment).home).toBe(shared)
    expect(environment.DSH_HOME).toBe(shared)
    expect(setPath).toHaveBeenCalledWith('userData', join(root, 'data', 'electron-data'))
  })

  it('treats a blank Harness home as unset', () => {
    const root = portableRoot()
    const { application: packaged } = application(true)
    const environment: NodeJS.ProcessEnv = { DSH_HOME: '   ' }

    expect(applyPortableLayout(packaged, executableIn(root), environment).home)
      .toBe(join(root, 'data', 'home'))
    expect(environment.DSH_HOME).toBe(join(root, 'data', 'home'))
  })

  it('fails before relocating anything inside a data path it cannot create', () => {
    const root = portableRoot()
    writeFileSync(join(root, 'data'), '')
    const { application: packaged, setPath } = application(true)
    const environment: NodeJS.ProcessEnv = {}

    expect(() => applyPortableLayout(packaged, executableIn(root), environment)).toThrow()
    expect(setPath).not.toHaveBeenCalled()
    expect(environment).toEqual({})
  })
})
