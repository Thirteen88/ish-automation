// Mock response generator for testing Mobile PWA
const mockResponses = {
    lmarena: "The answer is 4. This is a basic arithmetic problem where 2 + 2 equals 4.",
    claude: "2 + 2 = 4",
    chatgpt: "The sum of 2 and 2 is 4. This is one of the fundamental arithmetic operations.",
    gemini: "2 + 2 equals **4**. This is a simple addition problem.",
    poe: "4"
};

// Simulate streaming responses
function simulateStreaming(platform, response, onChunk) {
    const words = response.split(' ');
    let index = 0;

    const interval = setInterval(() => {
        if (index < words.length) {
            onChunk(words[index] + ' ');
            index++;
        } else {
            clearInterval(interval);
        }
    }, 100); // Stream one word every 100ms
}

// Export for use in web-server.js
module.exports = {
    sendPrompt: async (platform, prompt, options = {}) => {
        console.log(`🤖 Mock: Processing ${platform} with prompt: "${prompt}"`);

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get mock response
        const response = mockResponses[platform] || `Mock response from ${platform} for: ${prompt}`;

        // Stream response if callback provided
        if (options.streaming && options.onChunk) {
            simulateStreaming(platform, response, options.onChunk);

            // Wait for streaming to complete
            await new Promise(resolve => setTimeout(resolve, response.split(' ').length * 100 + 500));
        }

        return {
            text: response,
            metadata: {
                model: platform,
                timestamp: new Date().toISOString(),
                mock: true
            }
        };
    }
};