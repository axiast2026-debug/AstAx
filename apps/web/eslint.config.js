import { astaxConfig } from "@astax/config/eslint";

export default [...astaxConfig(), { ignores: [".next/**", "next-env.d.ts"] }];
