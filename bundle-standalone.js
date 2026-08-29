const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let embeddedRankingsJson = '{}';
try {
  embeddedRankingsJson = execSync('py build_embedded_rankings.py', {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  }).trim();
  JSON.parse(embeddedRankingsJson);
  console.log('Embedded rankings JSON generated successfully.');
} catch (error) {
  console.warn('Could not build embedded rankings; standalone will require python server.py.');
}

let standaloneHtml = indexHtml;

standaloneHtml = standaloneHtml.replace(
  /<link\s+rel="stylesheet"\s+href="styles\.css(?:\?[^"]*)?"\s*\/>/,
  `<style>\n${stylesCss}\n</style>`
);

standaloneHtml = standaloneHtml.replace(
  /<script\s+src="app\.js(?:\?[^"]*)?"\s*><\/script>/,
  `<script>\nwindow.EMBEDDED_RANKINGS = ${embeddedRankingsJson};\n</script>\n<script>\n${appJs}\n</script>`
);

if (standaloneHtml.includes('href="styles.css') || standaloneHtml.includes('src="app.js')) {
  console.error('Failed to inline styles.css and/or app.js. Check index.html link/script tags.');
  process.exit(1);
}

fs.writeFileSync(
  path.join(__dirname, 'fantasy-draft-sheet-standalone.html'),
  standaloneHtml,
  'utf8'
);

console.log('Standalone HTML file created successfully!');
console.log(`Output: fantasy-draft-sheet-standalone.html (${standaloneHtml.length} chars)`);
