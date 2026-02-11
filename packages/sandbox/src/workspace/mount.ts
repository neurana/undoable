import type { ContainerMount } from "../container/types.js";

export function createWorkspaceMount(hostPath: string, containerPath = "/workspace"): ContainerMount {
  return {
    source: hostPath,
    target: containerPath,
    readOnly: false,
  };
}

export function createReadOnlyMount(hostPath: string, containerPath: string): ContainerMount {
  return {
    source: hostPath,
    target: containerPath,
    readOnly: true,
  };
}
