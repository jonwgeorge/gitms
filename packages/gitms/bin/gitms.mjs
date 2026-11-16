#!/usr/bin/env node
/**
 * gitms command line.
 *
 *   npx gitms hash      prints GITMS_ADMIN_PASSWORD_HASH for a password (scrypt,
 *                       same format and parameters as src/core/password.ts).
 *                       Reads the password from stdin so it stays out of shell
 *                       history: it prompts (input hidden), or takes a pipe:
 *                       printf %s "$PW" | npx gitms hash
 *   npx gitms secret    prints a random GITMS_ADMIN_SESSION_SECRET.
 */
import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MIN_LENGTH = 12;

function readHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) process.stderr.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer);
    });
  });
}

async function readPiped() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function hash() {
  const password = process.stdin.isTTY ? await readHidden("Admin password: ") : await readPiped();
  if (password.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters (a long random passphrase is best).`);
    process.exit(1);
  }
  const salt = randomBytes(16);
  scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}`);
  });
}

const command = process.argv[2];
if (command === "hash") await hash();
else if (command === "secret") console.log(randomBytes(32).toString("base64url"));
else {
  console.error("usage: gitms hash | gitms secret");
  process.exit(command ? 1 : 0);
}
