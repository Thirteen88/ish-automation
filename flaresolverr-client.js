/**
 * FlareSolverr Client Module
 *
 * Provides integration with FlareSolverr proxy server for bypassing Cloudflare protection.
 * FlareSolverr uses a real Chrome browser to solve challenges and return cookies.
 */

const axios = require('axios');

class FlareSolverrClient {
    constructor(baseUrl = 'http://localhost:8191') {
        this.baseUrl = baseUrl;
        this.sessions = new Map();
    }

    /**
     * Check if FlareSolverr is available
     */
    async isAvailable() {
        try {
            const response = await axios.get(this.baseUrl, { timeout: 5000 });
            return response.data.msg === 'FlareSolverr is ready!';
        } catch (error) {
            return false;
        }
    }

    /**
     * Solve Cloudflare challenge for a URL
     * @param {string} url - Target URL
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Solution with cookies and HTML
     */
    async solveChallenge(url, options = {}) {
        const {
            maxTimeout = 60000,
            sessionId = null,
            returnOnlyCookies = false
        } = options;

        try {
            console.log(`🔓 FlareSolverr: Solving challenge for ${url}`);
            const startTime = Date.now();

            const payload = {
                cmd: 'request.get',
                url: url,
                maxTimeout: maxTimeout
            };

            if (sessionId) {
                payload.session = sessionId;
            }

            if (returnOnlyCookies) {
                payload.returnOnlyCookies = true;
            }

            const response = await axios.post(`${this.baseUrl}/v1`, payload, {
                timeout: maxTimeout + 5000
            });

            const duration = Date.now() - startTime;

            if (response.data.status === 'ok') {
                console.log(`✅ FlareSolverr: Challenge solved in ${(duration / 1000).toFixed(1)}s`);

                return {
                    success: true,
                    html: response.data.solution.response,
                    cookies: response.data.solution.cookies,
                    userAgent: response.data.solution.userAgent,
                    url: response.data.solution.url,
                    status: response.data.solution.status,
                    headers: response.data.solution.headers,
                    message: response.data.message,
                    duration: duration
                };
            } else {
                throw new Error(`FlareSolverr returned status: ${response.data.status}, message: ${response.data.message}`);
            }
        } catch (error) {
            console.error(`❌ FlareSolverr error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                errorDetails: error.response?.data || null
            };
        }
    }

    /**
     * Create a persistent browser session
     * @returns {Promise<string>} - Session ID
     */
    async createSession() {
        try {
            console.log('🆕 FlareSolverr: Creating new session');

            const response = await axios.post(`${this.baseUrl}/v1`, {
                cmd: 'sessions.create'
            });

            if (response.data.status === 'ok') {
                const sessionId = response.data.session;
                this.sessions.set(sessionId, {
                    created: new Date(),
                    lastUsed: new Date()
                });
                console.log(`✅ FlareSolverr: Session created: ${sessionId}`);
                return sessionId;
            } else {
                throw new Error('Failed to create session');
            }
        } catch (error) {
            console.error(`❌ FlareSolverr session creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * List all active sessions
     * @returns {Promise<array>} - Array of session IDs
     */
    async listSessions() {
        try {
            const response = await axios.post(`${this.baseUrl}/v1`, {
                cmd: 'sessions.list'
            });

            if (response.data.status === 'ok') {
                return response.data.sessions;
            } else {
                return [];
            }
        } catch (error) {
            console.error(`❌ FlareSolverr list sessions failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Destroy a session
     * @param {string} sessionId - Session ID to destroy
     */
    async destroySession(sessionId) {
        try {
            console.log(`🗑️  FlareSolverr: Destroying session ${sessionId}`);

            const response = await axios.post(`${this.baseUrl}/v1`, {
                cmd: 'sessions.destroy',
                session: sessionId
            });

            if (response.data.status === 'ok') {
                this.sessions.delete(sessionId);
                console.log(`✅ FlareSolverr: Session destroyed`);
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error(`❌ FlareSolverr destroy session failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Clean up all sessions
     */
    async cleanup() {
        const sessions = await this.listSessions();
        for (const sessionId of sessions) {
            await this.destroySession(sessionId);
        }
        this.sessions.clear();
        console.log('✅ FlareSolverr: All sessions cleaned up');
    }

    /**
     * Get service info
     */
    async getInfo() {
        try {
            const response = await axios.get(this.baseUrl);
            return {
                available: true,
                version: response.data.version,
                userAgent: response.data.userAgent,
                message: response.data.msg
            };
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }
}

module.exports = FlareSolverrClient;

// Demo/Test
if (require.main === module) {
    async function demo() {
        const client = new FlareSolverrClient();

        try {
            // Check availability
            console.log('\n📋 Checking FlareSolverr availability...');
            const info = await client.getInfo();
            console.log('Info:', JSON.stringify(info, null, 2));

            if (!info.available) {
                console.error('❌ FlareSolverr is not available');
                process.exit(1);
            }

            // Test with a simple URL
            console.log('\n🧪 Testing with example.com...');
            const result = await client.solveChallenge('http://example.com', {
                maxTimeout: 30000
            });

            if (result.success) {
                console.log('✅ Success!');
                console.log('Status:', result.status);
                console.log('Cookies:', result.cookies.length);
                console.log('HTML length:', result.html.length);
                console.log('Duration:', result.duration + 'ms');
            } else {
                console.log('❌ Failed:', result.error);
            }

            // Test with Cloudflare-protected site
            console.log('\n🧪 Testing with lmarena.ai (Cloudflare protected)...');
            const cfResult = await client.solveChallenge('https://lmarena.ai', {
                maxTimeout: 60000
            });

            if (cfResult.success) {
                console.log('✅ Cloudflare bypassed!');
                console.log('Message:', cfResult.message);
                console.log('Status:', cfResult.status);
                console.log('Cookies:', cfResult.cookies.length);
                console.log('Duration:', (cfResult.duration / 1000).toFixed(1) + 's');
                console.log('\n📋 Cookies received:');
                cfResult.cookies.forEach(cookie => {
                    console.log(`  - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
                });
            } else {
                console.log('❌ Failed:', cfResult.error);
            }

        } catch (error) {
            console.error('❌ Demo error:', error.message);
        }
    }

    demo().catch(console.error);
}
