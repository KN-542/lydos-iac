import * as cdk from 'aws-cdk-lib/core'
import { getEnvConfig } from '../lib/env'
import { AmplifyStack } from '../lib/stack/amplify'
import { DatabaseStack } from '../lib/stack/database'

const app = new cdk.App()

// 環境変数を読み込み
const config = getEnvConfig()

const env = {
  account: config.awsAccountId,
  region: config.awsRegion,
}

// 1. Databaseスタック
new DatabaseStack(app, 'LydosDatabaseStack', {
  config,
  env,
  description: 'Lydos Database Stack - VPC, RDS, ElastiCache, Bastion',
})

// 2. Amplifyスタック
new AmplifyStack(app, 'LydosAmplifyStack', {
  config,
  env,
  description: 'Lydos Amplify Stack',
})
