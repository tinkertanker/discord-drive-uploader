export function generateFileName(originalName, messageContent = '', timestamp = new Date(), authorName = '') {
  const nameParts = originalName.split('.');
  const extension = nameParts.length > 1 ? nameParts.pop().toLowerCase() : '';

  const date = timestamp.toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '-');
  const safeAuthor = sanitizeForFilename(authorName) || 'Unknown user';
  const safeComment = sanitizeForFilename(messageContent, 100);

  const baseFileName = safeComment
    ? `${date} - ${safeAuthor} - ${safeComment}`
    : `${date} - ${safeAuthor}`;

  return extension ? `${baseFileName}.${extension}` : baseFileName;
}

export function sanitizeForFilename(text, maxLength = 80) {
  if (!text) return '';

  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .split('')
    .filter((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint >= 32 && codePoint !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .substring(0, maxLength)
    .trim();
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

export function reserveDuplicateFilename(filename, existingFilenames) {
  const reservedFilename = handleDuplicateFilename(filename, existingFilenames);
  existingFilenames.push(reservedFilename);
  return reservedFilename;
}
