import * as provider from "@pulumi/pulumi/provider";
import { SpotAuth } from "./auth";
import { SpotClient } from "./client";
import { CloudSpaceHandler } from "./resources/cloudspace";
import { SpotNodePoolHandler } from "./resources/spotnodepool";
import { OnDemandNodePoolHandler } from "./resources/ondemandnodepool";
import { getCloudspace } from "./functions/getCloudspace";
import { getKubeconfig } from "./functions/getKubeconfig";
import { getRegions } from "./functions/getRegions";
import { getServerClasses } from "./functions/getServerClasses";

const API_BASE = "https://spot.rackspace.com";

/** Extract the simple resource type from a URN like `urn:pulumi:stack::project::rackspace-spot:index:CloudSpace::name` */
function resourceTypeFromUrn(urn: string): string {
  // URN format: urn:pulumi:<stack>::<project>::<module>:<type>::<name>
  // The type segment is at index 2 (0-based after splitting on "::")
  const typeSegment = urn.split("::")[2] ?? "";
  // typeSegment is e.g. "rackspace-spot:index:CloudSpace"
  const parts = typeSegment.split(":");
  return parts[parts.length - 1] ?? "";
}

export class RackspaceSpotProvider implements provider.Provider {
  readonly version: string;
  readonly schema: string;

  private refreshToken: string | undefined;

  constructor(version: string, schema: string) {
    this.version = version;
    this.schema = schema;
  }

  // -------------------------------------------------------------------------
  // Config validation / storage
  // -------------------------------------------------------------------------

  async checkConfig(urn: string, _olds: any, news: any): Promise<provider.CheckResult> {
    if (news["token"]) {
      this.refreshToken = news["token"] as string;
    }
    return { inputs: news };
  }

  async diffConfig(
    _id: string,
    _urn: string,
    _olds: any,
    news: any
  ): Promise<provider.DiffResult> {
    return { changes: false };
  }

  async configure(news: any): Promise<void> {
    if (news["token"]) {
      this.refreshToken = news["token"] as string;
    }
  }

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------

  private async ensureClient(): Promise<{ client: SpotClient; token: string; namespace: string }> {
    const token =
      this.refreshToken ??
      process.env["RACKSPACE_SPOT_TOKEN"];

    if (!token) {
      throw new Error(
        "A Rackspace Spot refresh token is required. " +
          "Set RACKSPACE_SPOT_TOKEN or configure rackspace-spot:token."
      );
    }

    const auth = new SpotAuth(token, API_BASE);
    const { idToken, namespace } = await auth.getToken();
    const client = new SpotClient(API_BASE, namespace, idToken);
    return { client, token: idToken, namespace };
  }

  // -------------------------------------------------------------------------
  // check — pass inputs through unchanged
  // -------------------------------------------------------------------------

  async check(urn: string, _olds: any, news: any): Promise<provider.CheckResult> {
    return { inputs: news };
  }

  // -------------------------------------------------------------------------
  // diff — pure logic, no API calls needed
  // -------------------------------------------------------------------------

  async diff(
    id: string,
    urn: string,
    olds: any,
    news: any
  ): Promise<provider.DiffResult> {
    const type = resourceTypeFromUrn(urn);

    switch (type) {
      case "CloudSpace": {
        const h = new CloudSpaceHandler(null as any, "");
        return h.diff(olds, news);
      }
      case "SpotNodePool": {
        const h = new SpotNodePoolHandler(null as any, "");
        return h.diff(olds, news);
      }
      case "OnDemandNodePool": {
        const h = new OnDemandNodePoolHandler(null as any, "");
        return h.diff(olds, news);
      }
      default:
        throw new Error(`Unknown resource type for diff: ${type}`);
    }
  }

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  async create(urn: string, inputs: any): Promise<provider.CreateResult> {
    const { client, namespace } = await this.ensureClient();
    const type = resourceTypeFromUrn(urn);

    switch (type) {
      case "CloudSpace": {
        const h = new CloudSpaceHandler(client, namespace);
        return h.create(inputs);
      }
      case "SpotNodePool": {
        const h = new SpotNodePoolHandler(client, namespace);
        return h.create(inputs);
      }
      case "OnDemandNodePool": {
        const h = new OnDemandNodePoolHandler(client, namespace);
        return h.create(inputs);
      }
      default:
        throw new Error(`Unknown resource type for create: ${type}`);
    }
  }

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  async read(id: string, urn: string, props?: any): Promise<provider.ReadResult> {
    const { client, namespace } = await this.ensureClient();
    const type = resourceTypeFromUrn(urn);

    switch (type) {
      case "CloudSpace": {
        const h = new CloudSpaceHandler(client, namespace);
        return h.read(id);
      }
      case "SpotNodePool": {
        const h = new SpotNodePoolHandler(client, namespace);
        return h.read(id);
      }
      case "OnDemandNodePool": {
        const h = new OnDemandNodePoolHandler(client, namespace);
        return h.read(id);
      }
      default:
        throw new Error(`Unknown resource type for read: ${type}`);
    }
  }

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  async update(
    id: string,
    urn: string,
    olds: any,
    news: any
  ): Promise<provider.UpdateResult> {
    const { client, namespace } = await this.ensureClient();
    const type = resourceTypeFromUrn(urn);

    switch (type) {
      case "CloudSpace": {
        const h = new CloudSpaceHandler(client, namespace);
        return h.update(id, olds, news);
      }
      case "SpotNodePool": {
        const h = new SpotNodePoolHandler(client, namespace);
        return h.update(id, olds, news);
      }
      case "OnDemandNodePool": {
        const h = new OnDemandNodePoolHandler(client, namespace);
        return h.update(id, olds, news);
      }
      default:
        throw new Error(`Unknown resource type for update: ${type}`);
    }
  }

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  async delete(id: string, urn: string, _props: any): Promise<void> {
    const { client, namespace } = await this.ensureClient();
    const type = resourceTypeFromUrn(urn);

    switch (type) {
      case "CloudSpace": {
        const h = new CloudSpaceHandler(client, namespace);
        return h.delete(id);
      }
      case "SpotNodePool": {
        const h = new SpotNodePoolHandler(client, namespace);
        return h.delete(id);
      }
      case "OnDemandNodePool": {
        const h = new OnDemandNodePoolHandler(client, namespace);
        return h.delete(id);
      }
      default:
        throw new Error(`Unknown resource type for delete: ${type}`);
    }
  }

  // -------------------------------------------------------------------------
  // invoke — data source functions
  // -------------------------------------------------------------------------

  async invoke(token: string, inputs: any): Promise<provider.InvokeResult> {
    const { client, token: idToken } = await this.ensureClient();

    switch (token) {
      case "rackspace-spot:index:getCloudspace":
        return getCloudspace(client, inputs);

      case "rackspace-spot:index:getKubeconfig":
        return getKubeconfig(client, idToken, inputs);

      case "rackspace-spot:index:getRegions":
        return getRegions(client);

      case "rackspace-spot:index:getServerClasses":
        return getServerClasses(client, inputs);

      default:
        throw new Error(`Unknown function token: ${token}`);
    }
  }
}
