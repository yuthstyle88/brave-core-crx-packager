import { randomUUID } from 'crypto'
import commander from 'commander'
import fetch from 'node-fetch'
import fs from 'fs-extra'
import path from 'path'
import unzip from 'unzip-crx-3'
import util from '../lib/util.js'
import ntpUtil from '../lib/ntpUtil.js'

const DOWNLOAD_DIR = path.resolve('./downloads')
const PEM_DIR = path.resolve('./out-all-pem')

const ensureDownloadDir = async () => {
  await fs.ensureDir(DOWNLOAD_DIR)
}

const downloadFile = async (url, outputPath) => {
  const res = await fetch(url, {
    headers: {
      'BraveServiceKey': 'qztbjzBqJueQZLFkwTTJrieu8Vw3789u'
    }
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const fileStream = fs.createWriteStream(outputPath)
  return new Promise((resolve, reject) => {
    res.body.pipe(fileStream)
    res.body.on('error', reject)
    fileStream.on('finish', resolve)
  })
}

async function updatePublicKeyInManifest (stagingDir, newPublicKey) {
  const manifestPath = path.join(stagingDir, 'manifest.json')
  const manifest = await fs.readJson(manifestPath)
  manifest.public_key = newPublicKey
  await fs.writeJson(manifestPath, manifest, { spaces: 2 })
}

const generateVerifiedContents = (stagingDir, signingKey) => {
  util.generateAndWriteVerifiedContents(
    stagingDir,
    ['resources.json', 'list.txt', 'list_catalog.json'],
    signingKey
  )
}

const checkForComponentsUpdates = async (platFroms, versions, params) => {
  const {
    binary,
    endpoint,
    region,
    privateKeyFile,
    publisherProofKey,
    publisherProofKeyAlt,
    verifiedContentsKey,
  } = params

  let os = 'android'
  if (platFroms === 'iOS') {
    os = 'mac'
  }

  console.log(
    `Checking for component updates for ${platFroms} ${endpoint} ${region} ${binary} ${privateKeyFile} ${publisherProofKey} ${publisherProofKeyAlt} ${verifiedContentsKey}`
  )
  const allExtensions = await util.getAllExtensions(endpoint, region)
  const extensions = allExtensions.Items || []
  await ensureDownloadDir()
  await Promise.all(extensions.map(async (ext) => {
    const prodVersions = ['135.1.0.2','135.1.0.3'];
    for (const version of versions) {
      for (const prodVersion of prodVersions) {

        const requestOS = {
          arch: 'arm64',
          platform: platFroms,
          version: prodVersion
        }

        const apps = {
          appid: ext.ID.S,
          enabled: true,
          lang: 'en-US',
          ping: {
            r: -2
          },
          updatecheck: {},
          version: ext.Version.S
        }

        const hw = {
          avx: false,
          physmemory: 8,
          sse: false,
          sse2: false,
          sse3: false,
          sse41: false,
          sse42: false,
          ssse3: false
        }

        try {
          const result = await sendDataForCheckComponentUpdates(
            os, apps, hw, 'arm64', 'arm', requestOS, prodVersion, prodVersion
          )
          const stagingDir = path.join('build', 'component-updater', ext.ID.S)
          const currentVersion = ext.version || '0.0.0'
          const nextVersion = result && result.response && result.response.apps && result.response.apps[0] && result.response.apps[0].updatecheck
            ? result.response.apps[0].updatecheck.nextversion || '0.0.0'
            : '0.0.0'
          if (isNewerVersion(nextVersion, currentVersion)) {
            const pipelines = result?.response?.apps?.[0]?.updatecheck?.pipelines || []
            let crxUrl = ''
            if (pipelines.length > 0) {
              const downloadOp = pipelines[0].operations.find(op => op.type === 'download')
              if (downloadOp && downloadOp.urls && downloadOp.urls.length > 0) {
                crxUrl = downloadOp.urls[0].url
              }
            }
            if (crxUrl) {
              const crxFile = path.join(DOWNLOAD_DIR, `${ext.id}-${nextVersion}.crx`)
              await downloadFile(crxUrl, crxFile)
              console.log(`Down loaded ${crxFile} successfully.`)
              unzip(crxFile, stagingDir).then(async () => {
                generateVerifiedContents(stagingDir, verifiedContentsKey)
                const keyFile = privateKeyFile || `${ext.id}.pem`
                const privateKeyFile = path.join(PEM_DIR, keyFile)
                const [newPublicKey] = await ntpUtil.generatePublicKeyAndID(privateKeyFile)
                await updatePublicKeyInManifest(stagingDir, newPublicKey)
                util.generateCRXFile(binary, crxFile, privateKeyFile, publisherProofKey,
                  publisherProofKeyAlt, stagingDir)
                await util.updateDBForCRXFile(endpoint, region, ext.id, currentVersion, nextVersion)
                await util.uploadCRXFile(endpoint, region, ext.id, currentVersion, nextVersion)
                console.log(`Update available for ${ext.name} (${currentVersion} -> ${nextVersion})`)
              })
            }
          }
        } catch (err) {
          console.error(`[${ext.id}] Err:`, err)
        }
      }
    }
  }))
}

const sendDataForCheckComponentUpdates = async (
  os, apps, hw, arch, nacl_arch, requestOS, prodversion, updaterversion
) => {
  const url = 'https://go-updater.brave.com/extensions'
  const data = {
    request: {
      '@os': os,
      '@updater': 'chromium',
      acceptformat: 'crx3,download,puff,run',
      apps: [apps],
      arch: arch,
      dedup: 'cr',
      hw,
      ismachine: true,
      nacl_arch: nacl_arch,
      requestOS,
      prodchannel: 'stable',
      prodversion: prodversion,
      protocol: '4.0',
      requestid: `{${randomUUID()}}`,
      sessionid: `{${randomUUID()}}`,
      updaterchannel: 'stable',
      updaterversion: updaterversion
    }
  }
  return await postData(url, data)
}

const postData = async (url, data) => {
  const dataString = JSON.stringify(data)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'BraveServiceKey': 'qztbjzBqJueQZLFkwTTJrieu8Vw3789u'
    },
    body: dataString
  })

  const text = await res.text()

  // 🔐 ตัด prefix ที่ใช้ป้องกัน XSSI เช่น )]}'
  const cleanText = text.replace(/^\)\]\}'\n?/, '')

  try {
    return JSON.parse(cleanText)
  } catch (err) {
    console.error('❌ Failed to parse JSON:', err.message)
    throw new Error(`Invalid JSON:\n${cleanText}`)
  }
}

function isNewerVersion (nextVersion, currentVersion) {
  const nextParts = nextVersion.split('.').map(Number)
  const currParts = currentVersion.split('.').map(Number)
  const length = Math.max(nextParts.length, currParts.length)

  for (let i = 0; i < length; i++) {
    const n = nextParts[i] || 0
    const c = currParts[i] || 0
    if (n > c) return true
    if (n < c) return false
  }
  return false
}

const processJob = async (platFroms, versions, commanderInstance) => {
  await checkForComponentsUpdates(platFroms, versions, commanderInstance)
}

util.installErrorHandlers()

util.addCommonScriptOptions(
  commander
    .option('-f, --key-file <file>', 'private key file for signing crx', 'key.pem')
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely')
).parse(process.argv);

(async () => {
  try {
    await util.createTableIfNotExists(commander.endpoint, commander.region)
    const platforms = [
      ['android', ['1.0.0', '2.0.0', '3.0.0']],
      ['iOS', ['18.5', '19.0', '20.0']]
    ]

    platforms.forEach(async (pf) => {
      var platform = pf[0]
      var version = pf[1]
      await processJob(platform, version, commander)
    })

  } catch (err) {
    console.error('Caught exception:', err)
    process.exit(1)
  }
})()