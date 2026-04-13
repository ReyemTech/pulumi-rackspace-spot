#!/usr/bin/env node
/**
 * Postinstall hook — symlinks the provider binary so Pulumi can find it on $PATH.
 * Creates: /usr/local/bin/pulumi-resource-rackspace-spot -> this package's cmd/pulumi-resource-rackspace-spot.js
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "pulumi-resource-rackspace-spot.js");
const dest = "/usr/local/bin/pulumi-resource-rackspace-spot";

try {
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.symlinkSync(src, dest);
  console.log(`pulumi-rackspace-spot: linked provider to ${dest}`);
} catch (e) {
  // Non-fatal — CI environments may not have /usr/local/bin write access
  console.warn(`pulumi-rackspace-spot: could not link provider to ${dest} (${e.code}). Add ${path.dirname(src)} to PATH manually.`);
}
