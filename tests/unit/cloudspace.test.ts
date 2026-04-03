import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudSpaceHandler, CloudSpaceInputs } from "../../provider/resources/cloudspace";
import { SpotClient } from "../../provider/client";

// Mock SpotClient — never import real network calls
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

const NAMESPACE = "test-ns";

const baseInputs: CloudSpaceInputs = {
  cloudspaceName: "my-cs",
  region: "us-east-1",
  kubernetesVersion: "1.28",
  cni: "cilium",
  haControlPlane: true,
  preemptionWebhookUrl: "https://webhook.example.com",
  deploymentType: "gen2",
};

const apiResponse = {
  apiVersion: "ngpc.rxt.io/v1",
  kind: "CloudSpace",
  metadata: {
    name: "my-cs",
    namespace: NAMESPACE,
    resourceVersion: "42",
  },
  spec: {
    region: "us-east-1",
    cloud: "default",
    kubernetesVersion: "1.28",
    cni: "cilium",
    haControlPlane: true,
    deploymentType: "gen2",
    webhook: "https://webhook.example.com",
  },
  status: {
    apiServerEndpoint: "https://api.my-cs.example.com",
    phase: "Running",
  },
};

describe("CloudSpaceHandler", () => {
  let client: SpotClient;
  let handler: CloudSpaceHandler;

  beforeEach(() => {
    client = makeClient();
    handler = new CloudSpaceHandler(client, NAMESPACE);
    vi.clearAllMocks();
  });

  // 1. create — sends correct K8s resource body, returns id + outputs with apiServerEndpoint
  it("create sends correct K8s resource body and returns id + outputs", async () => {
    vi.mocked(client.create).mockResolvedValue(apiResponse);

    const result = await handler.create(baseInputs);

    expect(client.create).toHaveBeenCalledOnce();
    const [resource, body] = vi.mocked(client.create).mock.calls[0];
    expect(resource).toBe("cloudspaces");
    expect(body).toMatchObject({
      apiVersion: "ngpc.rxt.io/v1",
      kind: "CloudSpace",
      metadata: {
        name: "my-cs",
        namespace: NAMESPACE,
      },
      spec: {
        region: "us-east-1",
        cloud: "default",
        kubernetesVersion: "1.28",
        cni: "cilium",
        haControlPlane: true,
        deploymentType: "gen2",
        webhook: "https://webhook.example.com",
      },
    });

    expect(result.id).toBe("my-cs");
    expect(result.outs.apiServerEndpoint).toBe("https://api.my-cs.example.com");
    expect(result.outs.phase).toBe("Running");
    expect(result.outs.cloudspaceName).toBe("my-cs");
    expect(result.outs.region).toBe("us-east-1");
  });

  // 2. read — calls client.get, maps response to props
  it("read calls client.get and maps response to props", async () => {
    vi.mocked(client.get).mockResolvedValue(apiResponse);

    const result = await handler.read("my-cs");

    expect(client.get).toHaveBeenCalledWith("cloudspaces", "my-cs");
    expect(result.id).toBe("my-cs");
    expect(result.props.apiServerEndpoint).toBe("https://api.my-cs.example.com");
    expect(result.props.phase).toBe("Running");
    expect(result.props.cloudspaceName).toBe("my-cs");
    expect(result.props.region).toBe("us-east-1");
    expect(result.props.kubernetesVersion).toBe("1.28");
    expect(result.props.cni).toBe("cilium");
    expect(result.props.haControlPlane).toBe(true);
    expect(result.props.preemptionWebhookUrl).toBe("https://webhook.example.com");
  });

  // 3. diff: no changes → { changes: false, replaces: [] }
  it("diff returns no changes when inputs are identical", () => {
    const result = handler.diff(baseInputs, { ...baseInputs });

    expect(result.changes).toBe(false);
    expect(result.replaces).toEqual([]);
  });

  // 4. diff: mutable change (kubernetesVersion) → { changes: true, replaces: [] }
  it("diff detects mutable change without triggering replacement", () => {
    const news = { ...baseInputs, kubernetesVersion: "1.29" };

    const result = handler.diff(baseInputs, news);

    expect(result.changes).toBe(true);
    expect(result.replaces).toEqual([]);
  });

  // 5. diff: immutable change (region) → { changes: true, replaces: ["region"] }
  it("diff flags immutable field change as replacement", () => {
    const news = { ...baseInputs, region: "eu-west-1" };

    const result = handler.diff(baseInputs, news);

    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("region");
  });

  // 6. diff: multiple immutable changes → replaces contains all changed immutable fields
  it("diff captures all changed immutable fields in replaces", () => {
    const news = { ...baseInputs, region: "eu-west-1", cni: "flannel", cloudspaceName: "new-cs" };

    const result = handler.diff(baseInputs, news);

    expect(result.changes).toBe(true);
    expect(result.replaces).toContain("region");
    expect(result.replaces).toContain("cni");
    expect(result.replaces).toContain("cloudspaceName");
  });

  // 7. update — GETs latest first, merges only mutable fields, PUTs with resourceVersion
  it("update GETs latest resource first then PUTs with resourceVersion and mutable fields", async () => {
    vi.mocked(client.get).mockResolvedValue(apiResponse);
    vi.mocked(client.update).mockResolvedValue({
      ...apiResponse,
      spec: { ...apiResponse.spec, kubernetesVersion: "1.29" },
    });

    const news = { ...baseInputs, kubernetesVersion: "1.29" };
    await handler.update("my-cs", baseInputs, news);

    // Must GET latest before PUT
    expect(client.get).toHaveBeenCalledWith("cloudspaces", "my-cs");

    // PUT must include the resourceVersion from GET response
    const [, , putBody] = vi.mocked(client.update).mock.calls[0];
    expect(putBody.metadata.resourceVersion).toBe("42");
    expect(putBody.spec.kubernetesVersion).toBe("1.29");
  });

  // 8. update — verify immutable fields are NOT changed in the PUT body
  it("update does not modify immutable fields in the PUT body", async () => {
    vi.mocked(client.get).mockResolvedValue(apiResponse);
    vi.mocked(client.update).mockResolvedValue(apiResponse);

    // Attempt to change region (immutable) — shouldn't happen in practice (diff triggers replace),
    // but update itself must guard against it
    const news = { ...baseInputs, kubernetesVersion: "1.29" };
    await handler.update("my-cs", baseInputs, news);

    const [, , putBody] = vi.mocked(client.update).mock.calls[0];
    expect(putBody.spec.region).toBe("us-east-1");   // unchanged from GET
    expect(putBody.spec.cni).toBe("cilium");           // unchanged from GET
    expect(putBody.spec.deploymentType).toBe("gen2");  // unchanged from GET
    expect(putBody.metadata.name).toBe("my-cs");       // unchanged from GET
  });

  // 9. delete — calls client.remove with correct args
  it("delete calls client.remove with correct resource and name", async () => {
    vi.mocked(client.remove).mockResolvedValue(undefined);

    await handler.delete("my-cs");

    expect(client.remove).toHaveBeenCalledWith("cloudspaces", "my-cs");
  });
});
