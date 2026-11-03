// SPDX-License-Identifier: BSD-3-Clause
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, posix, resolve, win32 } from 'node:path'
import { type Logger, SilentLogger } from '@/logger'

/**
 * Token storage abstraction for managing Questrade refresh tokens
 * Supports multiple backends: OS keychain (Bun.secrets), .env file, memory, and custom
 */

/**
 * Token storage type constants
 */
export const TokenStorageType = {
  /**
   * Store tokens securely using OS-native credential storage
   * - macOS: Keychain
   * - Windows: Credential Manager
   * - Linux: Secret Service API
   */
  SECURE: 'secure',

  /**
   * Store tokens in a .env file (plaintext, in the project directory by default)
   */
  ENV: 'env',

  /**
   * Store tokens in memory only (not persistent, useful for testing)
   */
  MEMORY: 'memory',

  /**
   * Store tokens in a user-only file (0600) in the per-user config directory
   */
  FILE: 'file',

  /**
   * Default. Use the OS keychain when it is usable, otherwise a user-only file
   * in the per-user config directory. The resolved backend is logged and observable.
   */
  AUTO: 'auto',
} as const

/**
 * Interface for token storage implementations
 */
export interface ITokenStorage {
  /**
   * Retrieve the stored refresh token
   * @returns The refresh token, or null only when none is stored
   * @throws Error when the backing store cannot be read (permissions, keychain failure)
   */
  get(): Promise<string | null>

  /**
   * Store a refresh token
   * @param refreshToken The token to store
   */
  set(refreshToken: string): Promise<void>

  /**
   * Delete the stored refresh token
   */
  delete(): Promise<void>
}

/**
 * Error thrown when token storage fails after a token has been rotated.
 * The new refresh token is attached as a non-enumerable property so it
 * does not appear in default log serialization but can be recovered
 * programmatically via `error.refreshToken`.
 */
export class TokenStorageError extends Error {
  /** The refresh token that could not be stored (non-enumerable) */
  declare readonly refreshToken: string

  constructor(message: string, refreshToken: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TokenStorageError'
    Object.defineProperty(this, 'refreshToken', {
      value: refreshToken,
      enumerable: false,
      writable: false,
      configurable: false,
    })
  }
}

export interface StorageConfig {
  type: 'secure' | 'env' | 'memory' | 'file' | 'auto'
}

/**
 * Configuration for secure storage using Bun.secrets
 * Uses OS-native credential storage (Keychain, Credential Manager, Secret Service)
 */
export interface SecureStorageConfig extends StorageConfig {
  type: 'secure'
  /**
   * Credential name in the OS keychain
   * @default 'refresh-token'
   */
  name?: string
  /**
   * Service name for OS keychain isolation (multi-account/multi-environment)
   * @default 'kest-trade-sdk'
   */
  service?: string
}

/**
 * Configuration for .env file storage
 */
export interface EnvStorageConfig extends StorageConfig {
  type: 'env'
  /**
   * Path to .env file
   * @default '.env'
   */
  envPath?: string
  /**
   * Environment variable name
   * @default 'QUESTRADE_REFRESH_TOKEN'
   */
  varName?: string
}

/**
 * Configuration for in-memory storage (not persistent)
 */
export interface MemoryStorageConfig extends StorageConfig {
  type: 'memory'
}

/**
 * Configuration for user-only file storage
 */
export interface FileStorageConfig extends StorageConfig {
  type: 'file'
  /**
   * Path to the token file
   * @default per-user config directory, see resolveDefaultTokenFilePath()
   */
  filePath?: string
}

/**
 * Configuration for automatic storage selection (OS keychain, else user-only file)
 */
export interface AutoStorageConfig extends StorageConfig {
  type: 'auto'
  /** Credential name in the OS keychain @default 'refresh-token' */
  name?: string
  /** Service name in the OS keychain @default 'kest-trade-sdk' */
  service?: string
  /** Token file used when the OS keychain is unusable @default resolveDefaultTokenFilePath() */
  filePath?: string
}

/**
 * Token storage type value union: 'secure' | 'env' | 'memory' | 'file' | 'auto'
 */
export type TokenStorageTypeValue = (typeof TokenStorageType)[keyof typeof TokenStorageType]

/**
 * Token storage configuration - can be a string shorthand or detailed config
 */
