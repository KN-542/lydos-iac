import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'

export interface RdsProps {
  vpc: ec2.IVpc
  instanceType?: string
  databaseName?: string
  engine?: rds.IInstanceEngine
  allocatedStorage?: number
  maxAllocatedStorage?: number
  backupRetention?: cdk.Duration
  deletionProtection?: boolean
  allowedSecurityGroups?: ec2.ISecurityGroup[]
}

export class Rds extends Construct {
  public readonly instance: rds.DatabaseInstance
  public readonly secret: secretsmanager.ISecret
  public readonly securityGroup: ec2.SecurityGroup

  constructor(scope: Construct, id: string, props: RdsProps) {
    super(scope, id)

    // Security Group for RDS
    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS instance',
      allowAllOutbound: false,
    })

    // Allow inbound from specified security groups
    if (props.allowedSecurityGroups) {
      for (const sg of props.allowedSecurityGroups) {
        this.securityGroup.addIngressRule(
          sg,
          ec2.Port.tcp(5432),
          'Allow PostgreSQL access from ECS',
        )
      }
    }

    // RDS Instance
    this.instance = new rds.DatabaseInstance(this, 'Instance', {
      engine:
        props.engine ||
        rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16,
        }),
      instanceType: new ec2.InstanceType(props.instanceType || 't3.micro'),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [this.securityGroup],
      databaseName: props.databaseName || 'lydos',
      allocatedStorage: props.allocatedStorage || 20,
      maxAllocatedStorage: props.maxAllocatedStorage || 100,
      storageType: rds.StorageType.GP3,
      multiAz: false, // シングルAZ（コスト削減）
      publiclyAccessible: false,
      deletionProtection: props.deletionProtection ?? false,
      backupRetention: props.backupRetention || cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
    })

    this.secret = this.instance.secret!

    // Outputs
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.instance.dbInstanceEndpointAddress,
      description: 'RDS Endpoint',
      exportName: `${cdk.Stack.of(this).stackName}-DbEndpoint`,
    })

    new cdk.CfnOutput(this, 'DbPort', {
      value: this.instance.dbInstanceEndpointPort,
      description: 'RDS Port',
      exportName: `${cdk.Stack.of(this).stackName}-DbPort`,
    })

    new cdk.CfnOutput(this, 'DbName', {
      value: props.databaseName || 'lydos',
      description: 'Database Name',
      exportName: `${cdk.Stack.of(this).stackName}-DbName`,
    })

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: this.secret.secretArn,
      description: 'RDS Secret ARN',
      exportName: `${cdk.Stack.of(this).stackName}-DbSecretArn`,
    })

    new cdk.CfnOutput(this, 'DbSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'RDS Security Group ID',
      exportName: `${cdk.Stack.of(this).stackName}-DbSecurityGroupId`,
    })
  }
}
