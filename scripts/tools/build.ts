import { build as TsupBuild, type Options as TsupOptions } from "tsup";
import { join } from "path";

import { normalizePath } from "../helpers/normalize-path.js";

import BunLock from "../../bun.lock";

const banner = `/**
* Thanks for using Venloc SVM <3
* https://github.com/venloc-tech/svm
*/`;


type ValueTypeFromArray<T> = T extends Array<infer U> ? U : never;
type TsupPlugin = ValueTypeFromArray<Exclude<TsupOptions["plugins"], null | undefined>>

const fixCJS: TsupPlugin = {
  // https://github.com/egoist/tsup/issues/953#issuecomment-2294998890
  // Maybe use: https://github.com/aymericzip/esbuild-fix-imports-plugin
  // ensuring that all local requires/imports in `.cjs` files import from `.cjs` files.
  // require('./path') → require('./path.cjs') in `.cjs` files
  // require('../path') → require('../path.cjs') in `.cjs` files
  // from './path' → from './path.cjs' in `.cjs` files
  // from '../path' → from '../path.cjs' in `.cjs` files
  name: "fix-cjs-imports",
  renderChunk(code) {
    if (this.format === "cjs") {
      const regexCjs = /require\((?<quote>['"])(?<import>\.[^'"]+)\.js['"]\)/g;
      const regexEsm = /from(?<space>[\s]*)(?<quote>['"])(?<import>\.[^'"]+)\.js['"]/g;
      return {
        code: code
          .replace(regexCjs, "require($<quote>$<import>.cjs$<quote>)")
          .replace(regexEsm, "from$<space>$<quote>$<import>.cjs$<quote>"),
      };
    }
  },
};

const main = async () => {
  const entries = Object.keys(BunLock.workspaces).slice(1);

  if (entries.length === 0) throw new Error(`Workspaces not found.`);

  /* If we don't collect all workspace packages (i.e., their names)
   * across the monorepository, TypeScript will include them
   * in the bundle instead of treating them as separate packages.
   */
  const workspacePackages = Object
    .values(BunLock.workspaces)
    .slice(1)
    .map(workspace => workspace.name)
    .filter(Boolean) as string[];

  for (const dir of entries) {
    const entry = [normalizePath(join(dir, "src", "index.ts"))];
    const allEntry = entry.concat(normalizePath(join(dir, "src", "**/*@(ts|tsx)")));
    const tsconfig = normalizePath(join(dir, "tsconfig.json"));
    const dist = normalizePath(join(dir, "dist"));

    try {
      await Bun.$`rm -rf ${dist}`;
    } catch {}

    const base: Partial<TsupOptions> = {
      outDir: dist,
      format: ["esm", "cjs"],
      tsconfig: tsconfig,
      external: workspacePackages,
      esbuildOptions: (options) => {
        options.packages = "external";
      },
    };

    await TsupBuild({
      entry: allEntry,
      dts: { only: true, banner },
      bundle: false,
      ...base,
    });

    await TsupBuild({
      entry: entry,
      ...base,
      sourcemap: true,
      splitting: false,
      bundle: true,
      banner: { js: banner },
      plugins: [fixCJS],
    });
  }
};

await main();