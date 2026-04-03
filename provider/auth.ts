/**
 * Rackspace Spot OIDC issuer. Discovered via .well-known/openid-configuration.
 * This is the public Auth0 tenant for Rackspace Spot — present in every JWT they issue.
 */
const OIDC_ISSUER = "https://login.spot.rackspace.com";

/**
 * Rackspace Spot Auth0 client ID (audience). This is a public OIDC value present
 * in every JWT's `aud` claim — not a secret. OIDC discovery doesn't expose
 * per-application client IDs, so this must be hardcoded.
 */
const OIDC_CLIENT_ID = "mwG3lUMV8KyeMqHe4fJ5Bb3nM1vBvRNa";

export interface TokenResult {
  idToken: string;
  orgId: string;
  namespace: string;
}

interface JwtPayload {
  org_id: string;
  exp: number;
  [key: string]: unknown;
}

interface CachedToken {
  result: TokenResult;
  /** Unix timestamp (seconds) after which this token should be refreshed */
  expiresAt: number;
}

export class SpotAuth {
  private readonly refreshToken: string;
  private readonly apiBase: string;
  private cache: CachedToken | null = null;

  constructor(refreshToken: string, apiBase = "https://spot.rackspace.com") {
    this.refreshToken = refreshToken;
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async getToken(): Promise<TokenResult> {
    const nowSec = Math.floor(Date.now() / 1000);

    if (this.cache !== null && nowSec < this.cache.expiresAt) {
      return this.cache.result;
    }

    const idToken = await this.exchangeToken();
    const payload = this.decodeJwtPayload(idToken);

    const orgId = payload.org_id;
    const namespace = orgId.toLowerCase().replace(/_/g, "-");

    const result: TokenResult = { idToken, orgId, namespace };
    this.cache = { result, expiresAt: payload.exp - 60 };

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async discoverTokenEndpoint(): Promise<string> {
    // Use OIDC discovery to find the token endpoint — unauthenticated and resilient
    // to domain changes. Only the clientId is hardcoded (OIDC discovery doesn't
    // expose per-application client IDs).
    const res = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`);
    if (!res.ok) {
      throw new Error(`OIDC discovery failed (HTTP ${res.status}): ${OIDC_ISSUER}`);
    }
    const config: { token_endpoint: string } = await res.json();
    return config.token_endpoint;
  }

  private async exchangeToken(): Promise<string> {
    const tokenEndpoint = await this.discoverTokenEndpoint();

    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: OIDC_CLIENT_ID,
        refresh_token: this.refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Token exchange failed (HTTP ${res.status}) against ${tokenEndpoint}`);
    }

    const data: { id_token: string } = await res.json();
    return data.id_token;
  }

  private decodeJwtPayload(jwt: string): JwtPayload {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT: expected 3 segments");
    }
    const raw = Buffer.from(parts[1], "base64").toString("utf-8");
    return JSON.parse(raw) as JwtPayload;
  }
}
