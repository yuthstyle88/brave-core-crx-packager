/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import commander from 'commander'
import fs from 'fs'
import path from 'path'
import util from '../lib/util.js'
import 'dotenv/config'
import ntpUtil from '../lib/ntpUtil.js'

util.installErrorHandlers()

commander
  .option('-d, --crx-directory <dir>', 'directory containing multiple crx files to upload')
  .option('-f, --crx-file <file>', 'crx file to upload', 'extension.crx')
  .option('-e, --endpoint <endpoint>', 'DynamoDB endpoint to connect to', 'http://localhost:4565') // If setup locally, use http://localhost:8000
  .option('-r, --region <region>', 'The AWS region to use', 'us-east-1')
  .parse(process.argv)
commander.region = process.env.S3_REGION
commander.endpoint = process.env.S3_ENDPOINT
let crxParam = ''

if (fs.existsSync(commander.crxFile)) {
  crxParam = commander.crxFile
} else if (fs.existsSync(commander.crxDirectory)) {
  crxParam = commander.crxDirectory
} else {
  throw new Error(`Missing or invalid crx file/directory, file: '${commander.crxFile} directory: '${commander.crxDirectory}'`)
}

const uploadJobs = []
if (fs.lstatSync(crxParam).isDirectory()) {
  fs.readdirSync(crxParam).forEach(file => {
    if (path.parse(file).ext === '.crx') {
      const id = ntpUtil.generatePublicKeyAndID(file)
      const filePath = path.resolve(crxParam, file)
      const hash = util.generateSHA256HashOfFile(filePath)
      // Push Promise ที่ผลลัพธ์ของ isUpdateCRXFile ครอบคลุมทั้งฟังก์ชัน upload
      uploadJobs.push(
        util.isUpdateCRXFile(commander.endpoint, commander.region, id, hash).then(isChanged => {
          if (isChanged) {
            return util.uploadCRXFile(commander.endpoint, commander.region, path.join(crxParam, file), id)
          }
        })
      )
    }
  })
} else {
  const id = util.getFilenameFromPath(crxParam)
  const hash = util.generateSHA256HashOfFile(crxParam)
  uploadJobs.push(
    util.isUpdateCRXFile(commander.endpoint, commander.region, id, hash).then(isChanged => {
      if (isChanged) {
        return util.uploadCRXFile(commander.endpoint, commander.region, crxParam, id)
      }
    })
  )
}

Promise.all(uploadJobs).then(() => {
  util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
    if (fs.lstatSync(crxParam).isDirectory()) {
      fs.readdirSync(crxParam).forEach(file => {
        const filePath = path.parse(path.join(crxParam, file))
        if (filePath.ext === '.crx') {
          const contentHashPath = path.resolve(filePath.dir, filePath.name + '.contentHash')
          let contentHash
          if (fs.existsSync(contentHashPath)) {
            contentHash = fs.readFileSync(contentHashPath).toString()
          }
          const id = util.getFilenameFromPath(file)
          util.updateDBForCRXFile(commander.endpoint, commander.region, path.join(crxParam, file), id, contentHash)
        }
      })
    } else {
      const id = util.getFilenameFromPath(crxParam)
      util.updateDBForCRXFile(commander.endpoint, commander.region, crxParam, id)
    }
  })
}).catch((err) => {
  console.error('Caught exception:', err)
  process.exit(1)
})
