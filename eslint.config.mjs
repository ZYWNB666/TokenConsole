import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs; the imported entries
// already ignore build output (.next/**, out/**, build/**, next-env.d.ts)
// and node_modules is ignored by ESLint itself. The new-api/gpt-load
// reference repositories are siblings outside this repository.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
