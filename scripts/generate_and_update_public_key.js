#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { glob } from 'glob';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_PATH = '/Users/yongyutjantaboot/WebstormProjects/brave-core-crx-packager';
const MANIFEST_PATH = path.join(ROOT_PATH, 'manifests');
const OUTPUT_DIR = path.join(ROOT_PATH, 'out_pem');

async function generateKeyAndUpdateManifest(manifestPath) {
  try {
    console.log(`กำลังประมวลผลไฟล์: ${manifestPath}`);

    // อ่านไฟล์ manifest
    const manifest = await fs.readJson(manifestPath);

    // สร้าง directory สำหรับเก็บ .pem ถ้ายังไม่มี
    const pemDir = path.join(OUTPUT_DIR, path.relative(MANIFEST_PATH, path.dirname(manifestPath)));
    await fs.ensureDir(pemDir);

    // กำหนดที่อยู่ไฟล์ .pem
    const pemFile = path.join(pemDir, `${path.basename(manifestPath, '.json')}.pem`);

    console.log(`กำลังสร้าง private key: ${pemFile}`);
    execSync(`openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out "${pemFile}"`);
    // ตั้งค่าสิทธิ์การเข้าถึงไฟล์ .pem
    await fs.chmod(pemFile, '600');

    console.log('กำลังสร้าง public key...');
    const publicKey = execSync(
      `openssl rsa -in "${pemFile}" -pubout -outform DER | base64`,
      { encoding: 'utf-8' }
    ).trim();

    // อัพเดท public key ในไฟล์ manifest เดิม
    manifest.key = publicKey;
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });

    console.log(`อัพเดท public key ในไฟล์: ${manifestPath}`);
    console.log(`สร้าง private key ที่: ${pemFile}`);
    console.log('------------------------');

    return {
      success: true,
      path: manifestPath,
      pemFile,
      publicKey
    };

  } catch (error) {
    console.error(`เกิดข้อผิดพลาดกับไฟล์ ${manifestPath}:`, error);
    return {
      success: false,
      path: manifestPath,
      error: error.message
    };
  }
}

async function main() {
  try {
    if (!await fs.pathExists(MANIFEST_PATH)) {
      console.error(`ไม่พบ directory: ${MANIFEST_PATH}`);
      process.exit(1);
    }

    // สร้าง output directory สำหรับเก็บ .pem files
    await fs.ensureDir(OUTPUT_DIR);

    const files = await glob('**/*manifest.json', {
      cwd: MANIFEST_PATH,
      absolute: true,
      ignore: ['**/out_pem/**']
    });

    if (files.length === 0) {
      console.log('ไม่พบไฟล์ manifest.json');
      return;
    }

    console.log('\nไฟล์ที่พบตาม Directory:');
    const filesByDir = files.reduce((acc, file) => {
      const dir = path.relative(MANIFEST_PATH, path.dirname(file));
      if (!acc[dir]) acc[dir] = [];
      acc[dir].push(path.basename(file));
      return acc;
    }, {});

    Object.entries(filesByDir).forEach(([dir, files]) => {
      console.log(`\n${dir || '(root)'}:`);
      files.forEach(file => console.log(`  - ${file}`));
    });

    console.log(`\nพบไฟล์ manifest.json ทั้งหมด ${files.length} ไฟล์`);

    const results = await Promise.all(files.map(async (file) => {
      console.log(`\nกำลังประมวลผล: ${path.relative(MANIFEST_PATH, file)}`);
      return generateKeyAndUpdateManifest(file);
    }));

    const summary = {
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results.map(r => ({
        manifestPath: path.relative(MANIFEST_PATH, r.path),
        success: r.success,
        ...(r.success ? {
          pemFile: path.relative(ROOT_PATH, r.pemFile),
          publicKey: r.publicKey
        } : {
          error: r.error
        })
      }))
    };

    const summaryPath = path.join(OUTPUT_DIR, 'summary.json');
    await fs.writeJson(summaryPath, summary, { spaces: 2 });

    console.log('\nเสร็จสิ้นการสร้างและอัพเดท keys ทั้งหมด');
    console.log(`สรุปผลการทำงาน:`);
    console.log(`- ประมวลผลสำเร็จ: ${summary.successful} ไฟล์`);
    console.log(`- ประมวลผลไม่สำเร็จ: ${summary.failed} ไฟล์`);
    console.log(`- รายงานสรุปอยู่ที่: ${summaryPath}`);

  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error);
    process.exit(1);
  }
}

main();