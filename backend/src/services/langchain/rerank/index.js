const OpenAICompatibleRerankAdapter = require('./OpenAICompatibleRerankAdapter');
const HttpRerankAdapter = require('./HttpRerankAdapter');

function isOpenAICompatiblePath(pathValue) {
  const value = String(pathValue || '').trim().toLowerCase();
  return value.includes('/v1/chat/completions') || value.includes('/v1/responses');
}

function createRerankAdapter(config = {}) {
  if (isOpenAICompatiblePath(config?.path)) {
    return new OpenAICompatibleRerankAdapter(config);
  }
  return new HttpRerankAdapter(config);
}

module.exports = {
  createRerankAdapter,
  isOpenAICompatiblePath,
};
