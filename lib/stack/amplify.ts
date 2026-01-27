import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { EnvConfig } from '../env'
import { Amplify } from './resource/amplify'

export interface AmplifyStackProps extends cdk.StackProps {
  config: EnvConfig
}

export class AmplifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AmplifyStackProps) {
    super(scope, id, props)

    // Amplify
    new Amplify(this, 'Amplify', {
      domainName: props.config.domainName,
      subdomain: props.config.subdomain,
      githubOwner: props.config.githubOwner,
      githubRepo: props.config.githubRepo,
      githubBranch: props.config.githubBranch,
      githubTokenSecretName: props.config.githubTokenSecretName,
      amplifyAppName: props.config.amplifyAppName,
      environment: props.config.environment,
    })
  }
}
