#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DocumentRequest = require('../models/DocumentRequest');
const DocumentHubFile = require('../models/DocumentHubFile');
const DocumentFolder = require('../models/DocumentFolder');

function inferMimeType(fileName = '') {
  const extension = path.extname(fileName).toLowerCase();
  return ({
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
  })[extension] || '';
}

async function resolveFolder(folderId) {
  if (!folderId) {
    return null;
  }
  const folder = await DocumentFolder.findOne({ _id: folderId, isActive: true }).select('_id').lean();
  return folder?._id || null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const requests = await DocumentRequest.find({
      isActive: true,
      'responses.status': 'approved',
      'responses.filePath': { $exists: true, $ne: null },
    }).lean();

    const results = [];

    for (const request of requests) {
      const targetFolderId = await resolveFolder(request.saveToFolder);

      for (const response of request.responses || []) {
        if (response.status !== 'approved' || !response.filePath) {
          continue;
        }

        const fullPath = path.join(__dirname, '..', response.filePath);
        let fileSize = 0;
        if (fs.existsSync(fullPath)) {
          try {
            fileSize = fs.statSync(fullPath).size;
          } catch (_) {
            fileSize = 0;
          }
        }

        const hubFile = await DocumentHubFile.findOneAndUpdate(
          { filePath: response.filePath },
          {
            $set: {
              name: request.title,
              folder: targetFolderId,
              filePath: response.filePath,
              originalFileName: response.originalFileName || path.basename(response.filePath),
              mimeType: inferMimeType(response.originalFileName || response.filePath),
              fileSize,
              description: `Approved response from document request: ${request.title}`,
              notes: response.notes || '',
              visibility: 'admin',
              restrictedTo: [],
              uploadedBy: response.reviewedBy || request.requestedBy,
              isActive: true,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        results.push({
          requestId: String(request._id),
          responseAgentId: String(response.agent),
          filePath: response.filePath,
          documentHubFileId: String(hubFile._id),
          folder: hubFile.folder ? String(hubFile.folder) : null,
        });
      }
    }

    console.log(JSON.stringify({ processed: results.length, results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});