export type TokenStorageConfig =
  | TokenStorageTypeValue
  | SecureStorageConfig
  | EnvStorageConfig
  | MemoryStorageConfig
  | FileStorageConfig
  | AutoStorageConfig

/**
 * Whether a value is a ready-made ITokenStorage rather than a storage config
 */
export function isTokenStorageInstance(value: unknown): value is ITokenStorage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Record<keyof ITokenStorage, unknown>>
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.set === 'function' &&
    typeof candidate.delete === 'function'
  )
}

export type TokenStorageKind = AutoStorageBackendKind | 'env' | 'memory' | 'custom'

/**
 * Describe where a storage keeps the token; resolves the backend of AutoTokenStorage.
 */
export async function resolveTokenStorageKind(storage: ITokenStorage): Promise<TokenStorageKind> {
  if (storage instanceof AutoTokenStorage) return storage.resolveBackendKind()
  if (storage instanceof SecureTokenStorage) return 'secure'
  if (storage instanceof FileTokenStorage) return 'file'
  if (storage instanceof EnvTokenStorage) return 'env'
  if (storage instanceof MemoryTokenStorage) return 'memory'
  return 'custom'
}

/**
 * Create a token storage instance based on configuration
 * @param config - Storage configuration (string shorthand or detailed config); defaults to 'auto'
 * @param logger - Logger for storage operations (default: silent)
 */
export function createTokenStorage(
  config?: TokenStorageConfig,
  logger: Logger = new SilentLogger(),
): ITokenStorage {
  const storageConfig = config ?? 'auto'

  // Handle string shorthand
  if (typeof storageConfig === 'string') {
    switch (storageConfig) {
      case 'secure':
        return new SecureTokenStorage(undefined, undefined, logger)
      case 'env':
        return new EnvTokenStorage(undefined, undefined, logger)
      case 'memory':
        return new MemoryTokenStorage(logger)
      case 'file':
        return new FileTokenStorage(undefined, logger)
      case 'auto':
        return createAutoTokenStorage({ type: 'auto' }, logger)
      default:
        throw new Error(`Unknown token storage type: ${JSON.stringify(storageConfig)}`)
    }
  }

  // Handle detailed config objects
  switch (storageConfig.type) {
    case 'secure':
      return new SecureTokenStorage(storageConfig.name, storageConfig.service, logger)
    case 'env':
      return new EnvTokenStorage(storageConfig.envPath, storageConfig.varName, logger)
    case 'memory':
      return new MemoryTokenStorage(logger)
    case 'file':
      return new FileTokenStorage(storageConfig.filePath, logger)
    case 'auto':
      return createAutoTokenStorage(storageConfig, logger)
    default:
      throw new Error(`Unknown token storage type: ${JSON.stringify(storageConfig)}`)
  }
}

function createAutoTokenStorage(config: AutoStorageConfig, logger: Logger): AutoTokenStorage {
  return new AutoTokenStorage(
    new SecureTokenStorage(config.name, config.service, logger),
    new FileTokenStorage(config.filePath, logger),
    logger,
  )
}

/**
 * Minimal keychain contract used by SecureTokenStorage (shaped after Bun.secrets).
 * Declared locally so the published typings do not depend on Bun's globals.
 */
export interface SecretsBackend {
  get(options: { service: string; name: string }): Promise<string | null>
  set(options: { service: string; name: string; value: string }): Promise<void>
  delete(options: { service: string; name: string }): Promise<boolean>
}

/**
 * Subset of the @napi-rs/keyring module used on Node.js
 */
export interface NodeKeyringModule {
  AsyncEntry: new (
    service: string,
    username: string,
  ) => {
    getPassword(): Promise<string | null | undefined>
    setPassword(password: string): Promise<void>
    deletePassword(): Promise<boolean>
  }
}

/**
 * Where the keychain backend comes from: Bun.secrets under Bun, the optional
 * @napi-rs/keyring dependency under Node.js.
 */
export interface KeychainRuntime {
  bun?: { secrets?: SecretsBackend }
  importNodeKeyring: () => Promise<NodeKeyringModule>
}

function detectKeychainRuntime(): KeychainRuntime {
  return {
    bun: (globalThis as { Bun?: { secrets?: SecretsBackend } }).Bun,
    importNodeKeyring: () => import('@napi-rs/keyring') as Promise<NodeKeyringModule>,
  }
}

