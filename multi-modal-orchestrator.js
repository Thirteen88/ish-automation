#!/usr/bin/env node

/**
 * Multi-Modal AI Orchestrator
 *
 * Intelligently routes requests to appropriate AI platforms based on task type:
 * - Text prompts → LLM platforms (LMArena, Claude, GPT, etc.)
 * - Image requests → Image generation platforms (Playground AI, DALL-E, etc.)
 * - Video requests → Video platforms (VEED, Synthesia, etc.)
 * - Voice requests → TTS platforms (ElevenLabs, Murf, etc.)
 * - Design requests → Diagram platforms (Eraser.io, Visily, etc.)
 */

const { chromium } = require('playwright');
const CLIVisualizer = require('./cli-visualizer');

class MultiModalOrchestrator {
    constructor(config = {}) {
        this.visualizer = new CLIVisualizer();
        this.browser = null;
        this.config = {
            headless: config.headless !== false,
            parallel: config.parallel !== false,
            autoRoute: config.autoRoute !== false,
            ...config
        };

        // Platform configurations by modality
        this.platforms = {
            text: {
                primary: [
                    {
                        name: 'LMArena',
                        url: 'https://lmarena.ai/?mode=direct',
                        models: ['gpt-4-turbo', 'claude-3-opus', 'gemini-1.5-pro', 'llama-3-70b', 'mixtral-8x22b'],
                        type: 'multi-model',
                        icon: '🌐'
                    },
                    {
                        name: 'Claude Direct',
                        url: 'https://claude.ai',
                        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
                        type: 'direct',
                        icon: '🎭'
                    },
                    {
                        name: 'ChatGPT',
                        url: 'https://chat.openai.com',
                        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
                        type: 'direct',
                        icon: '🤖'
                    },
                    {
                        name: 'Gemini',
                        url: 'https://gemini.google.com',
                        models: ['gemini-1.5-pro', 'gemini-pro'],
                        type: 'direct',
                        icon: '💎'
                    },
                    {
                        name: 'Poe',
                        url: 'https://poe.com',
                        models: ['multiple'],
                        type: 'aggregator',
                        icon: '📚'
                    }
                ],
                fallback: [
                    {
                        name: 'ISH',
                        url: 'https://ish.junioralive.in/',
                        models: ['claude-3-opus', 'gpt-4', 'gemini-pro'],
                        type: 'multi-model',
                        icon: '🚀'
                    },
                    {
                        name: 'CLAILA',
                        url: 'https://claila.com',
                        models: ['multiple'],
                        type: 'aggregator',
                        icon: '🌟'
                    }
                ]
            },
            image: {
                primary: [
                    {
                        name: 'Playground AI',
                        url: 'https://playground.com',
                        features: ['100-500 free images/day', 'Multiple models', 'Commercial use'],
                        type: 'generation',
                        icon: '🎨'
                    },
                    {
                        name: 'Stable Diffusion Web',
                        url: 'https://stablediffusionweb.com',
                        features: ['Unlimited', 'No signup', 'Open source'],
                        type: 'generation',
                        icon: '🖼️'
                    },
                    {
                        name: 'Bing Image Creator',
                        url: 'https://www.bing.com/images/create',
                        features: ['DALL-E 3', 'Free with Microsoft account', 'High quality'],
                        type: 'generation',
                        icon: '🎯'
                    },
                    {
                        name: 'Craiyon',
                        url: 'https://www.craiyon.com',
                        features: ['Completely free', 'No limits', 'Quick generation'],
                        type: 'generation',
                        icon: '🖍️'
                    }
                ],
                fallback: [
                    {
                        name: 'Leonardo AI',
                        url: 'https://leonardo.ai',
                        features: ['Daily credits', 'Multiple styles'],
                        type: 'generation',
                        icon: '🎭'
                    }
                ]
            },
            video: {
                primary: [
                    {
                        name: 'VEED.io',
                        url: 'https://www.veed.io/tools/ai-video',
                        features: ['No signup', 'Multiple models', 'Built-in editor'],
                        type: 'generation',
                        icon: '📹'
                    },
                    {
                        name: 'Synthesia Free',
                        url: 'https://www.synthesia.io/free-ai-video-generator',
                        features: ['3 min/month free', 'AI avatars', '140+ languages'],
                        type: 'avatar',
                        icon: '👤'
                    },
                    {
                        name: 'Lumen5',
                        url: 'https://lumen5.com',
                        features: ['No account required', 'Text-to-video', 'Templates'],
                        type: 'generation',
                        icon: '🎬'
                    },
                    {
                        name: 'Giz.ai',
                        url: 'https://www.giz.ai/ai-video-generator/',
                        features: ['Multiple models', 'No signup', 'Sora, Kling access'],
                        type: 'generation',
                        icon: '🌀'
                    }
                ]
            },
            voice: {
                primary: [
                    {
                        name: 'ElevenLabs',
                        url: 'https://elevenlabs.io/text-to-speech',
                        features: ['Free tier', 'Natural voices', 'Emotion control'],
                        type: 'tts',
                        icon: '🎙️'
                    },
                    {
                        name: 'Murf AI',
                        url: 'https://murf.ai/text-to-speech',
                        features: ['200+ voices', '20+ languages', 'High accuracy'],
                        type: 'tts',
                        icon: '🗣️'
                    },
                    {
                        name: 'NoteGPT TTS',
                        url: 'https://notegpt.io/text-to-speech',
                        features: ['Unlimited free', 'No signup', 'Voice cloning'],
                        type: 'tts',
                        icon: '📝'
                    },
                    {
                        name: 'PlayAI',
                        url: 'https://play.ht/',
                        features: ['Preview free', 'Human-like', 'Multiple languages'],
                        type: 'tts',
                        icon: '▶️'
                    }
                ]
            },
            design: {
                primary: [
                    {
                        name: 'Eraser.io DiagramGPT',
                        url: 'https://www.eraser.io/diagramgpt',
                        features: ['AI-powered', 'Multiple diagram types', 'Code to diagram'],
                        type: 'architecture',
                        icon: '📐'
                    },
                    {
                        name: 'Visily Diagram AI',
                        url: 'https://www.visily.ai/diagram-ai/',
                        features: ['No expertise required', 'Multiple types', 'Simple interface'],
                        type: 'architecture',
                        icon: '📊'
                    },
                    {
                        name: 'Edraw.AI',
                        url: 'https://www.edraw.ai',
                        features: ['210+ drawing types', 'AI assistant', 'Free online'],
                        type: 'architecture',
                        icon: '✏️'
                    },
                    {
                        name: 'Miro AI',
                        url: 'https://miro.com/ai/diagram-ai/',
                        features: ['Collaborative', 'Text to diagram', 'Free trial'],
                        type: 'architecture',
                        icon: '🎯'
                    }
                ]
            }
        };

        this.pages = new Map();
    }

