/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Example usage:
//  npm run package-leo-local-models -- --binary "/Applications/Google\\ Chrome\\ Canary.app/Contents/MacOS/Google\\ Chrome\\ Canary" --key-file path/to/leo-local-models-component.pem

import commander from 'commander'
import fs from 'fs-extra'
import path from 'path'
import util from '../lib/util.js'

const getOriginalManifest = () => {
  return path.join('manifests', 'leo-local-models-updater', 'default-manifest.json')
}

const stageFiles = (version, outputDir) => {
  util.stageDir('leo-local-models', getOriginalManifest(), version, outputDir)
}

const postNextVersionWork = (publisherProofKey, publisherProofKeyAlt, binary, localRun, version) => {
  const componentType = 'leo-local-models-updater'
  const datFileName = 'default'
  const stagingDir = path.join('build', componentType, datFileName)
  const crxOutputDir = path.join('build', componentType)
  const crxFile = path.join(crxOutputDir, `${componentType}-${datFileName}.crx`)
  let privateKeyFile = ''
  if (!localRun) {
    privateKeyFile = path.join('out-all-pem', `${datFileName}.pem`)
  }
  stageFiles(version, stagingDir)
  if (!localRun) {
    util.generateCRXFile(binary, crxFile, privateKeyFile, publisherProofKey,
      publisherProofKeyAlt, stagingDir)
  }
  console.log(`Generated ${crxFile} with version number ${version}`)
}

const processDATFile = (binary, endpoint, region, publisherProofKey, publisherProofKeyAlt, localRun) => {
  const originalManifest = getOriginalManifest()
  const parsedManifest = util.parseManifest(originalManifest)
  const id = util.getIDFromBase64PublicKey(parsedManifest.key)

  if (!localRun) {
    util.getNextVersion(endpoint, region, id).then((version) => {
      postNextVersionWork(publisherProofKey, publisherProofKeyAlt,
        binary, localRun, version)
    })
  } else {
    postNextVersionWork(publisherProofKey, publisherProofKeyAlt,
      binary, localRun, '1.0.0')
  }
}

const processJob = (commander) => {
  processDATFile(commander.binary, commander.endpoint, commander.region,
     commander.publisherProofKey, commander.publisherProofKeyAlt, commander.localRun)
}

util.installErrorHandlers()

util.addCommonScriptOptions(
  commander
    .option('-l, --local-run', 'Runs updater job without connecting anywhere remotely'))
  .parse(process.argv)

commander.binary = process.env.BINARY
commander.region = process.env.S3_REGION
commander.endpoint = process.env.S3_ENDPOINT
commander.publisherProofKey = process.env.PUBLISHER_PROOF_KEY
commander.verifiedContentsKey = process.env.VERIFIED_CONTENTS_KEY
if (!commander.localRun) {
  util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
    processJob(commander)
  })
} else {
  processJob(commander)
}
