import type { AgentTool } from "./types.js";
import type { MemoryService, SearchMode } from "../services/memory-service.js";

export function createMemoryTools(memoryService: MemoryService): AgentTool[] {
  const searchTool: AgentTool = {
    name: "memory_search",
    definition: {
      type: "function",
      function: {
        name: "memory_search",
        description: [
          "Search long-term memory for prior decisions, preferences, todos, or context.",
          "Modes: text (keyword match), semantic (vector similarity), hybrid (both, default).",
          "Semantic/hybrid require OPENAI_API_KEY for embeddings — falls back to text if unavailable.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default: 10)" },
            mode: {
              type: "string",
              enum: ["text", "semantic", "hybrid"],
              description: "Search mode (default: hybrid)",
            },
            minScore: {
              type: "number",
              description: "Minimum relevance score 0-1 (default: 0)",
            },
          },
          required: ["query"],
        },
      },
    },
    execute: async (args) => {
      const query = (args.query as string) ?? "";
      const limit = (args.limit as number) ?? 10;
      const mode = (args.mode as SearchMode) ?? "hybrid";
      const minScore = (args.minScore as number) ?? 0;

      const results = await memoryService.search(query, limit, mode, minScore);
      return {
        count: results.length,
        mode,
        hasEmbeddings: memoryService.hasEmbeddings,
        entries: results.map((r) => ({
          id: r.entry.id,
          content: r.entry.content,
          tags: r.entry.tags,
          score: Math.round(r.score * 1000) / 1000,
          source: r.source,
          updatedAt: new Date(r.entry.updatedAt).toISOString(),
        })),
      };
    },
  };

  const saveTool: AgentTool = {
    name: "memory_save",
    definition: {
      type: "function",
      function: {
        name: "memory_save",
        description:
          "Save or update a memory entry. Automatically generates vector embeddings if available. Use to persist decisions, preferences, project notes, or any context worth remembering across sessions.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique key for this memory (e.g. 'user-timezone', 'project-stack')" },
            content: { type: "string", description: "Memory content to store" },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for categorization",
            },
          },
          required: ["id", "content"],
        },
      },
    },
    execute: async (args) => {
      const id = args.id as string;
      const content = args.content as string;
      const tags = (args.tags as string[]) ?? [];
      if (!id || !content) return { error: "id and content are required" };
      const entry = await memoryService.save(id, content, tags);
      return {
        saved: true,
        id: entry.id,
        hasEmbedding: !!entry.embedding,
        updatedAt: new Date(entry.updatedAt).toISOString(),
      };
    },
  };

  const removeTool: AgentTool = {
    name: "memory_remove",
    definition: {
      type: "function",
      function: {
        name: "memory_remove",
        description: "Delete a memory entry by ID.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Memory ID to delete" },
          },
          required: ["id"],
        },
      },
    },
    execute: async (args) => {
      const id = args.id as string;
      if (!id) return { error: "id is required" };
      const deleted = await memoryService.remove(id);
      return { deleted, id };
    },
  };

  const syncTool: AgentTool = {
    name: "memory_sync",
    definition: {
      type: "function",
      function: {
        name: "memory_sync",
        description: "Re-index all memory entries that are missing vector embeddings. Use after enabling an embedding provider or to backfill embeddings.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    execute: async () => {
      const result = await memoryService.sync();
      return {
        ...result,
        hasEmbeddings: memoryService.hasEmbeddings,
      };
    },
  };

  return [searchTool, saveTool, removeTool, syncTool];
}
