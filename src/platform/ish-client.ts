import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { EventEmitter } from 'eventemitter3';
import {
  PlatformConfig,
  PlatformSession,
  Message,
  PlatformError,
  Model
} from '../types';
import { Logger } from '../utils/logger';

/**
 * ISH Platform Client - Handles interaction with the ISH platform
 * Uses Playwright for browser automation to interact with the AI chat interface
 */
export class ISHClient extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: PlatformConfig;
  private session: PlatformSession | null = null;
  private logger: Logger;
  private isInitialized = false;

  constructor(config: PlatformConfig) {
    super();
    this.config = config;
    this.logger = new Logger('ISHClient');
  }

  /**
   * Initialize the browser and navigate to the platform
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing ISH client...');

      this.browser = await chromium.launch({
        headless: this.config.headless,
        timeout: this.config.timeout
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      this.page = await this.context.newPage();

      // Set timeout for all operations
      this.page.setDefaultTimeout(this.config.timeout);

      // Navigate to platform
      await this.page.goto(this.config.baseUrl, {
        waitUntil: 'networkidle'
      });

      this.logger.info('Platform loaded successfully');

      // Authenticate if required
      if (this.config.authRequired) {
        await this.authenticate();
      }

      // Create session
      this.session = await this.createSession();
      this.isInitialized = true;

      this.emit('initialized', this.session);
    } catch (error) {
      this.logger.error('Failed to initialize ISH client', error);
      throw new PlatformError('Initialization failed', error);
    }
  }

  /**
   * Authenticate with the platform
   */
  private async authenticate(): Promise<void> {
    try {
      if (!this.page) throw new PlatformError('Page not initialized');

      this.logger.info('Authenticating with platform...');

      const { authType, credentials } = this.config;

      switch (authType) {
        case 'api_key':
          await this.authenticateWithApiKey(credentials?.apiKey || '');
          break;
        case 'session':
          await this.authenticateWithCredentials(
            credentials?.username || '',
            credentials?.password || ''
          );
          break;
        case 'oauth':
          await this.authenticateWithOAuth();
          break;
        default:
          throw new PlatformError('Unknown auth type');
      }

      this.logger.info('Authentication successful');
    } catch (error) {
      this.logger.error('Authentication failed', error);
      throw new PlatformError('Authentication failed', error);
    }
  }

  /**
   * Authenticate using API key (if platform supports it)
   */
  private async authenticateWithApiKey(apiKey: string): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');

    // Try to inject API key via localStorage or cookies
    await this.page.evaluate((key) => {
      localStorage.setItem('ish_api_key', key);
    }, apiKey);

    await this.page.reload({ waitUntil: 'networkidle' });
  }

  /**
   * Authenticate using username/password
   */
  private async authenticateWithCredentials(
    username: string,
    password: string
  ): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');

    // Wait for login form (adjust selectors based on actual platform)
    await this.page.waitForSelector('input[type="email"], input[name="username"]', {
      timeout: 5000
    }).catch(() => {
      this.logger.warn('Login form not found, may already be authenticated');
    });

    // Try to find and fill login form
    const emailInput = await this.page.$('input[type="email"], input[name="username"]');
    const passwordInput = await this.page.$('input[type="password"], input[name="password"]');
    const loginButton = await this.page.$('button[type="submit"], button:has-text("Login")');

    if (emailInput && passwordInput && loginButton) {
      await emailInput.fill(username);
      await passwordInput.fill(password);
      await loginButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Authenticate using OAuth
   */
  private async authenticateWithOAuth(): Promise<void> {
    // Implement OAuth flow if supported
    throw new PlatformError('OAuth not implemented yet');
  }

  /**
   * Create a session object with current state
   */
  private async createSession(): Promise<PlatformSession> {
    if (!this.page || !this.context) {
      throw new PlatformError('Browser not initialized');
    }

    const cookies = await this.context.cookies();
    const localStorage = await this.page.evaluate(() => {
      return Object.keys(window.localStorage).reduce((acc, key) => {
        acc[key] = window.localStorage.getItem(key) || '';
        return acc;
      }, {} as Record<string, string>);
    });

    return {
      id: `session_${Date.now()}`,
      authenticated: true,
      cookies,
      localStorage,
      sessionData: {}
    };
  }

  /**
   * Send a prompt to the platform and get response
   */
  async sendPrompt(
    prompt: string,
    options: {
      model?: string;
      systemPrompt?: string;
      conversationId?: string;
      streaming?: boolean;
    } = {}
  ): Promise<Message> {
    if (!this.isInitialized || !this.page) {
      throw new PlatformError('Client not initialized');
    }

    try {
      this.logger.info(`Sending prompt: ${prompt.substring(0, 50)}...`);

      // Switch model if specified
      if (options.model) {
        await this.switchModel(options.model);
      }

      // Set system prompt if specified
      if (options.systemPrompt) {
        await this.setSystemPrompt(options.systemPrompt);
      }

      // Find chat input (adjust selector based on actual platform)
      const inputSelector = 'textarea, input[type="text"]';
      await this.page.waitForSelector(inputSelector, { timeout: 5000 });

      // Type the prompt
      await this.page.fill(inputSelector, prompt);

      // Send the message (adjust selector based on actual platform)
      const sendButtonSelector = 'button[type="submit"], button:has-text("Send")';
      await this.page.click(sendButtonSelector);

      // Wait for response
      const response = await this.waitForResponse(options.streaming);

      this.emit('promptSent', { prompt, response });
      return response;
    } catch (error) {
      this.logger.error('Failed to send prompt', error);
      throw new PlatformError('Failed to send prompt', error);
    }
  }

  /**
   * Wait for AI response
   */
  private async waitForResponse(streaming = false): Promise<Message> {
    if (!this.page) throw new PlatformError('Page not initialized');

    // Wait for response to appear (adjust selector based on actual platform)
    const responseSelector = '[data-message-role="assistant"], .assistant-message, .ai-response';

    try {
      await this.page.waitForSelector(responseSelector, {
        timeout: this.config.timeout
      });

      // Get the latest response
      const responseElement = await this.page.$(
        `${responseSelector}:last-of-type`
      );

      if (!responseElement) {
        throw new PlatformError('Response element not found');
      }

      const content = await responseElement.textContent() || '';

      return {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: content.trim(),
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get response', error);
      throw new PlatformError('Failed to get response', error);
    }
  }

  /**
   * Switch to a different AI model
   */
  async switchModel(modelId: string): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');

    try {
      this.logger.info(`Switching to model: ${modelId}`);

      // Find model selector (adjust based on actual platform)
      const modelSelectorButton = await this.page.$(
        'button:has-text("Model"), select[name="model"], [data-model-selector]'
      );

      if (modelSelectorButton) {
        await modelSelectorButton.click();
        await this.page.waitForTimeout(500);

        // Select the model (adjust based on actual platform)
        const modelOption = await this.page.$(
          `[data-model-id="${modelId}"], option[value="${modelId}"]`
        );

        if (modelOption) {
          await modelOption.click();
          this.logger.info(`Switched to model: ${modelId}`);
        } else {
          this.logger.warn(`Model ${modelId} not found, using default`);
        }
      }

      this.emit('modelSwitched', { modelId });
    } catch (error) {
      this.logger.warn(`Failed to switch model: ${error}`);
      // Don't throw error, just continue with current model
    }
  }

  /**
   * Set system prompt
   */
  async setSystemPrompt(systemPrompt: string): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');

    try {
      this.logger.info('Setting system prompt...');

      // Find system prompt input (adjust based on actual platform)
      const systemPromptSelector = 'textarea[name="system"], [data-system-prompt]';

      const systemPromptInput = await this.page.$(systemPromptSelector);

      if (systemPromptInput) {
        await systemPromptInput.fill(systemPrompt);
        this.logger.info('System prompt set successfully');
      } else {
        this.logger.warn('System prompt input not found');
      }

      this.emit('systemPromptSet', { systemPrompt });
    } catch (error) {
      this.logger.warn(`Failed to set system prompt: ${error}`);
      // Don't throw error, just continue
    }
  }

  /**
   * Get available models from the platform
   */
  async getAvailableModels(): Promise<Model[]> {
    if (!this.page) throw new PlatformError('Page not initialized');

    try {
      this.logger.info('Fetching available models...');

      // Try to extract models from the UI
      const models = await this.page.evaluate(() => {
        // This would need to be adjusted based on actual platform structure
        const modelElements = document.querySelectorAll('[data-model-id]');
        return Array.from(modelElements).map((el) => ({
          id: el.getAttribute('data-model-id') || '',
          name: el.textContent?.trim() || '',
          provider: 'unknown',
          capabilities: {
            chat: true,
            completion: true,
            streaming: true,
            functionCalling: false,
            vision: false,
            codeGeneration: true
          },
          contextWindow: 8192,
          maxTokens: 4096
        }));
      });

      this.logger.info(`Found ${models.length} models`);
      return models;
    } catch (error) {
      this.logger.error('Failed to get models', error);
      return [];
    }
  }

  /**
   * Clear conversation history
   */
  async clearConversation(): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');

    try {
      const clearButton = await this.page.$(
        'button:has-text("Clear"), button:has-text("New Chat")'
      );

      if (clearButton) {
        await clearButton.click();
        this.logger.info('Conversation cleared');
      }
    } catch (error) {
      this.logger.warn('Failed to clear conversation', error);
    }
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(path: string): Promise<void> {
    if (!this.page) throw new PlatformError('Page not initialized');
    await this.page.screenshot({ path, fullPage: true });
    this.logger.info(`Screenshot saved to: ${path}`);
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();

      this.isInitialized = false;
      this.logger.info('ISH client closed');
      this.emit('closed');
    } catch (error) {
      this.logger.error('Error closing client', error);
    }
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.page !== null;
  }

  /**
   * Get current session
   */
  getSession(): PlatformSession | null {
    return this.session;
  }
}
