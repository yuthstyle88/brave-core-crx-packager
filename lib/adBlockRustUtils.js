import { Engine, FilterSet, uBlockResources } from 'adblock-rs'

import path from 'path'
import { promises as fs } from 'fs'
import { compress } from '@mongodb-js/zstd'
import ntpUtil from './ntpUtil.js'



const uBlockLocalRoot = 'submodules/uBlock'
const uBlockWebAccessibleResources = path.join(uBlockLocalRoot, 'src/web_accessible_resources')
const uBlockRedirectEngine = path.join(uBlockLocalRoot, 'src/js/redirect-resources.js')
const uBlockScriptlets = path.join(uBlockLocalRoot, 'src/js/resources/scriptlets.js')

const braveResourcesUrl = 'https://raw.githubusercontent.com/brave/adblock-resources/master/dist/resources.json'

const listCatalogUrl = 'https://raw.githubusercontent.com/yuthstyle88/brave-core-crx-packager/refs/heads/master/list_catalog.json'

const regionalCatalogComponentId = 'gkboaolpopklhgplhaaiboijnklogmbc'
// const regionalCatalogPubkey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkdcTS8nc4UVPcY454rXu87nMQ1BoFJSEimJAGwRAmmULV84Bumb1r1k4zzmzCma/xE5b5J/zLXIBP8gXyJh17+PUKl1U3H2RLIbO3Ba6yJ8o/o04COdh9toxEWbXyZnJtD1i3oxSMo6hX7SKN6EE1TxODTFoykhmQc7oUjrvMwbjlmuJrXcBiPWGvLoMr7S8ObA83KnoKGG4FR6kv77neRHPnlT+lOmlocE9MkMZwV5vNPo9RgPmLaU2gNfksoaq04F79pUsMncZGNhkdMv7n0uO6uFtCzcYFLg0V4mqQG2LTvyVcz4GVUIohmNpOVzgHhqQHCTTY5aRngXQaKYdyQIDAQAB'
const regionalCatalogPubkey = (privateKeyFile = 'out-all-pem/gkboaolpopklhgplhaaiboijnklogmbc.pem') => {
  const [publicKey] = ntpUtil.generatePublicKeyAndID(privateKeyFile)
  return publicKey
}

const resourcesComponentId = 'mfddibmblmbccpadfndgakiopmmhebop'
// const resourcesPubkey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvOS/+2r0UbGU7FxoBvoEWoKiIYA671xI+NkeCqktw2TgVFZdq4ROpYHnOXbfUjXW0EasJja8vv04z+c7wZzhi3uhnzzHkR2+EQjPpnHcxj3F0Kc43mbJAkgTmfItBqN/KPv1QDoIyi+Gj6fwQn/ZfV55Qtw6upit+PjxhgNij89c4lrFce6h1XY6MxjaZRkee9H486nU0YtX629LT3WMc699aY81raRXcyDZlsadCRVsNZhQg7luRi/akaGju0vnRN6Se6DgpLoIJHRtlHqmmfWFiWal4WQrj9Il7LByEiX8jHQmELQR8KW18cfMbB9aURFw2DLXOhb0ArlVh62czwIDAQAB'
const resourcesPubkey = (privateKeyFile = 'out-all-pem/mfddibmblmbccpadfndgakiopmmhebop.pem') => {
  const [publicKey] = ntpUtil.generatePublicKeyAndID(privateKeyFile)
  return publicKey
}

const requestJSON = async (url, debug = false) => {
  try {
    if (debug) {
      console.log(`[DEBUG] กำลังเรียก URL: ${url}`)
    }

    const response = await fetch(url)

    if (debug) {
      console.log(`[DEBUG] สถานะการตอบกลับ: ${response.status} ${response.statusText}`)
    }

    if (response.status !== 200) {
      const error = `สถานะผิดพลาด ${response.status} ${response.statusText} จาก URL: ${url}`
      if (debug) {
        console.error(`[DEBUG] ${error}`)
      }
      throw new Error(error)
    }

    // สร้าง clone response ทันทีหลังจากได้รับ response
    const responseClone = response.clone()

    try {
      // ใช้ responseClone สำหรับการแปลง JSON
      const data = await responseClone.json()

      if (debug) {
        // ใช้ original response สำหรับการ debug
        const debugData = await response.text()
        console.log(`[DEBUG] ข้อมูลที่ได้รับ:`, debugData)
      }

      return data
    } catch (parseError) {
      const error = `ไม่สามารถแปลงข้อมูลเป็น JSON ได้: ${parseError.message}`
      if (debug) {
        console.error(`[DEBUG] ${error}`)
      }
      throw new Error(error)
    }

  } catch (error) {
    const errorMessage = `เกิดข้อผิดพลาดในการดึงข้อมูลจาก ${url}: ${error.message}`
    if (debug) {
      console.error(`[DEBUG] ${errorMessage}`)
    }
    throw new Error(errorMessage)
  }
}
const lazyInit = (fn) => {
  let prom
  return () => {
    prom = prom || fn()
    return prom
  }
}

