"use strict";

const http = require("http");

let google;
try {
  ({ google } = require("googleapis"));
} catch (error) {
  ({ google } = require("../functions/node_modules/googleapis"));
}

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth2callback";

if (!clientId || !clientSecret) {
  console.error("Thiếu GMAIL_CLIENT_ID hoặc GMAIL_CLIENT_SECRET.");
  console.error("PowerShell ví dụ:");
  console.error("$env:GMAIL_CLIENT_ID='...'; $env:GMAIL_CLIENT_SECRET='...'; node tools/gmail-oauth.js");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = ["https://www.googleapis.com/auth/gmail.readonly"];
const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, redirectUri);
  if (requestUrl.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    res.writeHead(400);
    res.end("Missing code");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("OK. Quay lại terminal để copy refresh token.");
    console.log("\nGMAIL_REFRESH_TOKEN:");
    console.log(tokens.refresh_token || "(Không có refresh_token. Chạy lại và nhớ prompt=consent, hoặc xóa quyền app trong Google Account.)");
    console.log("\nLưu vào Firebase Secret:");
    console.log("firebase functions:secrets:set GMAIL_REFRESH_TOKEN");
    server.close();
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message);
    console.error(error);
    server.close();
  }
});

server.listen(3000, () => {
  console.log("Mở link này, đăng nhập Gmail nhận ACB: nguyenthingocnhung0703@gmail.com\n");
  console.log(url);
  console.log("\nĐang chờ callback tại http://localhost:3000/oauth2callback ...");
});
