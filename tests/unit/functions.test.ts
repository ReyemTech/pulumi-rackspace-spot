import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpotClient } from "../../provider/client";
import { getCloudspace } from "../../provider/functions/getCloudspace";
import { getKubeconfig } from "../../provider/functions/getKubeconfig";
import { getRegions } from "../../provider/functions/getRegions";
import { getServerClasses } from "../../provider/functions/getServerClasses";

// ---------------------------------------------------------------------------
// Mock SpotClient — never import real network calls
// ---------------------------------------------------------------------------

function makeClient(): SpotClient {
  return {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getClusterScoped: vi.fn(),
    listClusterScoped: vi.fn(),
  } as unknown as SpotClient;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const cloudspaceResponse = {
  metadata: { name: "my-cs" },
  spec: {
    region: "us-east-1",
    kubernetesVersion: "1.28",
    cni: "cilium",
    HAControlPlane: true,
  },
  status: {
    APIServerEndpoint: "api.my-cs.example.com",
    phase: "Running",
  },
};

// ---------------------------------------------------------------------------
// getCloudspace
// ---------------------------------------------------------------------------

describe("getCloudspace", () => {
  let client: SpotClient;

  beforeEach(() => {
    client = makeClient();
    vi.clearAllMocks();
  });

  it("returns correct outputs from API response", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(client.get).toHaveBeenCalledWith("cloudspaces", "my-cs");
    expect(result.outputs.name).toBe("my-cs");
    expect(result.outputs.region).toBe("us-east-1");
    expect(result.outputs.kubernetesVersion).toBe("1.28");
    expect(result.outputs.cni).toBe("cilium");
    expect(result.outputs.phase).toBe("Running");
  });

  it("handles PascalCase HAControlPlane field", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.haControlPlane).toBe(true);
  });

  it("falls back to camelCase haControlPlane when HAControlPlane is absent", async () => {
    const response = {
      ...cloudspaceResponse,
      spec: { ...cloudspaceResponse.spec, HAControlPlane: undefined, haControlPlane: false },
    };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.haControlPlane).toBe(false);
  });

  it("defaults haControlPlane to false when both fields are absent", async () => {
    const response = {
      ...cloudspaceResponse,
      spec: { region: "us-east-1", kubernetesVersion: "1.28", cni: "cilium" },
    };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.haControlPlane).toBe(false);
  });

  it("handles PascalCase APIServerEndpoint field", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.apiServerEndpoint).toBe("api.my-cs.example.com");
  });

  it("falls back to camelCase apiServerEndpoint when APIServerEndpoint is absent", async () => {
    const response = {
      ...cloudspaceResponse,
      status: { apiServerEndpoint: "api.fallback.example.com", phase: "Running" },
    };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.apiServerEndpoint).toBe("api.fallback.example.com");
  });

  it("defaults apiServerEndpoint to empty string when status is absent", async () => {
    const response = { ...cloudspaceResponse, status: undefined };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.apiServerEndpoint).toBe("");
  });

  it("defaults phase to empty string when status is absent", async () => {
    const response = { ...cloudspaceResponse, status: undefined };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getCloudspace(client, { name: "my-cs" });

    expect(result.outputs.phase).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getKubeconfig
// ---------------------------------------------------------------------------

describe("getKubeconfig", () => {
  let client: SpotClient;

  beforeEach(() => {
    client = makeClient();
    vi.clearAllMocks();
  });

  it("assembles kubeconfig JSON and returns raw/host/clusterName", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getKubeconfig(client, "id-token-xyz", { cloudspaceName: "my-cs" });

    expect(result.outputs.host).toBe("https://api.my-cs.example.com");
    expect(result.outputs.clusterName).toBe("my-cs");

    const raw = JSON.parse(result.outputs.raw);
    expect(raw.apiVersion).toBe("v1");
    expect(raw.kind).toBe("Config");
    expect(raw["current-context"]).toBe("my-cs");
    expect(raw.clusters[0].cluster.server).toBe("https://api.my-cs.example.com");
    expect(raw.users[0].user.token).toBe("id-token-xyz");
  });

  it("uses APIServerEndpoint (PascalCase) from status", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getKubeconfig(client, "tok", { cloudspaceName: "my-cs" });

    expect(result.outputs.host).toBe("https://api.my-cs.example.com");
  });

  it("falls back to camelCase apiServerEndpoint", async () => {
    const response = {
      ...cloudspaceResponse,
      status: { apiServerEndpoint: "api.fallback.example.com", phase: "Running" },
    };
    vi.mocked(client.get).mockResolvedValue(response);

    const result = await getKubeconfig(client, "tok", { cloudspaceName: "my-cs" });

    expect(result.outputs.host).toBe("https://api.fallback.example.com");
  });

  it("throws when no API endpoint is available", async () => {
    const response = { ...cloudspaceResponse, status: undefined };
    vi.mocked(client.get).mockResolvedValue(response);

    await expect(
      getKubeconfig(client, "tok", { cloudspaceName: "my-cs" })
    ).rejects.toThrow(/no API endpoint/i);
  });

  it("includes insecure-skip-tls-verify in cluster config", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getKubeconfig(client, "tok", { cloudspaceName: "my-cs" });

    const raw = JSON.parse(result.outputs.raw);
    expect(raw.clusters[0].cluster["insecure-skip-tls-verify"]).toBe(true);
  });

  it("sets context namespace to default and user to spot-user", async () => {
    vi.mocked(client.get).mockResolvedValue(cloudspaceResponse);

    const result = await getKubeconfig(client, "tok", { cloudspaceName: "my-cs" });

    const raw = JSON.parse(result.outputs.raw);
    expect(raw.contexts[0].context.namespace).toBe("default");
    expect(raw.contexts[0].context.user).toBe("spot-user");
  });
});

