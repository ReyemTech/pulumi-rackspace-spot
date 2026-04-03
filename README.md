<p align="center">
  <a href="https://reyem.tech">
    <img src="https://avatars.githubusercontent.com/u/153843352?v=4" width="80" alt="ReyemTech" />
  </a>
</p>

<h1 align="center">Pulumi Rackspace Spot Provider</h1>

<p align="center">
  A native <a href="https://www.pulumi.com">Pulumi</a> provider for <a href="https://spot.rackspace.com">Rackspace Spot</a> — manage cloudspaces, node pools, and kubeconfig from infrastructure code.
</p>

<p align="center">
  <a href="https://github.com/ReyemTech/pulumi-rackspace-spot/actions/workflows/ci.yml"><img src="https://github.com/ReyemTech/pulumi-rackspace-spot/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@reyemtech/pulumi-rackspace-spot"><img src="https://img.shields.io/npm/v/@reyemtech/pulumi-rackspace-spot" alt="npm version" /></a>
  <a href="https://github.com/ReyemTech/pulumi-rackspace-spot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ReyemTech/pulumi-rackspace-spot" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@reyemtech/pulumi-rackspace-spot"><img src="https://img.shields.io/npm/dm/@reyemtech/pulumi-rackspace-spot" alt="Downloads" /></a>
</p>

---

## Overview

This is a **native TypeScript Pulumi provider** that talks directly to the Rackspace Spot Kubernetes-style API. No Terraform bridge, no Go plugin binary — just TypeScript calling the API with proper diff semantics.

**Why native?** The bridged Terraform provider (`rackerlabs/spot`) sends ALL fields on every update, causing the Rackspace API to reject immutable field modifications. This provider only sends mutable fields, handles immutable changes as replacements, and supports auto-authentication via `~/.spot_config`.

### Resources

| Resource | Description |
|----------|-------------|
| `CloudSpace` | Rackspace Spot cloudspace (managed K8s cluster) |
| `SpotNodePool` | Spot instance node pool with bid pricing |
| `OnDemandNodePool` | On-demand (reserved) node pool |

### Data Sources

| Function | Description |
|----------|-------------|
| `getCloudspace` | Read an existing cloudspace |
| `getKubeconfig` | Get a fresh kubeconfig for a cloudspace |
| `getRegions` | List available Rackspace Spot regions |
| `getServerClasses` | List available server classes (optionally filtered by region) |

## Installation

```bash
npm install @reyemtech/pulumi-rackspace-spot
```

## Authentication

The provider authenticates via Rackspace Spot's OIDC flow using a refresh token. Three methods (checked in order):

1. **Pulumi config** (recommended for CI):
   ```bash
   pulumi config set --secret rackspace-spot:token <refresh-token>
   ```

2. **Environment variable**:
   ```bash
   export RACKSPACE_SPOT_TOKEN=<refresh-token>
   ```

3. **~/.spot_config** (automatic — created by `spotctl configure`):
   ```
   refreshToken: <your-token>
   ```

   If you use `spotctl` locally, the provider picks up your token automatically with zero configuration.

## Quick Start

```typescript
import * as spot from "@reyemtech/pulumi-rackspace-spot";

// Create a cloudspace
const cloudspace = new spot.CloudSpace("prod", {
  cloudspaceName: "my-cluster",
  region: "us-east-iad-1",
  kubernetesVersion: "1.33.0",
  cni: "calico",
});

// Add a spot node pool
const workers = new spot.SpotNodePool("workers", {
  cloudspaceName: "my-cluster",
  serverClass: "gp.vs1.xlarge-iad",
  bidPrice: 0.04,
  desiredCount: 3,
}, { dependsOn: [cloudspace] });

// Or with autoscaling
const scalable = new spot.SpotNodePool("scalable", {
  cloudspaceName: "my-cluster",
  serverClass: "gp.vs1.2xlarge-iad",
  bidPrice: 0.08,
  autoscaling: { minNodes: 2, maxNodes: 10 },
  labels: { "workload": "general" },
}, { dependsOn: [cloudspace] });

// Get kubeconfig for kubectl access
const kubeconfig = spot.getKubeconfigOutput({
  cloudspaceName: "my-cluster",
});

// Use with @pulumi/kubernetes
import * as k8s from "@pulumi/kubernetes";

const k8sProvider = new k8s.Provider("k8s", {
  kubeconfig: kubeconfig.raw,
});
```

## Resource Reference

### CloudSpace

Manages a Rackspace Spot cloudspace (Kubernetes cluster).

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `cloudspaceName` | `string` | Yes | Unique name for the cloudspace |
| `region` | `string` | Yes | Rackspace Spot region (e.g., `us-east-iad-1`) |
| `kubernetesVersion` | `string` | No | K8s version (e.g., `1.33.0`) |
| `cni` | `string` | No | CNI plugin: `calico`, `cilium`, `byocni`. Default: `calico` |
| `haControlPlane` | `boolean` | No | HA control plane. Default: `false` |
| `preemptionWebhookUrl` | `string` | No | Webhook URL for preemption notifications |

| Output | Type | Description |
|--------|------|-------------|
| `apiServerEndpoint` | `string` | K8s API server endpoint |
| `phase` | `string` | Cloudspace status phase |

**Immutable fields** (changes trigger replacement): `cloudspaceName`, `region`, `cni`

### SpotNodePool

Manages a spot instance node pool with bid pricing.

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `cloudspaceName` | `string` | Yes | Parent cloudspace name |
| `serverClass` | `string` | Yes | Server class (e.g., `gp.vs1.xlarge-iad`) |
| `bidPrice` | `number` | Yes | Bid price in USD (e.g., `0.04`) |
| `desiredCount` | `number` | No | Fixed node count (conflicts with autoscaling) |
| `autoscaling` | `object` | No | `{ minNodes, maxNodes }` (conflicts with desiredCount) |
| `labels` | `map<string>` | No | Kubernetes node labels |
| `annotations` | `map<string>` | No | Kubernetes node annotations |
| `taints` | `array` | No | `[{ key, value?, effect }]` |

| Output | Type | Description |
|--------|------|-------------|
| `nodepoolId` | `string` | Auto-generated UUID |
| `wonCount` | `number` | Number of won bids |
| `bidStatus` | `string` | Current bid status |

**Immutable fields**: `cloudspaceName`, `serverClass`

### OnDemandNodePool

Manages an on-demand (reserved) node pool.

Same as SpotNodePool but without `bidPrice` and `autoscaling`. `desiredCount` is required.

## Known Issues

- **CloudSpace resource import** fails with a protobuf serialization error (`toJavaScript`). Workaround: use `getCloudspace` data source for existing cloudspaces. Tracked in [REY-219](https://linear.app/reyemtech/issue/REY-219).
- **SpotNodePool import** via `pulumi import` CLI has the same serialization issue. Workaround: let the provider create a new node pool, then delete the old one via `spotctl`. Tracked in [REY-220](https://linear.app/reyemtech/issue/REY-220).

## Development

```bash
# Install dependencies
npm install

# Run tests (95%+ coverage required)
npx vitest run --coverage

# Build provider + SDK
npm run build

# Link provider binary for local testing
ln -sf $(pwd)/pulumi-resource-rackspace-spot /usr/local/bin/

# Link SDK for local use
cd sdk && npm link
```

## License

[MIT](LICENSE) &copy; [ReyemTech Inc.](https://reyem.tech)
