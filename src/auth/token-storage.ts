// SPDX-License-Identifier: BSD-3-Clause
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
   * Store tokens in .env file (default, backward compatible)
   */
  ENV: 'env',

  /**
   * Store tokens in memory only (not persistent, useful for testing)
   */
  MEMORY: 'memory',
} as const

/**
 * Interface for token storage implementations
 */
export interface ITokenStorage {
  /**
   * Retrieve the stored refresh token
   * @returns The refresh token or null if not found
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

export interface StorageConfig {
  type: 'secure' | 'env' | 'memory'
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
 * Token storage type value union: 'secure' | 'env' | 'memory'
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

/**
 * Create a token storage instance based on configuration
 */
export function createTokenStorage(config?: TokenStorageConfig): ITokenStorage {
  // Default to 'env' for backward compatibility
  const storageConfig = config || 'env'

  // Handle string shorthand
  if (typeof storageConfig === 'string') {
    switch (storageConfig) {
      case 'secure':
        return new SecureTokenStorage()
      case 'env':
        return new EnvTokenStorage()
      case 'memory':
        return new MemoryTokenStorage()
      default:
        return new EnvTokenStorage()
    }
  }

  // Handle detailed config objects
  switch (storageConfig.type) {
    case 'secure':
      return new SecureTokenStorage(storageConfig.name)
    case 'env':
      return new EnvTokenStorage(storageConfig.envPath, storageConfig.varName)
    case 'memory':
      return new MemoryTokenStorage()
    default:
      return new EnvTokenStorage()
  }
}

/**
 * Secure token storage using Bun.secrets
 * Stores tokens in OS-native credential storage:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API
 */
export class SecureTokenStorage implements ITokenStorage {
  private readonly service = 'kest-trade-sdk'
  private readonly name: string

  constructor(name: string = 'refresh-token') {
    this.name = name
  }

  private get secrets() {
    // Access Bun.secrets at runtime
    return (globalThis as Record<string, unknown>).secrets
  }

  async get(): Promise<string | null> {
    try {
      const secrets = this.secrets as
        | {
            get: (opts: { service: string; name: string }) => Promise<string | null>
          }
        | undefined

      if (!secrets?.get) {
        console.warn('⚠️  Bun.secrets not available in this environment')
        return null
      }

      const token = await secrets.get({
        service: this.service,
        name: this.name,
      })
      return token || null
    } catch (error) {
      console.warn(`⚠️  Failed to retrieve token from secure storage:`, error)
      return null
    }
  }

  async set(refreshToken: string): Promise<void> {
    try {
      const secrets = this.secrets as
        | {
            set: (opts: { service: string; name: string; value: string }) => Promise<void>
          }
        | undefined

      if (!secrets?.set) {
        console.warn('⚠️  Bun.secrets not available in this environment')
        throw new Error('Bun.secrets is not available')
      }

      await secrets.set({
        service: this.service,
        name: this.name,
        value: refreshToken,
      })
      console.log('✅ Token stored securely in OS keychain')
    } catch (error) {
      console.error(`❌ Failed to store token in secure storage:`, error)
      throw error
    }
  }

  async delete(): Promise<void> {
    try {
      const secrets = this.secrets as
        | {
            set: (opts: { service: string; name: string; value: string }) => Promise<void>
          }
        | undefined

      if (!secrets?.set) {
        console.warn('⚠️  Bun.secrets not available in this environment')
        throw new Error('Bun.secrets is not available')
      }

      // Bun.secrets doesn't have a delete method yet, set to empty string as workaround
      await secrets.set({
        service: this.service,
        name: this.name,
        value: '',
      })
      console.log('✅ Token deleted from secure storage')
    } catch (error) {
      console.error(`❌ Failed to delete token from secure storage:`, error)
      throw error
    }
  }
}

/**
 * Token storage using .env file
 * Maintains backward compatibility with existing implementation
 */
export class EnvTokenStorage implements ITokenStorage {
  private readonly envPath: string
  private readonly varName: string

  constructor(envPath: string = '.env', varName: string = 'QUESTRADE_REFRESH_TOKEN') {
    this.envPath = envPath
    this.varName = varName
  }

  async get(): Promise<string | null> {
    try {
      if (typeof process === 'undefined' || !process.cwd) {
        return null
      }

      const fullPath = this.envPath.startsWith('/')
        ? this.envPath
        : `${process.cwd()}/${this.envPath}`

      const envFile = Bun.file(fullPath)
      const exists = await envFile.exists()

      if (!exists) {
        return null
      }

      const content = await envFile.text()
      const match = content.match(new RegExp(`^${this.varName}=(.*)$`, 'm'))

      return match?.[1] || null
    } catch (error) {
      console.warn(`⚠️  Failed to read token from ${this.envPath}:`, error)
      return null
    }
  }

  async set(refreshToken: string): Promise<void> {
    try {
      if (typeof process === 'undefined' || !process.cwd) {
        console.warn('⚠️  Token rotated but cannot auto-save (not in Node.js/Bun environment)')
        console.warn('   New refresh token:', refreshToken)
        console.warn('   Please save this token manually!')
        return
      }

      const fullPath = this.envPath.startsWith('/')
        ? this.envPath
        : `${process.cwd()}/${this.envPath}`

      const envFile = Bun.file(fullPath)
      const exists = await envFile.exists()

      if (!exists) {
        // Create new .env file
        await Bun.write(fullPath, `${this.varName}=${refreshToken}\n`)
        console.log(`✅ Token saved to new ${this.envPath} file`)
        return
      }

      // Read existing .env file
      const envContent = await envFile.text()

      // Check if variable exists in the file
      if (envContent.includes(`${this.varName}=`)) {
        // Replace existing token
        const updated = envContent.replace(
          new RegExp(`${this.varName}=.*`),
          `${this.varName}=${refreshToken}`,
        )
        await Bun.write(fullPath, updated)
        console.log(`✅ Token refreshed and saved to ${this.envPath} file`)
      } else {
        // Append new token
        const updated = `${envContent.trimEnd()}\n${this.varName}=${refreshToken}\n`
        await Bun.write(fullPath, updated)
        console.log(`✅ Token saved to ${this.envPath} file`)
      }
    } catch (error) {
      console.error(`❌ Failed to save token to ${this.envPath}:`, error)
      console.warn('   New refresh token:', refreshToken)
      console.warn('   Please save this token manually!')
      throw error
    }
  }

  async delete(): Promise<void> {
    try {
      if (typeof process === 'undefined' || !process.cwd) {
        return
      }

      const fullPath = this.envPath.startsWith('/')
        ? this.envPath
        : `${process.cwd()}/${this.envPath}`

      const envFile = Bun.file(fullPath)
      const exists = await envFile.exists()

      if (!exists) {
        return
      }

      const content = await envFile.text()
      const updated = content.replace(new RegExp(`^${this.varName}=.*\n?`, 'm'), '')

      if (updated.trim() === '') {
        // Delete file if empty
        await Bun.spawn(['rm', fullPath])
        console.log(`✅ ${this.envPath} file deleted`)
      } else {
        await Bun.write(fullPath, updated)
        console.log(`✅ Token removed from ${this.envPath}`)
      }
    } catch (error) {
      console.error(`❌ Failed to delete token from ${this.envPath}:`, error)
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

  async get(): Promise<string | null> {
    return this.token
  }

  async set(refreshToken: string): Promise<void> {
    this.token = refreshToken
    console.log('✅ Token stored in memory')
  }

  async delete(): Promise<void> {
    this.token = null
    console.log('✅ Token removed from memory')
  }
}
