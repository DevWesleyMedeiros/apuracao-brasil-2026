/**
 * Gerenciador de execução e compilação da aplicação.
 *
 * Identifica o ambiente de execução e seleciona a ferramenta
 * adequada para iniciar (dev) ou compilar (build) do projeto.
 *
 * - Ambiente local: utiliza Vinext.
 * - Linux gerenciado: utiliza Vite ou o build verificado.
 *
 * Executado pelos scripts "dev" e "build" do package.json.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command))
  throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

if (managedLinux && command === "build") {
  const result = spawnSync(
    "bash",
    [fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Realize a importação neste processo, de modo que o proprietário da visualização (preview owner) mantenha seu PID e seus sinais.
const cli = new URL(
  managedLinux
    ? "../node_modules/vite/bin/vite.js"
    : "../node_modules/vinext/dist/cli.js",
  import.meta.url,
);
process.argv = [
  process.execPath,
  fileURLToPath(cli),
  command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []),
  ...args,
];
await import(cli.href);