const getListCatalog = lazyInit(async () => {
  return requestJSON(listCatalogUrl)
})

// Legacy logic requires a distinction between default and regional lists.
// This can be removed once DAT support is no longer needed by iOS.
const isDefaultList = entry => entry.default_enabled && entry.hidden
const getDefaultLists = () => getListCatalog().then(catalog => {
  return catalog.filter(isDefaultList)
})
const getRegionalLists = () => getListCatalog().then(catalog => {
  return catalog.filter(entry => !isDefaultList(entry))
})

// Wraps new template scriptlets with the older "numbered template arg" format and any required dependency code
const wrapScriptletArgFormat = (fnString, dependencyPrelude) => `{
  const args = ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}", "{{6}}", "{{7}}", "{{8}}", "{{9}}"];
  let last_arg_index = 0;
  for (const arg_index in args) {
    if (args[arg_index] === '{{' + (Number(arg_index) + 1) + '}}') {
      break;
    }
    last_arg_index += 1;
  }
  ${dependencyPrelude}
  (${fnString})(...args.slice(0, last_arg_index))
}`

const generateResources = lazyInit(async () => {
  const { builtinScriptlets } = await import(path.join('..', uBlockScriptlets).toString())

  const dependencyMap = builtinScriptlets.reduce((map, entry) => {
    map[entry.name] = entry
    return map
  }, {})

  const transformedUboBuiltins = builtinScriptlets.filter(s => !s.name.endsWith('.fn')).map(s => {
    // Bundle dependencies wherever needed. This causes some small duplication but makes each scriptlet fully self-contained.
    let dependencyPrelude = ''
    const requiredDependencies = s.dependencies ?? []
    for (const dep of requiredDependencies) {
      for (const recursiveDep of dependencyMap[dep].dependencies ?? []) {
        if (!requiredDependencies.includes(recursiveDep)) {
          requiredDependencies.push(recursiveDep)
        }
      }
    }
    for (const dep of requiredDependencies.reverse()) {
      const thisDepCode = dependencyMap[dep].fn.toString()
      if (thisDepCode === undefined) {
        throw new Error(`Couldn't find dependency ${dep}`)
      }
      dependencyPrelude += thisDepCode + '\n'
    }
    const content = Buffer.from(wrapScriptletArgFormat(s.fn.toString(), dependencyPrelude)).toString('base64')
    // in Brave Browser, bit 0 (i.e. 1 << 0) signifies uBO resource permission.
    return {
      name: s.name,
      aliases: s.aliases ?? [],
      kind: { mime: 'application/javascript' },
      content
    }
  })

  const resourceData = uBlockResources(
    uBlockWebAccessibleResources,
    uBlockRedirectEngine
  )

  const braveResources = await requestJSON(braveResourcesUrl)
  resourceData.push(...braveResources)
  resourceData.push(...transformedUboBuiltins)
  return JSON.stringify(resourceData)
})

/**
 * Returns a promise that generates a resources file from the uBlock Origin
 * repo hosted on GitHub
 */
const generateResourcesFile = async (outLocation) => {
  return fs.writeFile(outLocation, await generateResources(), 'utf8')
}

/**
 * A list of requests that should not be blocked unless the list has some serious issue.
 *
 * Each element is [requestUrl, sourceUrl, requestType].
 */
