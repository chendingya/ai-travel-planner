const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const createOpenApiSpec = () => {
  const definition = {
    openapi: '3.0.3',
    info: {
      title: '拾光绘旅 API',
      version: '1.0.0',
      description: 'AI 旅行规划系统后端接口',
    },
    servers: [
      { url: '/' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Plan' },
      { name: 'AI Chat' },
      { name: 'TTS' },
      { name: 'Image' },
      { name: 'Postcard' },
      { name: 'Playlist' },
      { name: 'Share' },
      { name: 'Prompt' },
      { name: 'MCP' },
      { name: 'System' },
    ],
  };

  const options = {
    definition,
    apis: [
      path.join(__dirname, 'index.js'),
      path.join(__dirname, 'routes', '*.js'),
    ],
  };

  return swaggerJsdoc(options);
};

module.exports = {
  createOpenApiSpec,
};
