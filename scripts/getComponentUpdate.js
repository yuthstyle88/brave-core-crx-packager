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
  console.log(`Downloading ${url} to ${outputPath}`)
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

function updatePublicKeyInManifest (stagingDir, newPublicKey) {
  const manifestPath = path.join(stagingDir, 'manifest.json')
  fs.readJson(manifestPath).then(data => {
    if (data && data.manifest_version && data.manifest_version !== 'undefined') {
      console.log(`Update manifest ${manifestPath} !`)
      data.key = newPublicKey
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(data, null, 2),
        'utf8'
      )
    }else{
      console.log('manifest not found')
    }
  })
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
    publisherProofKey,
    publisherProofKeyAlt,
    verifiedContentsKey,
  } = params

  let os = 'android'
  if (platFroms === 'iOS') {
    os = 'mac'
  }

  console.log(
    `Checking for component updates for ${platFroms} ${endpoint} ${region} ${binary} ${publisherProofKey} ${publisherProofKeyAlt} ${verifiedContentsKey}`
  )
  const allExtensions = await util.getAllExtensions(endpoint, region)
  const extensions = allExtensions.Items || []
  await ensureDownloadDir()
  for (const ext of extensions) {
    const prodVersions = ['135.1.0.2', '135.1.0.3']
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
          const currentVersion = ext.Version.S || '0.0.0'
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
              const pathname = new URL(crxUrl).pathname
              const extension = path.extname(pathname)
              const crxFile = path.join(DOWNLOAD_DIR, `${ext.ID.S}-${nextVersion}${extension}`)
              await downloadFile(crxUrl, crxFile)
              console.log(`Down loaded ${crxFile} successfully.`)
              unzip(crxFile, stagingDir).then(() => {
                const data = util.parseManifest(path.join(stagingDir, 'manifest.json'))
                if (data && data.name && data.name !== 'undefined') {
                  const crxOutputDir = path.join('build', 'component-updater')
                  const crxFile = path.join(crxOutputDir, `component-updater-${ext.ID.S}.crx`)
                  console.log(`Process ${data.name} !.`)
                  generateVerifiedContents(stagingDir, verifiedContentsKey)
                  const keyFile = `${ext.ID.S}.pem`
                  const privateKeyFile = path.join(PEM_DIR, keyFile)
                  const [newPublicKey] = ntpUtil.generatePublicKeyAndID(privateKeyFile)
                  updatePublicKeyInManifest(stagingDir, newPublicKey)
                  util.generateCRXFile(binary, crxFile, privateKeyFile, publisherProofKey,
                    publisherProofKeyAlt, stagingDir)
                  util.updateDBForCRXFile(endpoint, region, crxFile, currentVersion, nextVersion)
                  // await util.uploadCRXFile(endpoint, region, ext.ID.S, currentVersion, nextVersion)
                  console.log(`Update available for ${ext.Title.S} (${currentVersion} -> ${nextVersion})`)
                }
              })
            }
          }
        } catch (err) {
          console.error(`[${ext.ID.S}] Err:`, err)
        }
      }
    }
  }
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
      // ['iOS', ['18.5', '19.0', '20.0']]
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