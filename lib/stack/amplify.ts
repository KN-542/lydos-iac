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

    const apiUrl = `https://${props.config.apiSubdomain}.${props.config.domainName}`

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
      environmentVariables: {
        VITE_API_URL: apiUrl,
        VITE_CLERK_PUBLISHABLE_KEY: props.config.viteClerkPublishableKey,
        VITE_STRIPE_PUBLISHABLE_KEY: props.config.viteStripePublishableKey,
      },
      allowedCidrs: props.config.bastionAllowedCidrs,
    })
  }
}
