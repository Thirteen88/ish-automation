import {
  PromptTemplate,
  SystemPromptConfig,
  AgentType,
  PromptExample
} from '../types';
import { Logger } from '../utils/logger';
import { extractVariables, replaceVariables } from '../utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prompt Manager - Manages system prompts and templates
 */
export class PromptManager {
  private templates: Map<string, PromptTemplate>;
  private systemPrompts: Map<AgentType, SystemPromptConfig>;
  private logger: Logger;
  private configPath: string;

  constructor(configPath?: string) {
    this.templates = new Map();
    this.systemPrompts = new Map();
    this.logger = new Logger('PromptManager');
    this.configPath = configPath || path.join(process.cwd(), 'config/agents.json');
    this.loadConfiguration();
  }

  /**
   * Load configuration from file
   */
  private loadConfiguration(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

        // Load system prompts
        if (config.systemPrompts) {
          for (const [type, promptConfig] of Object.entries(
            config.systemPrompts as Record<string, SystemPromptConfig>
          )) {
            this.systemPrompts.set(type as AgentType, promptConfig);
          }
        }

        // Load templates
        if (config.templates && Array.isArray(config.templates)) {
          for (const template of config.templates) {
            this.templates.set(template.id, template);
          }
        }

        this.logger.info('Prompt configuration loaded');
      } else {
        this.logger.warn('Prompt config not found, using defaults');
        this.loadDefaults();
      }
    } catch (error) {
      this.logger.error('Failed to load prompt config', error);
      this.loadDefaults();
    }
  }

  /**
   * Load default prompts
   */
  private loadDefaults(): void {
    // Research Agent
    this.systemPrompts.set(AgentType.RESEARCH, {
      agentType: AgentType.RESEARCH,
      basePrompt: `You are a research assistant specialized in gathering, analyzing, and synthesizing information.
Your primary goal is to provide comprehensive, accurate, and well-sourced information on any topic.

Key responsibilities:
- Conduct thorough research on given topics
- Identify key facts, patterns, and insights
- Present information in a clear, structured manner
- Cite sources and maintain accuracy
- Suggest related topics or areas for further exploration`,
      enhancements: [
        'Focus on recent and credible sources',
        'Provide multiple perspectives when relevant',
        'Highlight conflicting information or uncertainties'
      ],
      constraints: [
        'Do not make unsupported claims',
        'Clearly distinguish facts from opinions',
        'Acknowledge limitations in available information'
      ]
    });

    // Code Generation Agent
    this.systemPrompts.set(AgentType.CODE_GENERATION, {
      agentType: AgentType.CODE_GENERATION,
      basePrompt: `You are an expert software engineer specialized in generating high-quality, production-ready code.
Your primary goal is to create efficient, maintainable, and well-documented code solutions.

Key responsibilities:
- Generate clean, efficient code following best practices
- Include comprehensive comments and documentation
- Consider edge cases and error handling
- Suggest improvements and optimizations
- Follow language-specific conventions and patterns`,
      enhancements: [
        'Write modular and reusable code',
        'Include unit tests when appropriate',
        'Optimize for performance and readability',
        'Use modern language features appropriately'
      ],
      constraints: [
        'Avoid deprecated or insecure patterns',
        'Do not include hardcoded sensitive information',
        'Follow SOLID principles and design patterns'
      ],
      examples: [
        {
          input: 'Create a function to validate email addresses',
          output: `function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}`,
          explanation: 'Simple, focused function with type safety'
        }
      ]
    });

    // Review Agent
    this.systemPrompts.set(AgentType.REVIEW, {
      agentType: AgentType.REVIEW,
      basePrompt: `You are a critical reviewer specialized in analyzing responses, code, and content for quality and accuracy.
Your primary goal is to provide constructive feedback and identify areas for improvement.

Key responsibilities:
- Critically analyze content for accuracy and quality
- Identify errors, inconsistencies, or gaps
- Provide specific, actionable feedback
- Suggest improvements and alternatives
- Assess completeness and relevance`,
      enhancements: [
        'Be thorough but constructive in criticism',
        'Prioritize feedback by importance',
        'Suggest concrete improvements'
      ],
      constraints: [
        'Focus on objective quality criteria',
        'Avoid personal preferences unless relevant',
        'Balance criticism with recognition of strengths'
      ]
    });

    // Strategy Agent
    this.systemPrompts.set(AgentType.STRATEGY, {
      agentType: AgentType.STRATEGY,
      basePrompt: `You are a strategic planner specialized in breaking down complex tasks and coordinating multi-step workflows.
Your primary goal is to create efficient plans and coordinate the work of other agents.

Key responsibilities:
- Analyze complex tasks and break them into subtasks
- Determine optimal task sequencing and dependencies
- Identify which agents are best suited for each subtask
- Monitor progress and adjust plans as needed
- Synthesize results from multiple agents`,
      enhancements: [
        'Consider task dependencies and parallelization',
        'Optimize for efficiency and quality',
        'Anticipate potential issues and create contingencies'
      ],
      constraints: [
        'Ensure task breakdown is comprehensive',
        'Avoid unnecessary complexity in plans',
        'Consider resource constraints and limitations'
      ]
    });

    this.logger.info('Default prompts loaded');
  }

  /**
   * Get system prompt for agent type
   */
  getSystemPrompt(agentType: AgentType, customizations?: string[]): string {
    const config = this.systemPrompts.get(agentType);

    if (!config) {
      return 'You are a helpful AI assistant.';
    }

    let prompt = config.basePrompt;

    // Add enhancements
    if (config.enhancements && config.enhancements.length > 0) {
      prompt += '\n\nEnhancements:\n';
      prompt += config.enhancements.map((e) => `- ${e}`).join('\n');
    }

    // Add constraints
    if (config.constraints && config.constraints.length > 0) {
      prompt += '\n\nConstraints:\n';
      prompt += config.constraints.map((c) => `- ${c}`).join('\n');
    }

    // Add examples
    if (config.examples && config.examples.length > 0) {
      prompt += '\n\nExamples:\n';
      for (const example of config.examples) {
        prompt += `\nInput: ${example.input}\n`;
        prompt += `Output: ${example.output}\n`;
        if (example.explanation) {
          prompt += `Explanation: ${example.explanation}\n`;
        }
      }
    }

    // Add custom enhancements
    if (customizations && customizations.length > 0) {
      prompt += '\n\nAdditional Instructions:\n';
      prompt += customizations.map((c) => `- ${c}`).join('\n');
    }

    return prompt;
  }

  /**
   * Update system prompt
   */
  updateSystemPrompt(agentType: AgentType, config: SystemPromptConfig): void {
    this.systemPrompts.set(agentType, config);
    this.logger.info(`System prompt updated for ${agentType}`);
  }

  /**
   * Create a prompt template
   */
  createTemplate(template: PromptTemplate): void {
    // Auto-detect variables if not provided
    if (!template.variables || template.variables.length === 0) {
      template.variables = extractVariables(template.template);
    }

    this.templates.set(template.id, template);
    this.logger.info(`Template created: ${template.id}`);
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    templateId: string,
    variables: Record<string, string>
  ): string {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate all required variables are provided
    const missing = template.variables.filter((v) => !(v in variables));

    if (missing.length > 0) {
      throw new Error(
        `Missing required variables for template ${templateId}: ${missing.join(', ')}`
      );
    }

    return replaceVariables(template.template, variables);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): PromptTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  /**
   * Delete template
   */
  deleteTemplate(templateId: string): boolean {
    const deleted = this.templates.delete(templateId);

    if (deleted) {
      this.logger.info(`Template deleted: ${templateId}`);
    }

    return deleted;
  }

  /**
   * Save configuration to file
   */
  saveConfiguration(): void {
    try {
      const config = {
        systemPrompts: Object.fromEntries(this.systemPrompts),
        templates: Array.from(this.templates.values()),
        updatedAt: new Date().toISOString()
      };

      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.logger.info(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
      throw error;
    }
  }

  /**
   * Build dynamic prompt with context
   */
  buildDynamicPrompt(options: {
    basePrompt: string;
    context?: Record<string, any>;
    instructions?: string[];
    examples?: PromptExample[];
    constraints?: string[];
  }): string {
    let prompt = options.basePrompt;

    // Add context
    if (options.context && Object.keys(options.context).length > 0) {
      prompt += '\n\nContext:\n';
      for (const [key, value] of Object.entries(options.context)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    // Add instructions
    if (options.instructions && options.instructions.length > 0) {
      prompt += '\n\nInstructions:\n';
      prompt += options.instructions.map((i) => `- ${i}`).join('\n');
    }

    // Add examples
    if (options.examples && options.examples.length > 0) {
      prompt += '\n\nExamples:\n';
      for (const example of options.examples) {
        prompt += `\nInput: ${example.input}\n`;
        prompt += `Output: ${example.output}\n`;
        if (example.explanation) {
          prompt += `Explanation: ${example.explanation}\n`;
        }
      }
    }

    // Add constraints
    if (options.constraints && options.constraints.length > 0) {
      prompt += '\n\nConstraints:\n';
      prompt += options.constraints.map((c) => `- ${c}`).join('\n');
    }

    return prompt;
  }
}
