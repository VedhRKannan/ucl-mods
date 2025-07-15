import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Extend Next.js rules
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Override or disable specific rules globally
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // allow 'any'
      "react/no-unescaped-entities": "off",        // allow unescaped apostrophes etc.
    },
  },
];

export default eslintConfig;
