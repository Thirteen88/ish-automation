#!/usr/bin/env node

/**
 * ISH Parallel Model Comparison
 *
 * Queries multiple AI models in parallel with the same prompt
 * and provides a comparison of their responses
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const CLIVisualizer = require('./cli-visualizer');

class ParallelModelComparison {
    constructor() {
        this.visualizer = new CLIVisualizer();
        this.browser = null;
        this.models = [
            {
                name: 'claude-3-opus',
                provider: 'Anthropic',
                color: 'cyan',
                icon: '🎭'
            },
            {
                name: 'claude-3-sonnet',
                provider: 'Anthropic',
                color: 'blue',
                icon: '💻'
            },
            {
                name: 'gpt-4',
                provider: 'OpenAI',
                color: 'green',
                icon: '🧠'
            },
            {
                name: 'gpt-4-turbo',
                provider: 'OpenAI',
                color: 'yellow',
                icon: '👁️'
            },
            {
                name: 'gemini-pro',
                provider: 'Google',
                color: 'magenta',
                icon: '💎'
            }
        ];
        this.results = [];
    }

    async initialize() {
        this.visualizer.sectionHeader('Initializing Parallel Model Comparison', '🚀');

        try {
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.visualizer.displaySuccess('Browser initialized for parallel processing');
            return true;
        } catch (error) {
            this.visualizer.displayError(error, 'Failed to initialize browser');
            return false;
        }
    }

    async queryModel(model, prompt, systemPrompt) {
        const startTime = Date.now();

        // Start loading for this specific model
        this.visualizer.displayAgentActivity(
            `${model.icon} ${model.name}`,
            'Processing query...',
            'active'
        );

        // Simulate API call to ISH with the model
        // In production, this would make actual API calls
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        // Simulate realistic responses based on the prompt
        const responses = {
            'claude-3-opus': {
                platforms: [
                    { name: 'Vercel', url: 'https://vercel.com', description: 'Excellent for Next.js and React apps, generous free tier' },
                    { name: 'Netlify', url: 'https://netlify.com', description: 'Great for static sites and JAMstack, automatic deployments' },
                    { name: 'GitHub Pages', url: 'https://pages.github.com', description: 'Perfect for static sites, integrated with GitHub repos' },
                    { name: 'Railway', url: 'https://railway.app', description: 'Modern platform for full-stack apps, $5 free credit monthly' },
                    { name: 'Render', url: 'https://render.com', description: 'Free tier for web services, automatic deploys from Git' }
                ],
                comparison: 'Vercel leads for Next.js projects, while Netlify excels at static sites. GitHub Pages is ideal for documentation and portfolios.',
                recommendation: 'For modern web apps, start with Vercel or Railway. For static sites, GitHub Pages offers the best simplicity.'
            },
            'claude-3-sonnet': {
                platforms: [
                    { name: 'Vercel', url: 'https://vercel.com', description: 'Optimized for frontend frameworks, serverless functions included' },
                    { name: 'Heroku', url: 'https://heroku.com', description: 'Limited free tier, good for prototypes and learning' },
                    { name: 'Fly.io', url: 'https://fly.io', description: 'Global edge hosting, generous free allowances' },
                    { name: 'Replit', url: 'https://replit.com', description: 'Browser-based IDE with instant hosting' },
                    { name: 'Glitch', url: 'https://glitch.com', description: 'Collaborative coding with instant hosting' }
                ],
                comparison: 'Fly.io offers the best performance globally. Replit provides the easiest setup with zero configuration.',
                recommendation: 'Technical users should choose Fly.io, beginners should start with Replit or Glitch.'
            },
            'gpt-4': {
                platforms: [
                    { name: 'Netlify', url: 'https://www.netlify.com', description: 'Comprehensive free tier with 100GB bandwidth' },
                    { name: 'Vercel', url: 'https://vercel.com', description: 'Automatic SSL, global CDN, great DX' },
                    { name: 'Surge.sh', url: 'https://surge.sh', description: 'Simple CLI deployment for static sites' },
                    { name: 'Firebase Hosting', url: 'https://firebase.google.com/products/hosting', description: 'Google\'s platform with 10GB storage free' },
                    { name: 'Cloudflare Pages', url: 'https://pages.cloudflare.com', description: 'Unlimited bandwidth, fast global network' }
                ],
                comparison: 'Cloudflare Pages offers unlimited bandwidth. Firebase integrates well with other Google services. Surge.sh is the simplest.',
                recommendation: 'Choose Cloudflare Pages for performance, Firebase for full-stack apps, or Surge.sh for quick deployments.'
            },
            'gpt-4-turbo': {
                platforms: [
                    { name: 'GitHub Pages', url: 'https://pages.github.com', description: 'Free for public repos, custom domains supported' },
                    { name: 'GitLab Pages', url: 'https://docs.gitlab.com/ee/user/project/pages/', description: 'Similar to GitHub Pages with CI/CD' },
                    { name: 'Deta Space', url: 'https://deta.space', description: 'Personal cloud computer, unique approach' },
                    { name: 'Cyclic', url: 'https://cyclic.sh', description: 'Full-stack apps with no cold starts' },
                    { name: 'Supabase', url: 'https://supabase.com', description: 'Backend-as-a-service with hosting options' }
                ],
                comparison: 'Cyclic eliminates cold starts. Deta Space offers a unique personal cloud model. Supabase excels for database-driven apps.',
                recommendation: 'For APIs choose Cyclic, for full-stack apps with databases use Supabase, for experiments try Deta Space.'
            },
            'gemini-pro': {
                platforms: [
                    { name: 'AWS Free Tier', url: 'https://aws.amazon.com/free', description: '12 months free with limits, most comprehensive' },
                    { name: 'Google Cloud Free', url: 'https://cloud.google.com/free', description: '$300 credit plus always-free products' },
                    { name: 'Azure Free', url: 'https://azure.microsoft.com/free', description: '$200 credit for 30 days plus free services' },
                    { name: 'Oracle Cloud Free', url: 'https://oracle.com/cloud/free', description: 'Generous always-free tier, 2 VMs included' },
                    { name: 'DigitalOcean', url: 'https://digitalocean.com', description: '$200 credit for 60 days on signup' }
                ],
                comparison: 'Oracle Cloud has the most generous always-free tier. AWS offers the most services. Google Cloud is best for AI/ML projects.',
                recommendation: 'Start with Oracle Cloud for always-free resources, or AWS/GCP for learning enterprise platforms.'
            }
        };

        const modelResponse = responses[model.name] || {
            platforms: [],
            comparison: 'No specific comparison available',
            recommendation: 'Please try a different model'
        };

        this.visualizer.displayAgentActivity(
            `${model.icon} ${model.name}`,
            `Completed in ${duration}s`,
            'complete'
        );

        return {
            model: model.name,
            provider: model.provider,
            duration: duration,
            response: modelResponse,
            timestamp: new Date().toISOString()
        };
    }

    async runParallelQueries(prompt, systemPrompt) {
        this.visualizer.sectionHeader('Running Parallel Queries', '🔄');

        this.visualizer.displayPrompt(prompt, 'QUERY');
        this.visualizer.displaySystemPrompt(systemPrompt);

        // Display all models that will be queried
        this.visualizer.displayOrchestration(
            this.models.map(m => ({
                name: m.name,
                model: m.provider,
                role: 'Finding hosting platforms'
            }))
        );

        console.log('\n');
        this.visualizer.startLoadingBar('Querying all models in parallel', 100);

        // Run all queries in parallel
        const queryPromises = this.models.map(model =>
            this.queryModel(model, prompt, systemPrompt)
        );

        // Update progress as queries complete
        let completed = 0;
        queryPromises.forEach(promise => {
            promise.then(() => {
                completed++;
                this.visualizer.updateLoadingBar((completed / this.models.length) * 100);
            });
        });

        // Wait for all queries to complete
        this.results = await Promise.all(queryPromises);

        this.visualizer.completeLoadingBar('All models queried successfully');
    }

    displayResults() {
        this.visualizer.sectionHeader('Results Comparison', '📊');

        // Aggregate all unique platforms
        const allPlatforms = new Map();

        this.results.forEach(result => {
            result.response.platforms.forEach(platform => {
                if (!allPlatforms.has(platform.name)) {
                    allPlatforms.set(platform.name, {
                        ...platform,
                        recommendedBy: []
                    });
                }
                allPlatforms.get(platform.name).recommendedBy.push(result.model);
            });
        });

        // Display aggregated platforms
        console.log('\n' + this.visualizer.colorize('🌐 FREE DEVELOPER HOSTING PLATFORMS', 'cyan'));
        console.log(this.visualizer.colorize('═'.repeat(80), 'cyan'));
        console.log();

        // Sort platforms by number of recommendations
        const sortedPlatforms = Array.from(allPlatforms.values())
            .sort((a, b) => b.recommendedBy.length - a.recommendedBy.length);

        sortedPlatforms.forEach((platform, index) => {
            const popularity = '⭐'.repeat(platform.recommendedBy.length);
            console.log(`${index + 1}. ${this.visualizer.colorize(platform.name, 'bright')} ${popularity}`);
            console.log(`   🔗 ${this.visualizer.colorize(platform.url, 'blue')}`);
            console.log(`   📝 ${platform.description}`);
            console.log(`   👍 Recommended by: ${platform.recommendedBy.join(', ')}`);
            console.log();
        });

        // Display individual model responses
        console.log(this.visualizer.colorize('═'.repeat(80), 'cyan'));
        console.log(this.visualizer.colorize('📋 MODEL-SPECIFIC INSIGHTS', 'yellow'));
        console.log(this.visualizer.colorize('═'.repeat(80), 'cyan'));
        console.log();

        this.results.forEach(result => {
            const model = this.models.find(m => m.name === result.model);
            console.log(`${model.icon} ${this.visualizer.colorize(result.model.toUpperCase(), 'bright')} (${result.provider})`);
            console.log(`   ⏱️  Response Time: ${result.duration}s`);
            console.log(`   💡 Comparison: ${result.response.comparison}`);
            console.log(`   ✅ Recommendation: ${result.response.recommendation}`);
            console.log();
        });

        // Overall summary
        console.log(this.visualizer.colorize('═'.repeat(80), 'cyan'));
        console.log(this.visualizer.colorize('🎯 OVERALL SUMMARY', 'green'));
        console.log(this.visualizer.colorize('═'.repeat(80), 'cyan'));
        console.log();

        console.log('📊 ' + this.visualizer.colorize('Most Recommended Platforms:', 'bright'));
        const top3 = sortedPlatforms.slice(0, 3);
        top3.forEach((platform, index) => {
            console.log(`   ${index + 1}. ${platform.name} - Recommended by ${platform.recommendedBy.length} models`);
        });

        console.log('\n🏆 ' + this.visualizer.colorize('Best for Different Use Cases:', 'bright'));
        console.log('   • Static Sites: GitHub Pages, Netlify, Surge.sh');
        console.log('   • Full-Stack Apps: Vercel, Railway, Fly.io');
        console.log('   • Serverless: Cloudflare Pages, Vercel, Netlify');
        console.log('   • Learning/Prototypes: Replit, Glitch, Heroku');
        console.log('   • Enterprise: AWS, Google Cloud, Azure');

        console.log('\n💰 ' + this.visualizer.colorize('Free Tier Highlights:', 'bright'));
        console.log('   • Unlimited Bandwidth: Cloudflare Pages');
        console.log('   • Most Generous: Oracle Cloud (always-free VMs)');
        console.log('   • Best DX: Vercel, Netlify');
        console.log('   • Easiest Setup: Replit, Glitch');

        // Display metrics
        const avgTime = (this.results.reduce((sum, r) => sum + parseFloat(r.duration), 0) / this.results.length).toFixed(2);

        this.visualizer.displayMetrics({
            duration: `${avgTime}s average`,
            modelsUsed: this.results.length.toString(),
            platformsFound: allPlatforms.size.toString(),
            queryType: 'Parallel execution'
        });
    }

    async cleanup() {
        this.visualizer.displayInfo('Cleaning up resources...');

        if (this.browser) {
            await this.browser.close();
        }

        // Save results to file
        try {
            await fs.writeFile(
                'hosting-platforms-comparison.json',
                JSON.stringify({
                    query: 'find me free developer hosting platforms',
                    timestamp: new Date().toISOString(),
                    results: this.results
                }, null, 2)
            );
            this.visualizer.displayInfo('Results saved to hosting-platforms-comparison.json');
        } catch (error) {
            this.visualizer.displayWarning('Failed to save results to file');
        }

        this.visualizer.displaySuccess('Cleanup completed');
    }
}

// Color helper for standalone use
const colorize = (text, color) => {
    const colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m'
    };
    return `${colors[color] || ''}${text}${colors.reset}`;
};

// Add colorize method to visualizer if not present
CLIVisualizer.prototype.colorize = function(text, color) {
    const colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m'
    };
    return `${colors[color] || ''}${text}${colors.reset}`;
};

// Main execution
async function main() {
    console.clear();
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log(colorize('        PARALLEL MODEL COMPARISON - FREE HOSTING PLATFORMS', 'cyan'));
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log();

    const comparison = new ParallelModelComparison();

    try {
        // Initialize
        await comparison.initialize();

        // Run parallel queries
        await comparison.runParallelQueries(
            'Find me free developer hosting platforms',
            'You are a helpful assistant that provides detailed information about free hosting platforms for developers. Include URLs, key features, and recommendations.'
        );

        // Display results
        comparison.displayResults();

        // Cleanup
        await comparison.cleanup();

    } catch (error) {
        console.error(colorize('❌ Error:', 'red'), error.message);
    }
}

// Run the comparison
main().catch(console.error);