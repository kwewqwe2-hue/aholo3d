// Producer-side check from the network being measured. Only anonymous HTTPS
// GETs, only files in the local release, no redirects/cookies/third-party API.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { get } from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const directory = fileURLToPath(new URL('../dist-web/', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function probeWeb(address, ca) {
  const base = new URL(address);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
    throw Error('请输入公开 HTTPS 目录地址，末尾保留 /，不含查询参数或凭据。');
  }
  const names = ['index.html', ...(await readdir(path.join(directory, 'assets'))).sort().map(n => 'assets/' + n)];
  const report = { at: new Date().toISOString(), url: base.href, expectedFiles: names.length, files: [], passed: true };
  for (const name of names) {
    const original = await readFile(path.join(directory, name));
    const url = name === 'index.html' ? base : new URL(name, base);
    const row = { path: url.pathname, expectedBytes: original.length };
    report.files.push(row);
    const start = performance.now();
    try {
      const response = await new Promise((resolve, reject) => {
        get(url, { ca, signal: AbortSignal.timeout(60000), headers: { 'Accept-Encoding': 'br, gzip' } }, resolve).on('error', reject);
      });
      row.ttfbMs = Math.round(performance.now() - start);
      row.status = response.statusCode;
      row.type = response.headers['content-type'] ?? '';
      row.encoding = response.headers['content-encoding'] ?? 'identity';
      row.cache = response.headers['cache-control'] ?? '';
      if (row.status !== 200) { response.destroy(); throw Error('HTTP ' + row.status); }
      const chunks = [];
      row.bodyBytes = 0;
      for await (const chunk of response) {
        row.bodyBytes += chunk.length;
        if (row.bodyBytes > original.length + 65536) throw Error('响应超过预期文件大小');
        chunks.push(chunk);
      }
      let body = Buffer.concat(chunks);
      const limit = { maxOutputLength: original.length + 1 };
      if (row.encoding === 'br') body = brotliDecompressSync(body, limit);
      if (row.encoding === 'gzip') body = gunzipSync(body, limit);
      row.sha256 = sha256(body);
      if (!body.equals(original)) throw Error('内容与本地正式包不同，期望 SHA-256 ' + sha256(original));
      if (name.endsWith('.js') && !/(?:java|ecma)script/i.test(row.type)) throw Error('模块 MIME 类型错误');
      if (name.endsWith('.css') && !/^text\/css\b/i.test(row.type)) throw Error('样式 MIME 类型错误');
      if (name === 'index.html' && !/^text\/html\b/i.test(row.type)) throw Error('入口 MIME 类型错误');
      if (name === 'index.html' && response.headers['content-disposition']?.toLowerCase().startsWith('attachment')) {
        throw Error('服务器强制下载入口页面');
      }
    } catch (error) {
      row.error = error.message;
      report.passed = false;
    }
    row.totalMs = Math.round(performance.now() - start);
    if (!report.passed && name === 'index.html') break;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('用法：node qa/probe-web.mjs <正式 HTTPS 目录地址>');
  const report = await probeWeb(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
