import * as cdk from 'aws-cdk-lib/core'
import { getEnvConfig } from '../lib/env'
import { AmplifyStack } from '../lib/stack/amplify'

const app = new cdk.App()

// 環境変数を読み込み
const config = getEnvConfig()

const env = {
  account: config.awsAccountId,
  region: config.awsRegion,
}

// Amplifyスタックをインスタンス化
new AmplifyStack(app, 'LydosAmplifyStack', {
  config,
  env,
  description: 'Lydos Amplify Stack',
})
