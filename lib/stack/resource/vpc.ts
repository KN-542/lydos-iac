import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'

export interface VpcProps {
  cidr?: string
  maxAzs?: number // デフォルト: 2（RDSのマルチAZ要件）
  natGateways?: number // デフォルト: 0（コスト削減）
}

export class Vpc extends Construct {
  public readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string, props?: VpcProps) {
    super(scope, id)

    // VPCを作成
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props?.cidr || '10.0.0.0/16'),
      maxAzs: props?.maxAzs || 2, // RDSのマルチAZ要件のため最低2つ
      natGateways: props?.natGateways ?? 0, // NAT Gatewayなし（月額$32削減）
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // インターネットアクセス不要
        },
      ],
    })

    // VPC Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${cdk.Stack.of(this).stackName}-VpcId`,
    })

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR Block',
    })

    // Private Subnet IDs（RDS/ElastiCache用 - インターネットアクセス不要）
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: cdk.Fn.join(
        ',',
        this.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      ),
      description: 'Private Subnet IDs for RDS/ElastiCache',
      exportName: `${cdk.Stack.of(this).stackName}-PrivateSubnetIds`,
    })
  }
}
