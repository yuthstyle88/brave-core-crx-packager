import fs from 'fs-extra'
import path from 'path'
import unzip from 'unzip-crx-3'
import childProcess from 'child_process'
import ntpUtil from '../lib/ntpUtil.js'

const adBlockUpdaterPemRoot = 'out-ad-block-updater-pem'
const listComponents = 'https://raw.githubusercontent.com/yuthstyle88/brave-core-crx-packager/refs/heads/master/list_catalog.json'
const unpackCrx = async (crxPath, unpackDir) => {
  console.log(`Unzipping ${crxPath} to ${unpackDir}`)
  await unzip(crxPath, unpackDir)
}

const base64PublicKeyFromPem = (pemPath) => {
  const [publicKey, _] = ntpUtil.generatePublicKeyAndID(pemPath)
  return publicKey
}

const replacePublicKeyInManifest = (manifestPath, newKey, description, name) => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  manifest.key = newKey
  manifest.description = description
  manifest.name = name
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log('Updated public key in manifest.')
}

const repackCrx = (chromeBinary, inputDir, keyPath, outPath) => {
  const tempUserDataDir = fs.mkdtempSync(path.join('/tmp', 'crx-repack-'))
  const args = [
    `--pack-extension=${path.resolve(inputDir)}`,
    `--pack-extension-key=${path.resolve(keyPath)}`,
    `--user-data-dir=${tempUserDataDir}`
  ]
  console.log('Packing CRX...')
  childProcess.execSync(`${chromeBinary} ${args.join(' ')}`)
  const output = `${inputDir}.crx`
  fs.renameSync(output, outPath)
  fs.rmSync(tempUserDataDir, { recursive: true })
  console.log(`Created CRX: ${outPath}`)
}

const main = async () => {
  const [, , crxPath, privateKey, chromePath] = process.argv
  if (!crxPath || !privateKey || !chromePath) {
    console.error('Usage: node repack-extension.js <crxPath> <privateKey.pem> <chromeBinary>')
    process.exit(1)
  }

  const unpackDir = path.join('build/unpacked')
  fs.rmSync(unpackDir, { recursive: true, force: true })
  await unpackCrx(crxPath, unpackDir)

  const base64Key = base64PublicKeyFromPem(privateKey)
  replacePublicKeyInManifest(path.join(unpackDir, 'manifest.json'), base64Key)

  const newCrx = path.basename(crxPath).replace('.crx', '_repacked.crx')
  const outPath = path.join('build', newCrx)
  repackCrx(chromePath, unpackDir, privateKey, outPath)
}

main().catch(console.error)