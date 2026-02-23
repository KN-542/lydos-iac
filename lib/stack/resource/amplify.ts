import * as cdk from 'aws-cdk-lib'
import * as amplify from 'aws-cdk-lib/aws-amplify'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as cr from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'
import { AmplifyWaf } from './amplify-waf'

export interface AmplifyProps {
  domainName: string
  subdomain?: string
  githubOwner: string
  githubRepo: string
  githubBranch: string
  githubTokenSecretName: string
  amplifyAppName: string
  environment: string
  environmentVariables?: Record<string, string>
  allowedCidrs?: string[]
}

export class Amplify extends Construct {
  public readonly amplifyApp: amplify.CfnApp
  public readonly branch: amplify.CfnBranch

  constructor(scope: Construct, id: string, props: AmplifyProps) {
    super(scope, id)

    // GitHub Token を Secrets Manager から取得
    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubToken',
      props.githubTokenSecretName,
    )

    // Amplify Service Role（ビルドプロセスで使用）
    const serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'IAM role for Amplify build process',
    })

    // Amplify App を作成
    this.amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: props.amplifyAppName,
      repository: `https://github.com/${props.githubOwner}/${props.githubRepo}`,
      accessToken: githubToken.secretValue.unsafeUnwrap(),
      platform: 'WEB',
      environmentVariables: props.environmentVariables
        ? Object.entries(props.environmentVariables).map(([name, value]) => ({ name, value }))
        : undefined,
      buildSpec: JSON.stringify({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'curl -fsSL https://bun.sh/install | bash',
                'source /root/.bash_profile',
                'bun install',
              ],
            },
            build: {
              commands: ['bun run build'],
            },
          },
          artifacts: {
            baseDirectory: 'dist',
            files: ['**/*'],
          },
          cache: {
            paths: ['node_modules/**/*'],
          },
        },
      }),
      iamServiceRole: serviceRole.roleArn,
      // SPA用リライトルール: 静的ファイル以外はすべて index.html に書き換え
      customRules: [
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
    })

    // Branch を作成
    this.branch = new amplify.CfnBranch(this, 'Branch', {
      appId: this.amplifyApp.attrAppId,
      branchName: props.githubBranch,
      enableAutoBuild: true,
      enablePullRequestPreview: true,
      stage: props.environment === 'production' ? 'PRODUCTION' : 'DEVELOPMENT',
    })

    // カスタムドメインの設定
    const fullDomain = props.subdomain ? `${props.subdomain}.${props.domainName}` : props.domainName

    // ドメイン設定（Route53にドメインが登録されている必要がある）
    const subDomainSettings: amplify.CfnDomain.SubDomainSettingProperty[] = []

    if (props.subdomain) {
      // サブドメインが指定されている場合
      subDomainSettings.push({
        branchName: this.branch.branchName,
        prefix: props.subdomain,
      })
    } else {
      // ルートドメインの場合
      subDomainSettings.push({
        branchName: this.branch.branchName,
        prefix: '',
      })
      // wwwも追加（リダイレクト用）
      subDomainSettings.push({
        branchName: this.branch.branchName,
        prefix: 'www',
      })
    }

    const domain = new amplify.CfnDomain(this, 'Domain', {
      appId: this.amplifyApp.attrAppId,
      domainName: props.domainName,
      subDomainSettings,
      enableAutoSubDomain: false,
    })

    // ブランチ作成後にドメインを設定
    domain.node.addDependency(this.branch)

    // 初回ビルドを自動実行するカスタムリソース
    const startJob = new cr.AwsCustomResource(this, 'StartInitialJob', {
      onCreate: {
        service: 'Amplify',
        action: 'startJob',
        parameters: {
          appId: this.amplifyApp.attrAppId,
          branchName: this.branch.branchName,
          jobType: 'RELEASE',
        },
        physicalResourceId: cr.PhysicalResourceId.of('AmplifyInitialJob'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['amplify:StartJob'],
          resources: [
            `arn:aws:amplify:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:apps/${this.amplifyApp.attrAppId}/*`,
          ],
        }),
      ]),
    })

    // ブランチ作成後に実行
    startJob.node.addDependency(this.branch)

    // WAF による IP 制限（allowedCidrs が指定されている場合）
    if (props.allowedCidrs && props.allowedCidrs.length > 0) {
      const waf = new AmplifyWaf(this, 'Waf', {
        amplifyAppId: this.amplifyApp.attrAppId,
        allowedCidrs: props.allowedCidrs,
      })
      waf.node.addDependency(this.amplifyApp)
    }

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyApp.attrAppId,
      description: 'Amplify App ID',
    })

    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${this.branch.branchName}.${this.amplifyApp.attrDefaultDomain}`,
      description: 'Amplify App Default URL',
    })

    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://${fullDomain}`,
      description: 'Custom Domain URL',
    })
  }
}
