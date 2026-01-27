import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { EnvConfig } from '../env'
import { Bastion } from './resource/bastion'
import { ElastiCache } from './resource/elasticache'
import { Rds } from './resource/rds'
import { Vpc } from './resource/vpc'

export interface DatabaseStackProps extends cdk.StackProps {
  config: EnvConfig
}

export class DatabaseStack extends cdk.Stack {
  public readonly vpc: Vpc
  public readonly rds: Rds
  public readonly elasticache: ElastiCache
  public readonly bastion: Bastion

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props)

    // VPC
    this.vpc = new Vpc(this, 'Vpc')

    // Bastion Host
    this.bastion = new Bastion(this, 'Bastion', {
      vpc: this.vpc.vpc,
      instanceType: props.config.bastionInstanceType,
      keyName: props.config.bastionKeyPairName,
      allowedCidrs: props.config.bastionAllowedCidrs,
    })

    // RDS
    this.rds = new Rds(this, 'Rds', {
      vpc: this.vpc.vpc,
      instanceType: props.config.rdsInstanceType,
      databaseName: props.config.rdsDatabaseName,
      allowedSecurityGroups: [this.bastion.securityGroup],
    })

    // ElastiCache
    this.elasticache = new ElastiCache(this, 'ElastiCache', {
      vpc: this.vpc.vpc,
      nodeType: props.config.redisNodeType,
      allowedSecurityGroups: [this.bastion.securityGroup],
    })

    // BastionからRDS/Redisへの接続を許可
    this.rds.securityGroup.addIngressRule(
      this.bastion.securityGroup,
      cdk.aws_ec2.Port.tcp(5432),
      'Allow PostgreSQL access from Bastion',
    )

    this.elasticache.securityGroup.addIngressRule(
      this.bastion.securityGroup,
      cdk.aws_ec2.Port.tcp(6379),
      'Allow Redis access from Bastion',
    )
  }
}
