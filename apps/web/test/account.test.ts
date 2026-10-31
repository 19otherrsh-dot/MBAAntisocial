import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import mongoose, { type Model } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_RULES } from '@/server/modules/account/registry';
import { userRefPaths } from '@/server/modules/account/paths';

const modelsDir = path.resolve(__dirname, '../src/models');
const files: string[] = [];
const walk = (dir: string) =>
  readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  });
walk(modelsDir);

beforeAll(async () => {
  await import('@/server/modules/account/all-models');
});

describe('account export and deletion registry', () => {
  it('imports every model file', () => {
    const imports = readFileSync(path.resolve(__dirname, '../src/server/modules/account/all-models.ts'), 'utf8');
    const missing = files.map((f) => `@/models/${path.relative(modelsDir, f).replace(/\.ts$/, '')}`).filter((m) => !imports.includes(`'${m}'`));
    expect(missing, 'add these to server/modules/account/all-models.ts').toEqual([]);
  });

  it('decides what happens to every reference to a person', () => {
    const unclassified: string[] = [];
    for (const name of Object.keys(mongoose.models)) {
      if (name === 'User') continue;
      const ruled = new Set((ACCOUNT_RULES[name] ?? []).map((rule) => rule.path));
      for (const p of userRefPaths(mongoose.models[name] as Model<unknown>)) if (!ruled.has(p)) unclassified.push(`${name}.${p}`);
    }
    expect(unclassified, 'classify these in server/modules/account/registry.ts').toEqual([]);
  });

  it('has no rules for paths that no longer exist', () => {
    const stale: string[] = [];
    for (const [name, rules] of Object.entries(ACCOUNT_RULES)) {
      const model = mongoose.models[name] as Model<unknown> | undefined;
      const real = new Set(model ? userRefPaths(model) : []);
      for (const rule of rules) if (!real.has(rule.path)) stale.push(`${name}.${rule.path}`);
    }
    expect(stale).toEqual([]);
  });
});
