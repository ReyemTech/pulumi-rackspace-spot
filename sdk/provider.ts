import * as pulumi from "@pulumi/pulumi";

export interface ProviderArgs {
  token?: pulumi.Input<string>;
}

export class Provider extends pulumi.ProviderResource {
  constructor(name: string, args?: ProviderArgs, opts?: pulumi.ResourceOptions) {
    super("rackspace-spot", name, { token: args?.token }, opts);
  }
}
