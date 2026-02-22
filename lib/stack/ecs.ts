import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'
import type { EnvConfig } from '../env'
import type { DatabaseStack } from './database'
import { Ecr } from './resource/ecr'
import { EcsService } from './resource/ecs'
import { InitialBuild } from './resource/initial-build'

export interface EcsStackProps extends cdk.StackProps {
  config: EnvConfig
  databaseStack: DatabaseStack
}

export class EcsStack extends cdk.Stack {
  public readonly ecr: Ecr
  public readonly ecsService: EcsService

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props)

    // ECRリポジトリを作成
    this.ecr = new Ecr(this, 'Ecr', {
      repositoryName: 'lydos-api',
    })

    // Secrets Managerにシークレットを作成
    const clerkSecret = new secretsmanager.Secret(this, 'ClerkSecret', {
      secretName: 'lydos/clerk-secret-key',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.config.clerkSecretKey),
      description: 'Clerk Secret Key for Lydos API',
    })

    const stripeSecret = new secretsmanager.Secret(this, 'StripeSecret', {
      secretName: 'lydos/stripe-secret-key',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.config.stripeSecretKey),
      description: 'Stripe Secret Key for Lydos API',
    })

    const geminiSecret = new secretsmanager.Secret(this, 'GeminiSecret', {
      secretName: 'lydos/gemini-api-key',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.config.geminiApiKey),
      description: 'Gemini API Key for Lydos API',
    })

    const groqSecret = new secretsmanager.Secret(this, 'GroqSecret', {
      secretName: 'lydos/groq-api-key',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.config.groqApiKey),
      description: 'Groq API Key for Lydos API',
    })

    // RDSとElastiCacheのエンドポイント取得
    const redisHost = props.databaseStack.elasticache.cluster.attrRedisEndpointAddress
    const redisPort = props.databaseStack.elasticache.cluster.attrRedisEndpointPort

    // フロントエンドURL
    const frontendUrl = props.config.subdomain
      ? `https://${props.config.subdomain}.${props.config.domainName}`
      : `https://${props.config.domainName}`

    // 環境変数
    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '3001',
      HOSTNAME: '0.0.0.0',
      CORS_ORIGIN: frontendUrl,
      FRONTEND_URL: frontendUrl,
      DATABASE_HOST: props.databaseStack.rds.instance.dbInstanceEndpointAddress,
      DATABASE_PORT: props.databaseStack.rds.instance.dbInstanceEndpointPort,
      DATABASE_NAME: props.config.rdsDatabaseName || 'lydos',
      REDIS_HOST: redisHost,
      REDIS_PORT: redisPort,
    }

    // シークレット
    const secrets: Record<string, ecs.Secret> = {
      DATABASE_USER: ecs.Secret.fromSecretsManager(
        props.databaseStack.rds.instance.secret!,
        'username',
      ),
      DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
        props.databaseStack.rds.instance.secret!,
        'password',
      ),
      CLERK_SECRET_KEY: ecs.Secret.fromSecretsManager(clerkSecret),
      STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(stripeSecret),
      GEMINI_API_KEY: ecs.Secret.fromSecretsManager(geminiSecret),
      GROQ_API_KEY: ecs.Secret.fromSecretsManager(groqSecret),
    }

    // 初回ビルド: ECR にイメージをプッシュしてから ECS を起動する
    const initialBuild = new InitialBuild(this, 'InitialBuild', {
      repository: this.ecr.repository,
      githubOwner: props.config.apiGithubOwner,
      githubRepo: props.config.apiGithubRepo,
      githubBranch: props.config.apiGithubBranch,
      githubTokenSecretName: props.config.githubTokenSecretName,
    })

    // ECSサービス（初回ビルド完了後に作成）
    this.ecsService = new EcsService(this, 'EcsService', {
      vpc: props.databaseStack.vpc.vpc,
      repository: this.ecr.repository,
      domainName: props.config.domainName,
      subdomain: props.config.apiSubdomain,
      cpu: props.config.apiTaskCpu,
      memory: props.config.apiTaskMemory,
      desiredCount: props.config.apiDesiredCount,
      environment,
      secrets,
      rdsSecurityGroupId: props.databaseStack.rds.securityGroup.securityGroupId,
      redisSecurityGroupId: props.databaseStack.elasticache.securityGroup.securityGroupId,
    })
    this.ecsService.node.addDependency(initialBuild.customResource)
  }
}
