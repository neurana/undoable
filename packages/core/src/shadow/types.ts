export type ShadowStrategy = "copy" | "docker";

export type ShadowWorkspaceConfig = {
  runId: string;
  sourceDir: string;
  baseDir: string;
  strategy: ShadowStrategy;
  exclude?: string[];
};

export type ShadowWorkspaceInfo = {
  runId: string;
  workspacePath: string;
  strategy: ShadowStrategy;
  createdAt: string;
};
