import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpotNodePoolHandler, SpotNodePoolInputs } from "../../provider/resources/spotnodepool";
import { SpotClient } from "../../provider/client";

vi.mock("../../provider/client");

const NAMESPACE = "test-ns";
const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeClient(): SpotClient {
  return new SpotClient("https://spot.rackspace.com", NAMESPACE, "tok") as unknown as SpotClient;
}

function makeApiResponse(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    apiVersion: "ngpc.rxt.io/v1",
    kind: "SpotNodePool",
    metadata: {
      name: UUID,
      namespace: NAMESPACE,
      resourceVersion: "12345",
    },
    spec: {
      cloudSpace: "cs-east",
      serverClass: "gp.medium",
      bidPrice: "0.040",
      desired: 2,
      customLabels: {},
      customAnnotations: {},
      customTaints: [],
    },
    status: {
      wonCount: 2,
      bidStatus: "Won",
    },
    ...overrides,
  };
}

describe("SpotNodePoolHandler", () => {
  let client: SpotClient;
  let handler: SpotNodePoolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    handler = new SpotNodePoolHandler(client, NAMESPACE);
  });

  // --- create ---

  it("create: sends correct body and returns UUID as id", async () => {
    const inputs: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const apiResp = makeApiResponse();
    vi.mocked(client.create).mockResolvedValue(apiResp);

    const result = await handler.create(inputs);

    expect(client.create).toHaveBeenCalledOnce();
    const [resource, body] = vi.mocked(client.create).mock.calls[0];
    expect(resource).toBe("spotnodepools");
    expect(body.metadata.namespace).toBe(NAMESPACE);
    expect(body.metadata.name).toMatch(/^[0-9a-f-]{36}$/); // auto-generated UUID
    expect(body.spec.cloudSpace).toBe("cs-east");
    expect(body.spec.serverClass).toBe("gp.medium");
    expect(body.spec.bidPrice).toBe("0.040");
    expect(body.spec.desired).toBe(2);
    expect(body.spec.autoscaling).toBeUndefined();
    expect(result.id).toBe(UUID);
    expect(result.outs.nodepoolId).toBe(UUID);
    expect(result.outs.wonCount).toBe(2);
    expect(result.outs.bidStatus).toBe("Won");
  });

  it("create with autoscaling: sends autoscaling block and no desired field", async () => {
    const inputs: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.05,
      autoscaling: { minNodes: 1, maxNodes: 5 },
    };
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        bidPrice: "0.050",
        autoscaling: { enabled: true, minNodes: 1, maxNodes: 5 },
        customLabels: {},
        customAnnotations: {},
        customTaints: [],
      },
    });
    vi.mocked(client.create).mockResolvedValue(apiResp);

    await handler.create(inputs);

    const [, body] = vi.mocked(client.create).mock.calls[0];
    expect(body.spec.autoscaling).toEqual({ enabled: true, minNodes: 1, maxNodes: 5 });
    expect(body.spec.desired).toBe(1); // Rackspace API requires desired even with autoscaling
    expect(body.spec.bidPrice).toBe("0.050");
  });

  it("create with labels/annotations/taints: maps to custom* fields", async () => {
    const inputs: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 1,
      labels: { env: "prod", team: "infra" },
      annotations: { "prometheus.io/scrape": "true" },
      taints: [{ key: "dedicated", value: "gpu", effect: "NoSchedule" }],
    };
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        bidPrice: "0.040",
        desired: 1,
        customLabels: { env: "prod", team: "infra" },
        customAnnotations: { "prometheus.io/scrape": "true" },
        customTaints: [{ key: "dedicated", value: "gpu", effect: "NoSchedule" }],
      },
    });
    vi.mocked(client.create).mockResolvedValue(apiResp);

    await handler.create(inputs);

    const [, body] = vi.mocked(client.create).mock.calls[0];
    expect(body.spec.customLabels).toEqual({ env: "prod", team: "infra" });
    expect(body.spec.customAnnotations).toEqual({ "prometheus.io/scrape": "true" });
    expect(body.spec.customTaints).toEqual([{ key: "dedicated", value: "gpu", effect: "NoSchedule" }]);
  });

  // --- read ---

  it("read: maps API response back to inputs (bidPrice string → number, custom* → user fields)", async () => {
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        bidPrice: "0.040",
        desired: 3,
        customLabels: { app: "web" },
        customAnnotations: { note: "hi" },
        customTaints: [{ key: "spot", effect: "PreferNoSchedule" }],
      },
    });
    vi.mocked(client.get).mockResolvedValue(apiResp);

    const result = await handler.read(UUID);

    expect(client.get).toHaveBeenCalledWith("spotnodepools", UUID);
    expect(result.id).toBe(UUID);
    expect(result.props.cloudspaceName).toBe("cs-east");
    expect(result.props.serverClass).toBe("gp.medium");
    expect(result.props.bidPrice).toBe(0.04);
    expect(result.props.desiredCount).toBe(3);
    expect(result.props.labels).toEqual({ app: "web" });
    expect(result.props.annotations).toEqual({ note: "hi" });
    expect(result.props.taints).toEqual([{ key: "spot", effect: "PreferNoSchedule" }]);
    expect(result.props.nodepoolId).toBe(UUID);
    expect(result.props.wonCount).toBe(2);
    expect(result.props.bidStatus).toBe("Won");
  });

  it("read: maps autoscaling when present", async () => {
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        bidPrice: "0.040",
        autoscaling: { enabled: true, minNodes: 2, maxNodes: 8 },
        customLabels: {},
        customAnnotations: {},
        customTaints: [],
      },
    });
    vi.mocked(client.get).mockResolvedValue(apiResp);

    const result = await handler.read(UUID);

    expect(result.props.autoscaling).toEqual({ minNodes: 2, maxNodes: 8 });
    expect(result.props.desiredCount).toBeUndefined();
  });

  // --- diff ---

  it("diff: no changes returns { changes: false }", () => {
    const inputs: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const result = handler.diff(inputs, { ...inputs });
    expect(result.changes).toBe(false);
    expect(result.replaces).toEqual([]);
  });

  it("diff: serverClass change triggers replace", () => {
    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const news: SpotNodePoolInputs = { ...olds, serverClass: "gp.large" };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("serverClass");
    expect(result.deleteBeforeReplace).toBe(true);
  });

  it("diff: cloudspaceName change triggers replace", () => {
    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const news: SpotNodePoolInputs = { ...olds, cloudspaceName: "cs-west" };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("cloudspaceName");
    expect(result.deleteBeforeReplace).toBe(true);
  });

  it("diff: bidPrice change → changes but no replace", () => {
    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const news: SpotNodePoolInputs = { ...olds, bidPrice: 0.05 };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
    expect(result.deleteBeforeReplace).toBe(false);
  });

  it("diff: autoscaling change → changes but no replace", () => {
    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      autoscaling: { minNodes: 1, maxNodes: 3 },
    };
    const news: SpotNodePoolInputs = { ...olds, autoscaling: { minNodes: 2, maxNodes: 6 } };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
  });

  it("diff: labels change → changes but no replace", () => {
    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 1,
      labels: { env: "staging" },
    };
    const news: SpotNodePoolInputs = { ...olds, labels: { env: "prod" } };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
  });

  // --- update ---

  it("update: GETs latest (for resourceVersion), merges mutable fields, PUTs back", async () => {
    const latest = makeApiResponse();
    const updated = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        bidPrice: "0.050",
        desired: 4,
        customLabels: {},
        customAnnotations: {},
        customTaints: [],
      },
    });
    vi.mocked(client.get).mockResolvedValue(latest);
    vi.mocked(client.update).mockResolvedValue(updated);

    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const news: SpotNodePoolInputs = { ...olds, bidPrice: 0.05, desiredCount: 4 };

    const result = await handler.update(UUID, olds, news);

    expect(client.get).toHaveBeenCalledWith("spotnodepools", UUID);
    const [, name, putBody] = vi.mocked(client.update).mock.calls[0];
    expect(name).toBe(UUID);
    expect(putBody.metadata.resourceVersion).toBe("12345");
    expect(putBody.spec.bidPrice).toBe("0.050");
    expect(putBody.spec.desired).toBe(4);
    expect(putBody.spec.cloudSpace).toBe("cs-east");
    expect(putBody.spec.serverClass).toBe("gp.medium");
    expect(result.outs.bidPrice).toBe(0.05);
  });

  it("update with autoscaling toggle: switches from desired to autoscaling", async () => {
    const latest = makeApiResponse();
    vi.mocked(client.get).mockResolvedValue(latest);
    vi.mocked(client.update).mockResolvedValue(
      makeApiResponse({
        spec: {
          cloudSpace: "cs-east",
          serverClass: "gp.medium",
          bidPrice: "0.040",
          autoscaling: { enabled: true, minNodes: 1, maxNodes: 5 },
          customLabels: {},
          customAnnotations: {},
          customTaints: [],
        },
      })
    );

    const olds: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      desiredCount: 2,
    };
    const news: SpotNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      bidPrice: 0.04,
      autoscaling: { minNodes: 1, maxNodes: 5 },
    };

    await handler.update(UUID, olds, news);

    const [, , putBody] = vi.mocked(client.update).mock.calls[0];
    expect(putBody.spec.autoscaling).toEqual({ enabled: true, minNodes: 1, maxNodes: 5 });
    expect(putBody.spec.desired).toBe(1); // Rackspace API requires desired even with autoscaling
  });

  // --- delete ---

  it("delete: calls client.remove with correct resource and UUID", async () => {
    vi.mocked(client.remove).mockResolvedValue(undefined);

    await handler.delete(UUID);

    expect(client.remove).toHaveBeenCalledWith("spotnodepools", UUID);
  });
});
