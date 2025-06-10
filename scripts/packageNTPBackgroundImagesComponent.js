/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import commander from 'commander'
import fs from 'fs-extra'
import { mkdirp } from 'mkdirp'
import path from 'path'
import util from '../lib/util.js'

const getOriginalManifest = () => {
  return path.join(path.resolve(), 'build', 'ntp-background-images', 'ntp-background-images-manifest.json')
}

const stageFiles = util.stageDir.bind(
    undefined,
    path.join(path.resolve(), 'build', 'ntp-background-images', 'resources'),
    getOriginalManifest())

const generateManifestFile = (publicKey, countryCode) => {
  const manifestFile = getOriginalManifest()
  const manifestContent = {
    description: 'iBrowe NTP background images component',
    key: publicKey,
    manifest_version: 2,
    name: `iBrowe NTP background images [${countryCode}]`,
    version: '0.0.0'
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifestContent))
}

const generateCRXFile = (binary, endpoint, region, privateKeyFile,
                         publisherProofKey, publisherProofKeyAlt) => {
  const rootBuildDir = path.join(path.resolve(), 'build', 'ntp-background-images')
  const stagingDir = path.join(rootBuildDir, 'staging')
  const crxOutputDir = path.join(rootBuildDir, 'output')
  mkdirp.sync(stagingDir)
  mkdirp.sync(crxOutputDir)
  const manifestFile = getOriginalManifest()
  const parsedManifest = util.parseManifest(manifestFile)
  generateManifestFile(parsedManifest.key, commander.countryCode)
  const componentID = util.getIDFromBase64PublicKey(parsedManifest.key)

  util.getNextVersion(endpoint, region, componentID).then((version) => {
    const crxFile = path.join(crxOutputDir, `${componentID}.crx`)
    stageFiles(version, stagingDir)
    util.generateCRXFile(binary, crxFile, privateKeyFile, publisherProofKey,
        publisherProofKeyAlt, stagingDir)
    console.log(`Generated ${crxFile} with version number ${version}`)
  })
}

util.installErrorHandlers()

util.addCommonScriptOptions(
    commander
        .option('-c, --country-code <country>', 'Runs updater job without connecting anywhere remotely'))
    .parse(process.argv)
commander.binary = process.env.BINARY
commander.binary = process.env.BINARY
commander.region = process.env.S3_REGION
commander.endpoint = process.env.S3_ENDPOINT
commander.publisherProofKey = process.env.PUBLISHER_PROOF_KEY
commander.publisherProofKeyAlt = process.env.PUBLISHER_PROOF_KEY_ALT
commander.verifiedContentsKey = process.env.VERIFIED_CONTENTS_KEY
let privateKeyFile = ''

if(commander.countryCode){
  privateKeyFile = `out-all-pem/user-model-installer-iso_3166_1_${commander.countryCode}.pem`
}

if (!privateKeyFile) {
  throw new Error('Missing or invalid private key')
}

util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {

  generateCRXFile(commander.binary, commander.endpoint, commander.region,
      privateKeyFile, commander.publisherProofKey, commander.publisherProofKeyAlt)
})
