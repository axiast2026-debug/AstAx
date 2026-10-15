import { astaxConfig } from "@astax/config/eslint";

export default [...astaxConfig(), { ignores: ["src/generated/**"] }];