// ---------------------------------------------------------------------------
// getRegions
// ---------------------------------------------------------------------------

describe("getRegions", () => {
  let client: SpotClient;

  beforeEach(() => {
    client = makeClient();
    vi.clearAllMocks();
  });

  const regionsResponse = [
    {
      metadata: { name: "us-east-1" },
      spec: { country: "US", description: "US East" },
    },
    {
      metadata: { name: "eu-west-1" },
      spec: { country: "IE", description: "EU West" },
    },
  ];

  it("maps items from listClusterScoped response", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(regionsResponse);

    const result = await getRegions(client);

    expect(client.listClusterScoped).toHaveBeenCalledWith("regions");
    expect(result.outputs.regions).toHaveLength(2);
    expect(result.outputs.regions[0]).toEqual({
      name: "us-east-1",
      country: "US",
      description: "US East",
    });
    expect(result.outputs.regions[1]).toEqual({
      name: "eu-west-1",
      country: "IE",
      description: "EU West",
    });
  });

  it("defaults country and description to empty string when spec is absent", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue([
      { metadata: { name: "no-spec-region" } },
    ]);

    const result = await getRegions(client);

    expect(result.outputs.regions[0]).toEqual({
      name: "no-spec-region",
      country: "",
      description: "",
    });
  });

  it("returns empty array when no regions exist", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue([]);

    const result = await getRegions(client);

    expect(result.outputs.regions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getServerClasses
// ---------------------------------------------------------------------------

describe("getServerClasses", () => {
  let client: SpotClient;

  beforeEach(() => {
    client = makeClient();
    vi.clearAllMocks();
  });

  const serverClassesResponse = [
    {
      metadata: { name: "sc-small" },
      spec: {
        region: "us-east-1",
        category: "compute",
        resources: { cpu: "4", memory: "16Gi" },
        flavorType: "spot",
      },
      status: { available: 10, capacity: 20 },
    },
    {
      metadata: { name: "sc-large" },
      spec: {
        region: "eu-west-1",
        category: "memory",
        resources: { cpu: "16", memory: "64Gi" },
        flavorType: "on-demand",
      },
      status: { available: 5, capacity: 10 },
    },
  ];

  it("maps all items when no region filter is provided", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(serverClassesResponse);

    const result = await getServerClasses(client);

    expect(client.listClusterScoped).toHaveBeenCalledWith("serverclasses");
    expect(result.outputs.serverClasses).toHaveLength(2);
    expect(result.outputs.serverClasses[0]).toEqual({
      name: "sc-small",
      region: "us-east-1",
      category: "compute",
      cpu: "4",
      memory: "16Gi",
      flavorType: "spot",
      available: 10,
      capacity: 20,
    });
  });

  it("filters by region when region input is provided", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(serverClassesResponse);

    const result = await getServerClasses(client, { region: "us-east-1" });

    expect(result.outputs.serverClasses).toHaveLength(1);
    expect(result.outputs.serverClasses[0].name).toBe("sc-small");
  });

  it("returns empty array when region filter matches nothing", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(serverClassesResponse);

    const result = await getServerClasses(client, { region: "ap-southeast-1" });

    expect(result.outputs.serverClasses).toEqual([]);
  });

  it("defaults optional fields to empty string / 0 when spec/status are absent", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue([
      { metadata: { name: "bare-class" } },
    ]);

    const result = await getServerClasses(client);

    expect(result.outputs.serverClasses[0]).toEqual({
      name: "bare-class",
      region: "",
      category: "",
      cpu: "",
      memory: "",
      flavorType: "",
      available: 0,
      capacity: 0,
    });
  });

  it("returns all items when inputs is undefined", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(serverClassesResponse);

    const result = await getServerClasses(client, undefined);

    expect(result.outputs.serverClasses).toHaveLength(2);
  });

  it("returns all items when inputs has no region property", async () => {
    vi.mocked(client.listClusterScoped).mockResolvedValue(serverClassesResponse);

    const result = await getServerClasses(client, {});

    expect(result.outputs.serverClasses).toHaveLength(2);
  });
});
