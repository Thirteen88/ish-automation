import { Model, ModelError } from '../types';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Model Manager - Handles model selection and information
 */
export class ModelManager {
  private models: Map<string, Model>;
  private logger: Logger;
  private configPath: string;

  constructor(configPath?: string) {
    this.models = new Map();
    this.logger = new Logger('ModelManager');
    this.configPath = configPath || path.join(process.cwd(), 'config/models.json');
    this.loadModels();
  }

  /**
   * Load models from configuration file
   */
  private loadModels(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

        if (config.models && Array.isArray(config.models)) {
          for (const model of config.models) {
            this.models.set(model.id, model);
          }
          this.logger.info(`Loaded ${this.models.size} models from config`);
        }
      } else {
        this.logger.warn('Models config file not found, using defaults');
        this.loadDefaultModels();
      }
    } catch (error) {
      this.logger.error('Failed to load models config', error);
      this.loadDefaultModels();
    }
  }

  /**
   * Load default models if config not found
   */
  private loadDefaultModels(): void {
    const defaultModels: Model[] = [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'OpenAI',
        capabilities: {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        },
        contextWindow: 128000,
        maxTokens: 4096,
        costPer1kTokens: {
          input: 0.01,
          output: 0.03
        }
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        capabilities: {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          codeGeneration: true
        },
        contextWindow: 200000,
        maxTokens: 4096,
        costPer1kTokens: {
          input: 0.015,
          output: 0.075
        }
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'Anthropic',
        capabilities: {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          codeGeneration: true
        },
        contextWindow: 200000,
        maxTokens: 4096,
        costPer1kTokens: {
          input: 0.003,
          output: 0.015
        }
      },
      {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        provider: 'Google',
        capabilities: {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        },
        contextWindow: 32000,
        maxTokens: 2048,
        costPer1kTokens: {
          input: 0.0005,
          output: 0.0015
        }
      },
      {
        id: 'mistral-large',
        name: 'Mistral Large',
        provider: 'Mistral',
        capabilities: {
          chat: true,
          completion: true,
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        },
        contextWindow: 32000,
        maxTokens: 8192,
        costPer1kTokens: {
          input: 0.008,
          output: 0.024
        }
      }
    ];

    for (const model of defaultModels) {
      this.models.set(model.id, model);
    }

    this.logger.info(`Loaded ${defaultModels.length} default models`);
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): Model {
    const model = this.models.get(modelId);

    if (!model) {
      throw new ModelError(`Model not found: ${modelId}`);
    }

    return model;
  }

  /**
   * Get all models
   */
  getAllModels(): Model[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider: string): Model[] {
    return this.getAllModels().filter(
      (model) => model.provider.toLowerCase() === provider.toLowerCase()
    );
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: keyof Model['capabilities']): Model[] {
    return this.getAllModels().filter((model) => model.capabilities[capability]);
  }

  /**
   * Find best model for task
   */
  findBestModel(requirements: {
    capability?: keyof Model['capabilities'];
    maxCost?: number;
    minContextWindow?: number;
    provider?: string;
  }): Model | null {
    let candidates = this.getAllModels();

    // Filter by capability
    if (requirements.capability) {
      candidates = candidates.filter(
        (model) => model.capabilities[requirements.capability!]
      );
    }

    // Filter by provider
    if (requirements.provider) {
      candidates = candidates.filter(
        (model) =>
          model.provider.toLowerCase() === requirements.provider!.toLowerCase()
      );
    }

    // Filter by context window
    if (requirements.minContextWindow) {
      candidates = candidates.filter(
        (model) => model.contextWindow >= requirements.minContextWindow!
      );
    }

    // Filter by cost
    if (requirements.maxCost && candidates.length > 0) {
      candidates = candidates.filter((model) => {
        if (!model.costPer1kTokens) return true;
        const avgCost =
          (model.costPer1kTokens.input + model.costPer1kTokens.output) / 2;
        return avgCost <= requirements.maxCost!;
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by cost (lower is better) and context window (higher is better)
    candidates.sort((a, b) => {
      const aCost = a.costPer1kTokens
        ? (a.costPer1kTokens.input + a.costPer1kTokens.output) / 2
        : 0;
      const bCost = b.costPer1kTokens
        ? (b.costPer1kTokens.input + b.costPer1kTokens.output) / 2
        : 0;

      if (aCost !== bCost) {
        return aCost - bCost;
      }

      return b.contextWindow - a.contextWindow;
    });

    return candidates[0];
  }

  /**
   * Add or update a model
   */
  addModel(model: Model): void {
    this.models.set(model.id, model);
    this.logger.info(`Model added/updated: ${model.id}`);
  }

  /**
   * Remove a model
   */
  removeModel(modelId: string): boolean {
    const deleted = this.models.delete(modelId);

    if (deleted) {
      this.logger.info(`Model removed: ${modelId}`);
    }

    return deleted;
  }

  /**
   * Check if model exists
   */
  hasModel(modelId: string): boolean {
    return this.models.has(modelId);
  }

  /**
   * Get model count
   */
  getModelCount(): number {
    return this.models.size;
  }

  /**
   * Save models to config file
   */
  saveModels(): void {
    try {
      const config = {
        models: Array.from(this.models.values()),
        updatedAt: new Date().toISOString()
      };

      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.logger.info(`Models saved to ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to save models', error);
      throw new ModelError('Failed to save models configuration');
    }
  }

  /**
   * Get model statistics
   */
  getStats(): {
    totalModels: number;
    byProvider: Record<string, number>;
    byCapability: Record<string, number>;
  } {
    const byProvider: Record<string, number> = {};
    const byCapability: Record<string, number> = {};

    for (const model of this.models.values()) {
      // Count by provider
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;

      // Count by capabilities
      for (const [capability, enabled] of Object.entries(model.capabilities)) {
        if (enabled) {
          byCapability[capability] = (byCapability[capability] || 0) + 1;
        }
      }
    }

    return {
      totalModels: this.models.size,
      byProvider,
      byCapability
    };
  }
}
