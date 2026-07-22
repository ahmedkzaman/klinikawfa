import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { componentTagger } from "lovable-tagger";
import { resolveSupabaseBuildConfig } from "./src/config/supabase-build-config";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Merge Vite's mode-specific .env with the process environment so hosted
  // builds (which inject VITE_* vars via process.env, without a .env file on
  // disk) resolve the same names as local development. process.env wins on
  // key conflicts so the deployment environment can override .env.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };
  const supabaseConfig = resolveSupabaseBuildConfig(mode, env);
  const { missing } = supabaseConfig;

  if (missing.length > 0) {
    // Fail closed for every mode except "development". Hosted dev-mode builds
    // may legitimately omit VITE_* vars from process.env, and the Supabase
    // client will still surface a clear runtime error at load time. Any other
    // mode (production, staging, test, etc.) must fail the build with the
    // exact missing variable names. CI=true does NOT bypass this check.
    const message = `Missing required Supabase environment variables: ${missing.join(", ")}`;
    if (mode === "development") {
      console.warn(`[vite.config] ${message}`);
    } else {
      throw new Error(message);
    }
  }

  return {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseConfig.url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        supabaseConfig.publishableKey
      ),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
        supabaseConfig.publishableKey
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        supabaseConfig.projectId
      ),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": sourceDirectory,
      },
    },
  };
});
