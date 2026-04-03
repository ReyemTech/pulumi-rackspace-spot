import * as pulumi from "@pulumi/pulumi";
import { readFileSync } from "fs";
import { resolve } from "path";
import { RackspaceSpotProvider } from "./provider";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json") as { version: string };

function main(args: string[]): Promise<void> {
  // At runtime __dirname is provider/bin/ (compiled output).
  // schema.json sits one level up at the provider root, and package.json
  // is at the repo root (two levels up from bin/).
  const schema = readFileSync(resolve(__dirname, "..", "schema.json"), "utf-8");

  return pulumi.provider.main(new RackspaceSpotProvider(pkg.version, schema), args);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
