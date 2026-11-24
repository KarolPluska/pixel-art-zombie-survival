import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["tests/environment.test.ts"], platform: "node", format: "esm", bundle: true, write: false,
});
await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);