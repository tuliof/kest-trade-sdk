// SPDX-License-Identifier: BSD-3-Clause
import {
  type ITokenStorage,
  resolveTokenStorageKind,
  type TokenStorageConfig,
  TokenStorageError,
} from '@/auth/token-storage'
import type { TokenResponse } from '@/types/auth'
import { AuthenticationError } from '@/types/errors'

export const CLI_NAME = 'kest-trade-sdk'

const CLI_STORAGE_TYPES = ['auto', 'secure', 'file', 'env'] as const
type CliStorageType = (typeof CLI_STORAGE_TYPES)[number]

type CliCommand = 'login' | 'logout' | 'status' | 'help'

interface ParsedCliArguments {
  command: CliCommand
  storage: CliStorageType
}

export interface CliIo {
  /** Read a secret without echoing it (hidden TTY prompt, or piped stdin) */
  readSecret(prompt: string): Promise<string>
  print(line: string): void
  printError(line: string): void
}

export interface CliDependencies {
  io: CliIo
  createStorage(config: TokenStorageConfig): ITokenStorage
  exchangeRefreshToken(refreshToken: string): Promise<TokenResponse>
}

export const EXIT_SUCCESS = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

export const CLI_USAGE = `Usage: ${CLI_NAME} <command> [--storage <type>]

Commands:
  login    Exchange a refresh token from the Questrade API Centre and store the
           rotated token. Prompts without echoing; also reads the token from stdin.
  logout   Delete the stored refresh token.
  status   Show where the token is stored and whether one is present.
  help     Show this message.

Options:
  --storage <type>  auto (default) | secure | file | env
                    Must match the tokenStorage your application uses.`

class CliUsageError extends Error {}

function isCliStorageType(value: string): value is CliStorageType {
  return (CLI_STORAGE_TYPES as readonly string[]).includes(value)
}

function parseStorageType(value: string | undefined): CliStorageType {
  if (value === undefined) throw new CliUsageError('--storage requires a value')
  if (!isCliStorageType(value)) {
    throw new CliUsageError(
      `Unknown storage "${value}". Expected one of: ${CLI_STORAGE_TYPES.join(', ')}`,
    )
  }
  return value
}

function parseCommand(value: string | undefined): CliCommand {
  switch (value) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return 'help'
    case 'login':
    case 'logout':
    case 'status':
      return value
    default:
      throw new CliUsageError(`Unknown command "${value}"`)
  }
}

export function parseCliArguments(argv: readonly string[]): ParsedCliArguments {
  const [commandArgument, ...options] = argv
  const command = parseCommand(commandArgument)
  let storage: CliStorageType = 'auto'

  for (let index = 0; index < options.length; index++) {
    const option = options[index] as string
    if (option === '--storage') {
      storage = parseStorageType(options[++index])
    } else if (option.startsWith('--storage=')) {
      storage = parseStorageType(option.slice('--storage='.length))
    } else {
      throw new CliUsageError(`Unknown option "${option}"`)
    }
  }

  return { command, storage }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loginWithRefreshToken(
  storage: ITokenStorage,
  dependencies: CliDependencies,
): Promise<number> {
  const { io } = dependencies
  const seedToken = (await io.readSecret('Questrade refresh token: ')).trim()
  if (!seedToken) {
    io.printError('[ERROR] No refresh token entered. Generate one in the Questrade API Centre.')
    return EXIT_FAILURE
  }

  let tokenResponse: TokenResponse
  try {
    tokenResponse = await dependencies.exchangeRefreshToken(seedToken)
  } catch (error) {
    const hint =
      error instanceof AuthenticationError
        ? ' The token was rejected: it may be mistyped, already used, or expired. Generate a new one in the Questrade API Centre.'
        : ''
    io.printError(`[ERROR] Login failed: ${describeError(error)}.${hint}`)
    return EXIT_FAILURE
  }

  try {
    await storage.set(tokenResponse.refresh_token)
  } catch (error) {
    // The entered token is already consumed; printing the rotated one is the only way to keep access
    const rotatedToken =
      error instanceof TokenStorageError ? error.refreshToken : tokenResponse.refresh_token
    io.printError(`[ERROR] Could not store the token: ${describeError(error)}`)
    io.printError(
      `[ERROR] The token you entered is already consumed. Save this new refresh token now: ${rotatedToken}`,
    )
    return EXIT_FAILURE
  }

  const kind = await resolveTokenStorageKind(storage)
  io.print(`[INFO] Logged in. Refresh token stored in ${kind} storage.`)
  return EXIT_SUCCESS
}

async function logout(storage: ITokenStorage, io: CliIo): Promise<number> {
  await storage.delete()
  io.print('[INFO] Stored refresh token deleted.')
  return EXIT_SUCCESS
}

async function printStatus(storage: ITokenStorage, io: CliIo): Promise<number> {
  const kind = await resolveTokenStorageKind(storage)
  const hasToken = (await storage.get()) !== null
  io.print(`[INFO] Storage: ${kind}`)
  io.print(
    hasToken
      ? '[INFO] A refresh token is stored.'
      : `[INFO] No refresh token stored. Run \`${CLI_NAME} login\`.`,
  )
  return EXIT_SUCCESS
}

/**
 * Run the CLI and return the process exit code.
 */
export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  const { io } = dependencies

  let parsed: ParsedCliArguments
  try {
    parsed = parseCliArguments(argv)
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error
    io.printError(`[ERROR] ${error.message}`)
    io.printError(CLI_USAGE)
    return EXIT_USAGE
  }

  if (parsed.command === 'help') {
    io.print(CLI_USAGE)
    return EXIT_SUCCESS
  }

  const storage = dependencies.createStorage(parsed.storage)
  try {
    switch (parsed.command) {
      case 'login':
        return await loginWithRefreshToken(storage, dependencies)
      case 'logout':
        return await logout(storage, io)
      case 'status':
        return await printStatus(storage, io)
    }
  } catch (error) {
    io.printError(`[ERROR] ${describeError(error)}`)
    return EXIT_FAILURE
  }
}
