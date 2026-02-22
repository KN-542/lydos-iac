import * as cdk from 'aws-cdk-lib'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

export interface CodePipelineProps {
  repository: ecr.IRepository
  ecsService: ecs.FargateService
  ecsCluster: ecs.Cluster
  githubOwner: string
  githubRepo: string
  githubBranch: string
  githubTokenSecretName: string
}

export class CodePipeline extends Construct {
  public readonly pipeline: codepipeline.Pipeline

  constructor(scope: Construct, id: string, props: CodePipelineProps) {
    super(scope, id)

    // GitHub Personal Access Token (Secrets Managerから取得)
    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubToken',
      props.githubTokenSecretName,
    )

    // Source Artifact
    const sourceOutput = new codepipeline.Artifact('SourceOutput')

    // Source Action (GitHub)
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: props.githubOwner,
      repo: props.githubRepo,
      branch: props.githubBranch,
      oauthToken: githubToken.secretValue,
      output: sourceOutput,
    })

    // CodeBuild Project
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'lydos-api-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Docker build に必要
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        AWS_ACCOUNT_ID: {
          value: cdk.Stack.of(this).account,
        },
        AWS_DEFAULT_REGION: {
          value: cdk.Stack.of(this).region,
        },
        IMAGE_REPO_NAME: {
          value: props.repository.repositoryName,
        },
        IMAGE_TAG: {
          value: 'latest',
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              // Bun インストール
              'curl -fsSL https://bun.sh/install | bash',
              'ln -sf $HOME/.bun/bin/bun /usr/local/bin/bun',
            ],
          },
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
              'REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME',
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH:-latest}',
              // テスト用 PostgreSQL 起動
              'docker run -d --name test-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lydos_test -p 5432:5432 postgres:16-alpine',
              'for i in $(seq 1 30); do docker exec test-postgres pg_isready -U postgres && break || sleep 2; done',
              // 依存関係インストール & Prisma クライアント生成
              'bun install --frozen-lockfile',
              'bunx prisma generate --schema=./schema.prisma',
              // テスト DB マイグレーション & シード
              'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lydos_test bunx prisma migrate deploy --schema=./schema.prisma',
              'DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/lydos_test bun run seed.test.ts',
            ],
          },
          build: {
            commands: [
              // ユニットテスト（テスト DB を使用）
              'echo Running unit tests...',
              'DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/lydos_test bun test src/',
              // Docker イメージビルド（Dockerfile 内で typecheck & lint も実行）
              'echo Build started on `date`',
              'docker build -t $REPOSITORY_URI:latest .',
              'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'docker push $REPOSITORY_URI:latest',
              'docker push $REPOSITORY_URI:$IMAGE_TAG',
              "printf '[{\"name\":\"ApiContainer\",\"imageUri\":\"%s\"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json",
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    })

    // ECRへのpush権限を付与
    props.repository.grantPullPush(buildProject)

    // Build Artifact
    const buildOutput = new codepipeline.Artifact('BuildOutput')

    // Build Action
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    })

    // Deploy Action (ECS)
    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: 'ECS_Deploy',
      service: props.ecsService,
      input: buildOutput,
    })

    // Pipeline
    this.pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'lydos-api-pipeline',
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Deploy',
          actions: [deployAction],
        },
      ],
    })

    // 出力
    new cdk.CfnOutput(this, 'PipelineName', {
      value: this.pipeline.pipelineName,
      description: 'CodePipeline Name',
    })

    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${this.pipeline.pipelineName}/view`,
      description: 'CodePipeline Console URL',
    })
  }
}
