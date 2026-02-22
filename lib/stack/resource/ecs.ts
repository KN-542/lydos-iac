import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import { Construct } from 'constructs'

export interface EcsServiceProps {
  vpc: ec2.Vpc
  repository: ecr.IRepository
  domainName: string
  subdomain: string
  cpu: number
  memory: number
  desiredCount: number
  environment: Record<string, string>
  secrets: Record<string, ecs.Secret>
  rdsSecurityGroupId: string
  redisSecurityGroupId: string
  allowedCidrs?: string[]
  hostedZoneId: string
}

export class EcsService extends Construct {
  public readonly cluster: ecs.Cluster
  public readonly service: ecs.FargateService
  public readonly alb: elbv2.ApplicationLoadBalancer
  public readonly certificate: acm.Certificate

  constructor(scope: Construct, id: string, props: EcsServiceProps) {
    super(scope, id)

    const fullDomain = `${props.subdomain}.${props.domainName}`

    // Route53 ホストゾーンを取得
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domainName,
    })

    // ACM証明書を作成（DNS検証 - ホストゾーン指定で自動検証）
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: fullDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    })

    // ECSクラスターを作成
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'lydos-api-cluster',
      containerInsights: true, // CloudWatch Container Insights有効化
    })

    // CloudWatch Logsロググループ
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/lydos-api`,
      retention: logs.RetentionDays.ONE_WEEK, // 1週間保持
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // タスク定義
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.cpu,
      memoryLimitMiB: props.memory,
    })

    // コンテナ定義
    taskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'lydos-api',
        logGroup,
      }),
      environment: props.environment,
      secrets: props.secrets,
      portMappings: [
        {
          containerPort: 3001,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'bun --version || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    })

    // Application Load Balancer用のセキュリティグループ
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    })

    // HTTP/HTTPS アクセスを許可（allowedCidrs が指定されている場合はそのIPのみ）
    const peers =
      props.allowedCidrs && props.allowedCidrs.length > 0
        ? props.allowedCidrs.map((cidr) => ec2.Peer.ipv4(cidr))
        : [ec2.Peer.anyIpv4()]
    for (const peer of peers) {
      albSecurityGroup.addIngressRule(peer, ec2.Port.tcp(80), 'Allow HTTP')
      albSecurityGroup.addIngressRule(peer, ec2.Port.tcp(443), 'Allow HTTPS')
    }

    // Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'lydos-api-alb',
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    })

    // HTTPSリスナー
    const httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [this.certificate],
    })

    // HTTPリスナー（HTTPSへリダイレクト）
    this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    })

    // Fargateサービス
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      serviceName: 'lydos-api-service',
      assignPublicIp: true, // PublicサブネットでパブリックIP割り当て
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    })

    // ECSタスクのセキュリティグループ - ALBからのみアクセスを許可
    const ecsSecurityGroup = this.service.connections.securityGroups[0]
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(3001), 'Allow traffic from ALB')

    // ECSタスクからRDS/Redisへのアクセスを許可
    // RDSセキュリティグループを取得してECSからのアクセスを許可
    const rdsSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedRdsSecurityGroup',
      props.rdsSecurityGroupId,
    )
    rdsSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from ECS',
    )

    // RedisセキュリティグループにECSからのアクセスを許可
    const redisSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedRedisSecurityGroup',
      props.redisSecurityGroupId,
    )
    redisSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS',
    )

    // ターゲットグループに登録
    httpsListener.addTargets('ECS', {
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/reference', // ヘルスチェックエンドポイント
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    })

    // ECRからのpull権限を付与
    props.repository.grantPull(taskDefinition.taskRole)

    // 出力
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
      exportName: `${cdk.Stack.of(this).stackName}-AlbDnsName`,
    })

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${fullDomain}`,
      description: 'API URL',
    })

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
    })

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
    })
  }
}
