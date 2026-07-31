const fs = require('fs');
const path = require('path');

/**
 * Safely deletes a file stored under public/uploads given its URL or filename.
 * Prevents directory traversal attacks.
 * 
 * @param {string} fileUrlOrName - URL (e.g., "/uploads/123.jpg") or filename (e.g., "123.jpg").
 */
function deleteUploadedFile(fileUrlOrName) {
  if (!fileUrlOrName || typeof fileUrlOrName !== 'string') return;
  
  // Extract filename
  const filename = fileUrlOrName.includes('/uploads/')
    ? fileUrlOrName.split('/uploads/').pop()
    : path.basename(fileUrlOrName);

  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return;
  }

  const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
  const filePath = path.join(uploadDir, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to delete uploaded file ${filename}:`, err.message);
  }
}

module.exports = {
  deleteUploadedFile,
};
