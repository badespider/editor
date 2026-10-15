/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { transformAsync } from "@babel/core";
import { build } from "esbuild";
import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import type { Plugin } from "esbuild";
import presetSolid from "babel-preset-solid";
import presetTypescript from "@babel/preset-typescript";

/**
 * Compiles a Solid JSX project module into a single-file ESM bundle for `dapi mount`.
 *
 * Import resolution splits modules into two worlds:
 *   - Host modules the app must provide as its own instance (the shared Solid
 *     reactive runtime and the JSX runtime) are left external under the
 *     "dapi-host:" prefix and shimmed to the app's namespaces at load time.
 *   - Everything else is userland: bare specifiers (three, gsap, ...) are left
 *     external and rewritten to a CDN URL, so authors never install anything and
 *     any npm package works without us hardcoding a dependency list. An optional
 *     `dapi.config.json` import map pins versions or redirects to a mirror.
 */

// Prefix shared with the app's module loader — a specifier no user code would
// contain by accident, so the app-side rewrite is unambiguous.
export const HOST_MODULE_PREFIX = "dapi-host:";

// Modules that must be the app's own instance (a second copy of the Solid
// runtime would not share the reactive graph). These are never userland.
const HOST_MODULES_RE = /^(?:solid-js(?:\/store)?|@diffusionstudio\/jsx)$/;

// Userland bare imports resolve here at runtime unless the import map overrides
// them; the renderer imports the URL natively (a blob module can import
// absolute URLs). esm.sh resolves each package's own transitive deps.
const DEFAULT_CDN_BASE = "https://esm.sh";

type ResolverConfig = { cdnBase: string; importMap: Record<string, string> };

/**
 * Config hook. `dapi.config.json` in the cwd may set `cdnBase` and `imports`
 * (exact keys like "three" or trailing-slash prefixes like "three/"); env vars
 * override for one-offs. Malformed config is ignored in favour of the defaults.
 */
function loadResolverConfig(): ResolverConfig {
  let cdnBase = process.env.DAPI_CDN_BASE || DEFAULT_CDN_BASE;
  let importMap: Record<string, string> = {};

  const configPath = resolve(process.cwd(), "dapi.config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8")) as {
        cdnBase?: string;
        imports?: Record<string, string>;
      };
      if (cfg.cdnBase) cdnBase = cfg.cdnBase;
      if (cfg.imports) importMap = cfg.imports;
    } catch {
      // Ignore a malformed config; fall back to defaults.
    }
  }

  if (process.env.DAPI_IMPORT_MAP) {
    try {
      importMap = { ...importMap, ...(JSON.parse(process.env.DAPI_IMPORT_MAP) as Record<string, string>) };
    } catch {
      // Ignore malformed env override.
    }
  }

  return { cdnBase: cdnBase.replace(/\/+$/, ""), importMap };
}

/**
 * Maps a bare specifier to a URL: an exact import-map hit wins, then the longest
 * matching trailing-slash prefix, then the CDN default.
 */
function resolveBareSpecifier(spec: string, { cdnBase, importMap }: ResolverConfig): string {
  const exact = importMap[spec];
  if (exact) return exact;

  let prefix: string | undefined;
  for (const key of Object.keys(importMap)) {
    if (key.endsWith("/") && spec.startsWith(key) && (prefix === undefined || key.length > prefix.length)) {
      prefix = key;
    }
  }
  if (prefix !== undefined) return importMap[prefix] + spec.slice(prefix.length);

  return `${cdnBase}/${spec}`;
}

