import { describe, it, expect, vi, beforeEach } from "vitest";
import { OnDemandNodePoolHandler, OnDemandNodePoolInputs } from "../../provider/resources/ondemandnodepool";
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
    kind: "OnDemandNodePool",
    metadata: {
      name: UUID,
      namespace: NAMESPACE,
      resourceVersion: "12345",
    },
    spec: {
      cloudSpace: "cs-east",
      serverClass: "gp.medium",
      desired: 2,
      customLabels: {},
      customAnnotations: {},
      customTaints: [],
    },
    status: {
      reservedCount: 2,
      reservedStatus: "Reserved",
    },
    ...overrides,
  };
}

describe("OnDemandNodePoolHandler", () => {
  let client: SpotClient;
  let handler: OnDemandNodePoolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    handler = new OnDemandNodePoolHandler(client, NAMESPACE);
  });

  // --- create ---

  it("create: sends correct body (no metadata.name, no bidPrice) and returns UUID as id", async () => {
    const inputs: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const apiResp = makeApiResponse();
    vi.mocked(client.create).mockResolvedValue(apiResp);

    const result = await handler.create(inputs);

    expect(client.create).toHaveBeenCalledOnce();
    const [resource, body] = vi.mocked(client.create).mock.calls[0];
    expect(resource).toBe("ondemandnodepools");
    expect(body.kind).toBe("OnDemandNodePool");
    expect(body.metadata.namespace).toBe(NAMESPACE);
    expect(body.metadata.name).toBeUndefined();
    expect(body.spec.cloudSpace).toBe("cs-east");
    expect(body.spec.serverClass).toBe("gp.medium");
    expect(body.spec.desired).toBe(2);
    expect(body.spec.bidPrice).toBeUndefined();
    expect(result.id).toBe(UUID);
    expect(result.outs.nodepoolId).toBe(UUID);
    expect(result.outs.reservedCount).toBe(2);
    expect(result.outs.reservedStatus).toBe("Reserved");
  });

  it("create with labels/annotations/taints: maps to custom* fields", async () => {
    const inputs: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 1,
      labels: { env: "prod", team: "infra" },
      annotations: { "prometheus.io/scrape": "true" },
      taints: [{ key: "dedicated", value: "gpu", effect: "NoSchedule" }],
    };
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
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

  it("read: maps API response to outputs (custom* → user fields, status → reserved*)", async () => {
    const apiResp = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        desired: 3,
        customLabels: { app: "web" },
        customAnnotations: { note: "hi" },
        customTaints: [{ key: "spot", effect: "PreferNoSchedule" }],
      },
      status: {
        reservedCount: 3,
        reservedStatus: "Reserved",
      },
    });
    vi.mocked(client.get).mockResolvedValue(apiResp);

    const result = await handler.read(UUID);

    expect(client.get).toHaveBeenCalledWith("ondemandnodepools", UUID);
    expect(result.id).toBe(UUID);
    expect(result.props.cloudspaceName).toBe("cs-east");
    expect(result.props.serverClass).toBe("gp.medium");
    expect(result.props.desiredCount).toBe(3);
    expect(result.props.labels).toEqual({ app: "web" });
    expect(result.props.annotations).toEqual({ note: "hi" });
    expect(result.props.taints).toEqual([{ key: "spot", effect: "PreferNoSchedule" }]);
    expect(result.props.nodepoolId).toBe(UUID);
    expect(result.props.reservedCount).toBe(3);
    expect(result.props.reservedStatus).toBe("Reserved");
  });

  // --- diff ---

  it("diff: no changes returns { changes: false, replaces: [] }", () => {
    const inputs: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const result = handler.diff(inputs, { ...inputs });
    expect(result.changes).toBe(false);
    expect(result.replaces).toEqual([]);
    expect(result.deleteBeforeReplace).toBe(false);
  });

  it("diff: desiredCount change → changes but no replace", () => {
    const olds: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const news: OnDemandNodePoolInputs = { ...olds, desiredCount: 4 };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
    expect(result.deleteBeforeReplace).toBe(false);
  });

  it("diff: labels change → changes but no replace", () => {
    const olds: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 1,
      labels: { env: "staging" },
    };
    const news: OnDemandNodePoolInputs = { ...olds, labels: { env: "prod" } };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
    expect(result.deleteBeforeReplace).toBe(false);
  });

  it("diff: serverClass change triggers replace", () => {
    const olds: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const news: OnDemandNodePoolInputs = { ...olds, serverClass: "gp.large" };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("serverClass");
    expect(result.deleteBeforeReplace).toBe(true);
  });

  it("diff: cloudspaceName change triggers replace", () => {
    const olds: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const news: OnDemandNodePoolInputs = { ...olds, cloudspaceName: "cs-west" };
    const result = handler.diff(olds, news);
    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("cloudspaceName");
    expect(result.deleteBeforeReplace).toBe(true);
  });

  // --- update ---

  it("update: GETs latest (for resourceVersion), merges only mutable fields, PUTs back", async () => {
    const latest = makeApiResponse();
    const updated = makeApiResponse({
      spec: {
        cloudSpace: "cs-east",
        serverClass: "gp.medium",
        desired: 4,
        customLabels: { env: "prod" },
        customAnnotations: {},
        customTaints: [],
      },
      status: {
        reservedCount: 4,
        reservedStatus: "Reserved",
      },
    });
    vi.mocked(client.get).mockResolvedValue(latest);
    vi.mocked(client.update).mockResolvedValue(updated);

    const olds: OnDemandNodePoolInputs = {
      cloudspaceName: "cs-east",
      serverClass: "gp.medium",
      desiredCount: 2,
    };
    const news: OnDemandNodePoolInputs = {
      ...olds,
      desiredCount: 4,
      labels: { env: "prod" },
    };

    const result = await handler.update(UUID, olds, news);

    expect(client.get).toHaveBeenCalledWith("ondemandnodepools", UUID);
    const [, name, putBody] = vi.mocked(client.update).mock.calls[0];
    expect(name).toBe(UUID);
    expect(putBody.metadata.resourceVersion).toBe("12345");
    expect(putBody.spec.desired).toBe(4);
    expect(putBody.spec.customLabels).toEqual({ env: "prod" });
    // Immutable fields preserved from latest
    expect(putBody.spec.cloudSpace).toBe("cs-east");
    expect(putBody.spec.serverClass).toBe("gp.medium");
    // No bidPrice
    expect(putBody.spec.bidPrice).toBeUndefined();
    expect(result.outs.desiredCount).toBe(4);
    expect(result.outs.reservedCount).toBe(4);
  });

  // --- delete ---

  it("delete: calls client.remove with correct resource and UUID", async () => {
    vi.mocked(client.remove).mockResolvedValue(undefined);

    await handler.delete(UUID);

    expect(client.remove).toHaveBeenCalledWith("ondemandnodepools", UUID);
  });
});
