import type { SpotClient } from "../client";

export async function getCloudspace(client: SpotClient, inputs: { name: string }) {
  const cs = await client.get("cloudspaces", inputs.name);
  return {
    outputs: {
      name: cs.metadata.name,
      region: cs.spec.region,
      kubernetesVersion: cs.spec.kubernetesVersion,
      cni: cs.spec.cni,
      haControlPlane: cs.spec.HAControlPlane ?? cs.spec.haControlPlane ?? false,
      apiServerEndpoint: cs.status?.APIServerEndpoint ?? cs.status?.apiServerEndpoint ?? "",
      phase: cs.status?.phase ?? "",
    },
  };
}
