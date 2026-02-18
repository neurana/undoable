import fs from "node:fs";
import path from "node:path";
import { generateId, nowISO } from "@undoable/shared";
import { DEFAULT_ORCHESTRATOR_AGENT, DEFAULT_STATE_FILE } from "./constants.js";
import { assignEdges, assertAcyclic, assertNodeIdAvailable, normalizeEdge } from "./graph.js";
import { normalizeSchedule, toCronSchedule } from "./schedule.js";
import type {
  CreateSwarmNodeInput,
  CreateSwarmWorkflowInput,
  SwarmEdge,
  SwarmServiceOptions,
  SwarmStateFile,
  SwarmWorkflow,
  SwarmWorkflowNode,
  UpdateSwarmNodePatch,
  UpdateSwarmWorkflowPatch,
} from "./types.js";
import { cleanOptionalString, cleanSkillRefs, cloneWorkflow } from "./utils.js";

export class SwarmService {
  private readonly scheduler: SwarmServiceOptions["scheduler"];
  private readonly persistenceEnabled: boolean;
  private readonly stateFilePath: string;
  private readonly workflows = new Map<string, SwarmWorkflow>();

  constructor(opts: SwarmServiceOptions) {
    this.scheduler = opts.scheduler;
    const defaultMode = process.env.NODE_ENV === "test" ? "off" : "on";
    this.persistenceEnabled = (opts.persistence ?? defaultMode) === "on";
    this.stateFilePath = opts.stateFilePath ?? DEFAULT_STATE_FILE;
    this.restoreFromDisk();
  }

  list(): SwarmWorkflow[] {
    return [...this.workflows.values()].map((workflow) => cloneWorkflow(workflow));
  }

  getById(id: string): SwarmWorkflow | undefined {
    const workflow = this.workflows.get(id);
    return workflow ? cloneWorkflow(workflow) : undefined;
  }

  async create(input: CreateSwarmWorkflowInput): Promise<SwarmWorkflow> {
    const name = cleanOptionalString(input.name);
    if (!name) throw new Error("workflow name is required");

    const now = nowISO();
    const workflowId = cleanOptionalString(input.id) ?? generateId();
    if (this.workflows.has(workflowId)) {
      throw new Error(`workflow "${workflowId}" already exists`);
    }

    const workflow: SwarmWorkflow = {
      id: workflowId,
      name,
      description: cleanOptionalString(input.description),
      orchestratorAgentId: cleanOptionalString(input.orchestratorAgentId) ?? DEFAULT_ORCHESTRATOR_AGENT,
      enabled: input.enabled ?? true,
      version: 1,
      nodes: [],
      edges: [],
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.set(workflow.id, workflow);

    if (Array.isArray(input.nodes)) {
      for (const nodeInput of input.nodes) {
        const node = this.buildNode(nodeInput);
        assertNodeIdAvailable(workflow, node.id);
        workflow.nodes.push(node);
      }
    }

    if (Array.isArray(input.edges) && input.edges.length > 0) {
      assignEdges(workflow, input.edges);
    }

    await this.syncWorkflowJobs(workflow);
    this.persistNow();
    return cloneWorkflow(workflow);
  }

  async update(workflowId: string, patch: UpdateSwarmWorkflowPatch): Promise<SwarmWorkflow | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;

    let changed = false;

    if (patch.name !== undefined) {
      const nextName = cleanOptionalString(patch.name);
      if (!nextName) throw new Error("workflow name cannot be empty");
      workflow.name = nextName;
      changed = true;
    }

    if (patch.description !== undefined) {
      workflow.description = cleanOptionalString(patch.description);
      changed = true;
    }

    if (patch.orchestratorAgentId !== undefined) {
      const orchestrator = cleanOptionalString(patch.orchestratorAgentId);
      if (!orchestrator) throw new Error("orchestratorAgentId cannot be empty");
      workflow.orchestratorAgentId = orchestrator;
      changed = true;
    }

    if (patch.enabled !== undefined) {
      workflow.enabled = patch.enabled;
      changed = true;
    }

    if (changed) {
      this.bumpVersion(workflow);
      await this.syncWorkflowJobs(workflow);
      this.persistNow();
    }

    return cloneWorkflow(workflow);
  }

