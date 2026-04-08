const fs = require('fs');
const path = require('path');

/**
 * Mueve los ficheros temporales al directorio definitivo del submission
 */
const moverFicheros = async (files, submissionId) => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const destDir = path.join(uploadDir, String(submissionId));

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const resultados = [];

  for (const file of files) {
    const destPath = path.join(destDir, file.filename);
    fs.renameSync(file.path, destPath);

    resultados.push({
      original_name: file.originalname,
      stored_path: destPath,
      mime_type: file.mimetype,
      size_bytes: file.size,
    });
  }

  return resultados;
};

module.exports = { moverFicheros };
