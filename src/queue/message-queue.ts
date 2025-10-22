import { EventEmitter } from 'eventemitter3';
import {
  QueueMessage,
  MessageType,
  TaskPriority,
  AgentError
} from '../types';
import { Logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

/**
 * Message Queue for inter-agent communication
 * Implements priority-based message routing
 */
export class MessageQueue extends EventEmitter {
  private queues: Map<string, QueueMessage[]>;
  private logger: Logger;
  private processing: Map<string, boolean>;

  constructor() {
    super();
    this.queues = new Map();
    this.processing = new Map();
    this.logger = new Logger('MessageQueue');
  }

  /**
   * Send a message to a specific agent
   */
  send(message: Omit<QueueMessage, 'id' | 'timestamp'>): string {
    const fullMessage: QueueMessage = {
      ...message,
      id: generateId('msg'),
      timestamp: new Date()
    };

    // Get or create queue for recipient
    if (!this.queues.has(message.to)) {
      this.queues.set(message.to, []);
    }

    const queue = this.queues.get(message.to)!;
    queue.push(fullMessage);

    // Sort by priority (higher priority first)
    queue.sort((a, b) => b.priority - a.priority);

    this.logger.debug(`Message sent from ${message.from} to ${message.to}`, {
      type: message.type,
      priority: message.priority
    });

    this.emit('messageSent', fullMessage);

    // Trigger processing for the recipient
    this.processQueue(message.to);

    return fullMessage.id;
  }

  /**
   * Receive messages for a specific agent
   */
  receive(agentId: string, filter?: {
    type?: MessageType;
    from?: string;
  }): QueueMessage[] {
    const queue = this.queues.get(agentId) || [];

    if (!filter) {
      // Return all messages and clear queue
      this.queues.set(agentId, []);
      return queue;
    }

    // Filter messages
    const filtered: QueueMessage[] = [];
    const remaining: QueueMessage[] = [];

    for (const message of queue) {
      let matches = true;

      if (filter.type && message.type !== filter.type) {
        matches = false;
      }

      if (filter.from && message.from !== filter.from) {
        matches = false;
      }

      if (matches) {
        filtered.push(message);
      } else {
        remaining.push(message);
      }
    }

    this.queues.set(agentId, remaining);

    this.logger.debug(`Agent ${agentId} received ${filtered.length} messages`);

    return filtered;
  }

  /**
   * Peek at next message without removing it
   */
  peek(agentId: string): QueueMessage | null {
    const queue = this.queues.get(agentId) || [];
    return queue.length > 0 ? queue[0] : null;
  }

  /**
   * Get queue size for an agent
   */
  size(agentId: string): number {
    const queue = this.queues.get(agentId) || [];
    return queue.length;
  }

  /**
   * Clear queue for an agent
   */
  clear(agentId: string): void {
    this.queues.set(agentId, []);
    this.logger.debug(`Queue cleared for agent ${agentId}`);
  }

  /**
   * Process queue for an agent
   */
  private processQueue(agentId: string): void {
    if (this.processing.get(agentId)) {
      return; // Already processing
    }

    this.processing.set(agentId, true);

    const queue = this.queues.get(agentId) || [];

    if (queue.length > 0) {
      const message = queue[0];
      this.emit('messageReady', { agentId, message });
    }

    this.processing.set(agentId, false);
  }

  /**
   * Send a task request
   */
  sendTaskRequest(
    from: string,
    to: string,
    task: any,
    priority: TaskPriority = TaskPriority.NORMAL
  ): string {
    return this.send({
      type: MessageType.TASK_REQUEST,
      from,
      to,
      payload: task,
      priority
    });
  }

  /**
   * Send a task response
   */
  sendTaskResponse(
    from: string,
    to: string,
    result: any,
    replyTo: string,
    priority: TaskPriority = TaskPriority.NORMAL
  ): string {
    return this.send({
      type: MessageType.TASK_RESPONSE,
      from,
      to,
      payload: result,
      priority,
      replyTo
    });
  }

  /**
   * Send status update
   */
  sendStatusUpdate(
    from: string,
    to: string,
    status: any,
    priority: TaskPriority = TaskPriority.LOW
  ): string {
    return this.send({
      type: MessageType.STATUS_UPDATE,
      from,
      to,
      payload: status,
      priority
    });
  }

  /**
   * Send error message
   */
  sendError(
    from: string,
    to: string,
    error: Error | string,
    replyTo?: string,
    priority: TaskPriority = TaskPriority.HIGH
  ): string {
    return this.send({
      type: MessageType.ERROR,
      from,
      to,
      payload: {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      },
      priority,
      replyTo
    });
  }

  /**
   * Broadcast message to all agents
   */
  broadcast(message: Omit<QueueMessage, 'id' | 'timestamp' | 'to'>): void {
    for (const agentId of this.queues.keys()) {
      this.send({
        ...message,
        to: agentId
      });
    }
  }

  /**
   * Get all agent IDs that have queues
   */
  getAgentIds(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get statistics about the queue
   */
  getStats(): {
    totalAgents: number;
    totalMessages: number;
    queueSizes: Record<string, number>;
  } {
    const queueSizes: Record<string, number> = {};
    let totalMessages = 0;

    for (const [agentId, queue] of this.queues.entries()) {
      queueSizes[agentId] = queue.length;
      totalMessages += queue.length;
    }

    return {
      totalAgents: this.queues.size,
      totalMessages,
      queueSizes
    };
  }
}
