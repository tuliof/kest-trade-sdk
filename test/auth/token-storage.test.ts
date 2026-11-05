// SPDX-License-Identifier: BSD-3-Clause
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AutoTokenStorage,
  createTokenStorage,
  FileTokenStorage,
  type ITokenStorage,
  isTokenStorageInstance,
  loadKeychainBackend,
  type MemoryStorageConfig,
  MemoryTokenStorage,
  type NodeKeyringModule,
  resolveDefaultTokenFilePath,
  resolveTokenStorageKind,
  type SecretsBackend,
  type SecureStorageConfig,
  SecureTokenStorage,
  TokenStorageError,
  TokenStorageType,
} from '@/auth/token-storage'
import { type Logger, SilentLogger } from '@/logger'

describe('MemoryTokenStorage', () => {
  let storage: MemoryTokenStorage

  beforeEach(() => {
    storage = new MemoryTokenStorage()
  })

  test('should return null when no token is stored', async () => {
    expect(await storage.get()).toBeNull()
  })

  test('should store and retrieve a token', async () => {
    await storage.set('my-refresh-token')
    expect(await storage.get()).toBe('my-refresh-token')
  })

  test('should overwrite previous token on set', async () => {
    await storage.set('first-token')
    await storage.set('second-token')
    expect(await storage.get()).toBe('second-token')
  })

  test('should delete stored token', async () => {
    await storage.set('my-refresh-token')
    await storage.delete()
    expect(await storage.get()).toBeNull()
  })

  test('should handle delete when no token is stored', async () => {
    await storage.delete()
    expect(await storage.get()).toBeNull()
  })
})

function createFakeSecrets() {
  const entries = new Map<string, string>()
  const keyOf = (options: { service: string; name: string }) => `${options.service}/${options.name}`
  const backend: SecretsBackend = {
    async get(options) {
      return entries.get(keyOf(options)) ?? null
    },
    async set(options) {
      entries.set(keyOf(options), options.value)
    },
    async delete(options) {
      return entries.delete(keyOf(options))
    },
  }
  return { backend, entries }
}

function createFakeNodeKeyring(): NodeKeyringModule {
  const { backend } = createFakeSecrets()
  class AsyncEntry {
    constructor(
      private readonly service: string,
      private readonly name: string,
    ) {}
    getPassword() {
      return backend.get({ service: this.service, name: this.name })
    }
    setPassword(value: string) {
      return backend.set({ service: this.service, name: this.name, value })
    }
    deletePassword() {
      return backend.delete({ service: this.service, name: this.name })
    }
  }
  return { AsyncEntry }
}

describe('loadKeychainBackend', () => {
  test('uses Bun.secrets when running under Bun', async () => {
    const { backend } = createFakeSecrets()
    const importNodeKeyring = async () => createFakeNodeKeyring()

    expect(await loadKeychainBackend({ bun: { secrets: backend }, importNodeKeyring })).toBe(
      backend,
    )
  })

  test('adapts @napi-rs/keyring when Bun.secrets is absent', async () => {
    const keychain = await loadKeychainBackend({
      importNodeKeyring: async () => createFakeNodeKeyring(),
    })

    await keychain.set({ service: 'svc', name: 'tok', value: 'node-token' })

    expect(await keychain.get({ service: 'svc', name: 'tok' })).toBe('node-token')
    expect(await keychain.delete({ service: 'svc', name: 'tok' })).toBe(true)
    expect(await keychain.get({ service: 'svc', name: 'tok' })).toBeNull()
  })

  test('explains how to install the keyring when it cannot be loaded', async () => {
    const importNodeKeyring = async (): Promise<NodeKeyringModule> => {
      throw new Error('Cannot find module')
    }

    await expect(loadKeychainBackend({ importNodeKeyring })).rejects.toThrow(
      'npm install @napi-rs/keyring',
    )
  })
})

