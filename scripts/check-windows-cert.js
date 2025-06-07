const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, '..', 'certs', 'windows', 'code-signing.pfx');

if (!fs.existsSync(certPath)) {
  console.warn('\n⚠️  WARNING: Windows code signing certificate not found!');
  console.warn('   Run "npm run cert:generate" to create a self-signed certificate.');
  console.warn('   Building without code signing...\n');
  
  // Remove signing config from environment to build unsigned
  delete process.env.CSC_LINK;
  delete process.env.WIN_CSC_LINK;
}