    async initialize() {
        this.visualizer.clear();
        this.visualizer.sectionHeader('Multi-Modal AI Orchestrator', '🌈');

        console.log(this.colorize('\n📊 Platform Configuration:', 'yellow'));
        console.log('  Text Platforms: ' + this.colorize(String(this.platforms.text.primary.length + this.platforms.text.fallback.length), 'green'));
        console.log('  Image Platforms: ' + this.colorize(String(this.platforms.image.primary.length), 'green'));
        console.log('  Video Platforms: ' + this.colorize(String(this.platforms.video.primary.length), 'green'));
        console.log('  Voice Platforms: ' + this.colorize(String(this.platforms.voice.primary.length), 'green'));
        console.log('  Design Platforms: ' + this.colorize(String(this.platforms.design.primary.length), 'green'));

        try {
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.visualizer.displaySuccess('Orchestrator initialized!', {
                'Total Platforms': this.countAllPlatforms(),
                'Auto-Routing': this.config.autoRoute ? 'Enabled' : 'Disabled',
                'Parallel Mode': this.config.parallel ? 'Enabled' : 'Disabled'
            });

            return true;
        } catch (error) {
            this.visualizer.displayError(error, 'Failed to initialize');
            return false;
        }
    }

    detectTaskType(prompt) {
        const lowercasePrompt = prompt.toLowerCase();

        // Keywords for each modality
        const imageKeywords = ['image', 'picture', 'photo', 'draw', 'generate art', 'illustration', 'visual', 'design image', 'create image'];
        const videoKeywords = ['video', 'animation', 'movie', 'clip', 'animate', 'motion'];
        const voiceKeywords = ['voice', 'speech', 'speak', 'audio', 'tts', 'text to speech', 'narrate', 'read aloud'];
        const designKeywords = ['diagram', 'architecture', 'flowchart', 'uml', 'system design', 'wireframe', 'schema'];

        // Check for specific modality keywords
        if (imageKeywords.some(keyword => lowercasePrompt.includes(keyword))) {
            return 'image';
        }
        if (videoKeywords.some(keyword => lowercasePrompt.includes(keyword))) {
            return 'video';
        }
        if (voiceKeywords.some(keyword => lowercasePrompt.includes(keyword))) {
            return 'voice';
        }
        if (designKeywords.some(keyword => lowercasePrompt.includes(keyword))) {
            return 'design';
        }

        // Default to text for general queries
        return 'text';
    }

