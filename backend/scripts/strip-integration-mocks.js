/**
 * Script to remove model/util/mongoose jest.mock calls from integration test files.
 * These mocks are now centralized in setup-integration.js.
 * Run: node scripts/strip-integration-mocks.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests', 'integration');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const result = [];
  let i = 0;
  let removed = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Remove single-line jest.mock for models
    if (/^\s*jest\.mock\(['"]\.\.\/\.\.\/models\//.test(line) && line.trim().endsWith(');')) {
      removed++;
      i++;
      continue;
    }
    
    // Remove single-line jest.mock for utils
    if (/^\s*jest\.mock\(['"]\.\.\/\.\.\/utils\//.test(line) && line.trim().endsWith(');')) {
      removed++;
      i++;
      continue;
    }
    
    // Remove multi-line jest.mock('mongoose', () => { ... });
    if (/^\s*jest\.mock\(['"]mongoose['"]/.test(line)) {
      // Find the closing });
      let depth = 0;
      let j = i;
      while (j < lines.length) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        if (depth <= 0 && j > i) break;
        if (depth === 0 && l.trim().endsWith(');')) break;
        j++;
      }
      removed += (j - i + 1);
      i = j + 1;
      continue;
    }
    
    result.push(line);
    i++;
  }

  // Remove excessive blank lines that remain after stripping
  const cleaned = [];
  let prevBlank = false;
  for (const line of result) {
    const isBlank = line.trim() === '';
    if (isBlank && prevBlank) continue;
    cleaned.push(line);
    prevBlank = isBlank;
  }

  if (removed > 0) {
    fs.writeFileSync(filePath, cleaned.join('\n'));
    console.log(`${file}: removed ${removed} mock lines`);
  } else {
    console.log(`${file}: no mocks to remove`);
  }
});
