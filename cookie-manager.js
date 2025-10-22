const fs = require('fs').promises;
const path = require('path');

class CookieManager {
    constructor(cookieDir = '.cookies') {
        this.cookieDir = path.resolve(cookieDir);
    }

    async ensureCookieDir() {
        try {
            await fs.mkdir(this.cookieDir, { recursive: true });
        } catch (error) {
            // Directory already exists
        }
    }

    async saveCookies(domain, cookies) {
        await this.ensureCookieDir();
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        await fs.writeFile(filePath, JSON.stringify({
            domain,
            timestamp: new Date().toISOString(),
            cookies
        }, null, 2));
        console.log(`  💾 Saved ${cookies.length} cookies to ${filePath}`);
    }

    async loadCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`  📂 Loaded ${parsed.cookies.length} cookies from ${filePath}`);
            return parsed.cookies;
        } catch (error) {
            console.log(`  ℹ️  No saved cookies found for ${domain}`);
            return null;
        }
    }

    async hasCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async deleteCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            await fs.unlink(filePath);
            console.log(`  🗑️  Deleted cookies for ${domain}`);
        } catch {
            // File doesn't exist
        }
    }
}

module.exports = CookieManager;
