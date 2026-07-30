import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// The postinstall hook registers the provider in Pulumi's plugin cache. When it
// silently fails, the engine finds no plugin and falls through to downloading
// one from get.pulumi.com, which does not serve this private provider.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "sdk", "cmd", "install-plugin.js");
const ENTRYPOINT = path.join(REPO_ROOT, "sdk", "cmd", "pulumi-resource-rackspace-spot.js");

// Pulumi requests the plugin at the SDK package version, so the cache directory
// has to be keyed on that exact version or the lookup misses.
const SDK_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "sdk", "package.json"), "utf-8"),
).version as string;

// The hook reports failure on stderr, so both streams matter.
function runInstall(pulumiHome: string): { output: string; status: number } {
  const result = spawnSync("node", [SCRIPT], {
    env: { ...process.env, PULUMI_HOME: pulumiHome },
    encoding: "utf-8",
  });
  return { output: `${result.stdout ?? ""}${result.stderr ?? ""}`, status: result.status ?? 1 };
}

describe("install-plugin postinstall hook", () => {
  let pulumiHome: string;

  beforeEach(() => {
    pulumiHome = fs.mkdtempSync(path.join(os.tmpdir(), "pulumi-home-"));
  });

  afterEach(() => {
    fs.rmSync(pulumiHome, { recursive: true, force: true });
  });

  it("registers the plugin at the version-keyed path Pulumi looks up", () => {
    runInstall(pulumiHome);

    const shim = path.join(
      pulumiHome,
      "plugins",
      `resource-rackspace-spot-v${SDK_VERSION}`,
      "pulumi-resource-rackspace-spot",
    );
    expect(fs.existsSync(shim)).toBe(true);
  });

  it("writes an executable shim pointing at the packaged entrypoint", () => {
    runInstall(pulumiHome);

    const shim = path.join(
      pulumiHome,
      "plugins",
      `resource-rackspace-spot-v${SDK_VERSION}`,
      "pulumi-resource-rackspace-spot",
    );
    const contents = fs.readFileSync(shim, "utf-8");

    // Must exec the entrypoint in place: it resolves its dependencies from the
    // surrounding node_modules tree, so it cannot be copied out of the package.
    expect(contents).toContain(ENTRYPOINT);
    expect(fs.existsSync(ENTRYPOINT)).toBe(true);
    expect(fs.statSync(shim).mode & 0o111).toBeTruthy();
  });

  it("does not create a directory for any other version", () => {
    runInstall(pulumiHome);

    const entries = fs.readdirSync(path.join(pulumiHome, "plugins"));
    expect(entries).toEqual([`resource-rackspace-spot-v${SDK_VERSION}`]);
  });

  it("never fails the install when the plugin cache is unwritable", () => {
    // A regular file where the directory should be — mkdir fails with ENOTDIR.
    const blocked = path.join(pulumiHome, "not-a-dir");
    fs.writeFileSync(blocked, "");

    const { status, output } = runInstall(blocked);

    expect(status).toBe(0);
    expect(output).toMatch(/could not register plugin/i);
  });
});
