import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Intentionally reports only filenames and rule names, never candidate secret values. */
export function scanPathAndContents(file, contents) {
  const normalized = file.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized).toLowerCase();
  const findings = [];
  const credentialFile = /^(?:\.env(?:\..+)?|id_(?:rsa|ed25519)|.*(?:private[-_]?key|wallet[-_]?key|mnemonic|seed[-_]?phrase).*(?:\.json|\.txt|\.pem|\.key)|.*\.(?:pem|key|keystore|age))$/i;
  if (basename !== '.env.example' && credentialFile.test(basename)) findings.push('credential-file');

  if (/(?:PRIVATE_KEY|SECRET_KEY|WALLET_KEY)\s*[:=]\s*['"]?(?:0x)?[0-9a-f]{64}\b/i.test(contents)) {
    findings.push('private-key-value');
  }
  if (/(?:MNEMONIC|SEED_PHRASE)\s*[:=]\s*['"]?[a-z]+(?:\s+[a-z]+){11,23}(?:['"]|$)/i.test(contents)) {
    findings.push('seed-phrase-value');
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) {
    findings.push('private-key-block');
  }
  return findings;
}

/** Caller supplies tracked file paths. CI obtains them using `git ls-files -z`. */
export function checkFiles(root, names) {
  const findings = [];
  for (const file of names) {
    const full = path.join(root, file);
    const data = readFileSync(full);
    const content = data.includes(0) ? '' : data.toString('utf8');
    for (const kind of scanPathAndContents(file, content)) findings.push({ path: file, kind });
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const findings = checkFiles(process.cwd(), process.argv.slice(2));
  if (findings.length) {
    for (const item of findings) process.stderr.write(`${item.path}: ${item.kind}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Secret guard: no tracked credential files or obvious private key values detected.\n');
  }
}
