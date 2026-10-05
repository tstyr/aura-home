# Aura Home

時計、天気、音楽、予定、ToDo、ニュースをまとめたPWAです。iPadとPCで使えます。

- サービス: https://aura-home-beta.vercel.app
- ソース: https://github.com/tstyr/aura-home
- ライセンス: MIT

## 利用する

「Googleで続ける」からログインします。初回も同じボタンです。左上のプロフィールから表示名、連携、通知、端末、バックアップ、ウィジェットを管理できます。利用者ごとに保存先と端末内の設定を分け、他の利用者のデータは表示しません。

Googleカレンダーは任意の読み取り専用連携です。一般向けのCalendar接続にはGoogle側の公開設定・審査が必要です。個別に設置する場合は自分のGoogle Cloudプロジェクトを使ってください。

## 時計・ガラス・天気のデザイン

アプリ選択の「時計の色・フォント」から設定の「表示」を直接開けます。背景にも時計の色を置いています。設定の「表示」で時計の色・4種類のフォント・太さ・間隔・位置・日付と秒の色/サイズを変更できます。ライブ/全画面プレビュー、8件までのスタイル保存、画面ごとのぼかしとガラスの濃さに対応します。ぼかしは0にできます。

天気の地域を設定すると、晴れ・曇り・雨・雪・霧と昼夜に背景が連動します。雨は窓ガラスの雨粒と遠くのぼやけた光で表現します。設定内で全種類を試せます。背景に「天気」の欄があり、自動連動・手動の晴れ/曇り/雨/雷雨/雪/霧・カラー/写真を切り替えられます。手動では地域未設定でも表示でき、昼/夜も選べます。写真へ効果を重ねず、背景全体を切り替えます。静止/控えめ/標準と端末の動きを減らす設定に対応します。

stats.fmの公開プロフィールを登録し、APIで再生中と判定できる曲があるときだけ、天気の隣にジャケット・曲名・アーティストを表示します。待機画面にも表示し、30秒ごとに確認します。音楽画面で時計画面への表示をオン/オフでき、接続・再生状態を確認できます。停止中・取得失敗・古い情報は非表示にします。音楽の再生操作は各サービスで行います。

## 自分の環境に設置する

Node.js 24、Supabase、Vercelを使います。

1. このリポジトリをcloneし、`npm ci` を実行します。
2. `.env.example` を `.env.local` にコピーし、自分のサービス用の値を設定します。秘密値をGitへコミットしないでください。
3. Supabaseプロジェクトを作成し、DBのTransaction poolerを `DATABASE_URL` に設定します。パスワードはURIエンコードします。
4. `npm run db` でテーブルと非公開Storageを作成します。アプリの6テーブルはRLSを有効にし、ブラウザのanon/authenticatedロールには直接のテーブル権限を与えません。認証済みサーバーで利用者ごとにスコープします。
5. Supabase AuthのSite URLを本番URL、許可するredirectを `https://YOUR-APP/auth/callback` に設定します。
6. Google CloudでWeb OAuthクライアントを作り、Supabase Authのcallback `https://YOUR-REF.supabase.co/auth/v1/callback` を登録します。IDとSecretをSupabaseのGoogle Providerに設定します。
7. Google Providerの設定後に `GOOGLE_AUTH_ENABLED=true` を設定します。ログインで使う権限はopenid・email・profileです。
8. Vercelの環境変数を設定し、`npm run build` 後にdeployします。

一般向けのサービスでは `PUBLIC_SIGNUPS=true` にします。`OWNER_EMAIL` は一般利用者の制限には使われません。個人用の設置では `PUBLIC_SIGNUPS=false` と `OWNER_EMAIL` を設定します。

既存データ移行用の `APP_DATA_USER_ID` は、確認済みの `OWNER_EMAIL` に一致するアカウントだけに適用します。その他のアカウントの保存先はAuthの利用者IDです。新規設置では移行用の2変数は空欄にしてください。

メールログインを一般利用者へ提供する場合は、Supabaseで独自SMTPの設定が必要です。標準メール送信の制限に依存しないよう、公開サービスではGoogleログインを主方式にします。

## 任意の連携

|機能|設定・制限|
|---|---|
|Google Calendar|`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_TOKEN_KEY`。戻り先は `/api/google/callback`。GoogleのCalendar APIと読み取り権限の設定・審査が必要|
|Google接続の暗号化|32バイトの乱数をBase64にした `GOOGLE_TOKEN_KEY`。既存接続を維持する間は変更しない|
|天気|Open-Meteo。地域を選択。現在地の座標を同期設定には保存しない|
|音楽|stats.fm公開プロフィール。Spotify / Apple Music / YouTube Musicへの曲リンク|
|ニュース|NHK / Googleニュースの見出し。記事本文は提供元で読む|
|スポーツ|TheSportsDBの無料API。件数制限あり。必要なら `SPORTSDB_API_KEY`|
|アニメ|Jikan / MyAnimeList。通信エラー時はAniList。公開予定の日付で絞り込む|
|映画の自動取得|任意の `TMDB_TOKEN`。未設定でも作品を手動保存できる|
|交通のライブ情報|任意の `ODPT_KEY`。未設定でも路線・出発時刻・公式リンクを登録できる|
|通知|許可した端末でアプリを開いている間だけ。バックグラウンドPushは未実装|

## 開発・検証

`npm run dev` でローカルサーバーを起動し、`npm test` で回帰テストを実行します。テストはPGliteと模擬認証・外部APIを使い、本番データを変更しません。

確認対象: 認証済みのログイン画面からの遷移、公開/個人用ログイン、利用者別のDB/Storage/ローカル保存、CSRF、偽装ヘッダー、端末失効、設定競合、バックアップ、OAuth PKCEとstate、暗号化、Calendar取得、外部フィードの制限。

データ書き出しには設定・ToDo・予定・タイマーを含めます。Google接続トークンやiCalの秘密URLは含めません。JSONからの復元は設定のみです。アカウント削除は本人の確認入力が必要で、その利用者のデータとログイン情報だけを削除します。

## 貢献・安全な報告

不具合や改善提案はGitHub Issuesへ。パスワード、認証コード、トークン、個人の予定は公開しないでください。秘密の環境設定・個人データ・デプロイ管理ファイルはリポジトリに含めません。

第三者サービスのデータや利用者の画像はこのソフトウェアのMITライセンスの対象外です。提供元の利用条件と表示上の出典を尊重してください。
