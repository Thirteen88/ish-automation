/**
 * Core type definitions for the ISH automation system
 */

// Model Types
export interface Model {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapabilities;
  contextWindow: number;
  maxTokens: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
}

export interface ModelCapabilities {
  chat: boolean;
  completion: boolean;
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  codeGeneration: boolean;
}

// Message Types
export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  messages: Message[];
  model: string;
  systemPrompt?: string;
  metadata?: Record<string, any>;
}

// Agent Types
export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  systemPrompt: string;
  defaultModel: string;
  capabilities: string[];
  maxRetries: number;
  timeout: number;
  metadata?: Record<string, any>;
}

export enum AgentType {
  RESEARCH = 'research',
  CODE_GENERATION = 'code_generation',
  REVIEW = 'review',
  STRATEGY = 'strategy',
  GENERIC = 'generic'
}

export interface AgentTask {
  id: string;
  agentId: string;
  prompt: string;
  model?: string;
  systemPrompt?: string;
  context?: Record<string, any>;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  result?: AgentTaskResult;
}

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface AgentTaskResult {
  success: boolean;
  response: string;
  model: string;
  tokensUsed?: number;
  executionTime: number;
  error?: string;
  metadata?: Record<string, any>;
}

// Platform Types
export interface PlatformConfig {
  baseUrl: string;
  authRequired: boolean;
  authType?: 'api_key' | 'session' | 'oauth';
  credentials?: {
    apiKey?: string;
    username?: string;
    password?: string;
    token?: string;
  };
  timeout: number;
  retries: number;
  headless: boolean;
}

export interface PlatformSession {
  id: string;
  authenticated: boolean;
  cookies?: any[];
  localStorage?: Record<string, string>;
  sessionData?: Record<string, any>;
  expiresAt?: Date;
}

// Orchestrator Types
export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  defaultTimeout: number;
  retryStrategy: RetryStrategy;
  loggingLevel: LogLevel;
}

export interface RetryStrategy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// Queue Types
export interface QueueMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string;
  payload: any;
  timestamp: Date;
  priority: TaskPriority;
  replyTo?: string;
}

export enum MessageType {
  TASK_REQUEST = 'task_request',
  TASK_RESPONSE = 'task_response',
  STATUS_UPDATE = 'status_update',
  ERROR = 'error',
  SYSTEM = 'system'
}

// Event Types
export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  timestamp: Date;
  data: any;
}

export enum AgentEventType {
  AGENT_CREATED = 'agent_created',
  AGENT_STARTED = 'agent_started',
  AGENT_COMPLETED = 'agent_completed',
  AGENT_FAILED = 'agent_failed',
  TASK_QUEUED = 'task_queued',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  MODEL_SWITCHED = 'model_switched',
  PROMPT_UPDATED = 'prompt_updated'
}

// Prompt Types
export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  description?: string;
  category?: string;
}

export interface SystemPromptConfig {
  agentType: AgentType;
  basePrompt: string;
  enhancements?: string[];
  constraints?: string[];
  examples?: PromptExample[];
}

export interface PromptExample {
  input: string;
  output: string;
  explanation?: string;
}

// State Management Types
export interface AgentState {
  agentId: string;
  status: AgentStatus;
  currentTask?: string;
  conversationHistory: Message[];
  context: Record<string, any>;
  metrics: AgentMetrics;
}

export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  WAITING = 'waiting',
  ERROR = 'error',
  STOPPED = 'stopped'
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalTokensUsed: number;
  averageExecutionTime: number;
  totalCost: number;
}

// Error Types
export class ISHAutomationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ISHAutomationError';
  }
}

export class PlatformError extends ISHAutomationError {
  constructor(message: string, details?: any) {
    super(message, 'PLATFORM_ERROR', details);
    this.name = 'PlatformError';
  }
}

export class AgentError extends ISHAutomationError {
  constructor(message: string, details?: any) {
    super(message, 'AGENT_ERROR', details);
    this.name = 'AgentError';
  }
}

export class ModelError extends ISHAutomationError {
  constructor(message: string, details?: any) {
    super(message, 'MODEL_ERROR', details);
    this.name = 'ModelError';
  }
}
