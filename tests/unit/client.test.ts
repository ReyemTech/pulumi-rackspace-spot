import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpotClient } from "../../provider/client";

const BASE_URL = "https://spot.rackspace.com";
const NAMESPACE = "test-ns";
const TOKEN = "test-token";

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

describe("SpotClient", () => {
  let client: SpotClient;

  beforeEach(() => {
    client = new SpotClient(BASE_URL, NAMESPACE, TOKEN);
  });

  // 1. GET builds correct namespaced URL with auth header
  it("GET builds correct namespaced URL and sends auth header", async () => {
    const resource = { apiVersion: "ngpc.rxt.io/v1", kind: "Cluster", metadata: { name: "my-cluster" } };
    const fetchMock = makeFetch(200, resource);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.get("clusters", "my-cluster");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/namespaces/${NAMESPACE}/clusters/my-cluster`);
    expect(opts.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(result).toEqual(resource);

    vi.unstubAllGlobals();
  });

  // 2. POST sends JSON body to collection URL (no name in path)
  it("POST sends JSON body to collection URL without name", async () => {
    const body = { metadata: { name: "new-cluster" } };
    const response = { ...body, status: {} };
    const fetchMock = makeFetch(201, response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.create("clusters", body);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/namespaces/${NAMESPACE}/clusters`);
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual(body);
    expect(result).toEqual(response);

    vi.unstubAllGlobals();
  });

  // 3. PUT sends body to named resource URL
  it("PUT sends body to named resource URL", async () => {
    const body = { metadata: { name: "my-cluster" }, spec: { updated: true } };
    const fetchMock = makeFetch(200, body);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.update("clusters", "my-cluster", body);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/namespaces/${NAMESPACE}/clusters/my-cluster`);
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual(body);
    expect(result).toEqual(body);

    vi.unstubAllGlobals();
  });

  // 4. DELETE calls correct URL with DELETE method
  it("DELETE calls correct URL with DELETE method", async () => {
    const fetchMock = makeFetch(204, "");
    vi.stubGlobal("fetch", fetchMock);

    await client.remove("clusters", "my-cluster");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/namespaces/${NAMESPACE}/clusters/my-cluster`);
    expect(opts.method).toBe("DELETE");

    vi.unstubAllGlobals();
  });

  // 5. LIST returns items array from response
  it("LIST returns items array from response", async () => {
    const items = [{ metadata: { name: "a" } }, { metadata: { name: "b" } }];
    const fetchMock = makeFetch(200, { items });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.list("clusters");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/namespaces/${NAMESPACE}/clusters`);
    expect(opts.method).toBe("GET");
    expect(result).toEqual(items);

    vi.unstubAllGlobals();
  });

  // 6. Throws on non-OK response (404)
  it("throws on 404 response with status and body", async () => {
    const fetchMock = makeFetch(404, "not found");
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.get("clusters", "missing")).rejects.toThrow("404");

    vi.unstubAllGlobals();
  });

  // 6b. Throws on non-OK response (500)
  it("throws on 500 response with status and body", async () => {
    const fetchMock = makeFetch(500, "internal server error");
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.list("clusters")).rejects.toThrow("500");

    vi.unstubAllGlobals();
  });

  // 7. Cluster-scoped GET uses path without namespace
  it("cluster-scoped GET uses path without namespace", async () => {
    const region = { metadata: { name: "us-east-1" } };
    const fetchMock = makeFetch(200, region);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.getClusterScoped("regions", "us-east-1");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/regions/us-east-1`);
    expect(opts.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(result).toEqual(region);

    vi.unstubAllGlobals();
  });

  // 7b. Cluster-scoped GET without name
  it("cluster-scoped GET without name omits name from path", async () => {
    const data = { metadata: {} };
    const fetchMock = makeFetch(200, data);
    vi.stubGlobal("fetch", fetchMock);

    await client.getClusterScoped("regions");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/regions`);

    vi.unstubAllGlobals();
  });

  // 8. Cluster-scoped LIST returns items
  it("cluster-scoped LIST returns items array", async () => {
    const items = [{ metadata: { name: "us-east-1" } }, { metadata: { name: "eu-west-1" } }];
    const fetchMock = makeFetch(200, { items });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.listClusterScoped("regions");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/apis/ngpc.rxt.io/v1/regions`);
    expect(opts.method).toBe("GET");
    expect(result).toEqual(items);

    vi.unstubAllGlobals();
  });
});
