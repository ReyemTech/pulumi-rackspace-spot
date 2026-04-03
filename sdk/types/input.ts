import * as pulumi from "@pulumi/pulumi";

export interface Autoscaling {
  minNodes: pulumi.Input<number>;
  maxNodes: pulumi.Input<number>;
}

export interface Taint {
  key: pulumi.Input<string>;
  value?: pulumi.Input<string>;
  effect: pulumi.Input<string>;
}
