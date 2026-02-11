import Docker from "dockerode";
import type { ContainerConfig, ContainerStatus, ExecResult } from "./types.js";

export class ContainerManager {
  private docker: Docker;

  constructor(socketPath?: string) {
    this.docker = new Docker(socketPath ? { socketPath } : undefined);
  }

  async create(config: ContainerConfig): Promise<string> {
    const container = await this.docker.createContainer({
      Image: config.image,
      WorkingDir: config.workingDir,
      Env: config.env
        ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      HostConfig: {
        NetworkMode: config.networkMode,
        Binds: config.mounts?.map(
          (m) => `${m.source}:${m.target}:${m.readOnly ? "ro" : "rw"}`,
        ),
        Memory: config.resourceLimits?.memoryMb
          ? config.resourceLimits.memoryMb * 1024 * 1024
          : undefined,
        NanoCpus: config.resourceLimits?.cpus
          ? config.resourceLimits.cpus * 1e9
          : undefined,
      },
    });
    const info = await container.inspect();
    return info.Id;
  }

  async start(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.start();
  }

  async exec(containerId: string, cmd: string[]): Promise<ExecResult> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      stream.on("end", async () => {
        const info = await exec.inspect();
        resolve({
          exitCode: info.ExitCode ?? 1,
          stdout,
          stderr,
        });
      });
    });
  }

  async status(containerId: string): Promise<ContainerStatus> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    return {
      id: containerId,
      running: info.State.Running,
      exitCode: info.State.ExitCode,
    };
  }

  async stop(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop().catch(() => {});
  }

  async remove(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true });
  }
}
