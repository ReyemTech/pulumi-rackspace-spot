import * as pulumi from "@pulumi/pulumi";

export interface GetCloudspaceArgs {
  name: string;
}

export interface GetCloudspaceResult {
  name: string;
  region: string;
  kubernetesVersion: string;
  cni: string;
  haControlPlane: boolean;
  apiServerEndpoint: string;
  phase: string;
}

export function getCloudspace(args: GetCloudspaceArgs, opts?: pulumi.InvokeOptions): Promise<GetCloudspaceResult> {
  return pulumi.runtime.invoke("rackspace-spot:index:getCloudspace", args, opts);
}

export function getCloudspaceOutput(args: GetCloudspaceArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCloudspaceResult> {
  return pulumi.runtime.invokeOutput("rackspace-spot:index:getCloudspace", args, opts);
}
