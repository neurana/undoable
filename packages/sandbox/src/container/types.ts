import type { ResourceLimits } from "@undoable/shared";

export type ContainerConfig = {
  image: string;
  workingDir: string;
  networkMode: "none" | "bridge" | "host";
  resourceLimits?: ResourceLimits;
  env?: Record<string, string>;
  mounts?: ContainerMount[];
};

export type ContainerMount = {
  source: string;
  target: string;
  readOnly: boolean;
};

export type ContainerStatus = {
  id: string;
  running: boolean;
  exitCode?: number;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};
