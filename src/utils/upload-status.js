export function buildDriveFolderUrl(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function formatUploadStatusMessage({
  successfulCount,
  totalCount,
  folderName,
  folderId,
  uploadedFilenames
}) {
  if (successfulCount === 0) {
    return '❌ Upload failed';
  }

  const lines = [];
  const folderLine = successfulCount === totalCount
    ? `Uploaded to [${folderName}](${buildDriveFolderUrl(folderId)}).`
    : `Uploaded ${successfulCount}/${totalCount} files to [${folderName}](${buildDriveFolderUrl(folderId)}).`;

  lines.push(folderLine);

  if (uploadedFilenames.length === 1) {
    lines.push('', 'File name:', `- ${uploadedFilenames[0]}`);
    return lines.join('\n');
  }

  if (uploadedFilenames.length > 1) {
    lines.push('', 'File names starting from:', `- ${uploadedFilenames[0]}`);
  }

  return lines.join('\n');
}
