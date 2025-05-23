export default async (request, context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type');
  
  // Only process HTML files
  if (!contentType || !contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  
  // Replace environment variable placeholders
  html = html.replace('%DISCORD_APPLICATION_ID%', Deno.env.get('DISCORD_APPLICATION_ID') || '');
  
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};