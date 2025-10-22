/**
 * Swagger/OpenAPI Configuration
 * Auto-generates API documentation
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ISH AI Orchestrator API',
      version: '1.0.0',
      description: `
# ISH AI Orchestrator REST API

Production-ready API for integrating with the ISH AI Orchestrator system.

## Features
- Multi-platform AI model access
- Intelligent query routing
- Real-time streaming responses
- Batch processing
- Response comparison
- Health monitoring
- Usage analytics

## Authentication
All requests require an API key passed in the \`X-API-Key\` header.

## Rate Limiting
- 100 requests per 15 minutes per API key
- Rate limit info returned in response headers

## Response Format
All responses follow this structure:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "timestamp": "2025-10-21T00:00:00.000Z",
    "requestId": "uuid-v4"
  }
}
\`\`\`

## Error Handling
Error responses include:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  },
  "metadata": { ... }
}
\`\`\`
      `,
      contact: {
        name: 'API Support',
        email: 'support@ish-orchestrator.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.ish-orchestrator.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Invalid request parameters'
                },
                details: {
                  type: 'object'
                }
              }
            },
            metadata: {
              $ref: '#/components/schemas/Metadata'
            }
          }
        },
        Metadata: {
          type: 'object',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            requestId: {
              type: 'string',
              format: 'uuid'
            }
          }
        },
        Platform: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'claude'
            },
            displayName: {
              type: 'string',
              example: 'Claude (Anthropic)'
            },
            models: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['claude-3-opus', 'claude-3-sonnet']
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['reasoning', 'coding', 'analysis']
            },
            status: {
              type: 'string',
              enum: ['available', 'degraded', 'unavailable'],
              example: 'available'
            }
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ],
    tags: [
      {
        name: 'Queries',
        description: 'Query submission and retrieval endpoints'
      },
      {
        name: 'Platforms',
        description: 'Platform information and health status'
      },
      {
        name: 'Batch',
        description: 'Batch processing operations'
      },
      {
        name: 'Analytics',
        description: 'Usage statistics and analytics'
      }
    ]
  },
  apis: ['./routes/*.js', './server.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
