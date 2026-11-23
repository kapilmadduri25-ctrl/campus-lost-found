/** The lines printed once the server is listening. Kept here so they can be tested. */
function bannerLines(port, env = process.env) {
  const publicUrl = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '';
  return [
    '',
    '  LOSTLY — Campus Lost & Found',
    `  local   http://localhost:${port}`,
    publicUrl ? `  live    ${publicUrl}` : '  live    (set PUBLIC_URL in .env to show your deployed link here)',
    '',
  ];
}

function printBanner(port, env = process.env) {
  bannerLines(port, env).forEach((line) => console.log(line));
}

module.exports = { bannerLines, printBanner };
