export interface TokenResult {
  idToken: string;
  orgId: string;
  namespace: string;
}

interface Auth0ClientEntry {
  name: string;
  domain: string;
  clientId: string;
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

    const { domain, clientId } = await this.fetchAuth0Client();
    const idToken = await this.exchangeToken(domain, clientId);
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

  private async fetchAuth0Client(): Promise<{ domain: string; clientId: string }> {
    const url = `${this.apiBase}/organizer/auth0clients`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `Failed to fetch auth0clients (HTTP ${res.status}): ${url}`
      );
    }

    const clients: Auth0ClientEntry[] = await res.json();
    const entry = clients.find((c) => c.name === "NGPC UI");

    if (!entry) {
      throw new Error(
        'NGPC UI entry not found in auth0clients response'
      );
    }

    return { domain: entry.domain, clientId: entry.clientId };
  }

  private async exchangeToken(domain: string, clientId: string): Promise<string> {
    const url = `https://${domain}/oauth/token`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: this.refreshToken,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(
        `Token exchange failed (HTTP ${res.status}) against ${url}`
      );
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
