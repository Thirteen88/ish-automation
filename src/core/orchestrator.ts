import { EventEmitter } from 'eventemitter3';
import {
  AgentConfig,
  AgentType,
  AgentTask,
  AgentTaskResult,
  OrchestratorConfig,
  PlatformConfig,
  TaskPriority,
  TaskStatus,
  AgentError
} from '../types';
import { Agent } from './agent';
import { ISHClient } from '../platform/ish-client';
import { MessageQueue } from '../queue/message-queue';
import { ModelManager } from '../models/model-manager';
import { PromptManager } from '../prompts/prompt-manager';
import { Logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

/**
 * Orchestrator - Manages multiple agents and coordinates their work
 */
export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private platformConfig: PlatformConfig;
  private client: ISHClient;
  private queue: MessageQueue;
  private modelManager: ModelManager;
  private promptManager: PromptManager;
  private agents: Map<string, Agent>;
  private logger: Logger;
  private isInitialized = false;

  constructor(
    platformConfig: PlatformConfig,
    orchestratorConfig?: Partial<OrchestratorConfig>
  ) {
    super();

    this.platformConfig = platformConfig;
    this.config = {
      maxConcurrentAgents: orchestratorConfig?.maxConcurrentAgents || 5,
      defaultTimeout: orchestratorConfig?.defaultTimeout || 30000,
      retryStrategy: orchestratorConfig?.retryStrategy || {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
        maxDelay: 10000
      },
      loggingLevel: orchestratorConfig?.loggingLevel || 'info'
    };

    this.logger = new Logger('Orchestrator');
    this.agents = new Map();
    this.queue = new MessageQueue();
    this.modelManager = new ModelManager();
    this.promptManager = new PromptManager();
    this.client = new ISHClient(platformConfig);
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing orchestrator...');

      // Initialize platform client
      await this.client.initialize();

      this.isInitialized = true;
      this.logger.info('Orchestrator initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize orchestrator', error);
      throw new AgentError('Orchestrator initialization failed', error);
    }
  }

  /**
   * Create a new agent
   */
  createAgent(config: Partial<AgentConfig>): Agent {
    if (!this.isInitialized) {
      throw new AgentError('Orchestrator not initialized');
    }

    // Generate ID if not provided
    const agentId = config.id || generateId('agent');

    // Check if agent already exists
    if (this.agents.has(agentId)) {
      throw new AgentError(`Agent already exists: ${agentId}`);
    }

    // Check concurrent agent limit
    if (this.agents.size >= this.config.maxConcurrentAgents) {
      throw new AgentError(
        `Maximum concurrent agents reached: ${this.config.maxConcurrentAgents}`
      );
    }

    // Build full config with defaults
    const fullConfig: AgentConfig = {
      id: agentId,
      name: config.name || `Agent-${agentId}`,
      type: config.type || AgentType.GENERIC,
      systemPrompt:
        config.systemPrompt ||
        this.promptManager.getSystemPrompt(config.type || AgentType.GENERIC),
      defaultModel: config.defaultModel || 'gpt-4-turbo',
      capabilities: config.capabilities || [],
      maxRetries: config.maxRetries || this.config.retryStrategy.maxRetries,
      timeout: config.timeout || this.config.defaultTimeout,
      metadata: config.metadata || {}
    };

    // Create agent
    const agent = new Agent(
      fullConfig,
      this.client,
      this.queue,
      this.promptManager
    );

    // Store agent
    this.agents.set(agentId, agent);

    this.logger.info(`Agent created: ${fullConfig.name} (${agentId})`);
    this.emit('agentCreated', { agent, config: fullConfig });

    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): Agent[] {
    return this.getAllAgents().filter(
      (agent) => agent.getConfig().type === type
    );
  }

  /**
   * Remove an agent
   */
  async removeAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return false;
    }

    await agent.stop();
    this.agents.delete(agentId);
    this.queue.clear(agentId);

    this.logger.info(`Agent removed: ${agentId}`);
    this.emit('agentRemoved', { agentId });

    return true;
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(
    agentId: string,
    prompt: string,
    options?: {
      model?: string;
      systemPrompt?: string;
      context?: Record<string, any>;
      priority?: TaskPriority;
    }
  ): Promise<AgentTaskResult> {
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new AgentError(`Agent not found: ${agentId}`);
    }

    if (agent.isBusy()) {
      this.logger.warn(`Agent ${agentId} is busy, queueing task`);
    }

    const task: AgentTask = {
      id: generateId('task'),
      agentId,
      prompt,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      context: options?.context,
      priority: options?.priority || TaskPriority.NORMAL,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.logger.info(`Assigning task ${task.id} to agent ${agentId}`);
    return await agent.executeTask(task);
  }

  /**
   * Assign task to best available agent
   */
  async assignTaskToAvailableAgent(
    agentType: AgentType,
    prompt: string,
    options?: {
      model?: string;
      systemPrompt?: string;
      context?: Record<string, any>;
      priority?: TaskPriority;
    }
  ): Promise<AgentTaskResult> {
    const agents = this.getAgentsByType(agentType).filter(
      (agent) => agent.isAvailable()
    );

    if (agents.length === 0) {
      throw new AgentError(`No available agents of type: ${agentType}`);
    }

    // Pick agent with best metrics (lowest average execution time)
    const bestAgent = agents.reduce((best, current) => {
      const bestMetrics = best.getMetrics();
      const currentMetrics = current.getMetrics();

      if (currentMetrics.averageExecutionTime < bestMetrics.averageExecutionTime) {
        return current;
      }
      return best;
    });

    return await this.assignTask(bestAgent.getConfig().id, prompt, options);
  }

  /**
   * Execute a multi-agent workflow
   */
  async executeWorkflow(steps: Array<{
    agentType: AgentType;
    prompt: string | ((previousResults: AgentTaskResult[]) => string);
    model?: string;
    systemPrompt?: string;
    parallel?: boolean;
  }>): Promise<AgentTaskResult[]> {
    const results: AgentTaskResult[] = [];

    this.logger.info(`Starting workflow with ${steps.length} steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      this.logger.info(`Executing workflow step ${i + 1}/${steps.length}`);

      // Build prompt (can be string or function)
      const prompt =
        typeof step.prompt === 'function'
          ? step.prompt(results)
          : step.prompt;

      // Execute step
      const result = await this.assignTaskToAvailableAgent(
        step.agentType,
        prompt,
        {
          model: step.model,
          systemPrompt: step.systemPrompt,
          priority: TaskPriority.NORMAL
        }
      );

      results.push(result);

      if (!result.success) {
        this.logger.error(`Workflow step ${i + 1} failed`, result.error);
        throw new AgentError(
          `Workflow failed at step ${i + 1}: ${result.error}`
        );
      }
    }

    this.logger.info('Workflow completed successfully');
    return results;
  }

  /**
   * Coordinate multiple agents in parallel
   */
  async coordinateParallel(
    tasks: Array<{
      agentType: AgentType;
      prompt: string;
      model?: string;
      systemPrompt?: string;
    }>
  ): Promise<AgentTaskResult[]> {
    this.logger.info(`Coordinating ${tasks.length} parallel tasks`);

    const promises = tasks.map((task) =>
      this.assignTaskToAvailableAgent(task.agentType, task.prompt, {
        model: task.model,
        systemPrompt: task.systemPrompt,
        priority: TaskPriority.NORMAL
      })
    );

    const results = await Promise.all(promises);

    this.logger.info('Parallel coordination completed');
    return results;
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    totalAgents: number;
    agentsByType: Record<string, number>;
    busyAgents: number;
    availableAgents: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    queueStats: any;
  } {
    const agentsByType: Record<string, number> = {};
    let busyAgents = 0;
    let totalTasksCompleted = 0;
    let totalTasksFailed = 0;

    for (const agent of this.agents.values()) {
      const config = agent.getConfig();
      const metrics = agent.getMetrics();

      agentsByType[config.type] = (agentsByType[config.type] || 0) + 1;

      if (agent.isBusy()) {
        busyAgents++;
      }

      totalTasksCompleted += metrics.tasksCompleted;
      totalTasksFailed += metrics.tasksFailed;
    }

    return {
      totalAgents: this.agents.size,
      agentsByType,
      busyAgents,
      availableAgents: this.agents.size - busyAgents,
      totalTasksCompleted,
      totalTasksFailed,
      queueStats: this.queue.getStats()
    };
  }

  /**
   * Get model manager
   */
  getModelManager(): ModelManager {
    return this.modelManager;
  }

  /**
   * Get prompt manager
   */
  getPromptManager(): PromptManager {
    return this.promptManager;
  }

  /**
   * Get message queue
   */
  getQueue(): MessageQueue {
    return this.queue;
  }

  /**
   * Get platform client
   */
  getClient(): ISHClient {
    return this.client;
  }

  /**
   * Shutdown orchestrator and cleanup
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down orchestrator...');

    // Stop all agents
    for (const agent of this.agents.values()) {
      await agent.stop();
    }

    // Clear queue
    for (const agentId of this.queue.getAgentIds()) {
      this.queue.clear(agentId);
    }

    // Close client
    await this.client.close();

    this.isInitialized = false;
    this.logger.info('Orchestrator shutdown complete');
    this.emit('shutdown');
  }

  /**
   * Check if orchestrator is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client.isReady();
  }
}