function adaptNodeKeyring(keyring: NodeKeyringModule): SecretsBackend {
  return {
    async get({ service, name }) {
      return (await new keyring.AsyncEntry(service, name).getPassword()) ?? null
    },
    async set({ service, name, value }) {
      await new keyring.AsyncEntry(service, name).setPassword(value)
    },
    async delete({ service, name }) {
      return new keyring.AsyncEntry(service, name).deletePassword()
    },
  }
}

/**
 * Load the OS keychain backend for the current runtime.
 * @throws Error if neither Bun.secrets nor @napi-rs/keyring is available
 */
export async function loadKeychainBackend(
  runtime: KeychainRuntime = detectKeychainRuntime(),
): Promise<SecretsBackend> {
  const bunSecrets = runtime.bun?.secrets
  if (bunSecrets) return bunSecrets

  try {
    return adaptNodeKeyring(await runtime.importNodeKeyring())
  } catch (error) {
    throw new Error(
      'OS keychain access on Node.js requires the optional dependency @napi-rs/keyring, which could not be loaded. Install it (npm install @napi-rs/keyring), run under Bun, or use tokenStorage "file", "env" or "memory".',
      { cause: error },
    )
  }
}

export type KeychainProbeResult = { usable: true } | { usable: false; reason: string }

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Secure token storage in the OS keychain
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API (needs libsecret and a running, unlocked keyring)
 *
 * Uses Bun.secrets under Bun and the optional @napi-rs/keyring dependency under Node.js.
 * Every operation throws a descriptive error when no keychain backend is available.
 */
export class SecureTokenStorage implements ITokenStorage {
  private readonly service: string
  private readonly name: string
  private readonly logger: Logger
  private readonly injectedSecrets?: SecretsBackend
  private backend?: Promise<SecretsBackend>

  /**
   * @param secrets - Keychain backend override (defaults to the runtime's keychain); mainly for tests
   */
  constructor(
    name: string = 'refresh-token',
    service: string = 'kest-trade-sdk',
    logger: Logger = new SilentLogger(),
    secrets?: SecretsBackend,
  ) {
    this.name = name
    this.service = service
    this.logger = logger
    this.injectedSecrets = secrets
  }

  private loadBackend(): Promise<SecretsBackend> {
    this.backend ??= this.injectedSecrets
      ? Promise.resolve(this.injectedSecrets)
      : loadKeychainBackend()
    return this.backend
  }

  /**
   * Check that the keychain really works by writing, reading back and deleting
   * a sentinel entry. Never throws.
   */
  async probe(): Promise<KeychainProbeResult> {
    const sentinel = { service: this.service, name: `${this.name}.probe` }
    try {
      const backend = await this.loadBackend()
      await backend.set({ ...sentinel, value: 'probe' })
      const readBack = await backend.get(sentinel)
      await backend.delete(sentinel)
      if (readBack !== 'probe') {
        return { usable: false, reason: 'the keychain did not return the value written to it' }
      }
      return { usable: true }
    } catch (error) {
      return { usable: false, reason: describeError(error) }
    }
  }

  async get(): Promise<string | null> {
    try {
      const backend = await this.loadBackend()
      const token = await backend.get({ service: this.service, name: this.name })
      return token || null
    } catch (error) {
      this.logger.error('Failed to retrieve token from secure storage', {
        error: describeError(error),
      })
      throw new Error(
        `Failed to read token from secure storage (service "${this.service}", name "${this.name}"): ${describeError(error)}. Check that the OS keychain is available and unlocked.`,
        { cause: error },
      )
    }
  }

  async set(refreshToken: string): Promise<void> {
    try {
      const backend = await this.loadBackend()
      await backend.set({ service: this.service, name: this.name, value: refreshToken })
      this.logger.info('Token stored in OS keychain')
    } catch (error) {
      throw new TokenStorageError(
        `Failed to store token in secure storage: ${describeError(error)}`,
        refreshToken,
        { cause: error },
      )
    }
  }

  async delete(): Promise<void> {
    try {
      const backend = await this.loadBackend()
      await backend.delete({ service: this.service, name: this.name })
      this.logger.info('Token deleted from secure storage')
    } catch (error) {
      this.logger.error('Failed to delete token from secure storage', {
        error: describeError(error),
      })
      throw error
    }
  }
}

