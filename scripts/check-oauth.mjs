#!/usr/bin/env node
/**
 * Ask Google which redirect URIs it will actually accept for our client.
 *
 * `redirect_uri_mismatch` is opaque from the app side: the config is correct
 * locally and the failure lives in a console list you cannot read back. So we
 * ask the authorisation endpoint directly — an unregistered URI is bounced to
 * /signin/oauth/error, a registered one continues to the sign-in page. No
 * credentials and no browser involved; only the public client_id is sent.
 *
 *   node scripts/check-oauth.mjs
 */
import { readFileSync } from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
} catch {
  console.error("No .env.local found — run this from the repo root.");
  process.exit(1);
}

const clientId = env.GOOGLE_CLIENT_ID;
if (!clientId) {
  console.error("GOOGLE_CLIENT_ID is not set in .env.local");
  process.exit(1);
}

// Every URI the app can ever send: NextAuth always builds
// `${NEXTAUTH_URL}/api/auth/callback/${providerId}`.
const origins = [
  env.NEXTAUTH_URL || "http://localhost:3000",
  "https://vibecurve-shivang.vercel.app",
];
const uris = [...new Set(origins)].map(
  (o) => `${o.replace(/\/$/, "")}/api/auth/callback/google`,
);

async function isRegistered(redirectUri) {
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
    });
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  if (location.includes("signin/oauth/error")) return false;
  if (res.status >= 300 && res.status < 400) return true;
  return null; // couldn't tell — treat as inconclusive rather than a pass
}

console.log(`\nclient_id  ${clientId.slice(0, 24)}…`);
console.log(`project    ${clientId.split("-")[0]}\n`);

let allGood = true;
for (const uri of uris) {
  let ok;
  try {
    ok = await isRegistered(uri);
  } catch (err) {
    console.log(`  ?  could not reach Google (${err.message})`);
    process.exit(2);
  }
  if (ok === true) console.log(`  ✅ registered      ${uri}`);
  else if (ok === false) {
    console.log(`  ❌ NOT registered  ${uri}`);
    allGood = false;
  } else {
    console.log(`  ?  inconclusive    ${uri}`);
    allGood = false;
  }
}

if (allGood) {
  console.log("\nAll redirect URIs are registered. Google sign-in will work.\n");
  process.exit(0);
}

console.log(`
Fix it at:
  https://console.cloud.google.com/apis/credentials?project=${clientId.split("-")[0]}

Open the OAuth 2.0 Client ID whose ID starts ${clientId.slice(0, 12)} — check this,
it is the mistake that wastes the most time — and paste the failing URI above into
"Authorised redirect URIs". That is the LOWER box on the page. The upper box,
"Authorised JavaScript origins", must not contain a path and is not what NextAuth
uses. Then press SAVE and re-run this script; changes can take a minute.
`);
process.exit(1);