const sampleUnblockedNetworkRequests = [
  // real resources from a personal website which will never ship ads/trackers
  ['https://antonok.com', 'https://antonok.com', 'document'],
  ['https://antonok.com/style.css?h=9aba43f4dd864e1e4f3a', 'https://antonok.com', 'stylesheet'],
  ['https://antonok.com/res/font/icons.woff2?h=598bc5b2aa7cdaf390d9', 'https://antonok.com', 'font'],
  ['https://antonok.com/res/antonok-logo.svg', 'https://antonok.com', 'image'],
  ['https://antonok.com/processed_images/profile-2021-05-03.14f955fe3ab1a230.webp', 'https://antonok.com', 'image'],
  // real resources from brave.com
  ['https://brave.com', 'https://brave.com', 'document'],
  ['https://brave.com/js/navigation.js', 'https://brave.com', 'script'],
  ['https://brave.com/static-assets/css-old/main.min.css', 'https://brave.com', 'stylesheet'],
  ['https://brave.com/static-assets/images/brave-logo-sans-text.svg', 'https://brave.com', 'image'],
  // real resources from Brave's QA testing pages
  ['https://dev-pages.brave.software/filtering/index.html', 'https://dev-pages.brave.software/filtering/index.html', 'document'],
  ['https://dev-pages.brave.software/static/css/bootstrap.min.css', 'https://dev-pages.brave.software/filtering/index.html', 'stylesheet'],
  ['https://dev-pages.brave.software/static/css/site.css', 'https://dev-pages.brave.software/filtering/index.html', 'stylesheet'],
  ['https://dev-pages.brave.software/static/js/site.js', 'https://dev-pages.brave.software/filtering/index.html', 'script'],
  ['https://dev-pages.bravesoftware.com/filtering/index.html', 'https://dev-pages.bravesoftware.com/filtering/index.html', 'document'],
  ['https://dev-pages.bravesoftware.com/static/images/test.jpg', 'https://dev-pages.bravesoftware.com/filtering/additional-lists.html', 'image'],
  // real resources from wikipedia.org
  ['https://en.wikipedia.org/wiki/Ad_blocking', 'https://en.wikipedia.org/wiki/Ad_blocking', 'document'],
  ['https://en.wikipedia.org/w/load.php?lang=en&modules=codex-search-styles%7Cext.cite.styles%7Cext.pygments%2CwikimediaBadges%7Cext.uls.interlanguage%7Cext.visualEditor.desktopArticleTarget.noscript%7Cskins.vector.icons%2Cstyles%7Cskins.vector.zebra.styles%7Cwikibase.client.init&only=styles&skin=vector-2022', 'https://en.wikipedia.org/wiki/Ad_blocking', 'stylesheet'],
  ['https://en.wikipedia.org/w/load.php?lang=en&modules=startup&only=scripts&raw=1&skin=vector-202', 'https://en.wikipedia.org/wiki/Ad_blocking', 'script'],
  ['https://en.wikipedia.org/static/images/mobile/copyright/wikipedia-wordmark-en.svg', 'https://en.wikipedia.org/wiki/Ad_blocking', 'image'],
  ['https://en.wikipedia.org/static/images/icons/wikipedia.png', 'https://en.wikipedia.org/wiki/Ad_blocking', 'image'],
  // hypothetical embeddings on example.com
  ['https://antonok.com', 'https://example.com', 'subdocument'],
  ['https://brave.com', 'https://example.com', 'subdocument'],
  ['https://en.wikipedia.org/wiki/Ad_blocking', 'https://example.com', 'subdocument']
]

/*
 * Throw an error if the list is blocking any of the resources from `sampleNetworkRequests`.
 */
const sanityCheckList = async ({ title, format, data }) => {
  const dataSplit = data.split('\n')
  {
    const filterSet = new FilterSet()
    filterSet.addFilters(dataSplit, { format })
    const engine = new Engine(filterSet)
    for (const request of sampleUnblockedNetworkRequests) {
      const result = engine.check(request[0], request[1], request[2])
      if (result) {
        throw new Error(title + ' failed sanity check for ' + request + '. Check for corrupted list contents.')
      }
    }
  }

  // Also, attempt to convert the rules to iOS content blocking syntax via adblock-rust and see if they are valid as per webkit-content-filter-validator.
  {
    const filterSet = new FilterSet(true)
    filterSet.addFilters(dataSplit, { format })
    const { contentBlockingRules } = filterSet.intoContentBlocking()
    let body = JSON.stringify(contentBlockingRules)
    const contentType = 'application/json'
    const headers = {
      'Content-Type': contentType
    }

    // The AWS lambda payload size limit is listed as 6291456 bytes,
    // although it appears to fail even at some lower values.
    if (body.length >= 5000000) {
      body = await compress(Buffer.from(body))
      headers['Content-Encoding'] = 'application/zstd'
    }

    const response = await fetch('https://2sq625b43mykl2tqumoue7j4k40vkupj.lambda-url.us-west-2.on.aws', {
      body,
      headers,
      method: 'POST'
    })
    if (response.status === 400) {
      const reason = await response.text()
      if (reason === '') {
        throw new Error(title + ' could not be converted to iOS content blocking syntax. Reason: out of memory or other lambda-specific issue.')
      } else if (reason === 'Empty extension.\n') {
        // Some sublists are no-op when converted individually; this is fine.
      } else if (reason === 'Too many rules in JSON array.\n') {
        // We might eventually want to do something here if a list grows to become too large,
        // but for lists that are already past the threshold, there's not much we can do.
      } else {
        throw new Error(title + ' could not be converted to iOS content blocking syntax. Reason: ' + reason)
      }
    } else if (response.status === 413) {
      // AWS error: payload is too large for the RequestResponse invocation type (limit 6291456 bytes)
      throw new Error(title + ' could not be converted to iOS content blocking syntax. Reason: payload too large for AWS Lambda request.')
    } else if (response.status !== 200) {
      throw new Error(title + ' encountered unexpected error (' + response.status + ') during conversion.')
    }
  }
}

