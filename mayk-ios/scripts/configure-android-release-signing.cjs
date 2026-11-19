// Inject a dedicated M.A.Y.K Play-upload signing config into the disposable
// Gradle project emitted by Expo prebuild. Never persist private signing values.
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../android/app/build.gradle');
if (!fs.existsSync(target)) throw new Error('M.A.Y.K Android Gradle app file missing. Run Expo prebuild first.');
for (const name of ['MAYK_ANDROID_KEYSTORE_PATH','MAYK_ANDROID_KEYSTORE_PASSWORD','MAYK_ANDROID_KEY_ALIAS','MAYK_ANDROID_KEY_PASSWORD']) {
  if (!process.env[name]) throw new Error('Missing required M.A.Y.K Android signing secret: ' + name);
}
let gradle = fs.readFileSync(target, 'utf8');
const configs = 'signingConfigs {';
const releaseConfig = `signingConfigs {
        maykRelease {
            storeFile file(System.getenv('MAYK_ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('MAYK_ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('MAYK_ANDROID_KEY_ALIAS')
            keyPassword System.getenv('MAYK_ANDROID_KEY_PASSWORD')
        }`;
if (gradle.includes('maykRelease {') || !gradle.includes(configs)) {
  throw new Error('Unexpected Gradle signingConfigs structure; refusing to sign.');
}
gradle = gradle.replace(configs, releaseConfig);
const buildTypes = gradle.indexOf('buildTypes {');
const release = gradle.indexOf('release {', buildTypes);
const debugSigning = gradle.indexOf('signingConfig signingConfigs.debug', release);
if (buildTypes < 0 || release < 0 || debugSigning < 0 || debugSigning > release + 8000) {
  throw new Error('Expo Gradle release signing anchor missing; refusing to sign.');
}
gradle = gradle.slice(0, debugSigning) + 'signingConfig signingConfigs.maykRelease'
  + gradle.slice(debugSigning + 'signingConfig signingConfigs.debug'.length);
fs.writeFileSync(target, gradle);
console.log('[MAYK Android] Standalone release builds now use the designated private M.A.Y.K upload keystore.');
