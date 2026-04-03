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

// Non-expired JWT (exp far in future)
const VALID_JWT = makeJwt({ org_id: ORG_ID, exp: 9999999999 });

// Expired JWT (exp in the past)
const EXPIRED_JWT = makeJwt({ org_id: ORG_ID, exp: 1000000000 });

// ---------------------------------------------------------------------------
// Mock fetch responses
// ---------------------------------------------------------------------------

const AUTH0_CLIENTS_RESPONSE = [
  { name: "Some Other App", domain: "other.auth0.com", clientId: "other123" },
  { name: "NGPC UI", domain: "rackspace.auth0.com", clientId: "clientABC" },
];

function makeFetch(idToken: string) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).includes("/organizer/auth0clients")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(AUTH0_CLIENTS_RESPONSE),
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

  // 1. Successful token exchange
  it("returns idToken, orgId, and correct namespace on success", async () => {
    global.fetch = makeFetch(VALID_JWT) as unknown as typeof fetch;

    const auth = new SpotAuth("my-refresh-token");
    const result: TokenResult = await auth.getToken();

    expect(result.idToken).toBe(VALID_JWT);
    expect(result.orgId).toBe(ORG_ID);
    expect(result.namespace).toBe(EXPECTED_NAMESPACE);
  });

  // 2. Namespace derivation: underscores → hyphens, full lowercase
  it("derives namespace correctly: org_KToQb0hKFDunDte3 → org-ktoqb0hkfdundte3", async () => {
    global.fetch = makeFetch(VALID_JWT) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    const { namespace } = await auth.getToken();

    expect(namespace).toBe("org-ktoqb0hkfdundte3");
  });

  // 3. Token caching — second call must not re-fetch
  it("caches the token and does not re-fetch on second call", async () => {
    const mockFetch = makeFetch(VALID_JWT);
    global.fetch = mockFetch as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await auth.getToken();
    await auth.getToken();

    // auth0clients + token endpoint = 2 calls total on first getToken; 0 on second
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // 4. Token refresh after expiry
  it("re-fetches when the cached token is expired", async () => {
    const mockFetch = vi
      .fn()
      .mockImplementationOnce((url: string) => {
        // first auth0clients call
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(AUTH0_CLIENTS_RESPONSE),
        });
      })
      .mockImplementationOnce((url: string) => {
        // first token call → expired JWT
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id_token: EXPIRED_JWT }),
        });
      })
      .mockImplementationOnce((url: string) => {
        // second auth0clients call
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(AUTH0_CLIENTS_RESPONSE),
        });
      })
      .mockImplementationOnce((url: string) => {
        // second token call → valid JWT
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id_token: VALID_JWT }),
        });
      });

    global.fetch = mockFetch as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await auth.getToken(); // loads expired token
    await auth.getToken(); // should detect expiry and re-fetch

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  // 5. Error: auth0clients HTTP failure
  it("throws when auth0clients endpoint returns a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await expect(auth.getToken()).rejects.toThrow(/auth0clients/i);
  });

  // 6. Error: NGPC UI entry not found
  it("throws when NGPC UI entry is missing from auth0clients response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "Other App", domain: "x.auth0.com", clientId: "x" },
        ]),
    }) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await expect(auth.getToken()).rejects.toThrow(/NGPC UI/);
  });

  // 7. Error: token exchange HTTP failure
  it("throws when the token exchange endpoint returns a non-ok response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(AUTH0_CLIENTS_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      }) as unknown as typeof fetch;

    const auth = new SpotAuth("tok");
    await expect(auth.getToken()).rejects.toThrow(/token exchange/i);
  });
});
