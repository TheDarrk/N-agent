const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', 'node_modules', '@hot-labs', 'kit', 'build');

// 1. Fix packageJson import in HotKit.js
const hotKitPath = path.join(base, 'HotKit.js');
if (fs.existsSync(hotKitPath)) {
  let hk = fs.readFileSync(hotKitPath, 'utf8');
  hk = hk.replace(/import\s+packageJson\s+from\s+["']\.\.\/package\.json["'];?/, 'const packageJson = { version: "1.6.3" };');
  fs.writeFileSync(hotKitPath, hk, 'utf8');
  console.log('Fixed package.json import in HotKit.js');
}

// 2. Fix freighter-api CJS import in stellar/freigher.js
const freighterPath = path.join(base, 'stellar', 'freigher.js');
if (fs.existsSync(freighterPath)) {
  let fp = fs.readFileSync(freighterPath, 'utf8');
  fp = fp.replace(
    'import { isConnected, requestAccess, getAddress, signTransaction, signAuthEntry, signMessage, getNetwork } from "@stellar/freighter-api";',
    'import * as _freighterPkg from "@stellar/freighter-api";\nconst { isConnected, requestAccess, getAddress, signTransaction, signAuthEntry, signMessage, getNetwork } = (_freighterPkg.default || _freighterPkg);'
  );
  fs.writeFileSync(freighterPath, fp, 'utf8');
  console.log('Fixed freighter-api import in stellar/freigher.js');
}

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Match from '...'
  content = content.replace(/(from\s+["'])(\.[^"']+)(["'])/g, (match, prefix, relPath, suffix) => {
    if (relPath.endsWith('.js') || relPath.endsWith('.json') || relPath.endsWith('.png') || relPath.endsWith('.svg')) {
      return match;
    }
    const targetPath = path.resolve(path.dirname(filePath), relPath);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      changed = true;
      return `${prefix}${relPath}/index.js${suffix}`;
    } else if (fs.existsSync(targetPath + '.js')) {
      changed = true;
      return `${prefix}${relPath}.js${suffix}`;
    }
    return match;
  });

  // 2. Match bare import '...'
  content = content.replace(/(import\s+["'])(\.[^"']+)(["'])/g, (match, prefix, relPath, suffix) => {
    if (relPath.endsWith('.js') || relPath.endsWith('.json') || relPath.endsWith('.png') || relPath.endsWith('.svg')) {
      return match;
    }
    const targetPath = path.resolve(path.dirname(filePath), relPath);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      changed = true;
      return `${prefix}${relPath}/index.js${suffix}`;
    } else if (fs.existsSync(targetPath + '.js')) {
      changed = true;
      return `${prefix}${relPath}.js${suffix}`;
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walkDir(full);
    else if (f.endsWith('.js')) {
      fixImportsInFile(full);
    }
  }
}

walkDir(base);
console.log('Fixed imports in @hot-labs/kit/build');