// The camelCase composition vocabulary, canonicalized to the PascalCase
// components in packages/jsx/src/elements.ts before babel-preset-solid runs.
// Project files write `<rect>`; the renderer keeps receiving `Rect`, so a
// tag's case still decides its environment at runtime.
const BUILT_IN_TAGS: Record<string, string> = {
  group: "Group", rect: "Rect", video: "Video", image: "Image",
  audio: "Audio", text: "Text", sequence: "Sequence", captions: "Captions",
  solidPaint: "SolidPaint", linearGradientPaint: "LinearGradientPaint",
  radialGradientPaint: "RadialGradientPaint", colorStop: "ColorStop",
  htmlPaint: "HtmlPaint", html: "Html", surfacePaint: "SurfacePaint", surface: "Surface",
  shaderPaint: "ShaderPaint",
};

// Tags that exist in both vocabularies. Every collision is SVG-only (HTML has
// no <rect>/<text>/<image>), and SVG content always sits under an SVG-only
// container, so lexical ancestry resolves them: inside one of the containers
// below the tag is SVG content, everywhere else it's a composition element.
// SVG fragments split into their own components must keep an <svg> or <g>
// wrapper; a bare fragment compiles as composition and the mount rejects it.
const AMBIGUOUS_TAGS = new Set(["rect", "text", "image"]);

const SVG_CONTAINERS = new Set([
  "svg", "g", "defs", "symbol", "marker", "mask", "clipPath", "pattern",
  "filter", "linearGradient", "radialGradient", "textPath", "tspan", "switch",
]);

// Recognized-but-wrong capitalized tags fail at compile time with a pointed
// message; anything else unbound is left for the bundler/runtime as usual.
const PASCAL_ELEMENTS = new Map(Object.entries(BUILT_IN_TAGS).map(([camel, pascal]) => [pascal, camel]));

const SOLID_CONTROL_FLOW = new Set([
  "For", "Show", "Switch", "Match", "Suspense", "SuspenseList", "Index", "ErrorBoundary",
]);

/**
 * Rewrites camelCase composition tags to aliased imports of their PascalCase
 * components. Aliases (rather than the component names themselves) keep a
 * user binding that happens to be called `Text` or `Rect` from capturing a
 * lowercase tag.
 */
function canonicalizeTags({ types: t }: { types: typeof BabelTypes }): PluginObj {
  const hasSvgAncestor = (path: NodePath): boolean =>
    path.findParent(
      (p) =>
        p.isJSXElement() &&
        t.isJSXIdentifier(p.node.openingElement.name) &&
        SVG_CONTAINERS.has(p.node.openingElement.name.name),
    ) !== null;

  return {
    visitor: {
      // The whole rewrite runs up front in Program enter: babel merges plugin
      // and preset visitors into one traversal, and babel-preset-solid
      // consumes an entire JSX tree on its first visit, so a JSXElement-level
      // visitor here would lose the race for every non-root tag.
      Program(path) {
        // PascalCase name -> local alias, per file.
        const aliases = new Map<string, string>();

        path.traverse({
          JSXElement(elementPath) {
            const name = elementPath.node.openingElement.name;
            if (!t.isJSXIdentifier(name)) return;

            if (/^[A-Z]/.test(name.name) && !elementPath.scope.hasBinding(name.name)) {
              const camel = PASCAL_ELEMENTS.get(name.name);
              if (camel !== undefined) {
                throw elementPath.buildCodeFrameError(
                  `<${name.name}> is not a tag; write the composition element as <${camel}>`,
                );
              }
              if (SOLID_CONTROL_FLOW.has(name.name)) {
                throw elementPath.buildCodeFrameError(
                  `<${name.name}> needs an import: add \`import { ${name.name} } from "solid-js"\``,
                );
              }
              return;
            }

            const pascal = BUILT_IN_TAGS[name.name];
            if (pascal === undefined) return;
            if (AMBIGUOUS_TAGS.has(name.name) && hasSvgAncestor(elementPath)) return;

            let alias = aliases.get(pascal);
            if (alias === undefined) {
              alias = `_$${pascal}`;
              aliases.set(pascal, alias);
            }
            elementPath.node.openingElement.name = t.jsxIdentifier(alias);
            if (elementPath.node.closingElement) {
              elementPath.node.closingElement.name = t.jsxIdentifier(alias);
            }
          },
        });

        if (aliases.size === 0) return;
        const specifiers = [...aliases].map(([name, alias]) =>
          t.importSpecifier(t.identifier(alias), t.identifier(name)),
        );
        path.unshiftContainer(
          "body",
          t.importDeclaration(specifiers, t.stringLiteral("@diffusionstudio/jsx")),
        );
      },
    },
  };
}