async function writeFileAtomically(fullPath: string, content: string): Promise<void> {
  const tempPath = join(
    dirname(fullPath),
    `.${basename(fullPath)}.${randomBytes(6).toString('hex')}.tmp`,
  )
  try {
    await writeFile(tempPath, content, { mode: 0o600 })
    await rename(tempPath, fullPath)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

async function readFileIfPresent(fullPath: string): Promise<string | null> {
  try {
    return await readFile(fullPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const SDK_CONFIG_DIRECTORY_NAME = 'kest-trade-sdk'
const TOKEN_FILE_NAME = 'refresh-token'

/**
 * Per-user location of the token file, following each platform's convention:
 * - Linux and other Unix: $XDG_CONFIG_HOME/kest-trade-sdk/refresh-token (default ~/.config)
 * - macOS: ~/Library/Application Support/kest-trade-sdk/refresh-token
 * - Windows: %APPDATA%\kest-trade-sdk\refresh-token
 *
 * @throws Error on Windows when APPDATA is not set
 */
export function resolveDefaultTokenFilePath(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  homeDirectory: string = homedir(),
): string {
  switch (platform) {
    case 'win32': {
      if (!env.APPDATA) {
        throw new Error(
          'Cannot locate the token file: APPDATA is not set. Pass filePath explicitly.',
        )
      }
      return win32.join(env.APPDATA, SDK_CONFIG_DIRECTORY_NAME, TOKEN_FILE_NAME)
    }
    case 'darwin':
      return posix.join(
        homeDirectory,
        'Library',
        'Application Support',
        SDK_CONFIG_DIRECTORY_NAME,
        TOKEN_FILE_NAME,
      )
    default: {
      const configHome = env.XDG_CONFIG_HOME || posix.join(homeDirectory, '.config')
      return posix.join(configHome, SDK_CONFIG_DIRECTORY_NAME, TOKEN_FILE_NAME)
    }
  }
}

/**
 * Token storage in a user-only file (directory 0700, file 0600, atomic writes),
 * by default in the per-user config directory rather than the project.
 * Same model as the gh, aws and gcloud CLIs when no keychain is available.
 */
export class FileTokenStorage implements ITokenStorage {
  readonly filePath: string
  private readonly logger: Logger

  constructor(filePath?: string, logger: Logger = new SilentLogger()) {
    this.filePath = resolve(filePath ?? resolveDefaultTokenFilePath())
    this.logger = logger
  }

  async get(): Promise<string | null> {
    try {
      const content = await readFileIfPresent(this.filePath)
      return content?.trim() || null
    } catch (error) {
      throw new Error(
        `Failed to read token from ${this.filePath}: ${describeError(error)}. Check that the file is readable by the current user.`,
        { cause: error },
      )
    }
  }

  async set(refreshToken: string): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
      await writeFileAtomically(this.filePath, `${refreshToken}\n`)
      this.logger.info('Token saved to file', { path: this.filePath })
    } catch (error) {
      throw new TokenStorageError(
        `Failed to save token to ${this.filePath}: ${describeError(error)}`,
        refreshToken,
        { cause: error },
      )
    }
  }

  async delete(): Promise<void> {
    try {
      await unlink(this.filePath)
      this.logger.info('Token file deleted', { path: this.filePath })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}

export type AutoStorageBackendKind = 'secure' | 'file'

/**
 * Uses the OS keychain when a real probe succeeds, otherwise a user-only file
 * (headless servers, Docker and CI usually have no Secret Service). This is the
 * documented policy of the 'auto' storage, not a silent fallback: the choice is
 * logged at WARN and observable through resolveBackendKind().
 */
export class AutoTokenStorage implements ITokenStorage {
  private readonly keychain: SecureTokenStorage
  private readonly file: FileTokenStorage
  private readonly logger: Logger
  private selection?: Promise<{ kind: AutoStorageBackendKind; storage: ITokenStorage }>

  constructor(keychain: SecureTokenStorage, file: FileTokenStorage, logger: Logger) {
    this.keychain = keychain
    this.file = file
    this.logger = logger
  }

  async resolveBackendKind(): Promise<AutoStorageBackendKind> {
    return (await this.selectBackend()).kind
  }

  private selectBackend(): Promise<{ kind: AutoStorageBackendKind; storage: ITokenStorage }> {
    this.selection ??= this.probeBackends()
    return this.selection
  }

  private async probeBackends(): Promise<{
    kind: AutoStorageBackendKind
    storage: ITokenStorage
  }> {
    const probe = await this.keychain.probe()
    if (probe.usable) return { kind: 'secure', storage: this.keychain }

    this.logger.warn('OS keychain unusable, storing the refresh token in a user-only file', {
      reason: probe.reason,
      path: this.file.filePath,
    })
    return { kind: 'file', storage: this.file }
  }

  async get(): Promise<string | null> {
    return (await this.selectBackend()).storage.get()
  }

  async set(refreshToken: string): Promise<void> {
    return (await this.selectBackend()).storage.set(refreshToken)
  }

  async delete(): Promise<void> {
    return (await this.selectBackend()).storage.delete()
  }
}

/**
 * Normalize a raw .env value: drop a trailing carriage return (CRLF files)
 * and one pair of matching surrounding quotes.
 */
export function parseEnvValue(rawValue: string): string {
  const value = rawValue.replace(/\r$/, '')
  const isQuoted =
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value.endsWith(value[0] as string)
  return isQuoted ? value.slice(1, -1) : value
}

/**
 * Token storage using .env file
 * Maintains backward compatibility with existing implementation
 */
export class EnvTokenStorage implements ITokenStorage {
  private readonly envPath: string
  private readonly varName: string
  private readonly logger: Logger

  constructor(
    envPath: string = '.env',
    varName: string = 'QUESTRADE_REFRESH_TOKEN',
    logger: Logger = new SilentLogger(),
  ) {
    this.envPath = envPath
    this.varName = varName
    this.logger = logger
  }

  private escapeVarName(): string {
    return this.varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private variableLinePattern(): RegExp {
    return new RegExp(`^${this.escapeVarName()}=.*$`, 'm')
  }

  private resolveFullPath(): string {
    return resolve(this.envPath)
  }

  async get(): Promise<string | null> {
    try {
      const content = await readFileIfPresent(this.resolveFullPath())
      if (content === null) return null

      const match = content.match(new RegExp(`^${this.escapeVarName()}=(.*)$`, 'm'))

      return parseEnvValue(match?.[1] ?? '') || null
    } catch (error) {
      this.logger.error(`Failed to read token from ${this.envPath}`, {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new Error(
        `Failed to read token from ${this.envPath}: ${error instanceof Error ? error.message : String(error)}. Check that the file is readable.`,
        { cause: error },
      )
    }
  }

  async set(refreshToken: string): Promise<void> {
    try {
      const fullPath = this.resolveFullPath()
      const envContent = await readFileIfPresent(fullPath)

      if (envContent === null) {
        await writeFileAtomically(fullPath, `${this.varName}=${refreshToken}\n`)
        this.logger.info('Token saved to new file', { path: this.envPath })
        return
      }

      const variableLine = this.variableLinePattern()

      if (variableLine.test(envContent)) {
        const updated = envContent.replace(variableLine, () => `${this.varName}=${refreshToken}`)
        await writeFileAtomically(fullPath, updated)
        this.logger.info('Token refreshed and saved', { path: this.envPath })
      } else {
        const updated = `${envContent.trimEnd()}\n${this.varName}=${refreshToken}\n`
        await writeFileAtomically(fullPath, updated)
        this.logger.info('Token saved', { path: this.envPath })
      }
    } catch (error) {
      throw new TokenStorageError(`Failed to save token to ${this.envPath}`, refreshToken, {
        cause: error,
      })
    }
  }

  async delete(): Promise<void> {
    try {
      const fullPath = this.resolveFullPath()
      const content = await readFileIfPresent(fullPath)
      if (content === null) return

      const updated = content.replace(new RegExp(`^${this.escapeVarName()}=.*\n?`, 'm'), '')

      if (updated.trim() === '') {
        await unlink(fullPath)
        this.logger.info('File deleted (was only token)', { path: this.envPath })
      } else {
        await writeFileAtomically(fullPath, updated)
        this.logger.info('Token removed from file', { path: this.envPath })
      }
    } catch (error) {
      this.logger.error(`Failed to delete token from ${this.envPath}`, {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

/**
 * In-memory token storage
 * Not persistent - useful for testing and temporary usage
 */
export class MemoryTokenStorage implements ITokenStorage {
  private token: string | null = null
  private readonly logger: Logger

  constructor(logger: Logger = new SilentLogger()) {
    this.logger = logger
  }

  async get(): Promise<string | null> {
    return this.token
  }

  async set(refreshToken: string): Promise<void> {
    this.token = refreshToken
    this.logger.info('Token stored in memory')
  }

  async delete(): Promise<void> {
    this.token = null
    this.logger.info('Token removed from memory')
  }
}
