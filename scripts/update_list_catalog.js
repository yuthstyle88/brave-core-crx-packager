import fs from 'fs'
import path from 'path'
import ntpUtil from '../lib/ntpUtil.js'

const PROJECT_ROOT = path.resolve()
const AD_BLOCK_PATH = '/Users/yongyutjantaboot/WebstormProjects/brave-core-crx-packager/out-ad-block-updater-pem'
const CATALOG_FILE = path.join(PROJECT_ROOT, 'list_catalog.json')

// อ่าน public key จาก .pem file
const getPublicKeyFromPem = (pemFile) => {
  try {
    const [publicKey] = ntpUtil.generatePublicKeyAndID(pemFile)
    return publicKey
  } catch (err) {
    console.error(`Error getting public key from ${pemFile}:`, err)
    return null
  }
}

// อัพเดท list_catalog.json
const update_list_catalog = async () => {
  // อ่านไฟล์ catalog เดิม
  const catalog = JSON.parse(
    fs.readFileSync(
      CATALOG_FILE,
      'utf8'
    )
  )

  // อัพเดทแต่ละ entry
  for (const entry of catalog) {
    const componentId = entry.list_text_component.component_id
    const pemFile = path.join(AD_BLOCK_PATH, `ad-block-updater-${componentId}.pem`)

    if (fs.existsSync(pemFile)) {
      const publicKey = getPublicKeyFromPem(pemFile)
      if (publicKey) {
        entry.list_text_component.base64_public_key = publicKey
        console.log(`Updated public key for ${componentId}`)
      }
    } else {
      console.warn(`No .pem file found for ${componentId}`)
    }
  }

  // เขียนไฟล์ catalog ใหม่
  fs.writeFileSync(
    CATALOG_FILE,
    JSON.stringify(catalog, null, 2),
    'utf8'
  )

  console.log(`Updated list_catalog.json saved to: ${CATALOG_FILE}`)

}

// รัน script
update_list_catalog().catch(console.error)