import { randomUUID } from 'crypto';
import commander from 'commander';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import unzip from 'unzip-crx-3';
import util from '../lib/util.js';
import ntpUtil from '../lib/ntpUtil.js';
const DOWNLOAD_DIR = path.resolve('./downloads');
const PEM_DIR = path.resolve('./out-all-pem');

const ensureDownloadDir = async () => {
  await fs.ensureDir(DOWNLOAD_DIR);
};

const downloadFile = async (url, outputPath) => {
  const res = await fetch(url, {
    headers: {
      'BraveServiceKey': 'qztbjzBqJueQZLFkwTTJrieu8Vw3789u'
    }
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const fileStream = fs.createWriteStream(outputPath);
  return new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
};

async function updatePublicKeyInManifest(stagingDir, newPublicKey) {
  const manifestPath = path.join(stagingDir, 'manifest.json');
  const manifest = await fs.readJson(manifestPath);
  manifest.public_key = newPublicKey;
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
}

const generateVerifiedContents = (stagingDir, signingKey) => {
  util.generateAndWriteVerifiedContents(
    stagingDir,
    ['resources.json', 'list.txt', 'list_catalog.json'],
    signingKey
  );
};

const checkForComponentsUpdates = async (params) => {
  const {
    binary,
    endpoint,
    region,
    privateKeyFile,
    publisherProofKey,
    publisherProofKeyAlt,
    verifiedContentsKey,
  } = params;

  const allExtensions = await util.getAllExtensions(endpoint, region);
  const extensions = allExtensions.Items || [];
  await ensureDownloadDir();
  await Promise.all(extensions.map(async (ext) => {
    try {
      const result = await sendDataForCheckComponentUpdates(
        ext.os || '', ext.id, ext.nacl_arch || '', ext.arch || '',
        ext.platform || '', ext.version || '', ext.prodversion || '', ext.updaterversion || ''
      );
      const stagingDir = path.join('build', 'component-updater', ext.id);
      const currentVersion = ext.version || '0.0.0';
      const nextVersion = result && result.response && result.response.apps && result.response.apps[0] && result.response.apps[0].updatecheck
        ? result.response.apps[0].updatecheck.nextversion || '0.0.0'
        : '0.0.0';
      if (isNewerVersion(nextVersion, currentVersion)) {
        const pipelines = result?.response?.apps?.[0]?.updatecheck?.pipelines || [];
        let crxUrl = '';
        if (pipelines.length > 0) {
          const downloadOp = pipelines[0].operations.find(op => op.type === 'download');
          if (downloadOp && downloadOp.urls && downloadOp.urls.length > 0) {
            crxUrl = downloadOp.urls[0].url;
          }
        }
        if (crxUrl) {
          const crxFile = path.join(DOWNLOAD_DIR, `${ext.id}-${nextVersion}.crx`);
          await downloadFile(crxUrl, crxFile);
          console.log(`Down loaded ${crxFile} successfully.`);
          return unzip(crxFile, stagingDir).then(async () => {
            generateVerifiedContents(stagingDir, verifiedContentsKey);
            const keyFile = privateKeyFile || `${ext.id}.pem`;
            const privateKeyFile = path.join(PEM_DIR, keyFile);
            const [newPublicKey] = await ntpUtil.generatePublicKeyAndID(privateKeyFile);
            await updatePublicKeyInManifest(stagingDir, newPublicKey);
            util.generateCRXFile(binary, crxFile, privateKeyFile, publisherProofKey,
              publisherProofKeyAlt, stagingDir);
            await util.updateDBForCRXFile(endpoint, region, ext.id, currentVersion, nextVersion);
            await util.uploadCRXFile(endpoint, region, ext.id, currentVersion, nextVersion);
            console.log(`Update available for ${ext.name} (${currentVersion} -> ${nextVersion})`);
          });
        }
      }
    } catch (err) {
      console.error(`[${ext.id}] Err:`, err);
    }
  }));
};

const sendDataForCheckComponentUpdates = async (
  os, id, nacl_arch, arch, platform, version, prodversion, updaterversion
) => {
  const url = 'https://go-updater.brave.com/extensions';
  const data = {
    request: {
      '@os': os,
      '@updater': 'BraveComponentUpdater',
      acceptformat: 'crx3,download,puff,run',
      apps: [
        {
          appid: id,
          enabled: true,
          installsource: 'ondemand',
          ping: { r: -2 },
          updatecheck: {},
          version: prodversion
        }
      ],
      arch,
      dedup: 'cr',
      hw: {
        avx: false,
        physmemory: 7,
        sse: false,
        sse2: false,
        sse3: false,
        sse41: false,
        sse42: false,
        ssse3: false
      },
      ismachine: true,
      nacl_arch,
      os: { arch, platform, version },
      prodchannel: 'stable',
      prodversion: updaterversion,
      protocol: '4.0',
      requestid: `{${randomUUID()}}`,
      sessionid: `{${randomUUID()}}`,
      updaterchannel: 'stable',
      updaterversion
    }
  };
  return await postData(url, data);
};

const postData = async (url, data) => {
  const dataString = JSON.stringify(data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'BraveServiceKey': 'qztbjzBqJueQZLFkwTTJrieu8Vw3789u'},
    body: dataString
  });
  return await res.json();
};

function isNewerVersion(nextVersion, currentVersion) {
  const nextParts = nextVersion.split('.').map(Number);
  const currParts = currentVersion.split('.').map(Number);
  const length = Math.max(nextParts.length, currParts.length);

  for (let i = 0; i < length; i++) {
    const n = nextParts[i] || 0;
    const c = currParts[i] || 0;
    if (n > c) return true;
    if (n < c) return false;
  }
  return false;
}

const processJob = async (commanderInstance) => {
  await checkForComponentsUpdates(commanderInstance);
};

util.installErrorHandlers();

util.addCommonScriptOptions(
  commander
    .option('-f, --key-file <file>', 'private key file for signing crx', 'key.pem')
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely')
).parse(process.argv);

(async () => {
  try {
    await util.createTableIfNotExists(commander.endpoint, commander.region);
    await processJob(commander);
  } catch (err) {
    console.error('Caught exception:', err);
    process.exit(1);
  }
})();