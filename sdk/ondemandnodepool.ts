import * as pulumi from "@pulumi/pulumi";
import { Taint } from "./types/input";
import { TaintOutput } from "./types/output";

export interface OnDemandNodePoolArgs {
  cloudspaceName: pulumi.Input<string>;
  serverClass: pulumi.Input<string>;
  desiredCount: pulumi.Input<number>;
  labels?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
  annotations?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
  taints?: pulumi.Input<pulumi.Input<Taint>[]>;
}

export class OnDemandNodePool extends pulumi.CustomResource {
  public readonly cloudspaceName!: pulumi.Output<string>;
  public readonly serverClass!: pulumi.Output<string>;
  public readonly desiredCount!: pulumi.Output<number>;
  public readonly labels!: pulumi.Output<{ [key: string]: string } | undefined>;
  public readonly annotations!: pulumi.Output<{ [key: string]: string } | undefined>;
  public readonly taints!: pulumi.Output<TaintOutput[] | undefined>;
  public readonly nodepoolId!: pulumi.Output<string>;
  public readonly reservedCount!: pulumi.Output<number>;
  public readonly reservedStatus!: pulumi.Output<string>;

  constructor(name: string, args: OnDemandNodePoolArgs, opts?: pulumi.CustomResourceOptions) {
    super("rackspace-spot:index:OnDemandNodePool", name, {
      ...args,
      nodepoolId: undefined,
      reservedCount: undefined,
      reservedStatus: undefined,
    }, opts);
  }
}
