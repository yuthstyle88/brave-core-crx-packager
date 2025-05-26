import util from '../lib/util.js'
import { randomUUID } from 'crypto'
import commander from 'commander'
import fetch from 'node-fetch'

interface RequestData {
  request: {
    '@os': string;
    '@updater': string;
    acceptformat: string;
    apps: Array<{
      appid: string;
      enabled: boolean;
      installsource: string;
      ping: { r: number };
      updatecheck: object;
      version: string;
    }>;
    arch: string;
    dedup: string;
    hw: {
      avx: boolean;
      physmemory: number;
      sse: boolean;
      sse2: boolean;
      sse3: boolean;
      sse41: boolean;
      sse42: boolean;
      ssse3: boolean;
    };
    ismachine: boolean;
    nacl_arch: string;
    os: {
      arch: string;
      platform: string;
      version: string;
    };
    prodchannel: string;
    prodversion: string;
    protocol: string;
    requestid: string;
    sessionid: string;
    updaterchannel: string;
    updaterversion: string;
  }
}

const simdFlags = {
  sse: false,
  sse2: false,
  sse3: false,
  sse41: false,
  sse42: false,
  ssse3: false
}

const checkForComponentsUpdates = async (endpoint: string, region: string) => {
  const extensions = (await util.getAllExtensions()).Items || []
  // Optimization: ใช้ Promise.all รันเช็คหลาย extension พร้อมกัน
  await Promise.all(extensions.map(async (ext) => {
    try {
      const result = await sendDataForCheckComponentUpdates(
        ext.os || '', ext.id, ext.nacl_arch || '', ext.arch || '', ext.platform || '', ext.version || '', ext.prodversion || '', ext.updaterversion || ''
      )
      const currentVersion = ext.version || '0.0.0'
      const nextVersion = result?.response?.apps?.[0]?.updatecheck?.nextversion || '0.0.0'
      if (isNewerVersion(nextVersion, currentVersion)) {
        await util.updateDBForCRXFile(endpoint, region, ext.id, currentVersion, nextVersion)
        await util.uploadCRXFile(endpoint, region, ext.id, currentVersion, nextVersion)
        console.log(`Update available for ${ext.name} (${currentVersion} -> ${nextVersion})`)
      }
    } catch (err) {
      console.error(`[${ext.id}] เกิดข้อผิดพลาด:`, err)
    }
  }))
}

const sendDataForCheckComponentUpdates = async (
  os: string,
  id: string,
  nacl_arch: string,
  arch: string,
  platform: string,
  version: string,
  prodversion: string,
  updaterversion: string
) => {
  const url = 'https://go-updater.brave.com/extensions'
  const data: RequestData = {
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
        ...simdFlags
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
  }
  return await postData(url, data)
}

const postData = async (url: string, data: any) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return await res.json()
}

function isNewerVersion(nextVersion: string, currentVersion: string): boolean {
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

const processJob = async (commanderInstance: typeof commander) => {
  await checkForComponentsUpdates(commanderInstance.endpoint, commanderInstance.region)
}

util.installErrorHandlers()

util.addCommonScriptOptions(
  commander
    .option('-d, --keys-directory <dir>', 'directory containing private keys for signing crx files')
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely')
).parse(process.argv)

(async () => {
  try {
    await util.createTableIfNotExists(commander.endpoint, commander.region)
    await processJob(commander)
  } catch (err) {
    console.error('Caught exception:', err)
    process.exit(1)
  }
})()