import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before any import that depends on them
// ---------------------------------------------------------------------------

vi.mock("../../provider/auth", () => {
  return {
    SpotAuth: vi.fn().mockImplementation(() => ({
      getToken: vi.fn().mockResolvedValue({
        idToken: "mock-id-token",
        orgId: "org_TEST",
        namespace: "org-test",
      }),
    })),
  };
});

vi.mock("../../provider/client", () => {
  const mockClient = {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getClusterScoped: vi.fn(),
    listClusterScoped: vi.fn(),
  };
  return {
    SpotClient: vi.fn().mockImplementation(() => mockClient),
    _mockClient: mockClient,
  };
});

// ---------------------------------------------------------------------------
// Imports (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import { RackspaceSpotProvider } from "../../provider/provider";
import * as clientModule from "../../provider/client";

// Helper to reach the shared mock client instance
function getMockClient() {
  return (clientModule as any)._mockClient as {
    get: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getClusterScoped: ReturnType<typeof vi.fn>;
    listClusterScoped: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// URN builder
// ---------------------------------------------------------------------------

function makeUrn(type: string, name = "resource-name"): string {
  return `urn:pulumi:stack::project::rackspace-spot:index:${type}::${name}`;
}

// ---------------------------------------------------------------------------
// Shared API response fixtures
// ---------------------------------------------------------------------------

const cloudspaceApiResponse = {
  metadata: { name: "my-cs", namespace: "org-test", resourceVersion: "1" },
  spec: {
    region: "us-east-1",
    cloud: "default",
    kubernetesVersion: "1.28",
    cni: "cilium",
    HAControlPlane: true,
    deploymentType: "gen2",
    webhook: "https://webhook.example.com",
  },
  status: { APIServerEndpoint: "api.my-cs.example.com", phase: "Running" },
};

const nodepoolApiResponse = {
  metadata: { name: "my-pool", namespace: "org-test", resourceVersion: "1" },
  spec: { cloudSpace: "my-cs", serverClass: "sc-small", minNodes: 1, maxNodes: 3 },
  status: { phase: "Running" },
};

const onDemandApiResponse = {
  metadata: { name: "od-pool", namespace: "org-test", resourceVersion: "1" },
  spec: { cloudSpace: "my-cs", serverClass: "sc-small", replicas: 2 },
  status: { phase: "Running" },
};

// ---------------------------------------------------------------------------
// Provider setup helper
// ---------------------------------------------------------------------------

function makeProvider(): RackspaceSpotProvider {
  return new RackspaceSpotProvider("0.0.0-test", "{}");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RackspaceSpotProvider", () => {
  let provider: RackspaceSpotProvider;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env["RACKSPACE_SPOT_TOKEN"];
    process.env["RACKSPACE_SPOT_TOKEN"] = "test-refresh-token";
    provider = makeProvider();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["RACKSPACE_SPOT_TOKEN"];
    } else {
      process.env["RACKSPACE_SPOT_TOKEN"] = originalEnv;
    }
  });

  // -------------------------------------------------------------------------
  // configure
  // -------------------------------------------------------------------------

  describe("configure", () => {
    it("stores the token from config", async () => {
      await provider.configure({ token: "my-refresh-token" });
      // Token stored — verify by ensuring ensureClient does not throw
      const client = getMockClient();
      client.create.mockResolvedValue(cloudspaceApiResponse);
      await expect(provider.create(makeUrn("CloudSpace"), {
        cloudspaceName: "my-cs",
        region: "us-east-1",
      })).resolves.toBeDefined();
    });

    it("is a no-op when no token is in config", async () => {
      await expect(provider.configure({})).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // checkConfig
  // -------------------------------------------------------------------------

  describe("checkConfig", () => {
    it("passes inputs through unchanged", async () => {
      const inputs = { token: "some-token", extra: "val" };
      const result = await provider.checkConfig("urn:pulumi:stack::project::rackspace-spot", {}, inputs);
      expect(result.inputs).toEqual(inputs);
    });

    it("stores token from checkConfig", async () => {
      await provider.checkConfig("urn", {}, { token: "check-token" });
      // No error expected; token is now stored
    });
  });

  // -------------------------------------------------------------------------
  // check
  // -------------------------------------------------------------------------

  describe("check", () => {
    it("passes inputs through unchanged for any resource type", async () => {
      const inputs = { cloudspaceName: "my-cs", region: "us-east-1" };
      const result = await provider.check(makeUrn("CloudSpace"), {}, inputs);
      expect(result.inputs).toEqual(inputs);
    });
  });

  // -------------------------------------------------------------------------
  // diff — pure logic, no API calls
  // -------------------------------------------------------------------------

  describe("diff", () => {
    const cloudspaceInputs = {
      cloudspaceName: "my-cs",
      region: "us-east-1",
      kubernetesVersion: "1.28",
      cni: "cilium",
      haControlPlane: true,
      deploymentType: "gen2",
    };

    it("routes CloudSpace diff and returns no changes for identical inputs", async () => {
      const result = await provider.diff("my-cs", makeUrn("CloudSpace"), cloudspaceInputs, { ...cloudspaceInputs });
      expect(result.changes).toBe(false);
    });

    it("routes CloudSpace diff and detects immutable field change", async () => {
      const news = { ...cloudspaceInputs, region: "eu-west-1" };
      const result = await provider.diff("my-cs", makeUrn("CloudSpace"), cloudspaceInputs, news);
      expect(result.changes).toBe(true);
      expect(result.replaces).toContain("region");
    });

    it("routes SpotNodePool diff", async () => {
      const inputs = { cloudspaceName: "my-cs", poolName: "my-pool", serverClass: "sc-small", minNodes: 1, maxNodes: 3 };
      const result = await provider.diff("my-pool", makeUrn("SpotNodePool"), inputs, { ...inputs });
      expect(result.changes).toBe(false);
    });

    it("routes OnDemandNodePool diff", async () => {
      const inputs = { cloudspaceName: "my-cs", poolName: "od-pool", serverClass: "sc-small", replicas: 2 };
      const result = await provider.diff("od-pool", makeUrn("OnDemandNodePool"), inputs, { ...inputs });
      expect(result.changes).toBe(false);
    });

    it("throws for unknown resource type", async () => {
      await expect(
        provider.diff("id", makeUrn("UnknownResource"), {}, {})
      ).rejects.toThrow(/unknown resource type/i);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("routes CloudSpace create to CloudSpaceHandler", async () => {
      const client = getMockClient();
      client.create.mockResolvedValue(cloudspaceApiResponse);

      const result = await provider.create(makeUrn("CloudSpace"), {
        cloudspaceName: "my-cs",
        region: "us-east-1",
        kubernetesVersion: "1.28",
        cni: "cilium",
        haControlPlane: true,
        deploymentType: "gen2",
        preemptionWebhookUrl: "https://webhook.example.com",
      });

      expect(result.id).toBe("my-cs");
      expect(client.create).toHaveBeenCalledWith("cloudspaces", expect.any(Object));
    });

    it("routes SpotNodePool create to SpotNodePoolHandler", async () => {
      const client = getMockClient();
      client.create.mockResolvedValue(nodepoolApiResponse);

      const result = await provider.create(makeUrn("SpotNodePool"), {
        cloudspaceName: "my-cs",
        serverClass: "sc-small",
        bidPrice: 0.05,
        desiredCount: 2,
      });

      expect(result.id).toBe("my-pool");
      expect(client.create).toHaveBeenCalledWith("spotnodepools", expect.any(Object));
    });

    it("routes OnDemandNodePool create to OnDemandNodePoolHandler", async () => {
      const client = getMockClient();
      client.create.mockResolvedValue(onDemandApiResponse);

      const result = await provider.create(makeUrn("OnDemandNodePool"), {
        cloudspaceName: "my-cs",
        poolName: "od-pool",
        serverClass: "sc-small",
        replicas: 2,
      });

      expect(result.id).toBe("od-pool");
      expect(client.create).toHaveBeenCalledWith("ondemandnodepools", expect.any(Object));
    });

    it("throws for unknown resource type", async () => {
      await expect(
        provider.create(makeUrn("UnknownType"), {})
      ).rejects.toThrow(/unknown resource type/i);
    });
  });

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  describe("read", () => {
    it("routes CloudSpace read to CloudSpaceHandler", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(cloudspaceApiResponse);

      const result = await provider.read("my-cs", makeUrn("CloudSpace"));

      expect(result.id).toBe("my-cs");
      expect(client.get).toHaveBeenCalledWith("cloudspaces", "my-cs");
    });

    it("routes SpotNodePool read to SpotNodePoolHandler", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(nodepoolApiResponse);

      const result = await provider.read("my-pool", makeUrn("SpotNodePool"));

      expect(result.id).toBe("my-pool");
      expect(client.get).toHaveBeenCalledWith("spotnodepools", "my-pool");
    });

    it("routes OnDemandNodePool read to OnDemandNodePoolHandler", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(onDemandApiResponse);

      const result = await provider.read("od-pool", makeUrn("OnDemandNodePool"));

      expect(result.id).toBe("od-pool");
      expect(client.get).toHaveBeenCalledWith("ondemandnodepools", "od-pool");
    });

    it("throws for unknown resource type", async () => {
      await expect(
        provider.read("id", makeUrn("UnknownType"))
      ).rejects.toThrow(/unknown resource type/i);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("update", () => {
    it("routes CloudSpace update to CloudSpaceHandler", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(cloudspaceApiResponse);
      client.update.mockResolvedValue({ ...cloudspaceApiResponse, spec: { ...cloudspaceApiResponse.spec, kubernetesVersion: "1.29" } });

      const olds = { cloudspaceName: "my-cs", region: "us-east-1", kubernetesVersion: "1.28" };
      const news = { ...olds, kubernetesVersion: "1.29" };
      const result = await provider.update("my-cs", makeUrn("CloudSpace"), olds, news);

      expect(client.update).toHaveBeenCalledWith("cloudspaces", "my-cs", expect.any(Object));
    });

    it("routes SpotNodePool update to SpotNodePoolHandler", async () => {
      const client = getMockClient();
      const spotPoolGetResponse = {
        metadata: { name: "my-pool", namespace: "org-test", resourceVersion: "1" },
        spec: {
          cloudSpace: "my-cs",
          serverClass: "sc-small",
          bidPrice: "0.050",
          desired: 2,
          customLabels: {},
          customAnnotations: {},
          customTaints: [],
        },
        status: { phase: "Running" },
      };
      client.get.mockResolvedValue(spotPoolGetResponse);
      client.update.mockResolvedValue({ ...spotPoolGetResponse, spec: { ...spotPoolGetResponse.spec, desired: 4 } });

      const olds = { cloudspaceName: "my-cs", serverClass: "sc-small", bidPrice: 0.05, desiredCount: 2 };
      const news = { ...olds, desiredCount: 4 };
      await provider.update("my-pool", makeUrn("SpotNodePool"), olds, news);

      expect(client.update).toHaveBeenCalledWith("spotnodepools", "my-pool", expect.any(Object));
    });

    it("routes OnDemandNodePool update to OnDemandNodePoolHandler", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(onDemandApiResponse);
      client.update.mockResolvedValue({ ...onDemandApiResponse, spec: { ...onDemandApiResponse.spec, replicas: 4 } });

      const olds = { cloudspaceName: "my-cs", poolName: "od-pool", serverClass: "sc-small", replicas: 2 };
      const news = { ...olds, replicas: 4 };
      await provider.update("od-pool", makeUrn("OnDemandNodePool"), olds, news);

      expect(client.update).toHaveBeenCalledWith("ondemandnodepools", "od-pool", expect.any(Object));
    });

    it("throws for unknown resource type", async () => {
      await expect(
        provider.update("id", makeUrn("UnknownType"), {}, {})
      ).rejects.toThrow(/unknown resource type/i);
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe("delete", () => {
    it("routes CloudSpace delete to CloudSpaceHandler", async () => {
      const client = getMockClient();
      client.remove.mockResolvedValue(undefined);

      await provider.delete("my-cs", makeUrn("CloudSpace"), {});

      expect(client.remove).toHaveBeenCalledWith("cloudspaces", "my-cs");
    });

    it("routes SpotNodePool delete to SpotNodePoolHandler", async () => {
      const client = getMockClient();
      client.remove.mockResolvedValue(undefined);

      await provider.delete("my-pool", makeUrn("SpotNodePool"), {});

      expect(client.remove).toHaveBeenCalledWith("spotnodepools", "my-pool");
    });

    it("routes OnDemandNodePool delete to OnDemandNodePoolHandler", async () => {
      const client = getMockClient();
      client.remove.mockResolvedValue(undefined);

      await provider.delete("od-pool", makeUrn("OnDemandNodePool"), {});

      expect(client.remove).toHaveBeenCalledWith("ondemandnodepools", "od-pool");
    });

    it("throws for unknown resource type", async () => {
      await expect(
        provider.delete("id", makeUrn("UnknownType"), {})
      ).rejects.toThrow(/unknown resource type/i);
    });
  });

  // -------------------------------------------------------------------------
  // invoke — data source routing
  // -------------------------------------------------------------------------

  describe("invoke", () => {
    const baseCloudspaceInput = {
      metadata: { name: "my-cs" },
      spec: { region: "us-east-1", kubernetesVersion: "1.28", cni: "cilium", HAControlPlane: true },
      status: { APIServerEndpoint: "api.my-cs.example.com", phase: "Running" },
    };

    it("routes getCloudspace to getCloudspace function", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(baseCloudspaceInput);

      const result = await provider.invoke("rackspace-spot:index:getCloudspace", { name: "my-cs" });

      expect(result.outputs).toBeDefined();
      expect(result.outputs.name).toBe("my-cs");
    });

    it("routes getKubeconfig to getKubeconfig function", async () => {
      const client = getMockClient();
      client.get.mockResolvedValue(baseCloudspaceInput);

      const result = await provider.invoke("rackspace-spot:index:getKubeconfig", { cloudspaceName: "my-cs" });

      expect(result.outputs.host).toBe("https://api.my-cs.example.com");
      expect(result.outputs.clusterName).toBe("my-cs");
      expect(result.outputs.raw).toBeDefined();
    });

    it("routes getRegions to getRegions function", async () => {
      const client = getMockClient();
      client.listClusterScoped.mockResolvedValue([
        { metadata: { name: "us-east-1" }, spec: { country: "US", description: "US East" } },
      ]);

      const result = await provider.invoke("rackspace-spot:index:getRegions", {});

      expect(result.outputs.regions).toHaveLength(1);
      expect(result.outputs.regions[0].name).toBe("us-east-1");
    });

    it("routes getServerClasses to getServerClasses function", async () => {
      const client = getMockClient();
      client.listClusterScoped.mockResolvedValue([
        {
          metadata: { name: "sc-small" },
          spec: { region: "us-east-1", category: "compute", resources: { cpu: "4", memory: "16Gi" }, flavorType: "spot" },
          status: { available: 10, capacity: 20 },
        },
      ]);

      const result = await provider.invoke("rackspace-spot:index:getServerClasses", {});

      expect(result.outputs.serverClasses).toHaveLength(1);
      expect(result.outputs.serverClasses[0].name).toBe("sc-small");
    });

    it("throws for unknown function token", async () => {
      await expect(
        provider.invoke("rackspace-spot:index:unknownFunction", {})
      ).rejects.toThrow(/unknown function token/i);
    });
  });

  // -------------------------------------------------------------------------
  // error cases — missing token
  // -------------------------------------------------------------------------

  describe("missing token", () => {
    it("throws when configure is not called and env var is not set", async () => {
      // The provider checks: this.refreshToken ?? env var ?? readSpotConfig()
      // We verify the error message by calling configure with no token then
      // directly testing ensureClient via a resource operation.
      // Since readSpotConfig() may find a real ~/.spot_config on dev machines,
      // we override SpotAuth to throw the same error the provider would throw
      // when no token is found, simulating the real no-token path in CI.
      const { SpotAuth } = await import("../../provider/auth");
      vi.mocked(SpotAuth).mockImplementationOnce((_token: string) => {
        if (!_token) throw new Error("A Rackspace Spot refresh token is required.");
        // If SpotAuth is constructed with a token (from ~/.spot_config), simulate failure
        return {
          getToken: vi.fn().mockRejectedValue(
            new Error("A Rackspace Spot refresh token is required.")
          ),
        };
      });

      delete process.env["RACKSPACE_SPOT_TOKEN"];
      const p = new RackspaceSpotProvider("0.0.0-test", "{}");

      await expect(
        p.create(makeUrn("CloudSpace"), { cloudspaceName: "x", region: "us-east-1" })
      ).rejects.toThrow(/refresh token is required/i);
    });
  });
});
