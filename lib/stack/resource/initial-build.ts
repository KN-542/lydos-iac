import * as cdk from 'aws-cdk-lib'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as cr from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export interface InitialBuildProps {
  repository: ecr.IRepository
  githubOwner: string
  githubRepo: string
  githubBranch: string
  githubTokenSecretName: string
}

export class InitialBuild extends Construct {
  public readonly customResource: cdk.CustomResource

  constructor(scope: Construct, id: string, props: InitialBuildProps) {
    super(scope, id)

    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubToken',
      props.githubTokenSecretName,
    )

    // GitHub認証情報をCodeBuildにアカウントレベルで登録
    new codebuild.GitHubSourceCredentials(this, 'GitHubCreds', {
      accessToken: githubToken.secretValue,
    })

    // 初回ビルド用 CodeBuild プロジェクト
    const buildProject = new codebuild.Project(this, 'Project', {
      projectName: 'lydos-api-initial-build',
      source: codebuild.Source.gitHub({
        owner: props.githubOwner,
        repo: props.githubRepo,
        branchOrRef: `refs/heads/${props.githubBranch}`,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        AWS_ACCOUNT_ID: { value: cdk.Stack.of(this).account },
        AWS_DEFAULT_REGION: { value: cdk.Stack.of(this).region },
        IMAGE_REPO_NAME: { value: props.repository.repositoryName },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
              'REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME',
            ],
          },
          build: {
            commands: ['docker build -t $REPOSITORY_URI:latest .'],
          },
          post_build: {
            commands: ['docker push $REPOSITORY_URI:latest'],
          },
        },
      }),
    })

    props.repository.grantPullPush(buildProject)

    // docker login に必要なアカウントレベル権限
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    )

    // onEventHandler: ビルドを開始し Build ID を返す
    const onEventHandler = new lambda.Function(this, 'OnEventHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(1),
      code: lambda.Code.fromInline(`
const { CodeBuildClient, StartBuildCommand } = require('@aws-sdk/client-codebuild');
exports.handler = async (event) => {
  if (event.RequestType !== 'Create') return { PhysicalResourceId: event.PhysicalResourceId || 'initial-build' };
  const client = new CodeBuildClient();
  const result = await client.send(new StartBuildCommand({ projectName: event.ResourceProperties.ProjectName }));
  return { PhysicalResourceId: result.build.id };
};`),
    })

    // isCompleteHandler: ビルド完了をポーリング
    const isCompleteHandler = new lambda.Function(this, 'IsCompleteHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(1),
      code: lambda.Code.fromInline(`
const { CodeBuildClient, BatchGetBuildsCommand } = require('@aws-sdk/client-codebuild');
exports.handler = async (event) => {
  if (event.RequestType !== 'Create') return { IsComplete: true };
  const client = new CodeBuildClient();
  const result = await client.send(new BatchGetBuildsCommand({ ids: [event.PhysicalResourceId] }));
  const build = result.builds[0];
  if (!build) throw new Error('Build not found');
  if (['FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT'].includes(build.buildStatus)) {
    throw new Error('Initial build failed: ' + build.buildStatus);
  }
  return { IsComplete: build.buildStatus === 'SUCCEEDED' };
};`),
    })

    onEventHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codebuild:StartBuild'],
        resources: [buildProject.projectArn],
      }),
    )
    isCompleteHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codebuild:BatchGetBuilds'],
        resources: [buildProject.projectArn],
      }),
    )

    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler,
      isCompleteHandler,
      queryInterval: cdk.Duration.seconds(30),
      totalTimeout: cdk.Duration.hours(1),
    })

    this.customResource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        ProjectName: buildProject.projectName,
      },
    })
  }
}
