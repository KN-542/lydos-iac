import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cr from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export interface AmplifyWafProps {
  amplifyAppId: string
  allowedCidrs: string[]
}

export class AmplifyWaf extends Construct {
  constructor(scope: Construct, id: string, props: AmplifyWafProps) {
    super(scope, id)

    const handler = new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', '..', 'lambda', 'amplify-waf')),
    })

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['wafv2:*', 'amplify:AssociateWebACL', 'amplify:DisassociateWebACL'],
        resources: ['*'],
      }),
    )

    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: handler,
    })

    new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        AmplifyAppId: props.amplifyAppId,
        AllowedCidrs: JSON.stringify(props.allowedCidrs),
        Region: cdk.Stack.of(this).region,
        AccountId: cdk.Stack.of(this).account,
      },
    })
  }
}