const IF_CONDITIONS = new Map([
  ['ext_ublock', true],
  // [ 'ext_ubol', 'ubol' ],
  // [ 'ext_devbuild', 'devbuild' ],
  ['env_chromium', true],
  ['env_edge', false],
  ['env_firefox', false],
  ['env_legacy', false],
  // [ 'env_mobile', 'mobile' ],
  // [ 'env_mv3', 'mv3' ],
  ['env_safari', false],
  ['cap_html_filtering', false],
  ['cap_user_stylesheet', true],
  ['false', false],
  ['ext_abp', false],
  ['adguard', false],
  ['adguard_app_android', false],
  ['adguard_app_ios', false],
  ['adguard_app_mac', false],
  ['adguard_app_windows', false],
  ['adguard_ext_android_cb', false],
  ['adguard_ext_chromium', true],
  ['adguard_ext_edge', false],
  ['adguard_ext_firefox', false],
  ['adguard_ext_opera', true],
  ['adguard_ext_safari', false]
])

const preprocess = (listBuffer) => {
  const [NORMAL, IF_BRAVE, IF_NOT_BRAVE, IF_WHATEVER] = [0, 1, 2, 3]
  const negateIfState = (currentState) => {
    if (currentState === IF_WHATEVER) return currentState
    return currentState === IF_BRAVE
      ? IF_NOT_BRAVE
      : IF_BRAVE
  }
  const stack = []
  const ifRegex = /^!#if (!?)(.*)$/
  const popStack = () => {
    if (stack.length === 0) {
      throw new Error(listBuffer.title + ' preprocessor error. Check for corrupted list contents.')
    }
    return stack.pop()
  }

  listBuffer.data = listBuffer.data.split('\n').filter(line => {
    line = line.trim()
    const currentIfStatePeek = stack.length === 0 ? NORMAL : stack[stack.length - 1]
    const ifMatch = line.match(ifRegex)
    if (ifMatch !== null) {
      if (currentIfStatePeek === IF_NOT_BRAVE) {
        // We are in falsey land, maintain falsey but record if-depth on stack
        stack.push(IF_NOT_BRAVE)
        return false
      }
      // eslint-disable-next-line no-unused-vars
      const [_, negate, variable] = ifMatch
      const variableValue = IF_CONDITIONS.get(variable)
      if (variableValue === undefined) {
        stack.push(IF_WHATEVER)
        return false
      }
      const conditionValue = negate === '!' ? !variableValue : variableValue
      stack.push(conditionValue ? IF_BRAVE : IF_NOT_BRAVE)
      return false
    }
    if (line === '!#else') {
      stack.push(negateIfState(popStack()))
      return false
    }
    if (line === '!#endif') {
      popStack()
      return false
    }
    return currentIfStatePeek !== IF_NOT_BRAVE
  }).join('\n')
  if (stack.length !== 0) {
    throw new Error(listBuffer.title + ' preprocessor stack not empty at end. Check for corrupted list contents.')
  }
  return listBuffer
}

export {
  preprocess,
  regionalCatalogComponentId,
  regionalCatalogPubkey,
  resourcesComponentId,
  resourcesPubkey,
  sanityCheckList,
  generateResourcesFile,
  getListCatalog,
  getDefaultLists,
  getRegionalLists
}
