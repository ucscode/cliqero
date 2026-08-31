import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/coverage/**",
    "**/dist/**",
    "**/build/**",
    "**/generated/**",
  ]),
  {
    rules: {
      // The application uses typed-at-call-site PostgreSQL projections whose
      // row shapes are intentionally dynamic in a few compatibility paths.
      "@typescript-eslint/no-explicit-any": "off",
      // This is an App Router application; the pages-directory rule is not
      // applicable here.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);
