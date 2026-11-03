// SPDX-License-Identifier: BSD-3-Clause
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTokenStorage,
  type EnvStorageConfig,
  EnvTokenStorage,
  type ITokenStorage,
  type MemoryStorageConfig,
  MemoryTokenStorage,
  resolveSecretsBackend,
  type SecretsBackend,
  type SecureStorageConfig,
  SecureTokenStorage,
  TokenStorageError,
  TokenStorageType,
} from '@/auth/token-storage'

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

describe('EnvTokenStorage', () => {
  let tempDir: string
  let envPath: string
  let storage: EnvTokenStorage

  beforeEach(async () => {
    tempDir = join(tmpdir(), `kest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(tempDir, { recursive: true })
    envPath = join(tempDir, '.env')
    storage = new EnvTokenStorage(envPath, 'QUESTRADE_REFRESH_TOKEN')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('should return null when .env file does not exist', async () => {
    expect(await storage.get()).toBeNull()
  })

  test('should create .env file and store token', async () => {
    await storage.set('my-refresh-token')

    const retrieved = await storage.get()
    expect(retrieved).toBe('my-refresh-token')
  })

  test('should update existing token in .env file', async () => {
    await storage.set('first-token')
    await storage.set('second-token')

    expect(await storage.get()).toBe('second-token')
  })

  test('should preserve other env vars when updating token', async () => {
    await mkdir(tempDir, { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(
      envPath,
      'OTHER_VAR=hello\nQUESTRADE_REFRESH_TOKEN=old-token\nTHIRD_VAR=world\n',
    )

    await storage.set('new-token')

    const content = await Bun.file(envPath).text()
    expect(content).toContain('OTHER_VAR=hello')
    expect(content).toContain('THIRD_VAR=world')
    expect(content).toContain('QUESTRADE_REFRESH_TOKEN=new-token')
    expect(content).not.toContain('old-token')
  })

  test('should append token to .env file if var does not exist', async () => {
    await mkdir(tempDir, { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(envPath, 'EXISTING_VAR=value\n')

    await storage.set('appended-token')

    const content = await Bun.file(envPath).text()
    expect(content).toContain('EXISTING_VAR=value')
    expect(content).toContain('QUESTRADE_REFRESH_TOKEN=appended-token')
  })

  test('should delete token from .env file', async () => {
    await storage.set('my-refresh-token')
    await storage.delete()

    expect(await storage.get()).toBeNull()
  })

  test('should delete entire .env file when only token var remains', async () => {
    await storage.set('my-refresh-token')
    await storage.delete()

    expect(await Bun.file(envPath).exists()).toBe(false)
  })

  test('should preserve other vars when deleting token', async () => {
    await mkdir(tempDir, { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(envPath, 'OTHER_VAR=hello\nQUESTRADE_REFRESH_TOKEN=my-token\n')

    await storage.delete()

    const content = await Bun.file(envPath).text()
    expect(content).toContain('OTHER_VAR=hello')
    expect(content).not.toContain('QUESTRADE_REFRESH_TOKEN')
  })

  test('should handle delete when .env file does not exist', async () => {
    await storage.delete()
    expect(await Bun.file(envPath).exists()).toBe(false)
  })

  test('should support custom var name', async () => {
    const customStorage = new EnvTokenStorage(envPath, 'MY_CUSTOM_TOKEN')
    await customStorage.set('custom-value')

    expect(await customStorage.get()).toBe('custom-value')
  })

  test('should handle var names with regex metacharacters safely', async () => {
    const customStorage = new EnvTokenStorage(envPath, 'TOKEN.VAR+NAME')
    await customStorage.set('safe-value')

    expect(await customStorage.get()).toBe('safe-value')

    await customStorage.set('updated-value')
    expect(await customStorage.get()).toBe('updated-value')

    await customStorage.delete()
    expect(await customStorage.get()).toBeNull()
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

describe('resolveSecretsBackend', () => {
  test('should throw a descriptive error when the Bun runtime is absent', () => {
    expect(() => resolveSecretsBackend(undefined)).toThrow('requires the Bun runtime')
  })

  test('should throw a descriptive error when Bun.secrets is missing', () => {
    expect(() => resolveSecretsBackend({})).toThrow('requires the Bun runtime')
  })

  test('should return the secrets backend of the Bun runtime', () => {
    const { backend } = createFakeSecrets()
    expect(resolveSecretsBackend({ secrets: backend })).toBe(backend)
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

describe('createTokenStorage', () => {
  test('should create MemoryTokenStorage from string shorthand', () => {
    const storage = createTokenStorage('memory')
    expect(storage).toBeInstanceOf(MemoryTokenStorage)
  })

  test('should create EnvTokenStorage from string shorthand', () => {
    const storage = createTokenStorage('env')
    expect(storage).toBeInstanceOf(EnvTokenStorage)
  })

  test('should create SecureTokenStorage from string shorthand', () => {
    const storage = createTokenStorage('secure')
    expect(storage).toBeInstanceOf(SecureTokenStorage)
  })

  test('should default to EnvTokenStorage when no config provided', () => {
    const storage = createTokenStorage()
    expect(storage).toBeInstanceOf(EnvTokenStorage)
  })

  test('should create from TokenStorageType constants', () => {
    expect(createTokenStorage(TokenStorageType.MEMORY)).toBeInstanceOf(MemoryTokenStorage)
    expect(createTokenStorage(TokenStorageType.ENV)).toBeInstanceOf(EnvTokenStorage)
    expect(createTokenStorage(TokenStorageType.SECURE)).toBeInstanceOf(SecureTokenStorage)
  })

  test('should create from detailed config objects', () => {
    const memoryStorage = createTokenStorage({ type: 'memory' } as MemoryStorageConfig)
    expect(memoryStorage).toBeInstanceOf(MemoryTokenStorage)

    const envStorage = createTokenStorage({
      type: 'env',
      envPath: '.env.test',
      varName: 'TEST_TOKEN',
    } as EnvStorageConfig)
    expect(envStorage).toBeInstanceOf(EnvTokenStorage)

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
    {
      name: 'EnvTokenStorage',
      storage: new EnvTokenStorage(join(tmpdir(), `kest-iface-${Date.now()}`)),
    },
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
