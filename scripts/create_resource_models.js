import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// สร้าง __dirname สำหรับ ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// รายการรหัสประเทศ
const countries = [
  'ar', 'at', 'au', 'be', 'br', 'ca', 'ch', 'cz',
  'de', 'dk', 'ee', 'es', 'fi', 'fr', 'gb', 'hk',
  'hu', 'id', 'ie', 'in', 'it', 'jp', 'kr', 'lt',
  'mx', 'my', 'nl', 'no', 'nz', 'ph', 'pk', 'pl',
  'pt', 'ro', 'ru', 'se', 'sg', 'sk', 'th', 'tr',
  'tw', 'ua', 'us', 'vn'
];

// สร้าง resource.json
const resourceJson = {
  "name": "universal_sentence_encoder_qa_with_metadata",
  "version": "1.0.0",
  "type": "tflite",
  "format": "tflite",
  "description": "Universal Sentence Encoder QA model with metadata",
  "files": {
    "model": "universal_sentence_encoder_qa_with_metadata.tflite"
  },
  "metadata": {
    "inputShape": [1, 128],
    "outputShape": [1, 512],
    "inputType": "float32",
    "framework": "tensorflow-lite",
    "supported_regions": countries
  },
  "tags": [
    "sentence-encoding",
    "question-answering",
    "nlp",
    "multilingual"
  ],
  "license": "Apache-2.0"
};

// สร้างฟังก์ชันหลัก
async function createFoldersAndFiles() {
  const basePath = 'build/user-model-installer/resources';

  try {
    // สร้างโฟลเดอร์หลักถ้ายังไม่มี
    await fs.ensureDir(basePath);

    // สร้างโฟลเดอร์สำหรับแต่ละประเทศ
    for (const country of countries) {
      const folderName = `iso_3166_1_${country}`;
      const folderPath = path.join(basePath, folderName);

      // สร้างโฟลเดอร์
      await fs.ensureDir(folderPath);

      // สร้างและเขียน resource.json
      const resourcePath = path.join(folderPath, 'resource.json');
      await fs.writeJson(resourcePath, resourceJson, { spaces: 2 });

      console.log(`สร้างโฟลเดอร์และไฟล์สำหรับ ${folderName} เรียบร้อยแล้ว`);
    }

    console.log('การดำเนินการเสร็จสมบูรณ์');
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error);
  }
}

// เรียกใช้ฟังก์ชัน
createFoldersAndFiles();