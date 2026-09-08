type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setNeonTokenGetter(getToken: TokenGetter | null) {
  tokenGetter = getToken;
}

export async function getClerkToken() {
  return tokenGetter?.() ?? null;
}
