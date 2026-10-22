import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import type { RenderedProposal } from '../rendering/render.js';
import { assertEmailSize } from '../rendering/render.js';
import { assertPdf } from '../rendering/pdf.js';

const artifactNames = ['proposal.json', 'email.html', 'email.txt', 'proposal.html', 'design.json', 'proposal.pdf'] as const;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema = z.strictObject({
  schemaVersion: z.literal(1), mode: z.literal('preview-only'), completeness: z.enum(['complete', 'html-only']),
  proposalId: z.uuid(), createdAt: z.iso.datetime(), templateVersion: z.string(),
  recipient: z.email().optional(), sender: z.email().optional(), subject: z.string(),
  files: z.partialRecord(z.enum(artifactNames), checksum),
});
const manifestSchema = metadataSchema.extend({ bundleHash: checksum });
function bundleHash(metadata: z.infer<typeof metadataSchema>) {
  return hash(JSON.stringify({ ...metadata, files: Object.fromEntries(Object.entries(metadata.files).sort(([a], [b]) => a.localeCompare(b))) }));
}

/** Replaces a disposable sample preview, preserving the previous bundle on failure.
 * Production approval storage will be immutable; these are explicitly previews. */
export async function writePreview(directory: string, rendered: RenderedProposal, pdf?: Buffer) {
  assertEmailSize(rendered.emailHtml);
  if (pdf !== undefined) assertPdf(pdf);
  const encodedSize = Buffer.byteLength(rendered.emailHtml) + Buffer.byteLength(rendered.emailText) + (pdf ? 4 * Math.ceil(pdf.length / 3) : 0);
  if (encodedSize >= 8_000_000) throw new Error('Encoded preview exceeds the 8 MB message budget');
  const content: Partial<Record<(typeof artifactNames)[number], string | Buffer>> = {
    'proposal.json': JSON.stringify(rendered.proposal, null, 2) + '\n',
    'email.html': rendered.emailHtml, 'email.txt': rendered.emailText,
    'proposal.html': rendered.documentHtml, 'design.json': JSON.stringify(rendered.design, null, 2) + '\n',
    ...(pdf ? { 'proposal.pdf': pdf } : {}),
  };
  const metadata = metadataSchema.parse({
    schemaVersion: 1, mode: 'preview-only', completeness: pdf ? 'complete' : 'html-only',
    proposalId: rendered.proposal.id, createdAt: rendered.proposal.createdAt,
    templateVersion: rendered.proposal.templateVersion, recipient: rendered.proposal.customer.email,
    sender: rendered.proposal.seller.email, subject: rendered.proposal.subject,
    files: Object.fromEntries(Object.entries(content).map(([name, bytes]) => [name, hash(bytes!)])),
  });
  const manifest = { ...metadata, bundleHash: bundleHash(metadata) };
  await mkdir(dirname(directory), { recursive: true });
  const lock = `${directory}.lock`;
  await mkdir(lock); // Fail visibly on a concurrent preview; never steal a stale lock.
  let staging: string | undefined;
  const backup = `${directory}.previous-${randomUUID()}`;
  let backedUp = false;
  try {
    staging = await mkdtemp(join(dirname(directory), `.${basename(directory)}-`));
    for (const [name, bytes] of Object.entries(content)) await writeFile(join(staging, name), bytes!);
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    try { await rename(directory, backup); backedUp = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename(staging, directory); staging = undefined; }
    catch (error) { if (backedUp) { await rename(backup, directory); backedUp = false; } throw error; }
    if (backedUp) await rm(backup, { recursive: true });
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
  return manifest;
}

export async function verifyPreview(directory: string) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
  const { bundleHash: stored, ...metadata } = manifest;
  if (stored !== bundleHash(metadata)) throw new Error('Manifest checksum mismatch');
  const expected = artifactNames.filter(name => name !== 'proposal.pdf' || manifest.completeness === 'complete');
  if (Object.keys(manifest.files).length !== expected.length) throw new Error('Incomplete artifact list');
  for (const name of expected) {
    const bytes = await readFile(join(directory, name));
    if (hash(bytes) !== manifest.files[name]) throw new Error(`Artifact checksum mismatch: ${name}`);
    if (name === 'proposal.pdf') assertPdf(bytes);
    if (name === 'email.html') assertEmailSize(bytes.toString('utf8'));
  }
  return manifest;
}
