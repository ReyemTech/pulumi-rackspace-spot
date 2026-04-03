import * as pulumi from "@pulumi/pulumi";

export interface GetServerClassesArgs {
  region?: string;
}

export interface ServerClassInfo {
  name: string;
  region: string;
  category: string;
  cpu: string;
  memory: string;
  flavorType: string;
  available: number;
  capacity: number;
}

export interface GetServerClassesResult {
  serverClasses: ServerClassInfo[];
}

export function getServerClasses(args?: GetServerClassesArgs, opts?: pulumi.InvokeOptions): Promise<GetServerClassesResult> {
  return pulumi.runtime.invoke("rackspace-spot:index:getServerClasses", args ?? {}, opts);
}

export function getServerClassesOutput(args?: GetServerClassesArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetServerClassesResult> {
  return pulumi.runtime.invokeOutput("rackspace-spot:index:getServerClasses", args ?? {}, opts);
}
