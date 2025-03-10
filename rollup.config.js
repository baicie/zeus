// @ts-check
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.TARGET) {
  throw new Error("TARGET package must be specified via --environment flag.");
}

const require = createRequire(import.meta.url);
const _dirname = fileURLToPath(new URL(".", import.meta.url));

const masterVersion = require("./package.json").version;

const packagesDir = path.resolve(_dirname, "packages");
const packageDir = path.resolve(packagesDir, process.env.TARGET);

const resolve = (p) => path.resolve(packageDir, p);
const pkg = require(resolve("package.json"));
const packageOptions = pkg.buildOptions || {};
const name = path.basename(packageDir);

const banner = `
* ${name} v${masterVersion}
* (c) ${new Date().getFullYear()} ${pkg.author}
* Released under the ${pkg.license} License.
`;

const outputConfigs = {};
