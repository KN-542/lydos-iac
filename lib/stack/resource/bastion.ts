import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'

export interface BastionProps {
  vpc: ec2.IVpc
  instanceType?: string
  keyName: string
  allowedCidrs?: string[]
}

export class Bastion extends Construct {
  public readonly instance: ec2.BastionHostLinux
  public readonly securityGroup: ec2.ISecurityGroup

  constructor(scope: Construct, id: string, props: BastionProps) {
    super(scope, id)

    // Bastion Host（Public Subnetに配置）
    this.instance = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc: props.vpc,
      instanceType: new ec2.InstanceType(props.instanceType || 't3.micro'),
      subnetSelection: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceName: 'LydosBastion',
    })

    // キーペアを設定
    const cfnInstance = this.instance.instance.node.defaultChild as ec2.CfnInstance
    cfnInstance.keyName = props.keyName

    this.securityGroup = this.instance.connections.securityGroups[0]

    // SSH接続を許可（複数のIPアドレス）
    if (props.allowedCidrs && props.allowedCidrs.length > 0) {
      for (const cidr of props.allowedCidrs) {
        this.instance.allowSshAccessFrom(ec2.Peer.ipv4(cidr))
      }
    }

    // Outputs
    new cdk.CfnOutput(this, 'BastionInstanceId', {
      value: this.instance.instanceId,
      description: 'Bastion Host Instance ID',
    })

    new cdk.CfnOutput(this, 'BastionPublicIp', {
      value: this.instance.instancePublicIp,
      description: 'Bastion Host Public IP',
    })

    new cdk.CfnOutput(this, 'BastionSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Bastion Host Security Group ID',
      exportName: `${cdk.Stack.of(this).stackName}-BastionSecurityGroupId`,
    })

    new cdk.CfnOutput(this, 'SshCommand', {
      value: `ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@${this.instance.instancePublicIp}`,
      description: 'SSH Command to connect to Bastion Host',
    })
  }
}