    async routeRequest(prompt, config = {}) {
        // Detect task type if not explicitly provided
        const taskType = config.type || this.detectTaskType(prompt);

        this.visualizer.sectionHeader(`Routing ${taskType.toUpperCase()} Request`, '🔄');
        console.log(this.colorize(`\nDetected Task Type: ${taskType}`, 'cyan'));
        console.log(this.colorize('Original Prompt:', 'yellow'));
        console.log(`  "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

        const platforms = this.platforms[taskType];
        if (!platforms) {
            this.visualizer.displayError(null, `Unknown task type: ${taskType}`);
            return null;
        }

        // Select platforms to use
        const selectedPlatforms = config.useFallback ?
            [...platforms.primary, ...(platforms.fallback || [])] :
            platforms.primary;

        console.log(this.colorize('\nSelected Platforms:', 'green'));
        selectedPlatforms.forEach(platform => {
            console.log(`  ${platform.icon} ${platform.name} - ${platform.type}`);
        });

        if (this.config.parallel && selectedPlatforms.length > 1) {
            return await this.executeParallel(prompt, selectedPlatforms, taskType, config);
        } else {
            return await this.executeSequential(prompt, selectedPlatforms, taskType, config);
        }
    }

    async executeParallel(prompt, platforms, taskType, config) {
        this.visualizer.startLoadingBar(`Parallel ${taskType} generation`, 100);

        const promises = platforms.map(async (platform) => {
            try {
                return await this.queryPlatform(platform, prompt, taskType, config);
            } catch (error) {
                console.error(`${platform.name} failed:`, error.message);
                return null;
            }
        });

        // Track progress
        let completed = 0;
        promises.forEach(promise => {
            promise.then(() => {
                completed++;
                this.visualizer.updateLoadingBar((completed / platforms.length) * 100);
            }).catch(() => {
                completed++;
                this.visualizer.updateLoadingBar((completed / platforms.length) * 100);
            });
        });

        const results = await Promise.allSettled(promises);
        this.visualizer.completeLoadingBar(`${taskType} generation complete`);

        // Filter successful results
        const successful = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

        return successful;
    }

    async executeSequential(prompt, platforms, taskType, config) {
        const results = [];

        for (const platform of platforms) {
            try {
                const result = await this.queryPlatform(platform, prompt, taskType, config);
                if (result) {
                    results.push(result);
                    if (!config.queryAll) break; // Stop after first success unless querying all
                }
            } catch (error) {
                console.error(`${platform.name} failed:`, error.message);
                continue; // Try next platform
            }
        }

        return results;
    }

    async queryPlatform(platform, prompt, taskType, config) {
        const startTime = Date.now();

        this.visualizer.displayAgentActivity(
            `${platform.icon} ${platform.name}`,
            `Processing ${taskType} request...`,
            'active'
        );

        // Get or create page for this platform
        let page = this.pages.get(platform.name);
        if (!page) {
            page = await this.browser.newPage();
            await page.setViewportSize({ width: 1280, height: 800 });
            this.pages.set(platform.name, page);
        }

        try {
            // Navigate to platform
            await page.goto(platform.url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Simulate interaction based on task type
            await this.interactWithPlatform(page, platform, prompt, taskType, config);

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            this.visualizer.displayAgentActivity(
                `${platform.icon} ${platform.name}`,
                `Complete (${duration}s)`,
                'complete'
            );

            return {
                platform: platform.name,
                type: taskType,
                url: platform.url,
                duration: duration,
                timestamp: new Date().toISOString(),
                prompt: prompt,
                features: platform.features || platform.models,
                status: 'success'
            };

        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            this.visualizer.displayAgentActivity(
                `${platform.icon} ${platform.name}`,
                `Failed (${duration}s)`,
                'error'
            );

            throw error;
        }
    }

    async interactWithPlatform(page, platform, prompt, taskType, config) {
        // Simulate platform-specific interactions
        // In production, this would contain actual automation logic
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        // Platform-specific handling would go here
        switch (taskType) {
            case 'text':
                // Handle text generation platforms
                console.log(`  → Sending prompt to ${platform.name}`);
                break;
            case 'image':
                // Handle image generation platforms
                console.log(`  → Generating image with ${platform.name}`);
                break;
            case 'video':
                // Handle video generation platforms
                console.log(`  → Creating video with ${platform.name}`);
                break;
            case 'voice':
                // Handle TTS platforms
                console.log(`  → Generating speech with ${platform.name}`);
                break;
            case 'design':
                // Handle diagram/design platforms
                console.log(`  → Creating diagram with ${platform.name}`);
                break;
        }
    }

    displayResults(results, taskType) {
        this.visualizer.sectionHeader(`${taskType} Generation Results`, '📊');

        if (!results || results.length === 0) {
            this.visualizer.displayError(null, 'No successful results');
            return;
        }

        // Group by status
        const successful = results.filter(r => r.status === 'success');
        const failed = results.filter(r => r.status === 'failed');

        console.log(this.colorize('\n✅ Successful Platforms:', 'green'));
        successful.forEach(r => {
            console.log(`  ${r.platform}: ${r.duration}s`);
            if (r.features) {
                if (Array.isArray(r.features)) {
                    r.features.forEach(f => console.log(`    • ${f}`));
                }
            }
        });

        if (failed.length > 0) {
            console.log(this.colorize('\n❌ Failed Platforms:', 'red'));
            failed.forEach(r => {
                console.log(`  ${r.platform}: ${r.error || 'Unknown error'}`);
            });
        }

        // Performance summary
        const avgTime = successful.length > 0 ?
            (successful.reduce((sum, r) => sum + parseFloat(r.duration), 0) / successful.length).toFixed(2) :
            'N/A';

        this.visualizer.displayMetrics({
            'Task Type': taskType,
            'Platforms Queried': results.length,
            'Successful': successful.length,
            'Average Time': `${avgTime}s`,
            'Fastest': successful.length > 0 ?
                successful.reduce((min, r) => parseFloat(r.duration) < parseFloat(min.duration) ? r : min).platform :
                'N/A'
        });
    }

    countAllPlatforms() {
        let total = 0;
        Object.values(this.platforms).forEach(category => {
            total += category.primary.length;
            if (category.fallback) {
                total += category.fallback.length;
            }
        });
        return total;
    }

    async cleanup() {
        this.visualizer.displayInfo('Cleaning up resources...');

        // Close all pages
        for (const [name, page] of this.pages) {
            try {
                await page.close();
            } catch (error) {
                console.error(`Failed to close page for ${name}:`, error.message);
            }
        }

        if (this.browser) {
            await this.browser.close();
        }

        this.visualizer.displaySuccess('Cleanup completed');
    }

    colorize(text, color) {
        const colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            cyan: '\x1b[36m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            red: '\x1b[31m',
            magenta: '\x1b[35m'
        };
        return `${colors[color] || ''}${text}${colors.reset}`;
    }
}

module.exports = { MultiModalOrchestrator };

// Demo if run directly
if (require.main === module) {
    async function demo() {
        const orchestrator = new MultiModalOrchestrator({
            parallel: true,
            autoRoute: true,
            headless: true
        });

        try {
            await orchestrator.initialize();

            // Example queries for different modalities
            const examples = [
                {
                    prompt: "Explain quantum computing in simple terms",
                    expectedType: 'text'
                },
                {
                    prompt: "Generate an image of a futuristic city at sunset",
                    expectedType: 'image'
                },
                {
                    prompt: "Create a video explaining machine learning",
                    expectedType: 'video'
                },
                {
                    prompt: "Convert this text to speech: Hello, welcome to our presentation",
                    expectedType: 'voice'
                },
                {
                    prompt: "Create a system architecture diagram for a microservices application",
                    expectedType: 'design'
                }
            ];

            for (const example of examples) {
                console.log('\n' + orchestrator.colorize('─'.repeat(80), 'cyan'));
                console.log(orchestrator.colorize(`Example: ${example.expectedType.toUpperCase()} Request`, 'yellow'));

                const results = await orchestrator.routeRequest(example.prompt, {
                    useFallback: false,
                    queryAll: false
                });

                orchestrator.displayResults(results, example.expectedType);

                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            await orchestrator.cleanup();
        } catch (error) {
            console.error('Error:', error);
            await orchestrator.cleanup();
        }
    }

    demo().catch(console.error);
}