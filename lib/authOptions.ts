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
 * Local development sign-in.
 *
 * Every meaningful route (`/api/curve`, `/api/profile`) calls getServerSession,
 * so with no provider configured the app loads but cannot be used at all —
 * clicking sign-in just lands on /api/auth/error. That makes the project
 * impossible to work on without first registering an OAuth client.
 *
 * So in development only, we offer a name-only credentials provider. It is
 * gated on NODE_ENV and refuses to exist in a production build, so it cannot
 * become an authentication bypass on a deployed site.
 */
const devLoginEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.VC_DEV_LOGIN !== "false";

const devProvider = CredentialsProvider({
  id: "dev",
  name: "Continue as a local test user",
  credentials: {
    name: { label: "Name", type: "text", placeholder: "Shivang" },
  },
  async authorize(credentials) {
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
