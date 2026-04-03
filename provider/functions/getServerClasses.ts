import type { SpotClient } from "../client";

export async function getServerClasses(client: SpotClient, inputs?: { region?: string }) {
  const items = await client.listClusterScoped("serverclasses");
  const filtered = inputs?.region
    ? items.filter((sc: any) => sc.spec?.region === inputs.region)
    : items;
  return {
    outputs: {
      serverClasses: filtered.map((sc: any) => ({
        name: sc.metadata.name,
        region: sc.spec?.region ?? "",
        category: sc.spec?.category ?? "",
        cpu: sc.spec?.resources?.cpu ?? "",
        memory: sc.spec?.resources?.memory ?? "",
        flavorType: sc.spec?.flavorType ?? "",
        available: sc.status?.available ?? 0,
        capacity: sc.status?.capacity ?? 0,
      })),
    },
  };
}
