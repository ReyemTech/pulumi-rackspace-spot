#!/usr/bin/env node
/**
 * Postinstall hook — registers the provider in Pulumi's plugin cache so the
 * engine can find it without a PATH entry or elevated permissions.
 *
 * Writes $PULUMI_HOME/plugins/resource-rackspace-spot-v<version>/pulumi-resource-rackspace-spot,
 * a shim that execs this package's entrypoint from inside node_modules, where its
 * dependencies resolve. The directory is version-keyed and is exactly where the
 * engine looks before attempting a download, so an upgrade registers itself.
 *
 * Previously this symlinked into /usr/local/bin, which is root-owned on most
 * Linux hosts — the link was silently skipped and Pulumi fell through to
 * downloading the plugin from get.pulumi.com, which 404s/403s for a private
 * provider.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_NAME = "rackspace-spot";

// The version Pulumi requests is the SDK package version, so key the directory
// on that rather than on the bundled cmd/package.json.
const { version } = require("../package.json");

const entrypoint = path.join(__dirname, "pulumi-resource-rackspace-spot.js");
const pulumiHome = process.env.PULUMI_HOME || path.join(os.homedir(), ".pulumi");
const dir = path.join(pulumiHome, "plugins", `resource-${PLUGIN_NAME}-v${version}`);
const dest = path.join(dir, `pulumi-resource-${PLUGIN_NAME}`);

try {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, `#!/bin/sh\nexec node ${JSON.stringify(entrypoint)} "$@"\n`);
  fs.chmodSync(dest, 0o755);
  console.log(`pulumi-rackspace-spot: registered plugin v${version} at ${dest}`);
} catch (e) {
  // Non-fatal — never fail an install over this.
  console.warn(
    `pulumi-rackspace-spot: could not register plugin v${version} (${e.code}). ` +
      `Pulumi will not find the provider; add ${__dirname} to PATH or create ${dest} manually.`,
  );
}
