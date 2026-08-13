import { timingSafeEqual } from "crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

/**
 * Google sign-in (identity-backed pseudonymity — playbook Tier-1). A verified
 * human on the backend; to other users you are still only an emoji.
 *
 * The Google provider is added ONLY when its credentials are present, so the
 * app builds and runs untouched until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * are configured. `NEXT_PUBLIC_AUTH_ENABLED` gates the client-side UI.
 */
export const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

/**
 * Sign-in that doesn't depend on Google.
 *
 * Every meaningful route (`/api/curve`, `/api/profile`) calls getServerSession,
 * so with no provider configured the app loads but cannot be used at all —
 * clicking sign-in just lands on /api/auth/error. That makes the project
 * impossible to work on until an OAuth client exists and its redirect URI is
 * registered, which is a console step no amount of local config can substitute
 * for. This provider is the escape hatch.
 *
 * Two modes, because a deployed URL is public and a laptop isn't:
 *
 *   local  — name only. Zero friction; nobody else can reach localhost.
 *   hosted — name + the access code in VC_ACCESS_CODE. Unset in production
 *            (the default) the provider does not exist at all, so it can never
 *            become an accidental open door on a public deployment.
 */
const accessCode = process.env.VC_ACCESS_CODE?.trim() || "";
const isProduction = process.env.NODE_ENV === "production";

const devLoginEnabled =
  process.env.VC_DEV_LOGIN !== "false" &&
  (isProduction ? accessCode.length > 0 : true);

/**
 * Timing-safe compare — a plain `===` on a secret leaks its length and prefix
 * through response timing. Cheap to do correctly, so do it correctly.
 */
function codeMatches(supplied: string): boolean {
  if (!accessCode) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(accessCode);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const devProvider = CredentialsProvider({
  id: "dev",
  name: isProduction ? "Sign in with an access code" : "Continue as a local test user",
  credentials: {
    name: { label: "Name", type: "text", placeholder: "Shivang" },
    ...(isProduction
      ? { code: { label: "Access code", type: "password" } }
      : {}),
  },
  async authorize(credentials) {
    if (isProduction && !codeMatches((credentials?.code || "").trim())) return null;
    const name = (credentials?.name || "").trim() || "Local Tester";
    // Stable id per name, so the same name is the same soul across restarts.
    const id = `dev-${Buffer.from(name.toLowerCase()).toString("hex").slice(0, 24)}`;
    return { id, name, email: `${id}@localhost` };
  },
});

export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(devLoginEnabled ? [devProvider] : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    // Credentials sessions carry no sub by default; keep the id stable.
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    // keep users inside our own calm UI rather than the default NextAuth page
    signIn: "/app",
  },
};
