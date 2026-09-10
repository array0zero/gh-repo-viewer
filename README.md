# GitHub Repo Viewer

自分の GitHub リポジトリをカード表示し、名前検索・言語フィルタ・更新日／スター数／名前順の並び替えを行うブラウザアプリです。Vite + TypeScript、実行時の外部ライブラリなし。

## 起動と検証

Node.js 22.12 以降（Node.js 24 推奨）を使用します。PowerShell では以下を実行してください。

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd test
```

開発サーバーが表示する localhost の URL を開きます。ビルド出力は `dist/`。`npm.cmd run preview` でビルド結果を確認できます。配信先は localhost または HTTPS を使用してください（キャッシュ識別に Web Crypto を使用）。

テストは Vitest + happy-dom で DOM 操作とモック通信を検証します。実ブラウザも実際の GitHub API も呼びません。

## 使い方

1. 自分の GitHub ユーザー名を入力し、「リポジトリを取得」を押します。トークンなしでは公開リポジトリを表示します。
2. 非公開も表示する場合はトークンを入力します。認証ありではユーザー名欄にかかわらずトークン所有者の所有リポジトリを取得します。
3. 名前検索と言語フィルタは組み合わせられます。並び替えは更新日降順・スター数降順・名前昇順です。
4. 10分未満の再取得は保存結果を利用します。「キャッシュを破棄」は通信せず、次の取得時に再通信します。

最大100件×3ページまで取得します。300件を超える場合は画面に通知し、取得した範囲だけを検索・並び替えします。API 残回数は最終レスポンスの値で、キャッシュ利用時は取得時点の値です。

## トークンの用意

GitHub の Settings → Developer settings → Personal access tokens から作成します。

- **Fine-grained tokens**: Generate new token を選び、有効期限と自分の Resource owner を指定します。Repository access で対象を選択し、Repository permissions は **Metadata: Read-only** を最小構成とします。生成したトークンを入力欄に貼り付けてください。
- **Tokens (classic)**: Generate new token (classic) を選び、有効期限と **repo** スコープを設定します。非公開リポジトリを取得できますが、repo は書き込みも可能な広い権限です。本アプリは読み取りだけを行います。
- 公開リポジトリだけならトークンは不要です。Fine-grained トークンでは許可したリポジトリだけが対象になります。

詳細は [GitHub のトークン作成手順](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) と [リポジトリ取得 API の権限](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user) を参照してください。

トークンと取得結果（非公開のメタデータを含む）はこのオリジンの localStorage に保存されます。共有端末では利用後にトークン欄を空にし、キャッシュを破棄してください。トークンは `.env`、ソースコード、ビルド成果物には埋め込みません。

仕様は `docs/specs/mvp.md`、設計判断は `docs/decisions/` にあります。`docs/walkthrough.md` と `docs/modules.md` は今回の依頼では作成対象外です。
