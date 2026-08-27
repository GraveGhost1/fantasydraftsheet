const fs = require('fs');
const path = require('path');

// Read the files
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// Create standalone HTML from the current local site files.
let standaloneHtml = indexHtml;

// Replace external CSS link (with optional cache-bust query) with inline styles
standaloneHtml = standaloneHtml.replace(
  /<link\s+rel="stylesheet"\s+href="styles\.css(?:\?[^"]*)?"\s*\/>/,
  `<style>\n${stylesCss}\n</style>`
);

// Replace external JS script (with optional cache-bust query) with inline script
standaloneHtml = standaloneHtml.replace(
  /<script\s+src="app\.js(?:\?[^"]*)?"\s*><\/script>/,
  `<script>\n${appJs}\n</script>`
);

if (standaloneHtml.includes('href="styles.css') || standaloneHtml.includes('src="app.js')) {
  console.error('Failed to inline styles.css and/or app.js. Check index.html link/script tags.');
  process.exit(1);
}

// Write the standalone file
fs.writeFileSync(
  path.join(__dirname, 'fantasy-draft-sheet-standalone.html'),
  standaloneHtml,
  'utf8'
);

console.log('Standalone HTML file created successfully!');
console.log(`Output: fantasy-draft-sheet-standalone.html (${standaloneHtml.length} chars)`);