describe('SecureTokenStorage', () => {
  test('should store and retrieve a token through Bun.secrets-style backend', async () => {
    const { backend, entries } = createFakeSecrets()
    const storage = new SecureTokenStorage('tok', 'svc', undefined, backend)

    await storage.set('my-token')

    expect(entries.get('svc/tok')).toBe('my-token')
    expect(await storage.get()).toBe('my-token')
  })

  test('should return null on get when no token is stored', async () => {
    const { backend } = createFakeSecrets()
    const storage = new SecureTokenStorage(undefined, undefined, undefined, backend)
    expect(await storage.get()).toBeNull()
  })

  test('should throw on get when the backend fails instead of reporting not found', async () => {
    const { backend } = createFakeSecrets()
    backend.get = async () => {
      throw new Error('keychain locked')
    }
    const storage = new SecureTokenStorage(undefined, undefined, undefined, backend)

    await expect(storage.get()).rejects.toThrow('keychain locked')
  })

  test('should remove the keychain entry on delete instead of blanking it', async () => {
    const { backend, entries } = createFakeSecrets()
    const storage = new SecureTokenStorage('tok', 'svc', undefined, backend)
    await storage.set('my-token')

    await storage.delete()

    expect(entries.has('svc/tok')).toBe(false)
    expect(await storage.get()).toBeNull()
  })

  test('should wrap backend set failures in TokenStorageError carrying the token', async () => {
    const { backend } = createFakeSecrets()
    backend.set = async () => {
      throw new Error('keychain locked')
    }
    const storage = new SecureTokenStorage(undefined, undefined, undefined, backend)

    try {
      await storage.set('secret-refresh-token')
      expect.unreachable('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(TokenStorageError)
      expect((error as TokenStorageError).refreshToken).toBe('secret-refresh-token')
      expect((error as TokenStorageError).cause).toBeInstanceOf(Error)
    }
  })

  test('should propagate backend delete failures', async () => {
    const { backend } = createFakeSecrets()
    backend.delete = async () => {
      throw new Error('keychain locked')
    }
    const storage = new SecureTokenStorage(undefined, undefined, undefined, backend)
    await expect(storage.delete()).rejects.toThrow('keychain locked')
  })
})

describe('SecureTokenStorage.probe', () => {
  test('reports a working keychain as usable and leaves no sentinel behind', async () => {
    const { backend, entries } = createFakeSecrets()
    const storage = new SecureTokenStorage('tok', 'svc', undefined, backend)

    expect(await storage.probe()).toEqual({ usable: true })
    expect(entries.size).toBe(0)
  })

  test('reports the reason when the keychain fails', async () => {
    const { backend } = createFakeSecrets()
    backend.set = async () => {
      throw new Error('libsecret not available')
    }
    const storage = new SecureTokenStorage(undefined, undefined, undefined, backend)

    expect(await storage.probe()).toEqual({ usable: false, reason: 'libsecret not available' })
  })
})

describe('resolveDefaultTokenFilePath', () => {
  test('uses XDG_CONFIG_HOME on Linux when set', () => {
    expect(resolveDefaultTokenFilePath('linux', { XDG_CONFIG_HOME: '/xdg' }, '/home/u')).toBe(
      '/xdg/kest-trade-sdk/refresh-token',
    )
  })

  test('defaults to ~/.config on Linux', () => {
    expect(resolveDefaultTokenFilePath('linux', {}, '/home/u')).toBe(
      '/home/u/.config/kest-trade-sdk/refresh-token',
    )
  })

  test('uses Application Support on macOS', () => {
    expect(resolveDefaultTokenFilePath('darwin', {}, '/Users/u')).toBe(
      '/Users/u/Library/Application Support/kest-trade-sdk/refresh-token',
    )
  })

  test('uses APPDATA on Windows', () => {
    expect(
      resolveDefaultTokenFilePath(
        'win32',
        { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
        'C:\\Users\\u',
      ),
    ).toBe('C:\\Users\\u\\AppData\\Roaming\\kest-trade-sdk\\refresh-token')
  })

  test('fails loud on Windows without APPDATA', () => {
    expect(() => resolveDefaultTokenFilePath('win32', {}, 'C:\\Users\\u')).toThrow('APPDATA')
  })
})

describe('FileTokenStorage', () => {
  let directory: string
  let filePath: string

  beforeEach(() => {
    directory = join(tmpdir(), `kest-file-storage-${Date.now()}-${Math.random()}`)
    filePath = join(directory, 'nested', 'refresh-token')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('returns null when the file does not exist', async () => {
    expect(await new FileTokenStorage(filePath).get()).toBeNull()
  })

  test('creates a user-only directory and file on set', async () => {
    const storage = new FileTokenStorage(filePath)

    await storage.set('file-token')

    expect(await storage.get()).toBe('file-token')
    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
    expect((await stat(join(directory, 'nested'))).mode & 0o777).toBe(0o700)
  })

  test('overwrites the previous token', async () => {
    const storage = new FileTokenStorage(filePath)
    await storage.set('first')

    await storage.set('second')

    expect(await readFile(filePath, 'utf8')).toBe('second\n')
  })

  test('delete removes the file and tolerates a missing one', async () => {
    const storage = new FileTokenStorage(filePath)
    await storage.set('file-token')

    await storage.delete()
    await storage.delete()

    expect(await storage.get()).toBeNull()
  })

  test('wraps write failures in TokenStorageError carrying the token', async () => {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'nested'), 'not a directory')
    const storage = new FileTokenStorage(filePath)

    const error = await storage.set('lost-token').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TokenStorageError)
    expect((error as TokenStorageError).refreshToken).toBe('lost-token')
  })
})

describe('AutoTokenStorage', () => {
  let directory: string

  beforeEach(() => {
    directory = join(tmpdir(), `kest-auto-storage-${Date.now()}-${Math.random()}`)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('uses the keychain when the probe succeeds', async () => {
    const { backend, entries } = createFakeSecrets()
    const storage = new AutoTokenStorage(
      new SecureTokenStorage('tok', 'svc', undefined, backend),
      new FileTokenStorage(join(directory, 'refresh-token')),
      new SilentLogger(),
    )

    await storage.set('keychain-token')

    expect(await storage.resolveBackendKind()).toBe('secure')
    expect(entries.get('svc/tok')).toBe('keychain-token')
  })

  test('falls back to the user-only file and warns when the keychain is unusable', async () => {
    const { backend } = createFakeSecrets()
    backend.set = async () => {
      throw new Error('libsecret not available')
    }
    const warnings: unknown[] = []
    const logger: Logger = {
      debug() {},
      info() {},
      warn: (message, context) => {
        warnings.push([message, context])
      },
      error() {},
    }
    const filePath = join(directory, 'refresh-token')
    const storage = new AutoTokenStorage(
      new SecureTokenStorage('tok', 'svc', undefined, backend),
      new FileTokenStorage(filePath),
      logger,
    )

    await storage.set('file-token')

    expect(await storage.resolveBackendKind()).toBe('file')
    expect(await readFile(filePath, 'utf8')).toBe('file-token\n')
    expect(JSON.stringify(warnings)).toContain('libsecret not available')
  })

  test('probes the keychain only once', async () => {
    const { backend } = createFakeSecrets()
    let probes = 0
    const originalSet = backend.set
    backend.set = async (options) => {
      if (options.name.endsWith('.probe')) probes++
      return originalSet(options)
    }
    const storage = new AutoTokenStorage(
      new SecureTokenStorage('tok', 'svc', undefined, backend),
      new FileTokenStorage(join(directory, 'refresh-token')),
      new SilentLogger(),
    )

    await storage.set('a')
    await storage.get()
    await storage.resolveBackendKind()

    expect(probes).toBe(1)
  })
})

describe('isTokenStorageInstance', () => {
  test('recognizes objects implementing get, set and delete', () => {
    expect(isTokenStorageInstance(new MemoryTokenStorage())).toBe(true)
    expect(
      isTokenStorageInstance({
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      }),
    ).toBe(true)
  })

  test('rejects storage configs and other values', () => {
    expect(isTokenStorageInstance('auto')).toBe(false)
    expect(isTokenStorageInstance({ type: 'file' })).toBe(false)
    expect(isTokenStorageInstance(null)).toBe(false)
  })
})

describe('resolveTokenStorageKind', () => {
  test('describes each built-in storage and custom ones', async () => {
    expect(await resolveTokenStorageKind(new MemoryTokenStorage())).toBe('memory')
    expect(await resolveTokenStorageKind(new FileTokenStorage('/tmp/x'))).toBe('file')
    expect(await resolveTokenStorageKind(new SecureTokenStorage())).toBe('secure')
    expect(
      await resolveTokenStorageKind({
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      }),
    ).toBe('custom')
  })
})

describe('createTokenStorage', () => {
  test('should create MemoryTokenStorage from string shorthand', () => {
    const storage = createTokenStorage('memory')
    expect(storage).toBeInstanceOf(MemoryTokenStorage)
  })

  test('should create SecureTokenStorage from string shorthand', () => {
    const storage = createTokenStorage('secure')
    expect(storage).toBeInstanceOf(SecureTokenStorage)
  })

  test('should default to AutoTokenStorage when no config provided', () => {
    expect(createTokenStorage()).toBeInstanceOf(AutoTokenStorage)
  })

  test('should create file and auto storages from shorthand and config objects', () => {
    expect(createTokenStorage('file')).toBeInstanceOf(FileTokenStorage)
    expect(createTokenStorage({ type: 'file', filePath: '/tmp/x' })).toBeInstanceOf(
      FileTokenStorage,
    )
    expect(createTokenStorage('auto')).toBeInstanceOf(AutoTokenStorage)
    expect(createTokenStorage({ type: 'auto', service: 'svc' })).toBeInstanceOf(AutoTokenStorage)
  })

  test('should create from TokenStorageType constants', () => {
    expect(createTokenStorage(TokenStorageType.MEMORY)).toBeInstanceOf(MemoryTokenStorage)
    expect(createTokenStorage(TokenStorageType.SECURE)).toBeInstanceOf(SecureTokenStorage)
  })

  test('should create from detailed config objects', () => {
    const memoryStorage = createTokenStorage({ type: 'memory' } as MemoryStorageConfig)
    expect(memoryStorage).toBeInstanceOf(MemoryTokenStorage)

    const secureStorage = createTokenStorage({
      type: 'secure',
      name: 'test',
    } as SecureStorageConfig)
    expect(secureStorage).toBeInstanceOf(SecureTokenStorage)
  })

  test('should throw on unknown string type', () => {
    expect(() => createTokenStorage('unknown' as never)).toThrow('Unknown token storage type')
  })

  test('should throw on unknown config type', () => {
    expect(() => createTokenStorage({ type: 'invalid' } as never)).toThrow(
      'Unknown token storage type',
    )
  })
})

describe('TokenStorageError', () => {
  test('should be an instance of Error', () => {
    const error = new TokenStorageError('test message', 'my-token')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('test message')
  })

  test('should carry the refresh token', () => {
    const error = new TokenStorageError('storage failed', 'secret-token')
    expect(error.refreshToken).toBe('secret-token')
  })

  test('should have refreshToken as non-enumerable', () => {
    const error = new TokenStorageError('storage failed', 'secret-token')
    expect(Object.keys(error)).not.toContain('refreshToken')
    expect(JSON.stringify(error)).not.toContain('secret-token')
  })

  test('should have name set to TokenStorageError', () => {
    const error = new TokenStorageError('test', 'token')
    expect(error.name).toBe('TokenStorageError')
  })

  test('should support cause option', () => {
    const cause = new Error('root cause')
    const error = new TokenStorageError('wrapper', 'token', { cause })
    expect(error.cause).toBe(cause)
  })

  test('should have readonly refreshToken', () => {
    const error = new TokenStorageError('test', 'token')
    expect(() => {
      // @ts-expect-error - refreshToken is readonly
      error.refreshToken = 'new-value'
    }).toThrow()
  })
})

describe('ITokenStorage interface compliance', () => {
  const storages: Array<{ name: string; storage: ITokenStorage }> = [
    { name: 'MemoryTokenStorage', storage: new MemoryTokenStorage() },
  ]

  for (const { name, storage } of storages) {
    test(`${name}: should implement get, set, delete`, async () => {
      expect(await storage.get()).toBeNull()

      await storage.set('interface-test-token')
      expect(await storage.get()).toBe('interface-test-token')

      await storage.delete()
      expect(await storage.get()).toBeNull()
    })
  }
})
