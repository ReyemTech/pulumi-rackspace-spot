import { SpotClient, K8sResource } from "../client";

const RESOURCE = "cloudspaces";
const API_VERSION = "ngpc.rxt.io/v1";
const KIND = "CloudSpace";

export interface CloudSpaceInputs {
  cloudspaceName: string;
  region: string;
  kubernetesVersion?: string;
  cni?: string;
  haControlPlane?: boolean;
  preemptionWebhookUrl?: string;
  deploymentType?: string;
}

// Fields that cannot change in-place; any change requires resource replacement.
const IMMUTABLE_FIELDS: (keyof CloudSpaceInputs)[] = [
  "cloudspaceName",
  "region",
  "cni",
  "deploymentType",
];

function buildBody(inputs: CloudSpaceInputs, namespace: string): K8sResource {
  return {
    apiVersion: API_VERSION,
    kind: KIND,
    metadata: {
      name: inputs.cloudspaceName,
      namespace,
    },
    spec: {
      region: inputs.region,
      cloud: "default",
      kubernetesVersion: inputs.kubernetesVersion,
      cni: inputs.cni,
      haControlPlane: inputs.haControlPlane,
      deploymentType: inputs.deploymentType ?? "gen2",
      webhook: inputs.preemptionWebhookUrl,
    },
  };
}

function mapToOutputs(resource: K8sResource): Record<string, any> {
  const spec = resource.spec ?? {};
  const status = resource.status ?? {};
  return {
    cloudspaceName: resource.metadata?.name,
    region: spec.region,
    kubernetesVersion: spec.kubernetesVersion,
    cni: spec.cni,
    haControlPlane: spec.haControlPlane,
    preemptionWebhookUrl: spec.webhook,
    deploymentType: spec.deploymentType,
    apiServerEndpoint: status.apiServerEndpoint,
    phase: status.phase,
  };
}

export class CloudSpaceHandler {
  private readonly client: SpotClient;
  private readonly namespace: string;

  constructor(client: SpotClient, namespace: string) {
    this.client = client;
    this.namespace = namespace;
  }

  async create(inputs: CloudSpaceInputs): Promise<{ id: string; outs: Record<string, any> }> {
    const body = buildBody(inputs, this.namespace);
    const resource = await this.client.create(RESOURCE, body);
    return {
      id: inputs.cloudspaceName,
      outs: mapToOutputs(resource),
    };
  }

  async read(id: string): Promise<{ id: string; props: Record<string, any> }> {
    const resource = await this.client.get(RESOURCE, id);
    return {
      id,
      props: mapToOutputs(resource),
    };
  }

  diff(
    olds: CloudSpaceInputs,
    news: CloudSpaceInputs
  ): { changes: boolean; replaces: string[]; deleteBeforeReplace: boolean } {
    const replaces: string[] = [];

    for (const field of IMMUTABLE_FIELDS) {
      if (olds[field] !== news[field]) {
        replaces.push(field);
      }
    }

    // Check mutable fields too so we can signal changes even with no replacements
    const mutableFields: (keyof CloudSpaceInputs)[] = [
      "kubernetesVersion",
      "haControlPlane",
      "preemptionWebhookUrl",
    ];

    let mutableChanged = false;
    for (const field of mutableFields) {
      if (olds[field] !== news[field]) {
        mutableChanged = true;
        break;
      }
    }

    const changes = replaces.length > 0 || mutableChanged;
    return { changes, replaces, deleteBeforeReplace: false };
  }

  async update(
    id: string,
    _olds: CloudSpaceInputs,
    news: CloudSpaceInputs
  ): Promise<{ outs: Record<string, any> }> {
    // GET latest to obtain metadata.resourceVersion for optimistic concurrency
    const latest = await this.client.get(RESOURCE, id);

    // Merge ONLY mutable fields onto the existing resource body
    const updated: K8sResource = {
      ...latest,
      spec: {
        ...latest.spec,
        kubernetesVersion: news.kubernetesVersion,
        haControlPlane: news.haControlPlane,
        webhook: news.preemptionWebhookUrl,
      },
    };

    const resource = await this.client.update(RESOURCE, id, updated);
    return { outs: mapToOutputs(resource) };
  }

  async delete(id: string): Promise<void> {
    await this.client.remove(RESOURCE, id);
  }
}
