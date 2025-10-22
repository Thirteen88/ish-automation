import { Agent } from '../core/agent';
import { AgentConfig, AgentType, Message } from '../types';
import { ISHClient } from '../platform/ish-client';
import { MessageQueue } from '../queue/message-queue';
import { PromptManager } from '../prompts/prompt-manager';

/**
 * Research Agent - Specialized in gathering and analyzing information
 */
export class ResearchAgent extends Agent {
  constructor(
    config: Omit<AgentConfig, 'type'>,
    client: ISHClient,
    queue: MessageQueue,
    promptManager: PromptManager
  ) {
    super(
      {
        ...config,
        type: AgentType.RESEARCH
      },
      client,
      queue,
      promptManager
    );
  }

  /**
   * Conduct research on a topic
   */
  async research(
    topic: string,
    options?: {
      depth?: 'shallow' | 'medium' | 'deep';
      focusAreas?: string[];
      model?: string;
    }
  ): Promise<Message> {
    const depth = options?.depth || 'medium';
    const focusAreas = options?.focusAreas || [];

    let prompt = `Conduct a ${depth} research on the following topic: ${topic}\n\n`;

    if (focusAreas.length > 0) {
      prompt += `Focus on these specific areas:\n${focusAreas.map((area) => `- ${area}`).join('\n')}\n\n`;
    }

    prompt += `Provide:\n`;
    prompt += `1. Overview and key findings\n`;
    prompt += `2. Important facts and data points\n`;
    prompt += `3. Multiple perspectives (if applicable)\n`;
    prompt += `4. Relevant sources or references\n`;
    prompt += `5. Suggestions for further exploration\n`;

    return await this.sendPrompt(prompt, {
      model: options?.model
    });
  }

  /**
   * Analyze data or information
   */
  async analyze(
    data: string,
    analysisType: 'summary' | 'patterns' | 'insights' | 'comparison',
    options?: { model?: string }
  ): Promise<Message> {
    let prompt = `Analyze the following data:\n\n${data}\n\n`;

    switch (analysisType) {
      case 'summary':
        prompt += 'Provide a concise summary of the key points.';
        break;
      case 'patterns':
        prompt += 'Identify patterns, trends, and notable observations.';
        break;
      case 'insights':
        prompt += 'Extract actionable insights and recommendations.';
        break;
      case 'comparison':
        prompt += 'Compare and contrast the different elements or viewpoints.';
        break;
    }

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Fact-check information
   */
  async factCheck(
    claim: string,
    options?: { model?: string }
  ): Promise<Message> {
    const prompt = `Fact-check the following claim:\n\n"${claim}"\n\n` +
      `Provide:\n` +
      `1. Verification status (true/false/partially true/unverified)\n` +
      `2. Supporting evidence\n` +
      `3. Contradicting evidence (if any)\n` +
      `4. Context and nuances\n` +
      `5. Confidence level in the assessment`;

    return await this.sendPrompt(prompt, options);
  }

  /**
   * Compare multiple sources or options
   */
  async compare(
    items: string[],
    criteria?: string[],
    options?: { model?: string }
  ): Promise<Message> {
    let prompt = `Compare the following items:\n\n`;
    items.forEach((item, index) => {
      prompt += `${index + 1}. ${item}\n`;
    });

    if (criteria && criteria.length > 0) {
      prompt += `\nEvaluate based on these criteria:\n`;
      criteria.forEach((criterion) => {
        prompt += `- ${criterion}\n`;
      });
    }

    prompt += `\nProvide a detailed comparison highlighting:\n`;
    prompt += `- Similarities and differences\n`;
    prompt += `- Pros and cons of each\n`;
    prompt += `- Recommendations based on the comparison`;

    return await this.sendPrompt(prompt, options);
  }
}
