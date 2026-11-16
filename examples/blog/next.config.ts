import type { NextConfig } from "next";
import { withGitms } from "gitms/next-config";
import cms from "./gitms.config";

const nextConfig: NextConfig = { poweredByHeader: false };

export default withGitms(cms, nextConfig);
