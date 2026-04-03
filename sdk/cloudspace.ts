import * as pulumi from "@pulumi/pulumi";

export interface CloudSpaceArgs {
  cloudspaceName: pulumi.Input<string>;
  region: pulumi.Input<string>;
  kubernetesVersion?: pulumi.Input<string>;
  cni?: pulumi.Input<string>;
  haControlPlane?: pulumi.Input<boolean>;
  preemptionWebhookUrl?: pulumi.Input<string>;
}

export class CloudSpace extends pulumi.CustomResource {
  public readonly cloudspaceName!: pulumi.Output<string>;
  public readonly region!: pulumi.Output<string>;
  public readonly kubernetesVersion!: pulumi.Output<string>;
  public readonly cni!: pulumi.Output<string>;
  public readonly haControlPlane!: pulumi.Output<boolean>;
  public readonly preemptionWebhookUrl!: pulumi.Output<string | undefined>;
  public readonly apiServerEndpoint!: pulumi.Output<string>;
  public readonly phase!: pulumi.Output<string>;

  constructor(name: string, args: CloudSpaceArgs, opts?: pulumi.CustomResourceOptions) {
    super("rackspace-spot:index:CloudSpace", name, {
      ...args,
      apiServerEndpoint: undefined,
      phase: undefined,
    }, opts);
  }
}
