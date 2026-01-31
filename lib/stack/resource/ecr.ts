import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { Construct } from 'constructs'

export interface EcrProps {
  repositoryName: string
  importExisting?: boolean // 既存リポジトリをインポートするか
}

export class Ecr extends Construct {
  public readonly repository: ecr.IRepository

  constructor(scope: Construct, id: string, props: EcrProps) {
    super(scope, id)

    // 既存リポジトリをインポートするか、新規作成するか
    if (props.importExisting) {
      // 既存のECRリポジトリをインポート
      this.repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName)
    } else {
      // ECRリポジトリを作成
      this.repository = new ecr.Repository(this, 'Repository', {
        repositoryName: props.repositoryName,
        imageScanOnPush: true, // プッシュ時に脆弱性スキャン
        lifecycleRules: [
          {
            description: 'Keep last 10 images',
            maxImageCount: 10, // 最新10イメージのみ保持
          },
        ],
        removalPolicy: cdk.RemovalPolicy.DESTROY, // スタック削除時にリポジトリも削除
        emptyOnDelete: true, // 削除時にイメージも全て削除
      })
    }

    // ECR Repository URI出力
    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `${cdk.Stack.of(this).stackName}-RepositoryUri`,
    })

    new cdk.CfnOutput(this, 'RepositoryArn', {
      value: this.repository.repositoryArn,
      description: 'ECR Repository ARN',
    })
  }
}
