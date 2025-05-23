export function generateFileName(originalName, messageContent = '', timestamp = new Date()) {
  const extension = originalName.split('.').pop().toLowerCase();
  
  const date = timestamp.toISOString()
    .replace(/:/g, '-')
    .split('.')[0]
    .replace('T', '-');
  
  const sanitizedContent = sanitizeForFilename(messageContent);
  
  const baseFileName = sanitizedContent 
    ? `${date}-${sanitizedContent}`
    : date;
  
  const maxLength = 100 - extension.length - 1;
  const truncatedBase = baseFileName.substring(0, maxLength);
  
  return `${truncatedBase}.${extension}`;
}

export function sanitizeForFilename(text) {
  if (!text) return '';
  
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

export function handleDuplicateFilename(filename, existingFilenames) {
  if (!existingFilenames.includes(filename)) {
    return filename;
  }
  
  const nameParts = filename.split('.');
  const extension = nameParts.pop();
  const baseName = nameParts.join('.');
  
  let counter = 1;
  let newFilename;
  
  do {
    newFilename = `${baseName}_${counter}.${extension}`;
    counter++;
  } while (existingFilenames.includes(newFilename));
  
  return newFilename;
}