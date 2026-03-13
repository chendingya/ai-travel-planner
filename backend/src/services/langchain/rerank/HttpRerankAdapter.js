const https = require('https');
const http = require('http');
const BaseRerankAdapter = require('./BaseRerankAdapter');

class HttpRerankAdapter extends BaseRerankAdapter {
  async rerank(query, documents) {
    const docs = Array.isArray(documents) ? documents : [];
    if (!docs.length) return [];

    const normalizedPath = this.path.startsWith('/') ? this.path : `/${this.path}`;
    const body = JSON.stringify({
      query,
      documents: docs,
      model: this.model,
      return_documents: false,
    });

    const url = new URL(`${this.baseURL}${normalizedPath}`);
    const lib = url.protocol === 'https:' ? https : http;

    const scoreItems = await new Promise((resolve, reject) => {
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? '443' : '80'),
          path: `${url.pathname}${url.search || ''}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(raw);
              if (Array.isArray(json)) {
                resolve(json.map((item) => ({ index: item.index, score: item.score ?? item.relevance_score ?? 0 })));
              } else if (Array.isArray(json?.results)) {
                resolve(json.results.map((item) => ({ index: item.index, score: item.relevance_score ?? item.score ?? 0 })));
              } else if (Array.isArray(json?.scores)) {
                resolve(json.scores.map((score, index) => ({ index, score })));
              } else if (Array.isArray(json?.data)) {
                resolve(json.data.map((item, index) => ({ index: item.index ?? index, score: item.score ?? item.relevance_score ?? 0 })));
              } else if (json?.error) {
                reject(new Error(String(json.error?.message || 'Rerank API 错误')));
              } else {
                reject(new Error(`Rerank API 未知响应格式: ${raw.slice(0, 200)}`));
              }
            } catch (_) {
              reject(new Error(`Rerank API JSON 解析失败: ${raw.slice(0, 200)}`));
            }
          });
        }
      );

      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        reject(new Error(`Rerank API 超时（${this.timeoutMs}ms）`));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    return scoreItems;
  }
}

module.exports = HttpRerankAdapter;
