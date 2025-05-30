import fs from 'fs'
import path from 'path'
import util from '../lib/util.js'

const PROJECT_ROOT = path.resolve()
const CATALOG_FILE = path.join(PROJECT_ROOT, 'list_catalog.json')

// อ่าน public key จาก .pem file

// อัพเดท list_catalog.json
// eslint-disable-next-line camelcase
const update_list_catalog = () => {
  // อ่านไฟล์ catalog เดิม
  const catalog = JSON.parse(
    fs.readFileSync(
      CATALOG_FILE,
      'utf8'
    )
  )

  // อัพเดทแต่ละ entry
  for (const entry of catalog) {
    const componentId = util.getIDFromBase64PublicKey(entry.list_text_component.base64_public_key)
    if (componentId) {
      entry.list_text_component.component_id = componentId
      console.log(`Updated public key for ${componentId}`)
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
update_list_catalog()