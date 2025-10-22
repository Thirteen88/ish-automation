import { EventEmitter } from 'eventemitter3';
import {
  AgentConfig,
  AgentTask,
  AgentTaskResult,
  AgentState,
  AgentStatus,
  AgentMetrics,
  TaskStatus,
  TaskPriority,
  Message,
  AgentError
} from '../types';
import { ISHClient } from '../platform/ish-client';
import { MessageQueue } from '../queue/message-queue';
import { PromptManager } from '../prompts/prompt-manager';
import { Logger } from '../utils/logger';
import { generateId, retry } from '../utils/helpers';

/**
 * Base Agent class - Represents an autonomous agent
 */
export class Agent extends EventEmitter {
  protected config: AgentConfig;
  protected state: AgentState;
  protected client: ISHClient;
  protected queue: MessageQueue;
  protected promptManager: PromptManager;
  protected logger: Logger;
  private currentTask: AgentTask | null = null;

  constructor(
    config: AgentConfig,
    client: ISHClient,
    queue: MessageQueue,
    promptManager: PromptManager
  ) {
    super();

    this.config = config;
    this.client = client;
    this.queue = queue;
    this.promptManager = promptManager;
    this.logger = new Logger(`Agent:${config.name}`);

    // Initialize state
    this.state = {
      agentId: config.id,
      status: AgentStatus.IDLE,
      conversationHistory: [],
      context: {},
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalTokensUsed: 0,
        averageExecutionTime: 0,
        totalCost: 0
      }
    };

