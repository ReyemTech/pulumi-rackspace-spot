import { SpotClient, K8sResource } from "../client";

const RESOURCE = "ondemandnodepools";

export interface OnDemandNodePoolInputs {
  cloudspaceName: string;
  serverClass: string;
  desiredCount: number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  taints?: Array<{ key: string; value?: string; effect: string }>;
}

function buildSpec(inputs: OnDemandNodePoolInputs): Record<string, any> {
  return {
    cloudSpace: inputs.cloudspaceName,
    serverClass: inputs.serverClass,
    desired: inputs.desiredCount,
    customLabels: inputs.labels ?? {},
    customAnnotations: inputs.annotations ?? {},
    customTaints: inputs.taints ?? [],
  };
}

function apiToOutputs(resource: K8sResource): Record<string, any> {
  const { metadata, spec, status } = resource;

  return {
    cloudspaceName: spec.cloudSpace,
    serverClass: spec.serverClass,
    desiredCount: spec.desired,
    labels: spec.customLabels ?? {},
    annotations: spec.customAnnotations ?? {},
    taints: spec.customTaints ?? [],
    nodepoolId: metadata.name,
    reservedCount: status?.reservedCount,
    reservedStatus: status?.reservedStatus,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class OnDemandNodePoolHandler {
  private readonly client: SpotClient;
  private readonly namespace: string;

  constructor(client: SpotClient, namespace: string) {
    this.client = client;
    this.namespace = namespace;
  }

  async create(inputs: OnDemandNodePoolInputs): Promise<{ id: string; outs: Record<string, any> }> {
    const body: K8sResource = {
      apiVersion: "ngpc.rxt.io/v1",
      kind: "OnDemandNodePool",
      metadata: {
        namespace: this.namespace,
      },
      spec: buildSpec(inputs),
    };

    const resource = await this.client.create(RESOURCE, body);
    const id: string = resource.metadata.name;
    const outs = apiToOutputs(resource);

    return { id, outs };
  }

  async read(id: string): Promise<{ id: string; props: Record<string, any> }> {
    const resource = await this.client.get(RESOURCE, id);
    const props = apiToOutputs(resource);
    return { id, props };
  }

  diff(
    olds: OnDemandNodePoolInputs,
    news: OnDemandNodePoolInputs
  ): { changes: boolean; replaces: string[]; deleteBeforeReplace: boolean } {
    const replaces: string[] = [];

    // Immutable fields
    if (olds.cloudspaceName !== news.cloudspaceName) replaces.push("cloudspaceName");
    if (olds.serverClass !== news.serverClass) replaces.push("serverClass");

    // Mutable fields — detect any change
    const mutableChanged =
      olds.desiredCount !== news.desiredCount ||
      !deepEqual(olds.labels, news.labels) ||
      !deepEqual(olds.annotations, news.annotations) ||
      !deepEqual(olds.taints, news.taints);

    const changes = replaces.length > 0 || mutableChanged;

    return {
      changes,
      replaces,
      deleteBeforeReplace: replaces.length > 0,
    };
  }

  async update(
    id: string,
    olds: OnDemandNodePoolInputs,
    news: OnDemandNodePoolInputs
  ): Promise<{ outs: Record<string, any> }> {
    // Fetch latest to get the current resourceVersion
    const latest = await this.client.get(RESOURCE, id);

    const updatedSpec: Record<string, any> = {
      ...latest.spec,
      desired: news.desiredCount,
      customLabels: news.labels ?? {},
      customAnnotations: news.annotations ?? {},
      customTaints: news.taints ?? [],
    };

    const body: K8sResource = {
      ...latest,
      spec: updatedSpec,
    };

    const updated = await this.client.update(RESOURCE, id, body);
    const outs = apiToOutputs(updated);

    return { outs };
  }

  async delete(id: string): Promise<void> {
    await this.client.remove(RESOURCE, id);
  }
}