async function transformSolidJsx(source: string, filename: string): Promise<string> {
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [canonicalizeTags],
    presets: [
      [presetSolid, { generate: "universal", moduleName: "@diffusionstudio/jsx" }],
      [presetTypescript, {}],
    ],
    sourceMaps: "inline",
  });
  if (!result?.code) {
    throw new Error(`Failed to compile ${filename}`);
  }
  return result.code;
}

function resolverPlugin(config: ResolverConfig): Plugin {
  return {
    name: "dapi-resolver",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        const spec = args.path;

        // Let esbuild resolve the entry file itself on disk.
        if (args.kind === "entry-point") return null;

        // App-provided singletons: externalized and shimmed at load time.
        if (HOST_MODULES_RE.test(spec)) {
          return { path: `${HOST_MODULE_PREFIX}${spec}`, external: true };
        }

        // Catalog modules are already executable in the app. Compiling one for
        // CLI mount must preserve the same singleton imports, never send them
        // to the userland CDN or accept an unknown app namespace.
        if (spec.startsWith(HOST_MODULE_PREFIX)) {
          if (!HOST_MODULES_RE.test(spec.slice(HOST_MODULE_PREFIX.length))) {
            throw new Error(`Unknown app-provided module: ${spec}`);
          }
          return { path: spec, external: true };
        }

        // Explicit URL imports pass through to the renderer untouched.
        if (/^https?:\/\//.test(spec)) return { external: true };

        // Relative or absolute-path imports resolve on disk as usual (multi-file
        // samples, local helpers).
        if (spec.startsWith(".") || isAbsolute(spec)) return null;

        // Anything else is a userland bare specifier -> CDN / import map.
        return { path: resolveBareSpecifier(spec, config), external: true };
      });

      // esbuild strips types from .ts natively; only JSX files go through babel
      // so the Solid transform sees the untouched JSX.
      pluginBuild.onLoad({ filter: /\.[jt]sx$/ }, async (args) => ({
        contents: await transformSolidJsx(await readFile(args.path, "utf8"), args.path),
        loader: "js",
      }));
    },
  };
}

export type CompileInput = { path: string } | { code: string };

// `--code` ergonomics: a bare JSX expression (no `export default`) is wrapped
// into a component module, so one-liners like `--code '<rect width={10} />'`
function wrapBareJsx(code: string): string {
  if (/\bexport\s+default\b/.test(code)) return code;
  return `export default () => (\n${code.trim().replace(/;+\s*$/, "")}\n);`;
}

export async function compileProject(input: CompileInput): Promise<string> {
  const common = {
    bundle: true as const,
    write: false as const,
    format: "esm" as const,
    platform: "browser" as const,
    target: "es2022",
    sourcemap: "inline" as const,
    logLevel: "silent" as const,
    plugins: [resolverPlugin(loadResolverConfig())],
  };

  // Inline --code bypasses esbuild's loader pipeline (stdin skips onLoad), so
  // it is babel-transformed up front and fed in as plain JS.
  const result =
    "path" in input
      ? await build({ ...common, entryPoints: [input.path] })
      : await build({
          ...common,
          stdin: {
            contents: await transformSolidJsx(wrapBareJsx(input.code), "project.tsx"),
            loader: "js",
            resolveDir: process.cwd(),
            sourcefile: "project.tsx",
          },
        });

  const out = result.outputFiles?.[0];
  if (!out) throw new Error("Compilation produced no output");
  return out.text;
}