    // Listen for messages
    this.queue.on('messageReady', this.handleMessage.bind(this));
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    this.logger.info(`Starting agent: ${this.config.name}`);
    this.state.status = AgentStatus.IDLE;
    this.emit('started', { agentId: this.config.id });
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.logger.info(`Stopping agent: ${this.config.name}`);
    this.state.status = AgentStatus.STOPPED;
    this.currentTask = null;
    this.emit('stopped', { agentId: this.config.id });
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(data: { agentId: string; message: any }): Promise<void> {
    if (data.agentId !== this.config.id) {
      return;
    }

    const messages = this.queue.receive(this.config.id);

    for (const message of messages) {
      try {
        switch (message.type) {
          case 'task_request':
            await this.handleTaskRequest(message);
            break;
          case 'status_update':
            this.handleStatusUpdate(message);
            break;
          case 'error':
            this.handleError(message);
            break;
          default:
            this.logger.warn(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        this.logger.error('Error handling message', error);
      }
    }
  }

  /**
   * Handle task request
   */
  private async handleTaskRequest(message: any): Promise<void> {
    const task: AgentTask = {
      id: generateId('task'),
      agentId: this.config.id,
      prompt: message.payload.prompt,
      model: message.payload.model || this.config.defaultModel,
      systemPrompt: message.payload.systemPrompt,
      context: message.payload.context,
      priority: message.priority,
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.logger.info(`Received task: ${task.id}`);
    await this.executeTask(task, message.from, message.id);
  }

  /**
   * Handle status update
   */
  private handleStatusUpdate(message: any): void {
    this.logger.debug('Status update received', message.payload);
  }

  /**
   * Handle error message
   */
  private handleError(message: any): void {
    this.logger.error('Error message received', message.payload);
  }

  /**
   * Execute a task
   */
  async executeTask(
    task: AgentTask,
    replyTo?: string,
    messageId?: string
  ): Promise<AgentTaskResult> {
    const startTime = Date.now();

    try {
      this.currentTask = task;
      this.state.status = AgentStatus.BUSY;
      this.state.currentTask = task.id;

      task.status = TaskStatus.IN_PROGRESS;
      task.updatedAt = new Date();

      this.logger.info(`Executing task: ${task.id}`);
      this.emit('taskStarted', { agentId: this.config.id, task });

      // Get system prompt
      const systemPrompt =
        task.systemPrompt ||
        this.promptManager.getSystemPrompt(this.config.type);

      // Execute with retry logic
      const response = await retry(
        async () => {
          return await this.client.sendPrompt(task.prompt, {
            model: task.model,
            systemPrompt,
            streaming: false
          });
        },
        {
          maxRetries: this.config.maxRetries,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2
        }
      );

      // Create result
      const executionTime = Date.now() - startTime;
      const result: AgentTaskResult = {
        success: true,
        response: response.content,
        model: task.model || this.config.defaultModel,
        executionTime,
        metadata: {
          taskId: task.id,
          agentId: this.config.id
        }
      };

      // Update task
      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.updatedAt = new Date();

      // Update metrics
      this.updateMetrics(result, executionTime);

      // Update conversation history
      this.state.conversationHistory.push(
        {
          id: generateId('msg'),
          role: 'user',
          content: task.prompt,
          timestamp: new Date()
        },
        response
      );

      // Send response if requested
      if (replyTo && messageId) {
        this.queue.sendTaskResponse(
          this.config.id,
          replyTo,
          result,
          messageId,
          task.priority
        );
      }

      this.logger.info(`Task completed: ${task.id} (${executionTime}ms)`);
      this.emit('taskCompleted', { agentId: this.config.id, task, result });

      this.state.status = AgentStatus.IDLE;
      this.currentTask = null;

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Task failed: ${task.id}`, error);

      const result: AgentTaskResult = {
        success: false,
        response: '',
        model: task.model || this.config.defaultModel,
        executionTime,
        error: errorMessage,
        metadata: {
          taskId: task.id,
          agentId: this.config.id
        }
      };

      task.status = TaskStatus.FAILED;
      task.result = result;
      task.updatedAt = new Date();

      this.state.metrics.tasksFailed++;

      // Send error if requested
      if (replyTo && messageId) {
        this.queue.sendError(
          this.config.id,
          replyTo,
          errorMessage,
          messageId,
          TaskPriority.HIGH
        );
      }

      this.emit('taskFailed', { agentId: this.config.id, task, error });

      this.state.status = AgentStatus.IDLE;
      this.currentTask = null;

      return result;
    }
  }

  /**
   * Update agent metrics
   */
  private updateMetrics(result: AgentTaskResult, executionTime: number): void {
    const metrics = this.state.metrics;

    metrics.tasksCompleted++;

    // Update average execution time
    const totalTime =
      metrics.averageExecutionTime * (metrics.tasksCompleted - 1) + executionTime;
    metrics.averageExecutionTime = totalTime / metrics.tasksCompleted;

    // Update tokens (if available)
    if (result.tokensUsed) {
      metrics.totalTokensUsed += result.tokensUsed;
    }
  }

  /**
   * Send a prompt directly
   */
  async sendPrompt(
    prompt: string,
    options?: {
      model?: string;
      systemPrompt?: string;
      context?: Record<string, any>;
    }
  ): Promise<Message> {
    const systemPrompt =
      options?.systemPrompt ||
      this.promptManager.getSystemPrompt(this.config.type);

    return await this.client.sendPrompt(prompt, {
      model: options?.model || this.config.defaultModel,
      systemPrompt,
      streaming: false
    });
  }

  /**
   * Get agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get agent config
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Update system prompt
   */
  updateSystemPrompt(systemPrompt: string): void {
    this.config.systemPrompt = systemPrompt;
    this.logger.info('System prompt updated');
    this.emit('promptUpdated', { agentId: this.config.id, systemPrompt });
  }

  /**
   * Switch model
   */
  async switchModel(modelId: string): Promise<void> {
    this.config.defaultModel = modelId;
    await this.client.switchModel(modelId);
    this.logger.info(`Switched to model: ${modelId}`);
    this.emit('modelSwitched', { agentId: this.config.id, modelId });
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.state.conversationHistory = [];
    this.logger.info('Conversation history cleared');
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.state.conversationHistory];
  }

  /**
   * Add context
   */
  addContext(key: string, value: any): void {
    this.state.context[key] = value;
  }

  /**
   * Get context
   */
  getContext(key?: string): any {
    if (key) {
      return this.state.context[key];
    }
    return { ...this.state.context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.state.context = {};
  }

  /**
   * Get metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Check if agent is busy
   */
  isBusy(): boolean {
    return this.state.status === AgentStatus.BUSY;
  }

  /**
   * Check if agent is available
   */
  isAvailable(): boolean {
    return this.state.status === AgentStatus.IDLE;
  }

  /**
   * Get current task
   */
  getCurrentTask(): AgentTask | null {
    return this.currentTask ? { ...this.currentTask } : null;
  }
}
