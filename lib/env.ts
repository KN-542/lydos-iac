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
  apiSubdomain: string
  apiTaskCpu: number
  apiTaskMemory: number
  apiDesiredCount: number
  apiGithubOwner: string
  apiGithubRepo: string
  apiGithubBranch: string
  clerkSecretKey: string
  stripeSecretKey: string
  geminiApiKey: string
  groqApiKey: string
  stripePaidPlanPriceId: string
  viteClerkPublishableKey: string
  viteStripePublishableKey: string
  hostedZoneId: string
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
    apiSubdomain: getRequiredEnv('API_SUBDOMAIN'),
    apiTaskCpu: Number.parseInt(getRequiredEnv('API_TASK_CPU'), 10),
    apiTaskMemory: Number.parseInt(getRequiredEnv('API_TASK_MEMORY'), 10),
    apiDesiredCount: Number.parseInt(getRequiredEnv('API_DESIRED_COUNT'), 10),
    apiGithubOwner: getRequiredEnv('API_GITHUB_OWNER'),
    apiGithubRepo: getRequiredEnv('API_GITHUB_REPO'),
    apiGithubBranch: getRequiredEnv('API_GITHUB_BRANCH'),
    clerkSecretKey: getRequiredEnv('CLERK_SECRET_KEY'),
    stripeSecretKey: getRequiredEnv('STRIPE_SECRET_KEY'),
    geminiApiKey: getRequiredEnv('GEMINI_API_KEY'),
    groqApiKey: getRequiredEnv('GROQ_API_KEY'),
    stripePaidPlanPriceId: getRequiredEnv('STRIPE_PAID_PLAN_PRICE_ID'),
    viteClerkPublishableKey: getRequiredEnv('VITE_CLERK_PUBLISHABLE_KEY'),
    viteStripePublishableKey: getRequiredEnv('VITE_STRIPE_PUBLISHABLE_KEY'),
    hostedZoneId: getRequiredEnv('HOSTED_ZONE_ID'),
  }
}

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}\nPlease check your .env file.`)
  }
  return value
}
