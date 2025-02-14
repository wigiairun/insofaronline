// server.js
const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// ルート: ホームページ（テスト用）
app.get('/', (req, res) => {
  res.send('Hello, Node.js!');
});

// /login ルート: ユーザーを eBay の認可画面へ誘導するリンクを表示
app.get('/login', (req, res) => {
  // eBay Developer Program で取得したクライアントID
  const clientId = 'DaikiSai-Sellerha-PRD-695e48f43-9d8fa6bd';

  // eBay に登録したリダイレクトURL（例: /callback）
  // テスト環境の場合は、localhost を使用してください。例: http://localhost:3000/callback
  const redirectUri = encodeURIComponent('http://localhost:3000/callback');
  
  // 要求するスコープ（必要に応じて調整）
  const scope = encodeURIComponent('https://api.ebay.com/oauth/api_scope');
  
  // CSRF対策用のランダム文字列（ここでは例として固定値）
  const state = 'abc123';

  // eBay の認可エンドポイントへの URL を組み立てる
  const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;

  // HTML を返して、ユーザーがリンクをクリックできるようにする
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>eBay OAuth Login</title>
      </head>
      <body>
        <h1>eBayでログイン</h1>
        <p>
          <a href="${authUrl}">こちらをクリックしてeBayでログイン</a>
        </p>
      </body>
    </html>
  `);
});

// /callback ルート: eBay から認可コードが返ってきた後に、アクセストークンを取得
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('認可コードが見つかりませんでした。');
  }

  try {
    // eBay のトークンエンドポイント（Production 環境）
    // Sandbox 環境でテストする場合は、URLを https://api.sandbox.ebay.com/identity/v1/oauth2/token に変更してください
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';

    // eBay Developer Program で取得した Client ID / Client Secret
    const CLIENT_ID = 'DaikiSai-Sellerha-PRD-695e48f43-9d8fa6bd';
    const CLIENT_SECRET = 'PRD-95e48f431292-9b95-4b3f-85d4-7bc7';

    // リダイレクトURLは、eBay 側で設定したものと同じにしてください
    const REDIRECT_URI = 'http://localhost:3000/callback';

    // eBay へアクセストークン取得のリクエストを送る
    const response = await axios.post(tokenUrl, null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // 取得したトークン情報を画面に表示（実際にはDB保存やセッション管理を検討してください）
    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Token Received</title>
        </head>
        <body>
          <h1>アクセストークンを取得しました</h1>
          <p><strong>access_token:</strong> ${access_token}</p>
          <p><strong>refresh_token:</strong> ${refresh_token}</p>
          <p><strong>expires_in:</strong> ${expires_in} 秒</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).send('トークン取得に失敗しました。');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
