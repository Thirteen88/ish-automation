import { Agent } from '../core/agent';
import { AgentConfig, AgentType, Message } from '../types';
import { ISHClient } from '../platform/ish-client';
import { MessageQueue } from '../queue/message-queue';
import { PromptManager } from '../prompts/prompt-manager';

/**
 * Review Agent - Specialized in analyzing and providing feedback
 */
export class ReviewAgent extends Agent {
  constructor(
    config: Omit<AgentConfig, 'type'>,
    client: ISHClient,
    queue: MessageQueue,
    promptManager: PromptManager
  ) {
    super(
      {
        ...config,
        type: AgentType.REVIEW
      },
      client,
      queue,
      promptManager
    );
  }

  /**
   * Review code quality
   */
  async reviewCode(
    code: string,
    options?: {
      language?: string;
      focusAreas?: string[];
      severity?: 'critical' | 'all';
      model?: string;
    }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';
    const focusAreas = options?.focusAreas || [
      'code quality',
      'security',
      'performance',
      'maintainability'
    ];
    const severity = options?.severity || 'all';

    let prompt = `Review the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    prompt += `Focus areas:\n${focusAreas.map((area) => `- ${area}`).join('\n')}\n\n`;
    prompt += `Provide:\n`;
    prompt += `1. Overall quality assessment (score out of 10)\n`;
    prompt += `2. Issues found (categorized by severity)\n`;
    prompt += `3. Specific recommendations for improvement\n`;
    prompt += `4. Security concerns (if any)\n`;
    prompt += `5. Best practices that should be followed\n`;
    prompt += `6. Positive aspects worth noting\n`;

    if (severity === 'critical') {
      prompt += `\nFocus only on critical issues that must be addressed.`;
    }

    return await this.sendPrompt(prompt, {
      model: options?.model
    });
  }

  /**
   * Review content/text quality
   */
  async reviewContent(
    content: string,
    contentType: 'documentation' | 'article' | 'report' | 'general',
    options?: {
      criteria?: string[];
      model?: string;
    }
  ): Promise<Message> {
    const criteria = options?.criteria || [
      'clarity',
      'accuracy',
      'completeness',
      'grammar',
      'tone'
    ];

    let prompt = `Review the following ${contentType}:\n\n${content}\n\n`;
    prompt += `Evaluation criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\n`;
    prompt += `Provide:\n`;
    prompt += `1. Overall quality rating\n`;
    prompt += `2. Strengths\n`;
    prompt += `3. Areas for improvement\n`;
    prompt += `4. Specific suggestions and corrections\n`;
    prompt += `5. Clarity and readability assessment`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Review AI response quality
   */
  async reviewResponse(
    originalPrompt: string,
    response: string,
    options?: { model?: string }
  ): Promise<Message> {
    let prompt = `Review the quality of this AI response:\n\n`;
    prompt += `Original Prompt:\n${originalPrompt}\n\n`;
    prompt += `Response:\n${response}\n\n`;
    prompt += `Evaluate:\n`;
    prompt += `1. Relevance to the prompt\n`;
    prompt += `2. Completeness of the answer\n`;
    prompt += `3. Accuracy of information\n`;
    prompt += `4. Clarity and structure\n`;
    prompt += `5. Helpfulness and actionability\n`;
    prompt += `6. Potential improvements\n`;
    prompt += `7. Rating (out of 10)`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Perform security review
   */
  async securityReview(
    code: string,
    options?: {
      language?: string;
      securityStandards?: string[];
      model?: string;
    }
  ): Promise<Message> {
    const language = options?.language || 'TypeScript';
    const standards = options?.securityStandards || [
      'OWASP Top 10',
      'Secure coding practices'
    ];

    let prompt = `Perform a security review of the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    prompt += `Security standards to check against:\n${standards.map((s) => `- ${s}`).join('\n')}\n\n`;
    prompt += `Identify:\n`;
    prompt += `1. Security vulnerabilities (with severity ratings)\n`;
    prompt += `2. Potential attack vectors\n`;
    prompt += `3. Data exposure risks\n`;
    prompt += `4. Authentication/authorization issues\n`;
    prompt += `5. Input validation problems\n`;
    prompt += `6. Recommendations for remediation\n`;
    prompt += `7. Security best practices to implement`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Review architecture/design
   */
  async reviewArchitecture(
    description: string,
    systemType: string,
    options?: {
      focusAreas?: string[];
      model?: string;
    }
  ): Promise<Message> {
    const focusAreas = options?.focusAreas || [
      'scalability',
      'maintainability',
      'security',
      'performance'
    ];

    let prompt = `Review the architecture/design for a ${systemType}:\n\n${description}\n\n`;
    prompt += `Focus areas:\n${focusAreas.map((area) => `- ${area}`).join('\n')}\n\n`;
    prompt += `Provide:\n`;
    prompt += `1. Overall architecture assessment\n`;
    prompt += `2. Strengths of the design\n`;
    prompt += `3. Potential issues or weaknesses\n`;
    prompt += `4. Scalability considerations\n`;
    prompt += `5. Security implications\n`;
    prompt += `6. Recommended improvements\n`;
    prompt += `7. Alternative approaches to consider`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Compare multiple solutions
   */
  async compareSolutions(
    problem: string,
    solutions: string[],
    criteria: string[],
    options?: { model?: string }
  ): Promise<Message> {
    let prompt = `Compare the following solutions to this problem:\n\n`;
    prompt += `Problem: ${problem}\n\n`;
    prompt += `Solutions:\n`;
    solutions.forEach((solution, index) => {
      prompt += `\nSolution ${index + 1}:\n${solution}\n`;
    });
    prompt += `\nEvaluation criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\n`;
    prompt += `Provide:\n`;
    prompt += `1. Comparison matrix\n`;
    prompt += `2. Pros and cons of each solution\n`;
    prompt += `3. Scoring for each criterion\n`;
    prompt += `4. Recommendation with justification\n`;
    prompt += `5. Trade-offs to consider`;

    return await this.sendPrompt(prompt, options);
  }
}
