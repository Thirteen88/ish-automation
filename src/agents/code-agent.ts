import { Agent } from '../core/agent';
import { AgentConfig, AgentType, Message } from '../types';
import { ISHClient } from '../platform/ish-client';
import { MessageQueue } from '../queue/message-queue';
import { PromptManager } from '../prompts/prompt-manager';

/**
 * Code Generation Agent - Specialized in creating and optimizing code
 */
export class CodeAgent extends Agent {
  constructor(
    config: Omit<AgentConfig, 'type'>,
    client: ISHClient,
    queue: MessageQueue,
    promptManager: PromptManager
  ) {
    super(
      {
        ...config,
        type: AgentType.CODE_GENERATION
      },
      client,
      queue,
      promptManager
    );
  }

  /**
   * Generate code from requirements
   */
  async generateCode(
    requirements: string,
    options?: {
      language?: string;
      framework?: string;
      includeTests?: boolean;
      includeComments?: boolean;
      model?: string;
    }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';
    const framework = options?.framework;
    const includeTests = options?.includeTests ?? true;
    const includeComments = options?.includeComments ?? true;

    let prompt = `Generate ${language} code for the following requirements:\n\n${requirements}\n\n`;

    if (framework) {
      prompt += `Use the ${framework} framework.\n`;
    }

    prompt += `Requirements:\n`;
    if (includeComments) {
      prompt += `- Include comprehensive inline comments\n`;
    }
    prompt += `- Follow best practices and coding standards\n`;
    prompt += `- Handle edge cases and errors appropriately\n`;
    prompt += `- Write clean, maintainable, and efficient code\n`;

    if (includeTests) {
      prompt += `- Include unit tests\n`;
    }

    return await this.sendPrompt(prompt, {
      model: options?.model
    });
  }

  /**
   * Refactor existing code
   */
  async refactor(
    code: string,
    improvements: string[],
    options?: { language?: string; model?: string }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';

    let prompt = `Refactor the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    prompt += `Apply these improvements:\n`;
    improvements.forEach((improvement) => {
      prompt += `- ${improvement}\n`;
    });
    prompt += `\nProvide:\n`;
    prompt += `1. The refactored code\n`;
    prompt += `2. Explanation of changes made\n`;
    prompt += `3. Benefits of the refactoring`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Debug code and find issues
   */
  async debug(
    code: string,
    error?: string,
    options?: { language?: string; model?: string }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';

    let prompt = `Debug the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

    if (error) {
      prompt += `Error message:\n${error}\n\n`;
    }

    prompt += `Provide:\n`;
    prompt += `1. Identified issues or bugs\n`;
    prompt += `2. Root cause analysis\n`;
    prompt += `3. Fixed code\n`;
    prompt += `4. Explanation of the fix\n`;
    prompt += `5. Suggestions to prevent similar issues`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Optimize code for performance
   */
  async optimize(
    code: string,
    optimizationGoals: string[],
    options?: { language?: string; model?: string }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';

    let prompt = `Optimize the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    prompt += `Optimization goals:\n`;
    optimizationGoals.forEach((goal) => {
      prompt += `- ${goal}\n`;
    });
    prompt += `\nProvide:\n`;
    prompt += `1. Optimized code\n`;
    prompt += `2. Performance improvements expected\n`;
    prompt += `3. Trade-offs (if any)\n`;
    prompt += `4. Benchmarking suggestions`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Generate tests for code
   */
  async generateTests(
    code: string,
    testFramework?: string,
    options?: { language?: string; model?: string }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';
    const framework = testFramework || 'Jest';

    let prompt = `Generate ${framework} tests for the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    prompt += `Requirements:\n`;
    prompt += `- Test all public methods/functions\n`;
    prompt += `- Include edge cases and error scenarios\n`;
    prompt += `- Use appropriate assertions\n`;
    prompt += `- Include setup and teardown if needed\n`;
    prompt += `- Add descriptive test names and comments`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Explain code functionality
   */
  async explainCode(
    code: string,
    options?: { language?: string; detailLevel?: 'brief' | 'detailed'; model?: string }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';
    const detailLevel = options?.detailLevel || 'detailed';

    let prompt = `Explain the following ${language} code in a ${detailLevel} manner:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

    if (detailLevel === 'detailed') {
      prompt += `Provide:\n`;
      prompt += `1. Overview of what the code does\n`;
      prompt += `2. Line-by-line or section-by-section explanation\n`;
      prompt += `3. Key algorithms or patterns used\n`;
      prompt += `4. Potential use cases\n`;
      prompt += `5. Any important considerations or caveats`;
    } else {
      prompt += `Provide a concise explanation of what the code does and its purpose.`;
    }

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Convert code between languages
   */
  async convertLanguage(
    code: string,
    fromLanguage: string,
    toLanguage: string,
    options?: { model?: string }
  ): Promise<Message> {
    let prompt = `Convert the following ${fromLanguage} code to ${toLanguage}:\n\n\`\`\`${fromLanguage}\n${code}\n\`\`\`\n\n`;
    prompt += `Requirements:\n`;
    prompt += `- Maintain the same functionality\n`;
    prompt += `- Use idiomatic ${toLanguage} patterns\n`;
    prompt += `- Include comments explaining ${toLanguage}-specific approaches\n`;
    prompt += `- Note any features that don't have direct equivalents`;

    return await this.sendPrompt(prompt, options);
  }
}