  async delete(workflowId: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    for (const node of workflow.nodes) {
      await this.removeNodeJob(node);
    }

    const deleted = this.workflows.delete(workflowId);
    if (deleted) this.persistNow();
    return deleted;
  }

  async addNode(workflowId: string, input: CreateSwarmNodeInput): Promise<SwarmWorkflowNode | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;

    const node = this.buildNode(input);
    assertNodeIdAvailable(workflow, node.id);

    workflow.nodes.push(node);
    this.bumpVersion(workflow);
    await this.syncNodeJob(workflow, node);
    this.persistNow();

    return structuredClone(node);
  }

  async updateNode(
    workflowId: string,
    nodeId: string,
    patch: UpdateSwarmNodePatch,
  ): Promise<SwarmWorkflowNode | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;

    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node) return undefined;

    let changed = false;

    if (patch.name !== undefined) {
      const nextName = cleanOptionalString(patch.name);
      if (!nextName) throw new Error("node name cannot be empty");
      node.name = nextName;
      changed = true;
    }

    if (patch.type !== undefined) {
      node.type = patch.type;
      changed = true;
    }

    if (patch.prompt !== undefined) {
      node.prompt = cleanOptionalString(patch.prompt);
      changed = true;
    }

    if (patch.agentId !== undefined) {
      node.agentId = cleanOptionalString(patch.agentId);
      changed = true;
    }

    if (patch.skillRefs !== undefined) {
      node.skillRefs = cleanSkillRefs(patch.skillRefs);
      changed = true;
    }

    if (patch.config !== undefined) {
      node.config = patch.config;
      changed = true;
    }

    if (patch.schedule !== undefined) {
      node.schedule = patch.schedule === null ? { mode: "manual" } : normalizeSchedule(patch.schedule);
      changed = true;
    }

    if (patch.enabled !== undefined) {
      node.enabled = patch.enabled;
      changed = true;
    }

    if (changed) {
      node.updatedAt = nowISO();
      this.bumpVersion(workflow);
      await this.syncNodeJob(workflow, node);
      this.persistNow();
    }

    return structuredClone(node);
  }

  async removeNode(workflowId: string, nodeId: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    const idx = workflow.nodes.findIndex((node) => node.id === nodeId);
    if (idx < 0) return false;

    const [removed] = workflow.nodes.splice(idx, 1);
    if (removed) await this.removeNodeJob(removed);

    workflow.edges = workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    this.bumpVersion(workflow);
    this.persistNow();
    return true;
  }

  async setEdges(workflowId: string, edges: SwarmEdge[]): Promise<SwarmWorkflow | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;

    assignEdges(workflow, edges);
    this.bumpVersion(workflow);
    this.persistNow();
    return cloneWorkflow(workflow);
  }

  async upsertEdge(workflowId: string, edge: SwarmEdge): Promise<SwarmWorkflow | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;

    const normalized = normalizeEdge(workflow, edge);
    const idx = workflow.edges.findIndex((existing) => existing.from === normalized.from && existing.to === normalized.to);
    if (idx >= 0) {
      workflow.edges[idx] = normalized;
    } else {
      workflow.edges.push(normalized);
    }

    assertAcyclic(workflow.nodes, workflow.edges);
    this.bumpVersion(workflow);
    this.persistNow();
    return cloneWorkflow(workflow);
  }

  async removeEdge(workflowId: string, from: string, to: string): Promise<boolean> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    const before = workflow.edges.length;
    workflow.edges = workflow.edges.filter((edge) => !(edge.from === from && edge.to === to));

    if (workflow.edges.length !== before) {
      this.bumpVersion(workflow);
      this.persistNow();
      return true;
    }

    return false;
  }

  async reconcileJobs(): Promise<{ workflows: number; nodes: number }> {
    let nodes = 0;
    for (const workflow of this.workflows.values()) {
      await this.syncWorkflowJobs(workflow);
      nodes += workflow.nodes.length;
    }
    this.persistNow();
    return { workflows: this.workflows.size, nodes };
  }

  private buildNode(input: CreateSwarmNodeInput): SwarmWorkflowNode {
    const name = cleanOptionalString(input.name);
    if (!name) throw new Error("node name is required");

    const now = nowISO();
    return {
      id: cleanOptionalString(input.id) ?? generateId(),
      name,
      type: input.type ?? "agent_task",
      prompt: cleanOptionalString(input.prompt),
      agentId: cleanOptionalString(input.agentId),
      skillRefs: cleanSkillRefs(input.skillRefs),
      config: input.config,
      schedule: normalizeSchedule(input.schedule),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private composeNodeInstruction(workflow: SwarmWorkflow, node: SwarmWorkflowNode): string {
    const prompt = cleanOptionalString(node.prompt);
    if (prompt) return prompt;

    const lines = [
      `Execute SWARM node "${node.name}" (${node.type}) from workflow "${workflow.name}".`,
      "Act autonomously and return concise structured output for downstream nodes.",
    ];

    if (node.skillRefs.length > 0) {
      lines.push(`Preferred skills: ${node.skillRefs.join(", ")}.`);
    }

    return lines.join("\n");
  }

  private composeNodeJobName(workflow: SwarmWorkflow, node: SwarmWorkflowNode): string {
    return `swarm:${workflow.name}:${node.name}`;
  }

  private async syncWorkflowJobs(workflow: SwarmWorkflow): Promise<void> {
    for (const node of workflow.nodes) {
      await this.syncNodeJob(workflow, node);
    }
  }

  private async syncNodeJob(workflow: SwarmWorkflow, node: SwarmWorkflowNode): Promise<void> {
    const schedule = toCronSchedule(node.schedule);
    if (!schedule) {
      await this.removeNodeJob(node);
      return;
    }

    const payload = {
      kind: "run" as const,
      instruction: this.composeNodeInstruction(workflow, node),
      ...(node.agentId ? { agentId: node.agentId } : {}),
    };

    const shouldEnable = workflow.enabled && node.enabled;

    if (node.jobId) {
      try {
        await this.scheduler.update(node.jobId, {
          name: this.composeNodeJobName(workflow, node),
          description: `SWARM node ${node.id} in workflow ${workflow.id}`,
          enabled: shouldEnable,
          schedule,
          payload,
        });
        return;
      } catch {
        node.jobId = undefined;
      }
    }

    const created = await this.scheduler.add({
      name: this.composeNodeJobName(workflow, node),
      description: `SWARM node ${node.id} in workflow ${workflow.id}`,
      enabled: shouldEnable,
      schedule,
      payload,
    });
    node.jobId = created.id;
  }

  private async removeNodeJob(node: SwarmWorkflowNode): Promise<void> {
    if (!node.jobId) return;

    try {
      await this.scheduler.remove(node.jobId);
    } catch {
      // best effort cleanup
    }

    node.jobId = undefined;
  }

  private bumpVersion(workflow: SwarmWorkflow): void {
    workflow.version += 1;
    workflow.updatedAt = nowISO();
  }

  private restoreFromDisk(): void {
    if (!this.persistenceEnabled) return;

    try {
      if (!fs.existsSync(this.stateFilePath)) return;
      const raw = fs.readFileSync(this.stateFilePath, "utf-8").trim();
      if (!raw) return;

      const parsed = JSON.parse(raw) as SwarmStateFile;
      if (!Array.isArray(parsed.workflows)) return;

      for (const workflow of parsed.workflows) {
        if (!workflow || typeof workflow.id !== "string" || typeof workflow.name !== "string") continue;
        this.workflows.set(workflow.id, workflow);
      }
    } catch {
      // best effort restore only
    }
  }

  private persistNow(): void {
    if (!this.persistenceEnabled) return;

    try {
      const dir = path.dirname(this.stateFilePath);
      fs.mkdirSync(dir, { recursive: true });

      const state: SwarmStateFile = {
        version: 1,
        workflows: [...this.workflows.values()],
        savedAt: nowISO(),
      };

      const tempPath = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(tempPath, this.stateFilePath);

      try {
        fs.chmodSync(this.stateFilePath, 0o600);
      } catch {
        // best effort
      }
    } catch {
      // best effort persistence only
    }
  }
}
