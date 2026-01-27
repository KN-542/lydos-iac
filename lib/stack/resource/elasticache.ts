import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elasticache from 'aws-cdk-lib/aws-elasticache'
import { Construct } from 'constructs'

export interface ElastiCacheProps {
  vpc: ec2.IVpc
  nodeType?: string
  numCacheNodes?: number
  engineVersion?: string
  allowedSecurityGroups?: ec2.ISecurityGroup[]
}

export class ElastiCache extends Construct {
  public readonly cluster: elasticache.CfnCacheCluster
  public readonly securityGroup: ec2.SecurityGroup
  public readonly subnetGroup: elasticache.CfnSubnetGroup

  constructor(scope: Construct, id: string, props: ElastiCacheProps) {
    super(scope, id)

    // Security Group for ElastiCache
    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ElastiCache Redis cluster',
      allowAllOutbound: false,
    })

    // Allow inbound from specified security groups
    if (props.allowedSecurityGroups) {
      for (const sg of props.allowedSecurityGroups) {
        this.securityGroup.addIngressRule(sg, ec2.Port.tcp(6379), 'Allow Redis access from ECS')
      }
    }

    // Subnet Group
    this.subnetGroup = new elasticache.CfnSubnetGroup(this, 'SubnetGroup', {
      description: 'Subnet group for ElastiCache',
      subnetIds: props.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      cacheSubnetGroupName: `${cdk.Stack.of(this).stackName}-redis-subnet-group`,
    })

    // ElastiCache Cluster
    this.cluster = new elasticache.CfnCacheCluster(this, 'Cluster', {
      cacheNodeType: props.nodeType || 'cache.t3.micro',
      engine: 'redis',
      engineVersion: props.engineVersion || '7.1',
      numCacheNodes: props.numCacheNodes || 1,
      cacheSubnetGroupName: this.subnetGroup.ref,
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
      autoMinorVersionUpgrade: true,
      snapshotRetentionLimit: 0,
      preferredMaintenanceWindow: 'sun:17:00-sun:18:00',
    })

    this.cluster.addDependency(this.subnetGroup)

    // Outputs
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.cluster.attrRedisEndpointAddress,
      description: 'Redis Endpoint',
      exportName: `${cdk.Stack.of(this).stackName}-RedisEndpoint`,
    })

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.cluster.attrRedisEndpointPort,
      description: 'Redis Port',
      exportName: `${cdk.Stack.of(this).stackName}-RedisPort`,
    })

    new cdk.CfnOutput(this, 'RedisSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Redis Security Group ID',
      exportName: `${cdk.Stack.of(this).stackName}-RedisSecurityGroupId`,
    })
  }
}
