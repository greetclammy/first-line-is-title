import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// IMPORTANT: When creating git tags, use format "X.Y.Z" NOT "vX.Y.Z"
// The release workflow is configured to ignore v-prefixed tags

// Update manifest.json
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');

console.log(`Updated manifest.json to version ${targetVersion}`);
