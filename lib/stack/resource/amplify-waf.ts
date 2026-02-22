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
      code: lambda.Code.fromInline(`
const { WAFV2Client, CreateIPSetCommand, UpdateIPSetCommand, DeleteIPSetCommand, GetIPSetCommand, CreateWebACLCommand, DeleteWebACLCommand, GetWebACLCommand } = require('@aws-sdk/client-wafv2');
const { AmplifyClient, AssociateWebACLCommand, DisassociateWebACLCommand } = require('@aws-sdk/client-amplify');
const waf = new WAFV2Client({ region: 'us-east-1' });
exports.handler = async (event) => {
  const props = event.ResourceProperties;
  const cidrs = JSON.parse(props.AllowedCidrs);
  const appId = props.AmplifyAppId;
  const amplify = new AmplifyClient({ region: props.Region });

  if (event.RequestType === 'Delete') {
    const parts = (event.PhysicalResourceId || '').split('|');
    if (parts.length === 4) {
      const [, , ipSetId, webAclId] = parts;
      try {
        await amplify.send(new DisassociateWebACLCommand({ appId }));
      } catch (e) { console.log('Disassociate error:', e.message); }
      try {
        const w = await waf.send(new GetWebACLCommand({ Id: webAclId, Name: 'lydos-amplify-waf', Scope: 'CLOUDFRONT' }));
        await waf.send(new DeleteWebACLCommand({ Id: webAclId, Name: 'lydos-amplify-waf', Scope: 'CLOUDFRONT', LockToken: w.LockToken }));
      } catch (e) { console.log('Delete WebACL error:', e.message); }
      try {
        const s = await waf.send(new GetIPSetCommand({ Id: ipSetId, Name: 'lydos-allowed-ips', Scope: 'CLOUDFRONT' }));
        await waf.send(new DeleteIPSetCommand({ Id: ipSetId, Name: 'lydos-allowed-ips', Scope: 'CLOUDFRONT', LockToken: s.LockToken }));
      } catch (e) { console.log('Delete IPSet error:', e.message); }
    }
    return { PhysicalResourceId: event.PhysicalResourceId || 'waf-deleted' };
  }

  let ipSetId, ipSetArn, webAclId, webAclArn;

  if (event.RequestType === 'Create') {
    const ipSetResult = await waf.send(new CreateIPSetCommand({
      Name: 'lydos-allowed-ips',
      Scope: 'CLOUDFRONT',
      IPAddressVersion: 'IPV4',
      Addresses: cidrs,
    }));
    ipSetId = ipSetResult.Summary.Id;
    ipSetArn = ipSetResult.Summary.ARN;

    const webAclResult = await waf.send(new CreateWebACLCommand({
      Name: 'lydos-amplify-waf',
      Scope: 'CLOUDFRONT',
      DefaultAction: { Block: {} },
      Rules: [{
        Name: 'AllowSpecificIPs',
        Priority: 1,
        Statement: { IPSetReferenceStatement: { ARN: ipSetArn } },
        Action: { Allow: {} },
        VisibilityConfig: { CloudWatchMetricsEnabled: false, MetricName: 'AllowSpecificIPs', SampledRequestsEnabled: false },
      }],
      VisibilityConfig: { CloudWatchMetricsEnabled: false, MetricName: 'LydosAmplifyWaf', SampledRequestsEnabled: false },
    }));
    webAclId = webAclResult.Summary.Id;
    webAclArn = webAclResult.Summary.ARN;
  } else {
    // Update: IP Set のアドレスのみ更新
    [webAclArn, ipSetArn, ipSetId, webAclId] = event.PhysicalResourceId.split('|');
    const ipSetRes = await waf.send(new GetIPSetCommand({ Id: ipSetId, Name: 'lydos-allowed-ips', Scope: 'CLOUDFRONT' }));
    await waf.send(new UpdateIPSetCommand({
      Id: ipSetId, Name: 'lydos-allowed-ips', Scope: 'CLOUDFRONT',
      LockToken: ipSetRes.LockToken,
      Addresses: cidrs,
    }));
  }

  await amplify.send(new AssociateWebACLCommand({ appId, webAclArn }));
  return { PhysicalResourceId: [webAclArn, ipSetArn, ipSetId, webAclId].join('|') };
};
      `),
    })

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'wafv2:CreateIPSet',
          'wafv2:UpdateIPSet',
          'wafv2:DeleteIPSet',
          'wafv2:GetIPSet',
          'wafv2:CreateWebACL',
          'wafv2:DeleteWebACL',
          'wafv2:GetWebACL',
        ],
        resources: ['*'],
      }),
    )

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['amplify:AssociateWebACL', 'amplify:DisassociateWebACL'],
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
      },
    })
  }
}
