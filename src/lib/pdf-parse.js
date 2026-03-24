// Workaround for pdf-parse v1 on Vercel serverless
// The original index.js tries to load a test file when module.parent is falsy
const Pdf = require('pdf-parse/lib/pdf-parse.js');
module.exports = Pdf;
