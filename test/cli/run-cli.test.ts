// SPDX-License-Identifier: BSD-3-Clause
import { describe, expect, test } from 'bun:test'
import {
  MemoryTokenStorage,
  type TokenStorageConfig,
  TokenStorageError,
} from '@/auth/token-storage'
import {
  type CliDependencies,
  EXIT_FAILURE,
  EXIT_SUCCESS,
  EXIT_USAGE,
  parseCliArguments,
  runCli,
} from '@/cli/run-cli'
import type { TokenResponse } from '@/types/auth'
import { AuthenticationError } from '@/types/errors'

function createTokenResponse(refreshToken: string): TokenResponse {
  return {
    access_token: 'access',
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 1800,
    api_server: 'https://api01.iq.questrade.com/',
  }
}

function createHarness(options: { enteredToken?: string; storage?: MemoryTokenStorage } = {}) {
  const output: string[] = []
  const errors: string[] = []
  const exchangedTokens: string[] = []
  const requestedStorages: TokenStorageConfig[] = []
  const storage = options.storage ?? new MemoryTokenStorage()
  const dependencies: CliDependencies = {
    io: {
      readSecret: async () => options.enteredToken ?? '',
      print: (line) => output.push(line),
      printError: (line) => errors.push(line),
    },
    createStorage: (config) => {
      requestedStorages.push(config)
      return storage
    },
    exchangeRefreshToken: async (token) => {
      exchangedTokens.push(token)
      return createTokenResponse(`rotated_${token}`)
    },
  }
  return { dependencies, output, errors, exchangedTokens, requestedStorages, storage }
}

describe('parseCliArguments', () => {
  test('defaults to help and the auto storage', () => {
    expect(parseCliArguments([])).toEqual({ command: 'help', storage: 'auto' })
  })

  test('accepts --storage in both forms', () => {
    expect(parseCliArguments(['login', '--storage', 'secure']).storage).toBe('secure')
    expect(parseCliArguments(['login', '--storage=file']).storage).toBe('file')
  })

  test('rejects memory storage, which would lose the token on exit', () => {
    expect(() => parseCliArguments(['login', '--storage', 'memory'])).toThrow(
      'Unknown storage "memory"',
    )
  })

  test('rejects unknown commands and options', () => {
    expect(() => parseCliArguments(['signin'])).toThrow('Unknown command')
    expect(() => parseCliArguments(['login', '--token', 'x'])).toThrow('Unknown option')
  })
})

describe('runCli login', () => {
  test('exchanges the entered token and stores the rotated one', async () => {
    const harness = createHarness({ enteredToken: '  seed-token\n' })

    const exitCode = await runCli(['login'], harness.dependencies)

    expect(exitCode).toBe(EXIT_SUCCESS)
    expect(harness.exchangedTokens).toEqual(['seed-token'])
    expect(await harness.storage.get()).toBe('rotated_seed-token')
    expect(harness.requestedStorages).toEqual(['auto'])
    expect(harness.output.join('\n')).toContain('stored in memory storage')
  })

  test('passes the requested storage type', async () => {
    const harness = createHarness({ enteredToken: 'seed' })

    await runCli(['login', '--storage', 'secure'], harness.dependencies)

    expect(harness.requestedStorages).toEqual(['secure'])
  })

  test('fails without contacting Questrade when no token is entered', async () => {
    const harness = createHarness({ enteredToken: '   ' })

    expect(await runCli(['login'], harness.dependencies)).toBe(EXIT_FAILURE)
    expect(harness.exchangedTokens).toEqual([])
  })

  test('explains a rejected token', async () => {
    const harness = createHarness({ enteredToken: 'used' })
    harness.dependencies.exchangeRefreshToken = async () => {
      throw new AuthenticationError('Bad Request')
    }

    expect(await runCli(['login'], harness.dependencies)).toBe(EXIT_FAILURE)
    expect(harness.errors.join('\n')).toContain('already used')
    expect(await harness.storage.get()).toBeNull()
  })

  test('prints the rotated token when it cannot be stored, since the entered one is consumed', async () => {
    const storage = new MemoryTokenStorage()
    storage.set = async (token) => {
      throw new TokenStorageError('keychain locked', token)
    }
    const harness = createHarness({ enteredToken: 'seed', storage })

    expect(await runCli(['login'], harness.dependencies)).toBe(EXIT_FAILURE)
    expect(harness.errors.join('\n')).toContain('rotated_seed')
  })
})

describe('runCli status and logout', () => {
  test('reports a stored token without printing it', async () => {
    const storage = new MemoryTokenStorage()
    await storage.set('secret-token')
    const harness = createHarness({ storage })

    expect(await runCli(['status'], harness.dependencies)).toBe(EXIT_SUCCESS)
    expect(harness.output.join('\n')).toContain('A refresh token is stored')
    expect(harness.output.join('\n')).not.toContain('secret-token')
  })

  test('suggests login when nothing is stored', async () => {
    const harness = createHarness()

    await runCli(['status'], harness.dependencies)

    expect(harness.output.join('\n')).toContain('kest-trade-sdk login')
  })

  test('logout deletes the stored token', async () => {
    const storage = new MemoryTokenStorage()
    await storage.set('secret-token')
    const harness = createHarness({ storage })

    expect(await runCli(['logout'], harness.dependencies)).toBe(EXIT_SUCCESS)
    expect(await storage.get()).toBeNull()
  })

  test('reports storage failures with exit code 1', async () => {
    const storage = new MemoryTokenStorage()
    storage.get = async () => {
      throw new Error('keychain locked')
    }
    const harness = createHarness({ storage })

    expect(await runCli(['status'], harness.dependencies)).toBe(EXIT_FAILURE)
    expect(harness.errors.join('\n')).toContain('keychain locked')
  })
})

describe('runCli usage', () => {
  test('prints usage for help', async () => {
    const harness = createHarness()

    expect(await runCli(['help'], harness.dependencies)).toBe(EXIT_SUCCESS)
    expect(harness.output.join('\n')).toContain('Usage: kest-trade-sdk')
  })

  test('returns exit code 2 on invalid usage', async () => {
    const harness = createHarness()

    expect(await runCli(['nope'], harness.dependencies)).toBe(EXIT_USAGE)
    expect(harness.errors.join('\n')).toContain('Unknown command "nope"')
  })
})
