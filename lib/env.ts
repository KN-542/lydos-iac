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
  rdsInstanceType?: string
  rdsDatabaseName?: string
  redisNodeType?: string
  bastionInstanceType?: string
  bastionKeyPairName: string
  bastionAllowedCidrs: string[]
}

export function getEnvConfig(): EnvConfig {
  // BASTION_SG_IP_n を読み込む（空文字まで）
  const bastionAllowedCidrs: string[] = []
  let n = 1
  while (true) {
    const cidr = process.env[`BASTION_SG_IP_${n}`]
    if (!cidr || cidr === '') {
      break
    }
    bastionAllowedCidrs.push(cidr)
    n++
  }

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
    rdsInstanceType: process.env.RDS_INSTANCE_TYPE || undefined,
    rdsDatabaseName: process.env.RDS_DATABASE_NAME || undefined,
    redisNodeType: process.env.REDIS_NODE_TYPE || undefined,
    bastionInstanceType: process.env.BASTION_INSTANCE_TYPE || undefined,
    bastionKeyPairName: getRequiredEnv('BASTION_KEY_PAIR_NAME'),
    bastionAllowedCidrs,
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}\nPlease check your .env file.`)
  }
  return value
}
