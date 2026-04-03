import * as pulumi from "@pulumi/pulumi";
import { Autoscaling, Taint } from "./types/input";
import { AutoscalingOutput, TaintOutput } from "./types/output";

export interface SpotNodePoolArgs {
  cloudspaceName: pulumi.Input<string>;
  serverClass: pulumi.Input<string>;
  bidPrice: pulumi.Input<number>;
  desiredCount?: pulumi.Input<number>;
  autoscaling?: pulumi.Input<Autoscaling>;
  labels?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
  annotations?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
  taints?: pulumi.Input<pulumi.Input<Taint>[]>;
}

export class SpotNodePool extends pulumi.CustomResource {
  public readonly cloudspaceName!: pulumi.Output<string>;
  public readonly serverClass!: pulumi.Output<string>;
  public readonly bidPrice!: pulumi.Output<number>;
  public readonly desiredCount!: pulumi.Output<number | undefined>;
  public readonly autoscaling!: pulumi.Output<AutoscalingOutput | undefined>;
  public readonly labels!: pulumi.Output<{ [key: string]: string } | undefined>;
  public readonly annotations!: pulumi.Output<{ [key: string]: string } | undefined>;
  public readonly taints!: pulumi.Output<TaintOutput[] | undefined>;
  public readonly nodepoolId!: pulumi.Output<string>;
  public readonly wonCount!: pulumi.Output<number>;
  public readonly bidStatus!: pulumi.Output<string>;

  constructor(name: string, args: SpotNodePoolArgs, opts?: pulumi.CustomResourceOptions) {
    super("rackspace-spot:index:SpotNodePool", name, {
      ...args,
      nodepoolId: undefined,
      wonCount: undefined,
      bidStatus: undefined,
    }, opts);
  }
}
