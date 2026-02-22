import * as cdk from 'aws-cdk-lib/core'
import { getEnvConfig } from '../lib/env'
import { AmplifyStack } from '../lib/stack/amplify'
import { DatabaseStack } from '../lib/stack/database'
import { EcsStack } from '../lib/stack/ecs'
import { PipelineStack } from '../lib/stack/pipeline'

const app = new cdk.App()

// 環境変数を読み込み
const config = getEnvConfig()

const env = {
  account: config.awsAccountId,
  region: config.awsRegion,
}

// 1. Databaseスタック
const databaseStack = new DatabaseStack(app, 'LydosDatabaseStack', {
  config,
  env,
  description: 'Lydos Database Stack - VPC, RDS, ElastiCache, Bastion',
})

// 2. ECSスタック（DatabaseStackに依存）: ECR → 初回ビルド → ECS
const ecsStack = new EcsStack(app, 'LydosEcsStack', {
  config,
  databaseStack,
  env,
  description: 'Lydos ECS Stack - ECR, Initial Build, ECS Fargate, ALB',
})

// 3. Pipelineスタック（EcsStackに依存）: CI/CD
new PipelineStack(app, 'LydosPipelineStack', {
  config,
  ecsStack,
  env,
  description: 'Lydos Pipeline Stack - CodePipeline CI/CD',
})

// 4. Amplifyスタック（独立）
new AmplifyStack(app, 'LydosAmplifyStack', {
  config,
  env,
  description: 'Lydos Amplify Stack',
})
