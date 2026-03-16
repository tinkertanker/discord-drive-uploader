export function generateFileName(
  originalName,
  messageContent = '',
  timestamp = new Date(),
  authorName = '',
  timeZone = getUploadTimeZone()
) {
  const nameParts = originalName.split('.');
  const extension = nameParts.length > 1 ? nameParts.pop().toLowerCase() : '';

  const time = formatUploadTime(timestamp, timeZone);
  const safeAuthor = sanitizeForFilename(authorName) || 'Unknown user';
  const safeComment = sanitizeForFilename(messageContent, 100);

  const baseFileName = safeComment
    ? `${safeAuthor} - ${time} - ${safeComment}`
    : `${safeAuthor} - ${time}`;

  return extension ? `${baseFileName}.${extension}` : baseFileName;
}

export function getUploadTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getFormatterParts(timestamp, timeZone, options) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    ...options
  }).formatToParts(timestamp);
}

function getPart(parts, type) {
  return parts.find((part) => part.type === type)?.value || '';
}

export function formatUploadDate(timestamp = new Date(), timeZone = getUploadTimeZone()) {
  const parts = getFormatterParts(timestamp, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return `${getPart(parts, 'year')}-${getPart(parts, 'month')}-${getPart(parts, 'day')}`;
}

export function formatUploadTime(timestamp = new Date(), timeZone = getUploadTimeZone()) {
  const parts = getFormatterParts(timestamp, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${getPart(parts, 'hour')}-${getPart(parts, 'minute')}-${getPart(parts, 'second')}`;
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
