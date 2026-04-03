import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpotAuth, TokenResult } from "../../provider/auth";

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>): string {
  const header = "eyJhbGciOiJSUzI1NiJ9";
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = "fakesig";
  return `${header}.${payloadB64}.${sig}`;
}

const ORG_ID = "org_KToQb0hKFDunDte3";
const EXPECTED_NAMESPACE = "org-ktoqb0hkfdundte3";
const VALID_JWT = makeJwt({ org_id: ORG_ID, exp: 9999999999 });
const EXPIRED_JWT = makeJwt({ org_id: ORG_ID, exp: 1000000000 });

// ---------------------------------------------------------------------------
// Mock fetch — new flow: OIDC discovery → token exchange
// ---------------------------------------------------------------------------

function makeFetch(idToken: string) {
  return vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("/.well-known/openid-configuration")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token_endpoint: "https://login.spot.rackspace.com/oauth/token" }),
      });
    }
    if (String(url).includes("/oauth/token")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id_token: idToken }),
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SpotAuth", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns idToken, orgId, and correct namespace on success", async () => {
    global.fetch = makeFetch(VALID_JWT) as unknown as typeof fetch;

    const auth = new SpotAuth("my-refresh-token");
    const result: TokenResult = await auth.getToken();

    expect(result.idToken).toBe(VALID_JWT);
    expect(result.orgId).toBe(ORG_ID);
    expect(result.namespace).toBe(EXPECTED_NAMESPACE);
  });

  it("derives namespace correctly: org_KToQb0hKFDunDte3 → org-ktoqb0hkfdundte3", async () => {
    global.fetch = makeFetch(VALID_JWT) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    const { namespace } = await auth.getToken();

    expect(namespace).toBe("org-ktoqb0hkfdundte3");
  });

  it("caches the token and does not re-fetch on second call", async () => {
    const mockFetch = makeFetch(VALID_JWT);
    global.fetch = mockFetch as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await auth.getToken();
    await auth.getToken();

    // OIDC discovery + token exchange = 2 calls total; 0 on second
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when the cached token is expired", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/.well-known/openid-configuration")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token_endpoint: "https://login.spot.rackspace.com/oauth/token" }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // First call returns expired, second returns valid
    let tokenCallCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/.well-known/openid-configuration")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token_endpoint: "https://login.spot.rackspace.com/oauth/token" }),
        });
      }
      if (String(url).includes("/oauth/token")) {
        tokenCallCount++;
        const jwt = tokenCallCount === 1 ? EXPIRED_JWT : VALID_JWT;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id_token: jwt }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await auth.getToken(); // expired
    await auth.getToken(); // should re-fetch

    // 2 discovery + 2 token exchange = 4 calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws when OIDC discovery fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await expect(auth.getToken()).rejects.toThrow(/OIDC discovery/i);
  });

  it("throws when the token exchange endpoint returns a non-ok response", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/.well-known/openid-configuration")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token_endpoint: "https://login.spot.rackspace.com/oauth/token" }),
        });
      }
      return Promise.resolve({ ok: false, status: 401 });
    }) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await expect(auth.getToken()).rejects.toThrow(/token exchange/i);
  });
});
