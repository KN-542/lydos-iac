import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { EnvConfig } from '../env'
import type { EcsStack } from './ecs'
import { CodePipeline } from './resource/codepipeline'

export interface PipelineStackProps extends cdk.StackProps {
  config: EnvConfig
  ecsStack: EcsStack
}

export class PipelineStack extends cdk.Stack {
  public readonly codePipeline: CodePipeline

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props)

    this.codePipeline = new CodePipeline(this, 'CodePipeline', {
      repository: props.ecsStack.ecr.repository,
      ecsService: props.ecsStack.ecsService.service,
      ecsCluster: props.ecsStack.ecsService.cluster,
      githubOwner: props.config.apiGithubOwner,
      githubRepo: props.config.apiGithubRepo,
      githubBranch: props.config.apiGithubBranch,
      githubTokenSecretName: props.config.githubTokenSecretName,
    })
  }
}
