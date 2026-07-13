import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Merge Vite's mode-specific .env with the process environment so hosted
  // builds (which inject VITE_* vars via process.env, without a .env file on
  // disk) resolve the same names as local development. process.env wins on
  // key conflicts so the deployment environment can override .env.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY;
  const supabaseProjectId = env.VITE_SUPABASE_PROJECT_ID;

  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !supabasePublishableKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
    !supabaseProjectId && "VITE_SUPABASE_PROJECT_ID",
  ].filter(Boolean);

  if (missing.length > 0) {
    // Warn rather than fail: hosted dev-mode builds may not inject VITE_* vars
    // into process.env, and the Supabase client will surface a clear runtime
    // error if they're truly absent at load time.
    console.warn(
      `[vite.config] Missing Supabase environment variables: ${missing.join(", ")}`
    );
  }


  return {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        env.VITE_SUPABASE_PROJECT_ID
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
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
