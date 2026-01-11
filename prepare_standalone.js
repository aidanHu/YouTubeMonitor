const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const buildPlatform = process.env.BUILD_PLATFORM || 'mac'; // 'mac' or 'win'

const destDir = path.join(__dirname, 'standalone_package');
const sourceDir = path.join(__dirname, '.next/standalone');
const publicSource = path.join(__dirname, 'public');
const staticSource = path.join(__dirname, '.next/static');

// 0. Prepare directories
console.log('Preparing standalone directory...');
// Ensure .next/standalone/public exists
execSync(`mkdir -p "${path.join(sourceDir, 'public')}"`);
// Ensure .next/standalone/.next/static exists
execSync(`mkdir -p "${path.join(sourceDir, '.next/static')}"`);

// Copy Public
console.log('Copying public assets...');
execSync(`cp -R "${publicSource}/." "${path.join(sourceDir, 'public/')}"`);

// Copy Static
console.log('Copying static assets...');
execSync(`cp -R "${staticSource}/"* "${path.join(sourceDir, '.next/static/')}"`);

// Copy Node Binary (Only if not Windows build)
// On Windows, checking /opt/homebrew/bin/node doesn't make sense, and we don't want to bundle a Mac binary.
if (buildPlatform !== 'win') {
    const localNodePath = '/opt/homebrew/bin/node';
    if (fs.existsSync(localNodePath)) {
        console.log('Bundling local Node binary for macOS...');
        execSync(`mkdir -p "${path.join(sourceDir, 'bin')}"`);
        execSync(`cp "${localNodePath}" "${path.join(sourceDir, 'bin/')}"`);
    } else {
        console.warn('Local Node binary not found at /opt/homebrew/bin/node. Skipping.');
    }
} else {
    console.log('Skipping bundling of Node binary for Windows build.');
}

// 1. Clean and Copy to Destination
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
console.log('Copying standalone build to standalone_package...');
execSync(`cp -R "${sourceDir}" "${destDir}"`);

// CLEANUP: Remove unnecessary large folders that Next.js might have traced or copied
const foldersToRemove = ['resources', 'final_builds', 'dist', 'dist_final', 'dist_win', 'dist_1230', 'dist_mac', '.git', 'electron', '.github', '.vscode', 'release_latest', 'release', 'brain', '.gemini'];
console.log('Cleaning up unnecessary folders from standalone_package...');
foldersToRemove.forEach(folder => {
    const target = path.join(destDir, folder);
    if (fs.existsSync(target)) {
        console.log(`Removing ${folder}...`);
        fs.rmSync(target, { recursive: true, force: true });
    }
});


// 2. Rename node_modules -> dependencies
const nodeModulesPath = path.join(destDir, 'node_modules');
const dependenciesPath = path.join(destDir, 'dependencies');

if (fs.existsSync(nodeModulesPath)) {
    console.log('Renaming node_modules to dependencies...');
    fs.renameSync(nodeModulesPath, dependenciesPath);
} else {
    console.warn('Warning: node_modules not found in standalone build!');
}

// 3. Create launcher.js
const launcherContent = `
const path = require('path');
const Module = require('module');

// Runtime Patch: Redirect hashed @prisma/client requests to the real one
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (typeof id === 'string' && id.startsWith('@prisma/client-')) {
        // console.log('Redirecting hashed prisma require:', id, 'to @prisma/client');
        return originalRequire.call(this, '@prisma/client');
    }
    return originalRequire.call(this, id);
};

// Set NODE_PATH to include our renamed dependencies folder
const depsPath = path.join(__dirname, 'dependencies');
process.env.NODE_PATH = [depsPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
// Refresh module paths
require('module').Module._initPaths();

console.log('Launcher: NODE_PATH set to', process.env.NODE_PATH);

// Start Next.js server
require('./server.js');
`;

console.log('Creating launcher.js...');
fs.writeFileSync(path.join(destDir, 'launcher.js'), launcherContent);

console.log('Standalone package preparation complete.');
