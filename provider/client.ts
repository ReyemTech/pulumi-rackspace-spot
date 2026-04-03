export type K8sResource = Record<string, any>;

const API_GROUP = "ngpc.rxt.io/v1";

export class SpotClient {
  private readonly baseUrl: string;
  private readonly namespace: string;
  private readonly headers: Record<string, string>;

  constructor(baseUrl: string, namespace: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.namespace = namespace;
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // Namespaced path: /apis/ngpc.rxt.io/v1/namespaces/{namespace}/{resource}/{name}
  private namespacedUrl(resource: string, name?: string): string {
    const base = `${this.baseUrl}/apis/${API_GROUP}/namespaces/${this.namespace}/${resource}`;
    return name ? `${base}/${name}` : base;
  }

  // Cluster-scoped path: /apis/ngpc.rxt.io/v1/{resource}/{name}
  private clusterUrl(resource: string, name?: string): string {
    const base = `${this.baseUrl}/apis/${API_GROUP}/${resource}`;
    return name ? `${base}/${name}` : base;
  }

  private async request(url: string, opts: RequestInit = {}): Promise<string> {
    const res = await fetch(url, {
      ...opts,
      headers: { ...this.headers, ...(opts.headers as Record<string, string> | undefined) },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Spot API error ${res.status}: ${text}`);
    }
    return text;
  }

  async get(resource: string, name: string): Promise<K8sResource> {
    const text = await this.request(this.namespacedUrl(resource, name), { method: "GET" });
    return JSON.parse(text);
  }

  async list(resource: string): Promise<K8sResource[]> {
    const text = await this.request(this.namespacedUrl(resource), { method: "GET" });
    const body = JSON.parse(text);
    return body.items as K8sResource[];
  }

  async create(resource: string, body: K8sResource): Promise<K8sResource> {
    const text = await this.request(this.namespacedUrl(resource), {
      method: "POST",
      body: JSON.stringify(body),
    });
    return JSON.parse(text);
  }

  async update(resource: string, name: string, body: K8sResource): Promise<K8sResource> {
    const text = await this.request(this.namespacedUrl(resource, name), {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return JSON.parse(text);
  }

  async remove(resource: string, name: string): Promise<void> {
    await this.request(this.namespacedUrl(resource, name), { method: "DELETE" });
  }

  async getClusterScoped(resource: string, name?: string): Promise<K8sResource> {
    const text = await this.request(this.clusterUrl(resource, name), { method: "GET" });
    return JSON.parse(text);
  }

  async listClusterScoped(resource: string): Promise<K8sResource[]> {
    const text = await this.request(this.clusterUrl(resource), { method: "GET" });
    const body = JSON.parse(text);
    return body.items as K8sResource[];
  }
}
