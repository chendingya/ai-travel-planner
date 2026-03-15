const OpenAICompatibleEmbeddingAdapter = require('./OpenAICompatibleEmbeddingAdapter');

function createEmbeddingAdapter(config = {}) {
  return new OpenAICompatibleEmbeddingAdapter(config);
}

module.exports = {
  createEmbeddingAdapter,
};
