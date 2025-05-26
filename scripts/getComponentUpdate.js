import util from '../lib/util.js'

const fetch = require('node-fetch');
interface RequestData {
  request: {
    "@os": string;
    "@updater": string;
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
};

const checkForComponentsUpdates = async () => {
  const extensions = (await util.getAllExtensions()).Items || [];
  for (const ext of extensions) {
    if (ext.status === 'active') {
       const  result = await sendDataForCheckComponentUpdates()
    }
  }
};

const sendDataForCheckComponentUpdates = async (os, id, nacl_arch, arch, platform, version, prodversion , updaterversion) => {
  const url = 'https://go-updater.brave.com/extensions';
  const data: RequestData = {
    request: {
      "@os": os,
      "@updater": "BraveComponentUpdater",
      acceptformat: "crx3,download,puff,run",
      apps: [
        {
          appid: id,
          enabled: true,
          installsource: "ondemand",
          ping: { r: -2 },
          updatecheck: {},
          version: prodversion
        }
      ],
      arch: arch,
      dedup: "cr",
      hw: {
        avx: false,
        physmemory: 7,
        ...simdFlags
      },
      ismachine: true,
      nacl_arch: nacl_arch,
      os: {
        arch: arch,
        platform: platform,
        version: version
      },
      prodchannel: "stable",
      prodversion: updaterversion,
      protocol: "4.0",
      requestid: `{${randomUUID()}}`,
      sessionid: `{${randomUUID()}}`,
      updaterchannel: "stable",
      updaterversion: updaterversion
    }
  };

  return  await postData(url, data);
}

const postData = async (url, data) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  // อ่านผลลัพธ์เป็น json
  return await res.json();
};

