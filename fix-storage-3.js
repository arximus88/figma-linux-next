const fs = require('fs');

let content = fs.readFileSync('src/main/Storage.ts', 'utf8');

content = content.replace(
  'public setFeatureFlags(_: IpcMainEvent, data: { featureFlags: Types.FeatureFlags }) {',
  'public async setFeatureFlags(_: IpcMainEvent, data: { featureFlags: Types.FeatureFlags }) {'
);
// it doesn't await storage.save currently, it just modifies the settings object
// let's double check if it actually saves or not
// Oh, the reviewer said "missed propagating the async/await pattern to other internal methods like setFeatureFlags in Storage.ts"
// But it doesn't call storage.save(). I will add it if it makes sense, but the reviewer might have misspoken or meant something else. Let's add storage.save() to it. Wait, the reviewer said "missed propagating the async/await pattern... resulting in floating promises".

// Let's read the file again
console.log(content.includes('setFeatureFlags'));
