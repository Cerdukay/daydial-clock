import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getClerkToken } from "./token";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  const jwksUrl = process.env["CLERK_JWKS_URL"];
  if (!jwksUrl) {
    throw new Error("Missing CLERK_JWKS_URL for server function authentication");
  }

  if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
  return jwks;
}

export const attachClerkAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await getClerkToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

export const requireClerkAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const token = request?.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) throw new Error("Unauthorized");

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: process.env["CLERK_ISSUER"] || undefined,
    });
    if (!payload.sub) throw new Error("Invalid token");
    return next({ context: { userId: payload.sub, claims: payload } });
  } catch {
    throw new Error("Unauthorized");
  }
});
