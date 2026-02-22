# Lydos IaC

AWS CDK (TypeScript) で構築する Lydos のインフラストラクチャ
簡易AIチャットアプリになりました。

## スタック構成

1. **LydosDatabaseStack** - VPC、RDS (PostgreSQL)、ElastiCache (Redis)、Bastion Host
2. **LydosEcsStack** - ECR、初回 Docker ビルド (Custom Resource)、ECS Fargate、ALB
3. **LydosPipelineStack** - CodePipeline (CI/CD)
4. **LydosAmplifyStack** - AWS Amplify (React SPA ホスティング)

## 前提条件

- [Bun](https://bun.sh/) がインストールされていること
- AWS CLI が設定されていること
- AWS CDK がブートストラップされていること

## セットアップ

### 1. 依存関係のインストール

```bash
bun install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、必要な環境変数を設定します。

```bash
cp .env.example .env
```

`.env` ファイルを編集して、適切な値を設定してください。

| 変数名 | 説明 | 取得先 |
|---|---|---|
| `AWS_ACCOUNT_ID` | AWS アカウント ID | AWS コンソール |
| `CLERK_SECRET_KEY` | Clerk シークレットキー | Clerk ダッシュボード > API Keys |
| `STRIPE_SECRET_KEY` | Stripe シークレットキー | Stripe ダッシュボード > API Keys |
| `GEMINI_API_KEY` | Gemini API キー | Google AI Studio |
| `GROQ_API_KEY` | Groq API キー | Groq Console |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk 公開キー (`pk_...`) | Clerk ダッシュボード > API Keys |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe 公開キー (`pk_...`) | Stripe ダッシュボード > API Keys |
| `BASTION_KEY_PAIR_NAME` | Bastion 用 EC2 キーペア名 | AWS EC2 コンソール > キーペア |

### 3. AWS CDK Bootstrap（初回のみ）

```bash
bunx cdk bootstrap
```

## デプロイ

### デプロイ順序

依存関係があるため、以下の順序でデプロイしてください：

```
1. cdk deploy LydosDatabaseStack   # VPC, RDS, ElastiCache, Bastion
2. cdk deploy LydosEcsStack        # ECR 作成 → 初回 Docker ビルド & ECR プッシュ → ECS 起動 → マイグレーション & シード
3. cdk deploy LydosPipelineStack   # CI/CD（以降は main push で自動デプロイ）
   cdk deploy LydosAmplifyStack    # フロントエンド（3と順不同・並行可）
```

### 1. DatabaseStack のデプロイ

```bash
bunx cdk deploy LydosDatabaseStack
```

VPC、RDS、ElastiCache、Bastion Host が作成されます。

**所要時間**: 15-20分（RDS作成に時間がかかります）

### 2. EcsStack のデプロイ

```bash
bunx cdk deploy LydosEcsStack
```

ECR が作成され、CDK Custom Resource により初回 Docker ビルドが実行されて ECR にイメージがプッシュされます。
その後 ECS Fargate サービスが起動し、`docker-entrypoint.sh` によりマイグレーション & シードが自動実行されます。

**所要時間**: 20-30分（初回 Docker ビルド込み）

**⚠️ 注意**: ACM証明書のDNS検証が必要です。Route53にCNAMEレコードを追加してください。

#### ACM証明書のDNS検証手順

1. 証明書の詳細を確認：
```bash
aws acm list-certificates --region ap-northeast-1
```

2. 検証レコードを確認：
```bash
aws acm describe-certificate --certificate-arn <CertificateArn> --region ap-northeast-1
```

3. Route53にCNAMEレコードを追加（出力された`ResourceRecord`の値を使用）

4. 証明書が発行されるまで待つ（5-30分）


### 3. PipelineStack のデプロイ

```bash
bunx cdk deploy LydosPipelineStack
```

CodePipeline を構築します。以降は `lydos-api` の `main` ブランチへの push で自動デプロイされます。

**所要時間**: 5分

### 4. AmplifyStack のデプロイ

```bash
bunx cdk deploy LydosAmplifyStack
```

AWS Amplify アプリケーションが作成され、GitHub リポジトリと連携されます。

**所要時間**: 5-10分

### すべてのスタックを一度にデプロイ

```bash
bunx cdk deploy --all
```

**⚠️ 注意**: 依存関係があるため、順次デプロイされます。全体で30-45分程度かかります。

## 便利なコマンド

### 開発

- `bun run build` - TypeScript をコンパイル
- `bun run watch` - ファイル変更を監視して自動コンパイル
- `bun run test` - Jest ユニットテストを実行
- `bun run lint` - Biome でリント
- `bun run format` - Biome でフォーマット
- `bun run check:fix` - リントとフォーマットを自動修正

### CDK

- `bunx cdk list` - スタック一覧を表示
- `bunx cdk diff <スタック名>` - デプロイ前の変更内容を確認
- `bunx cdk synth <スタック名>` - CloudFormation テンプレートを生成
- `bunx cdk deploy <スタック名>` - 特定のスタックをデプロイ
- `bunx cdk destroy <スタック名>` - スタックを削除

## インフラ構成

### DatabaseStack

- **VPC**: 10.0.0.0/16
  - Public Subnet × 2 (AZ分散)
  - Private Subnet × 2 (AZ分散)
- **RDS**: PostgreSQL 16 (t3.micro)
- **ElastiCache**: Redis 7.1 (cache.t3.micro)
- **Bastion Host**: Amazon Linux 2023 (t3.micro)

### EcsStack

- **ECR**: Docker イメージリポジトリ
  - リポジトリ名: `lydos-api`
  - イメージスキャン有効
  - ライフサイクルルール: 最新10イメージ保持
- **ECS Fargate**: コンテナ実行環境
  - クラスター: `lydos-api-cluster`
  - タスク: 0.25vCPU / 0.5GB メモリ
  - Publicサブネットに配置
- **ALB**: Application Load Balancer
  - HTTPS対応（ACM証明書）
  - HTTPからHTTPSへリダイレクト
  - ドメイン: `api.lydos.click`
- **初回ビルド (Custom Resource)**:
  - CDK デプロイ時に CodeBuild を同期実行、ECR にイメージをプッシュ後に ECS が起動
- **Secrets Manager**:
  - Clerk Secret Key
  - Stripe Secret Key
  - Gemini API Key
  - Groq API Key

### PipelineStack

- **CodePipeline**: GitHub `main` push → CodeBuild → ECR → ECS ローリングデプロイ

### AmplifyStack

- **Platform**: WEB (React SPA)
- **Build**: Bun
- **Custom Domain**: www.lydos.click

## Bastion Host 経由でのデータベース接続

### 1. 接続情報の取得

#### Bastion Public IP の確認
1. CloudFormation コンソールを開く
2. `LydosDatabaseStack` を選択
3. 「出力」タブをクリック
4. `BastionBastionPublicIp...` の値をコピー

#### RDS Endpoint の確認
1. RDS コンソールを開く
2. 「データベース」から該当のデータベースをクリック
3. 「接続とセキュリティ」セクションの「エンドポイント」をコピー

#### Redis Endpoint の確認
1. ElastiCache コンソールを開く
2. 「Redis クラスター」を選択
3. クラスター名（`lyd-el-...`）をクリック
4. **「ノード」タブ**をクリック
5. 「エンドポイント」列のアドレスをコピー（例: `xxx.cache.amazonaws.com:6379`）

### 2. GUI ツールで接続

#### PostgreSQL
1. SSH タブまたはトンネル設定を開く
2. SSH 接続情報を入力：
   - SSH Host: Bastion の Public IP
   - SSH User: `ec2-user`
   - SSH Key: `~/.ssh/lydos-bastion.pem`
3. データベース接続情報を入力：
   - Host: RDS Endpoint
   - Port: `5432`
   - Database: `lydos`
   - User: `postgres`
   - Password: Secrets Manager から取得
4. テスト接続 → 保存

#### Redis
1. SSH トンネル設定を有効化
2. SSH 接続情報を入力：
   - SSH Host: Bastion の Public IP
   - SSH User: `ec2-user`
   - SSH Key: `~/.ssh/lydos-bastion.pem`
3. Redis 接続情報を入力：
   - Host: Redis Endpoint（ノードタブから取得）
   - Port: `6379`
   - Password: なし
4. テスト接続 → 保存

## CI/CD パイプライン

### 概要

`lydos-api` リポジトリの `main` ブランチにコードをプッシュすると、自動的にECSにデプロイされます。

### フロー

```
GitHub (lydos-api/main)
  ↓ git push
CodePipeline
  ↓ Source Stage
GitHub Checkout
  ↓ Build Stage
CodeBuild
  - Dockerイメージビルド
  - ECRにプッシュ
  - imagedefinitions.json生成
  ↓ Deploy Stage
ECS Deploy
  - 新しいタスク定義作成
  - サービス更新（ローリングデプロイ）
```

### パイプライン確認

```bash
# パイプライン一覧
aws codepipeline list-pipelines

# パイプライン詳細
aws codepipeline get-pipeline --name lydos-api-pipeline

# 実行履歴
aws codepipeline list-pipeline-executions --pipeline-name lydos-api-pipeline
```

### 手動デプロイ（パイプラインを使わない場合）

```bash
# 1. ECRログイン
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com

# 2. イメージビルド
cd lydos-api
docker build -t lydos-api .

# 3. タグ付け
docker tag lydos-api:latest <ECR_URI>/lydos-api:latest

# 4. プッシュ
docker push <ECR_URI>/lydos-api:latest

# 5. ECSサービス更新（新しいイメージを使用）
aws ecs update-service --cluster lydos-api-cluster --service lydos-api-service --force-new-deployment --region ap-northeast-1
```

## トラブルシューティング

### ACM証明書の検証が完了しない

**症状**: ECSスタックのデプロイが長時間止まる

**原因**: DNS検証レコードが正しく追加されていない

**解決方法**:
1. Route53のホストゾーンを確認
2. ACM証明書の検証レコード（CNAME）が存在するか確認
3. DNSの伝播を待つ（最大30分）

### ECSタスクが起動しない

**症状**: ECSサービスは作成されたがタスクが0個

**原因**: ECRにイメージがない、または環境変数/シークレットの問題

**解決方法**:
```bash
# 1. ECRイメージ確認
aws ecr list-images --repository-name lydos-api --region ap-northeast-1

# 2. タスク定義確認
aws ecs describe-task-definition --task-definition lydos-api-task-def --region ap-northeast-1

# 3. サービスイベント確認
aws ecs describe-services --cluster lydos-api-cluster --services lydos-api-service --region ap-northeast-1

# 4. CloudWatch Logsでエラー確認
aws logs tail /ecs/lydos-api --follow --region ap-northeast-1
```

### CI/CDパイプラインが失敗する

**症状**: CodeBuildでビルドが失敗

**解決方法**:
```bash
# ビルドログ確認
aws codebuild batch-get-builds --ids <build-id> --region ap-northeast-1
```

一般的な原因:
- Dockerfileの構文エラー
- 依存関係のインストール失敗
- ECRへのプッシュ権限不足

## 費用概算

### 月額コスト（24時間稼働の場合）

- **RDS (t3.micro)**: ~$15
- **ElastiCache (cache.t3.micro)**: ~$12
- **Bastion (t3.micro)**: ~$7
- **ECS Fargate (0.25vCPU/0.5GB)**: ~$10
- **ALB**: ~$16
- **NAT Gateway**: $0（使用していない）
- **その他（ECR、Secrets Manager、CloudWatch Logs）**: ~$5

**合計**: 約 $65/月

### コスト削減のヒント

- Bastionを使わないときは停止する
- 開発環境は使用時のみ起動
- CloudWatch Logsの保持期間を短くする（現在1週間）
- ALBのアイドル削除を有効化
