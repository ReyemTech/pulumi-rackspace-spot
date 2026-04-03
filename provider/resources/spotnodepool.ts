import { randomUUID } from "crypto";
import { SpotClient, K8sResource } from "../client";

const RESOURCE = "spotnodepools";

export interface SpotNodePoolInputs {
  cloudspaceName: string;
  serverClass: string;
  bidPrice: number;
  desiredCount?: number;
  autoscaling?: { minNodes: number; maxNodes: number };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  taints?: Array<{ key: string; value?: string; effect: string }>;
}

function buildSpec(inputs: SpotNodePoolInputs): Record<string, any> {
  const spec: Record<string, any> = {
    cloudSpace: inputs.cloudspaceName,
    serverClass: inputs.serverClass,
    bidPrice: inputs.bidPrice.toFixed(3),
    customLabels: inputs.labels ?? {},
    customAnnotations: inputs.annotations ?? {},
    customTaints: inputs.taints ?? [],
  };

  if (inputs.autoscaling) {
    spec.autoscaling = {
      enabled: true,
      minNodes: inputs.autoscaling.minNodes,
      maxNodes: inputs.autoscaling.maxNodes,
    };
  } else if (inputs.desiredCount !== undefined) {
    spec.desired = inputs.desiredCount;
  }

  return spec;
}

function apiToOutputs(resource: K8sResource): Record<string, any> {
  const { metadata, spec, status } = resource;

  const props: Record<string, any> = {
    cloudspaceName: spec.cloudSpace,
    serverClass: spec.serverClass,
    bidPrice: parseFloat(spec.bidPrice),
    labels: spec.customLabels ?? {},
    annotations: spec.customAnnotations ?? {},
    taints: spec.customTaints ?? [],
    nodepoolId: metadata.name ?? "",
    wonCount: status?.wonCount ?? 0,
    bidStatus: status?.bidStatus ?? "",
  };

  if (spec.autoscaling?.enabled) {
    props.autoscaling = {
      minNodes: spec.autoscaling.minNodes,
      maxNodes: spec.autoscaling.maxNodes,
    };
  } else if (spec.desired !== undefined) {
    props.desiredCount = spec.desired;
  }

  return props;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class SpotNodePoolHandler {
  private readonly client: SpotClient;
  private readonly namespace: string;

  constructor(client: SpotClient, namespace: string) {
    this.client = client;
    this.namespace = namespace;
  }

  async create(inputs: SpotNodePoolInputs): Promise<{ id: string; outs: Record<string, any> }> {
    const body: K8sResource = {
      apiVersion: "ngpc.rxt.io/v1",
      kind: "SpotNodePool",
      metadata: {
        name: randomUUID(),
        namespace: this.namespace,
      },
      spec: buildSpec(inputs),
    };

    const resource = await this.client.create(RESOURCE, body);
    const id: string = resource.metadata.name;
    return { id, outs: JSON.parse(JSON.stringify(apiToOutputs(resource))) };
  }

  async read(id: string): Promise<{ id: string; props: Record<string, any> }> {
    const resource = await this.client.get(RESOURCE, id);
    const props = apiToOutputs(resource);
    return { id, props };
  }

  diff(
    olds: SpotNodePoolInputs,
    news: SpotNodePoolInputs
  ): { changes: boolean; replaces: string[]; deleteBeforeReplace: boolean } {
    const replaces: string[] = [];

    // Immutable fields
    if (olds.cloudspaceName !== news.cloudspaceName) replaces.push("cloudspaceName");
    if (olds.serverClass !== news.serverClass) replaces.push("serverClass");

    // Mutable fields — detect any change
    const mutableChanged =
      olds.bidPrice !== news.bidPrice ||
      olds.desiredCount !== news.desiredCount ||
      !deepEqual(olds.autoscaling, news.autoscaling) ||
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
    olds: SpotNodePoolInputs,
    news: SpotNodePoolInputs
  ): Promise<{ outs: Record<string, any> }> {
    // Fetch latest to get the current resourceVersion
    const latest = await this.client.get(RESOURCE, id);

    const updatedSpec: Record<string, any> = {
      ...latest.spec,
      bidPrice: news.bidPrice.toFixed(3),
      customLabels: news.labels ?? {},
      customAnnotations: news.annotations ?? {},
      customTaints: news.taints ?? [],
    };

    // Handle autoscaling vs desired (mutually exclusive)
    if (news.autoscaling) {
      updatedSpec.autoscaling = {
        enabled: true,
        minNodes: news.autoscaling.minNodes,
        maxNodes: news.autoscaling.maxNodes,
      };
      delete updatedSpec.desired;
    } else {
      delete updatedSpec.autoscaling;
      if (news.desiredCount !== undefined) {
        updatedSpec.desired = news.desiredCount;
      }
    }

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
