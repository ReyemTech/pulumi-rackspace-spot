import type { SpotClient } from "../client";

export async function getKubeconfig(client: SpotClient, token: string, inputs: { cloudspaceName: string }) {
  const cs = await client.get("cloudspaces", inputs.cloudspaceName);
  const endpoint = cs.status?.apiServerEndpoint;
  if (!endpoint) throw new Error(`Cloudspace ${inputs.cloudspaceName} has no API endpoint yet`);

  const raw = JSON.stringify({
    apiVersion: "v1",
    kind: "Config",
    clusters: [{
      cluster: { server: `https://${endpoint}`, "insecure-skip-tls-verify": true },
      name: inputs.cloudspaceName,
    }],
    contexts: [{
      context: { cluster: inputs.cloudspaceName, namespace: "default", user: "spot-user" },
      name: inputs.cloudspaceName,
    }],
    "current-context": inputs.cloudspaceName,
    users: [{ name: "spot-user", user: { token } }],
  });

  return { outputs: { raw, host: `https://${endpoint}`, clusterName: inputs.cloudspaceName } };
}
