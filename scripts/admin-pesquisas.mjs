/**
 * pnpm run admin:pesquisas
 * Inicia sua ferramenta administrativa para trabalhar com pesquisas eleitorais.
- Executa scripts/admin-pesquisas.mjs.
- Utiliza React e Vite.
- Disponibiliza a interface em http://127.0.0.1:4179.
- Ferramenta não exposta automaticamente à internet.
- Comando para abrir o formulário local de pesquisas.
 * */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Sem encaminhamento via CLI: a opção --host não pode ser exposta à rede local (LAN)
if (process.argv.length > 2)
  throw new Error(
    "Este comando não aceita argumentos; use http://127.0.0.1:4179.",
  );
const root = fileURLToPath(new URL("../tools/pesquisas/", import.meta.url));
const shared = fileURLToPath(new URL("../lib/forecast/", import.meta.url));
const catalog = fileURLToPath(new URL("../lib/catalog.ts", import.meta.url));
const dependencies = fileURLToPath(
  new URL("../node_modules/", import.meta.url),
);
const server = await createServer({
  configFile: false,
  envFile: false,
  root,
  publicDir: false,
  cacheDir: fileURLToPath(
    new URL("../node_modules/.vite-pesquisas/", import.meta.url),
  ),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4179,
    strictPort: true,
    cors: false,
    fs: { strict: true, allow: [root, shared, catalog, dependencies] },
    headers: {
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
