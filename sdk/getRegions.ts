import * as pulumi from "@pulumi/pulumi";

export interface RegionInfo {
  name: string;
  country: string;
  description: string;
}

export interface GetRegionsResult {
  regions: RegionInfo[];
}

export function getRegions(opts?: pulumi.InvokeOptions): Promise<GetRegionsResult> {
  return pulumi.runtime.invoke("rackspace-spot:index:getRegions", {}, opts);
}

export function getRegionsOutput(opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetRegionsResult> {
  return pulumi.runtime.invokeOutput("rackspace-spot:index:getRegions", {}, opts);
}
