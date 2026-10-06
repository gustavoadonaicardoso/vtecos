/**
 * Confere que toda rota da API que exige login também diz QUAL permissão
 * da tela Equipe ela exige (requireActiveProfile/requireAdminOrManagerProfile
 * com `permission`). Rotas abertas a qualquer usuário logado precisam de um
 * comentário `// permission: open (motivo)` na linha de cima.
 * Administrador e Painel Master (requireAdminProfile, requirePlatformAdmin)
 * não entram: administrador sempre pode tudo.
 *
 *   npm run check:permissions
 */
const fs = require('fs');
const path = require('path');

const roots = [path.join(__dirname, '..', 'src', 'app', 'api'), path.join(__dirname, '..', 'src', 'lib')];
const skip = new Set([path.join(__dirname, '..', 'src', 'lib', 'session.ts')]);
const files = [];
(function walk(dirs) {
  for (const dir of dirs) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk([full]);
      else if (/\.(ts|tsx)$/.test(entry.name) && !skip.has(full)) files.push(full);
    }
  }
})(roots);

const problems = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/(requireActiveProfile|requireAdminOrManagerProfile)\(([^)]*)\)/);
    if (!match || /function\s+(requireActiveProfile|requireAdminOrManagerProfile)/.test(line) || /^\s*(import|\*|\/\/)/.test(line)) return;
    if (/\bpermission\b/.test(match[2])) return;
    const before = lines.slice(Math.max(0, index - 2), index).join('\n');
    if (/permission: open/.test(before)) return;
    problems.push(`  ${path.relative(path.join(__dirname, '..'), file)}:${index + 1}  ${match[0]}`);
  });
}

if (problems.length) {
  console.error(`${problems.length} rota(s) sem permissão da tela Equipe:\n${problems.join('\n')}\n\nUse { permission: '...' } ou explique com // permission: open (motivo).`);
  process.exit(1);
}
console.log('OK: todas as rotas com login dizem qual permissão exigem.');
