# Lydos IaC

AWS CDK (TypeScript) で構築する Lydos のインフラストラクチャ

## スタック構成

1. **LydosDatabaseStack** - VPC、RDS (PostgreSQL)、ElastiCache (Redis)、Bastion Host
2. **LydosAmplifyStack** - AWS Amplify (React SPA ホスティング)

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

### 3. AWS CDK Bootstrap（初回のみ）

```bash
bunx cdk bootstrap
```

## デプロイ

### 1. DatabaseStack のデプロイ

```bash
bunx cdk deploy LydosDatabaseStack
```

VPC、RDS、ElastiCache、Bastion Host が作成されます。

### 2. AmplifyStack のデプロイ

```bash
bunx cdk deploy LydosAmplifyStack
```

AWS Amplify アプリケーションが作成され、GitHub リポジトリと連携されます。

### すべてのスタックを一度にデプロイ

```bash
bunx cdk deploy --all
```

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

### AmplifyStack

- **Platform**: WEB (React SPA)
- **Build**: Bun
- **Custom Domain**: lydos.click

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
