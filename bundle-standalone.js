const fs = require('fs');
const path = require('path');

// Read the files
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// Create standalone HTML
let standaloneHtml = indexHtml;

// Replace external CSS link with inline styles
standaloneHtml = standaloneHtml.replace(
  '<link rel="stylesheet" href="styles.css" />',
  `<style>${stylesCss}</style>`
);

// Replace external JS script with inline script
standaloneHtml = standaloneHtml.replace(
  '<script src="app.js"></script>',
  `<script>${appJs}</script>`
);

// Write the standalone file
fs.writeFileSync(
  path.join(__dirname, 'fantasy-draft-sheet-standalone.html'),
  standaloneHtml,
  'utf8'
);

console.log('Standalone HTML file created successfully!');
