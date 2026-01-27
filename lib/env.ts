import * as path from 'node:path'
import * as dotenv from 'dotenv'

// .envファイルを読み込む
dotenv.config({ path: path.resolve(__dirname, '../.env') })

export interface EnvConfig {
  awsAccountId: string
  awsRegion: string
  domainName: string
  subdomain?: string
  githubOwner: string
  githubRepo: string
  githubBranch: string
  githubTokenSecretName: string
  amplifyAppName: string
  environment: string
}

export function getEnvConfig(): EnvConfig {
  return {
    awsAccountId: getRequiredEnv('AWS_ACCOUNT_ID'),
    awsRegion: getRequiredEnv('AWS_REGION'),
    domainName: getRequiredEnv('DOMAIN_NAME'),
    subdomain: process.env.SUBDOMAIN || undefined,
    githubOwner: getRequiredEnv('GITHUB_OWNER'),
    githubRepo: getRequiredEnv('GITHUB_REPO'),
    githubBranch: getRequiredEnv('GITHUB_BRANCH'),
    githubTokenSecretName: getRequiredEnv('GITHUB_TOKEN_SECRET_NAME'),
    amplifyAppName: getRequiredEnv('AMPLIFY_APP_NAME'),
    environment: getRequiredEnv('ENVIRONMENT'),
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}\nPlease check your .env file.`)
  }
  return value
}
