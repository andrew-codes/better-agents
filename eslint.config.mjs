import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.dist/**", "**/.build/**"] },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommended],
    plugins: { "import-x": importX },
    rules: {
      // Enforce all exports as a collected block at the bottom — no `export function`,
      // `export const`, `export interface`, etc. inline on declarations.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration[declaration!=null]",
          message:
            "Remove the `export` keyword from the declaration and add it to a collected export block at the bottom of the file.",
        },
      ],
      // All export statements must come after non-export code.
      "import-x/exports-last": "error",
      // All exports must be grouped together (no scattered export blocks).
      "import-x/group-exports": "error",
      // Allow _-prefixed params that are intentionally unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettierConfig,
);
