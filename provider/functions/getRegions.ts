import type { SpotClient } from "../client";

export async function getRegions(client: SpotClient) {
  const items = await client.listClusterScoped("regions");
  return {
    outputs: {
      regions: items.map((r: any) => ({
        name: r.metadata.name,
        country: r.spec?.country ?? "",
        description: r.spec?.description ?? "",
      })),
    },
  };
}
