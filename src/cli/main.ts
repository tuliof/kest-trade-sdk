// SPDX-License-Identifier: BSD-3-Clause
import { AuthClient } from '@/auth/auth-client'
import { createTokenStorage } from '@/auth/token-storage'
import { ConsoleLogger } from '@/logger'
import { type CliIo, runCli } from './run-cli'

const CTRL_C = '\u0003'
const BACKSPACE_CHARACTERS = new Set(['\u007f', '\b'])

function readHiddenLineFromTerminal(prompt: string): Promise<string> {
  const stdin = process.stdin
  return new Promise((resolve, reject) => {
    let input = ''
    const stopReading = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      process.stderr.write('\n')
    }
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          stopReading()
          resolve(input)
          return
        }
        if (character === CTRL_C) {
          stopReading()
          reject(new Error('Login cancelled'))
          return
        }
        input = BACKSPACE_CHARACTERS.has(character) ? input.slice(0, -1) : input + character
      }
    }

    process.stderr.write(prompt)
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

async function readAllFromStdin(): Promise<string> {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk
  return input
}

const terminalIo: CliIo = {
  readSecret: (prompt) =>
    process.stdin.isTTY ? readHiddenLineFromTerminal(prompt) : readAllFromStdin(),
  print: (line) => process.stdout.write(`${line}\n`),
  printError: (line) => process.stderr.write(`${line}\n`),
}

const logger = new ConsoleLogger('warn')
const authClient = new AuthClient()

process.exitCode = await runCli(process.argv.slice(2), {
  io: terminalIo,
  createStorage: (config) => createTokenStorage(config, logger),
  exchangeRefreshToken: (refreshToken) => authClient.refreshToken(refreshToken),
})
