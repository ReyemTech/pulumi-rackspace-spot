import * as pulumi from "@pulumi/pulumi";

export interface GetKubeconfigArgs {
  cloudspaceName: string;
}

export interface GetKubeconfigResult {
  raw: string;
  host: string;
  clusterName: string;
}

export function getKubeconfig(args: GetKubeconfigArgs, opts?: pulumi.InvokeOptions): Promise<GetKubeconfigResult> {
  return pulumi.runtime.invoke("rackspace-spot:index:getKubeconfig", args, opts);
}

export function getKubeconfigOutput(args: GetKubeconfigArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetKubeconfigResult> {
  return pulumi.runtime.invokeOutput("rackspace-spot:index:getKubeconfig", args, opts);
}
